extern crate std;

use super::*;
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, AuthorizedFunction, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env,
};

struct Fixture {
    env: Env,
    client: MilestoneEscrowClient<'static>,
    token: Address,
    funder: Address,
    beneficiary: Address,
    arbiter: Address,
    escrow_id: BytesN<32>,
}

fn fixture() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);
    let admin = Address::generate(&env);
    let funder = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    StellarAssetClient::new(&env, &token).mint(&funder, &1_000);
    let contract = env.register(MilestoneEscrow, ());
    let client = MilestoneEscrowClient::new(&env, &contract);
    let escrow_id = BytesN::from_array(&env, &[7; 32]);
    Fixture {
        env,
        client,
        token,
        funder,
        beneficiary,
        arbiter,
        escrow_id,
    }
}

fn milestones(env: &Env) -> Vec<MilestoneInput> {
    vec![
        env,
        MilestoneInput {
            amount: 300,
            evidence_hash: BytesN::from_array(env, &[1; 32]),
        },
        MilestoneInput {
            amount: 700,
            evidence_hash: BytesN::from_array(env, &[2; 32]),
        },
    ]
}

fn input(f: &Fixture) -> EscrowInput {
    EscrowInput {
        escrow_id: f.escrow_id.clone(),
        funder: f.funder.clone(),
        beneficiary: f.beneficiary.clone(),
        arbiter: f.arbiter.clone(),
        token: f.token.clone(),
        milestones: milestones(&f.env),
        refund_after: 2_000,
    }
}

fn required_contract_auth(env: &Env, expected: &Address, function: soroban_sdk::Symbol) -> bool {
    env.auths().iter().any(|(address, invocation)| {
        address == expected
            && matches!(
                &invocation.function,
                AuthorizedFunction::Contract((_, name, _)) if name == &function
            )
    })
}

#[test]
fn funds_and_releases_milestones_in_order() {
    let f = fixture();
    f.client.create(&input(&f));
    assert!(required_contract_auth(
        &f.env,
        &f.funder,
        symbol_short!("create")
    ));
    let token = TokenClient::new(&f.env, &f.token);
    assert_eq!(token.balance(&f.funder), 0);
    assert_eq!(token.balance(&f.client.address), 1_000);

    let after_first = f.client.release(&f.escrow_id);
    assert!(required_contract_auth(
        &f.env,
        &f.arbiter,
        symbol_short!("release")
    ));
    assert_eq!(after_first.status, EscrowStatus::Open);
    assert_eq!(after_first.released, 300);
    assert_eq!(token.balance(&f.beneficiary), 300);
    assert!(f.client.get_milestone(&f.escrow_id, &0).released);

    let complete = f.client.release(&f.escrow_id);
    assert_eq!(complete.status, EscrowStatus::Complete);
    assert_eq!(token.balance(&f.beneficiary), 1_000);
    assert_eq!(token.balance(&f.client.address), 0);
}

#[test]
fn refunds_only_remaining_funds_after_deadline() {
    let f = fixture();
    f.client.create(&input(&f));
    f.client.release(&f.escrow_id);
    f.env.ledger().set_timestamp(2_000);
    let refunded = f.client.refund(&f.escrow_id);
    let token = TokenClient::new(&f.env, &f.token);
    assert_eq!(refunded.status, EscrowStatus::Refunded);
    assert_eq!(token.balance(&f.funder), 700);
    assert_eq!(token.balance(&f.beneficiary), 300);
    assert_eq!(token.balance(&f.client.address), 0);
}

#[test]
fn rejects_invalid_configuration_and_early_refund() {
    let f = fixture();
    assert_eq!(
        f.client.try_create(&EscrowInput {
            beneficiary: f.funder.clone(),
            ..input(&f)
        }),
        Err(Ok(EscrowError::InvalidParticipants))
    );
    f.client.create(&input(&f));
    assert_eq!(
        f.client.try_refund(&f.escrow_id),
        Err(Ok(EscrowError::RefundNotAvailable))
    );
    assert_eq!(
        f.client.try_create(&input(&f)),
        Err(Ok(EscrowError::AlreadyExists))
    );
}
