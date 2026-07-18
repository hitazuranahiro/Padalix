create table if not exists platform.recipient_claim_intent (
  id text primary key,
  transfer_id text not null references platform.transfer(id) on delete restrict,
  recipient_id text not null references platform.recipient(id) on delete restrict,
  account_id text not null references platform.account(id) on delete restrict,
  token_hash bytea not null,
  status text not null default 'active'
    check (status in ('active','redeemed','expired','locked','revoked')),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redemption_idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (failed_attempts <= max_attempts),
  check (
    (status = 'redeemed' and redeemed_at is not null and redemption_idempotency_key is not null)
    or
    (status <> 'redeemed' and redeemed_at is null and redemption_idempotency_key is null)
  )
);

create unique index if not exists platform_recipient_claim_active_transfer_idx
  on platform.recipient_claim_intent(transfer_id)
  where status = 'active';

create unique index if not exists platform_recipient_claim_redeemed_transfer_idx
  on platform.recipient_claim_intent(transfer_id)
  where status = 'redeemed';

create index if not exists platform_recipient_claim_expiry_idx
  on platform.recipient_claim_intent(expires_at)
  where status = 'active';
