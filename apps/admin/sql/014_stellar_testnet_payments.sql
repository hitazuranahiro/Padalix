alter table platform.transfer drop constraint if exists transfer_status_check;
alter table platform.transfer add constraint transfer_status_check
  check (status in ('prepared','submitted','pending','confirmed','failed','cancelled'));

alter table platform.transfer
  add column if not exists settlement_mode text not null default 'sandbox';

alter table platform.transfer drop constraint if exists transfer_settlement_mode_check;
alter table platform.transfer add constraint transfer_settlement_mode_check
  check (settlement_mode in ('sandbox','stellar_testnet'));

create table if not exists platform.stellar_payment_intent (
  id text primary key,
  account_id text not null references platform.account(id) on delete restrict,
  transfer_id text not null unique references platform.transfer(id) on delete restrict,
  wallet_link_id text not null references platform.stellar_wallet_link(id) on delete restrict,
  network text not null check (network = 'testnet'),
  source_public_key text not null check (source_public_key ~ '^G[A-Z2-7]{55}$'),
  destination_public_key text not null check (destination_public_key ~ '^G[A-Z2-7]{55}$'),
  asset_code text not null,
  asset_issuer text,
  amount numeric(30,7) not null check (amount > 0),
  unsigned_xdr text not null,
  transaction_hash char(64) not null unique check (transaction_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'prepared' check (status in ('prepared','submitted','confirmed','failed','expired')),
  submission_status text,
  ledger bigint check (ledger is null or ledger > 0),
  failure_code text,
  expires_at timestamptz not null,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (destination_public_key <> source_public_key),
  check (expires_at > created_at),
  check ((asset_code = 'XLM' and asset_issuer is null) or (asset_code <> 'XLM' and asset_issuer ~ '^G[A-Z2-7]{55}$'))
);

create index if not exists platform_stellar_payment_account_idx
  on platform.stellar_payment_intent(account_id, created_at desc);

create index if not exists platform_stellar_payment_pending_idx
  on platform.stellar_payment_intent(status, updated_at)
  where status in ('prepared','submitted');

create unique index if not exists platform_transfer_stellar_evidence_idx
  on platform.transfer_evidence_event(transfer_id, evidence_type, stellar_transaction_hash)
  where evidence_type = 'stellar_transaction' and stellar_transaction_hash is not null;

insert into platform.payment_connector(id,provider_key,display_name,connector_kind,environment,status,capabilities)
values (
  'connector-stellar-testnet',
  'stellar_testnet',
  'Stellar Testnet',
  'stellar_wallet',
  'testnet',
  'active',
  '["wallet_signing","rpc_submission","rpc_reconciliation"]'::jsonb
)
on conflict(provider_key) do update set
  display_name=excluded.display_name,
  status=excluded.status,
  capabilities=excluded.capabilities,
  updated_at=now();
