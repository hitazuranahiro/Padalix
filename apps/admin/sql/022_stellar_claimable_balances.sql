alter table platform.transfer drop constraint if exists transfer_settlement_mode_check;
alter table platform.transfer add constraint transfer_settlement_mode_check
  check (settlement_mode in ('sandbox','stellar_testnet','stellar_claimable_testnet'));

create table if not exists platform.stellar_claimable_balance_intent (
  id text primary key,
  account_id text not null references platform.account(id) on delete restrict,
  transfer_id text not null unique references platform.transfer(id) on delete restrict,
  wallet_link_id text not null references platform.stellar_wallet_link(id) on delete restrict,
  network text not null check (network = 'testnet'),
  source_public_key text not null check (source_public_key ~ '^G[A-Z2-7]{55}$'),
  claimant_public_key text not null check (claimant_public_key ~ '^G[A-Z2-7]{55}$'),
  asset_code text not null,
  asset_issuer text,
  amount numeric(30,7) not null check (amount > 0),
  unsigned_xdr text not null,
  transaction_hash char(64) not null unique check (transaction_hash ~ '^[0-9a-f]{64}$'),
  claimable_balance_id char(72) not null unique check (claimable_balance_id ~ '^00000000[0-9a-f]{64}$'),
  reclaim_after_seconds bigint not null check (reclaim_after_seconds between 3600 and 2592000),
  status text not null default 'prepared' check (status in ('prepared','submitted','confirmed','failed','expired')),
  submission_status text,
  ledger bigint check (ledger is null or ledger > 0),
  failure_code text,
  reconciliation_status text not null default 'pending' check (reconciliation_status in ('pending','matched','exception')),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_public_key <> claimant_public_key),
  check (expires_at > created_at),
  check ((asset_code = 'XLM' and asset_issuer is null) or (asset_code <> 'XLM' and asset_issuer ~ '^G[A-Z2-7]{55}$'))
);

create index if not exists platform_claimable_balance_account_idx
  on platform.stellar_claimable_balance_intent(account_id, created_at desc);
create index if not exists platform_claimable_balance_pending_idx
  on platform.stellar_claimable_balance_intent(status, updated_at)
  where status in ('prepared','submitted');

alter table platform.reconciliation_exception
  alter column payment_intent_id drop not null;
alter table platform.reconciliation_exception
  add column if not exists claimable_balance_intent_id text references platform.stellar_claimable_balance_intent(id) on delete restrict;
alter table platform.reconciliation_exception
  drop constraint if exists reconciliation_exception_intent_check;
alter table platform.reconciliation_exception
  add constraint reconciliation_exception_intent_check
  check (num_nonnulls(payment_intent_id, claimable_balance_intent_id) = 1);
create unique index if not exists platform_reconciliation_claimable_exception_uidx
  on platform.reconciliation_exception(claimable_balance_intent_id, exception_code)
  where claimable_balance_intent_id is not null;
