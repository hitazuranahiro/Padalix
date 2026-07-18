#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN,
    Env, MuxedAddress, Vec,
};

const MAX_MILESTONES: u32 = 32;
const LEDGER_DAY: u32 = 17_280;
const TTL_THRESHOLD: u32 = 30 * LEDGER_DAY;
const TTL_EXTEND_TO: u32 = 180 * LEDGER_DAY;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Open,
    Complete,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneInput {
    pub amount: i128,
    pub evidence_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowInput {
    pub escrow_id: BytesN<32>,
    pub funder: Address,
    pub beneficiary: Address,
    pub arbiter: Address,
    pub token: Address,
    pub milestones: Vec<MilestoneInput>,
    pub refund_after: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub amount: i128,
    pub evidence_hash: BytesN<32>,
    pub released: bool,
}

#[contractevent(topics = ["padalix", "created"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CreatedEvent {
    #[topic]
    pub escrow_id: BytesN<32>,
    pub funder: Address,
    pub total: i128,
}

#[contractevent(topics = ["padalix", "released"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReleasedEvent {
    #[topic]
    pub escrow_id: BytesN<32>,
    pub milestone: u32,
    pub amount: i128,
}

#[contractevent(topics = ["padalix", "refunded"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RefundedEvent {
    #[topic]
    pub escrow_id: BytesN<32>,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub funder: Address,
    pub beneficiary: Address,
    pub arbiter: Address,
    pub token: Address,
    pub total: i128,
    pub released: i128,
    pub next_milestone: u32,
    pub milestone_count: u32,
    pub refund_after: u64,
    pub status: EscrowStatus,
}

#[contracttype]
enum DataKey {
    Escrow(BytesN<32>),
    Milestone(BytesN<32>, u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    AlreadyExists = 1,
    NotFound = 2,
    InvalidParticipants = 3,
    InvalidMilestones = 4,
    InvalidDeadline = 5,
    NotOpen = 6,
    MilestonesComplete = 7,
    RefundNotAvailable = 8,
    ArithmeticOverflow = 9,
}

#[contract]
pub struct MilestoneEscrow;

#[contractimpl]
impl MilestoneEscrow {
    pub fn create(env: Env, input: EscrowInput) -> Result<Escrow, EscrowError> {
        input.funder.require_auth();
        if input.funder == input.beneficiary
            || input.funder == input.arbiter
            || input.beneficiary == input.arbiter
        {
            return Err(EscrowError::InvalidParticipants);
        }
        if input.refund_after <= env.ledger().timestamp() {
            return Err(EscrowError::InvalidDeadline);
        }
        let count = input.milestones.len();
        if count == 0 || count > MAX_MILESTONES {
            return Err(EscrowError::InvalidMilestones);
        }

        let escrow_key = DataKey::Escrow(input.escrow_id.clone());
        if env.storage().persistent().has(&escrow_key) {
            return Err(EscrowError::AlreadyExists);
        }

        let mut total = 0_i128;
        for index in 0..count {
            let milestone_input = input
                .milestones
                .get(index)
                .ok_or(EscrowError::InvalidMilestones)?;
            if milestone_input.amount <= 0 {
                return Err(EscrowError::InvalidMilestones);
            }
            total = total
                .checked_add(milestone_input.amount)
                .ok_or(EscrowError::ArithmeticOverflow)?;
            let milestone = Milestone {
                amount: milestone_input.amount,
                evidence_hash: milestone_input.evidence_hash,
                released: false,
            };
            let key = DataKey::Milestone(input.escrow_id.clone(), index);
            env.storage().persistent().set(&key, &milestone);
            bump(&env, &key);
        }

        let escrow = Escrow {
            funder: input.funder.clone(),
            beneficiary: input.beneficiary,
            arbiter: input.arbiter,
            token: input.token.clone(),
            total,
            released: 0,
            next_milestone: 0,
            milestone_count: count,
            refund_after: input.refund_after,
            status: EscrowStatus::Open,
        };
        env.storage().persistent().set(&escrow_key, &escrow);
        bump(&env, &escrow_key);

        let contract = env.current_contract_address();
        let contract_destination = MuxedAddress::from(&contract);
        token::TokenClient::new(&env, &input.token).transfer(
            &input.funder,
            &contract_destination,
            &total,
        );
        env.events().publish_event(&CreatedEvent {
            escrow_id: input.escrow_id,
            funder: input.funder,
            total,
        });
        Ok(escrow)
    }

    pub fn release(env: Env, escrow_id: BytesN<32>) -> Result<Escrow, EscrowError> {
        let escrow_key = DataKey::Escrow(escrow_id.clone());
        let mut escrow = load_escrow(&env, &escrow_key)?;
        escrow.arbiter.require_auth();
        if escrow.status != EscrowStatus::Open {
            return Err(EscrowError::NotOpen);
        }
        if escrow.next_milestone >= escrow.milestone_count {
            return Err(EscrowError::MilestonesComplete);
        }

        let index = escrow.next_milestone;
        let milestone_key = DataKey::Milestone(escrow_id.clone(), index);
        let mut milestone: Milestone = env
            .storage()
            .persistent()
            .get(&milestone_key)
            .ok_or(EscrowError::NotFound)?;
        milestone.released = true;
        escrow.released = escrow
            .released
            .checked_add(milestone.amount)
            .ok_or(EscrowError::ArithmeticOverflow)?;
        escrow.next_milestone += 1;
        if escrow.next_milestone == escrow.milestone_count {
            escrow.status = EscrowStatus::Complete;
        }

        env.storage().persistent().set(&milestone_key, &milestone);
        env.storage().persistent().set(&escrow_key, &escrow);
        bump(&env, &milestone_key);
        bump(&env, &escrow_key);

        let contract = env.current_contract_address();
        let beneficiary = MuxedAddress::from(&escrow.beneficiary);
        token::TokenClient::new(&env, &escrow.token).transfer(
            &contract,
            &beneficiary,
            &milestone.amount,
        );
        env.events().publish_event(&ReleasedEvent {
            escrow_id,
            milestone: index,
            amount: milestone.amount,
        });
        Ok(escrow)
    }

    pub fn refund(env: Env, escrow_id: BytesN<32>) -> Result<Escrow, EscrowError> {
        let escrow_key = DataKey::Escrow(escrow_id.clone());
        let mut escrow = load_escrow(&env, &escrow_key)?;
        escrow.funder.require_auth();
        if escrow.status != EscrowStatus::Open {
            return Err(EscrowError::NotOpen);
        }
        if env.ledger().timestamp() < escrow.refund_after {
            return Err(EscrowError::RefundNotAvailable);
        }
        let remaining = escrow
            .total
            .checked_sub(escrow.released)
            .ok_or(EscrowError::ArithmeticOverflow)?;
        if remaining <= 0 {
            return Err(EscrowError::MilestonesComplete);
        }

        escrow.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&escrow_key, &escrow);
        bump(&env, &escrow_key);

        let contract = env.current_contract_address();
        let funder = MuxedAddress::from(&escrow.funder);
        token::TokenClient::new(&env, &escrow.token).transfer(&contract, &funder, &remaining);
        env.events().publish_event(&RefundedEvent {
            escrow_id,
            amount: remaining,
        });
        Ok(escrow)
    }

    pub fn get(env: Env, escrow_id: BytesN<32>) -> Result<Escrow, EscrowError> {
        let key = DataKey::Escrow(escrow_id);
        let escrow = load_escrow(&env, &key)?;
        bump(&env, &key);
        Ok(escrow)
    }

    pub fn get_milestone(
        env: Env,
        escrow_id: BytesN<32>,
        index: u32,
    ) -> Result<Milestone, EscrowError> {
        let escrow_key = DataKey::Escrow(escrow_id.clone());
        let escrow = load_escrow(&env, &escrow_key)?;
        if index >= escrow.milestone_count {
            return Err(EscrowError::NotFound);
        }
        let key = DataKey::Milestone(escrow_id, index);
        let milestone = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;
        bump(&env, &escrow_key);
        bump(&env, &key);
        Ok(milestone)
    }
}

fn load_escrow(env: &Env, key: &DataKey) -> Result<Escrow, EscrowError> {
    env.storage()
        .persistent()
        .get(key)
        .ok_or(EscrowError::NotFound)
}

fn bump(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[cfg(test)]
mod test;
