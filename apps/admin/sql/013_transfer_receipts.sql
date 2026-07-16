create table if not exists platform.transfer_evidence_event (
  id text primary key,
  transfer_id text not null references platform.transfer(id) on delete restrict,
  evidence_type text not null check (evidence_type in ('provider_status','stellar_transaction','payout_reference','provider_receipt')),
  provider_key text not null,
  provider_environment text not null check (provider_environment in ('sandbox','testnet','preview','production')),
  provider_transaction_id text,
  provider_reference text,
  provider_status text,
  stellar_network text check (stellar_network is null or stellar_network in ('testnet','mainnet')),
  stellar_transaction_hash char(64) check (stellar_transaction_hash is null or stellar_transaction_hash ~ '^[0-9a-f]{64}$'),
  stellar_ledger bigint check (stellar_ledger is null or stellar_ledger > 0),
  stellar_source_account text,
  stellar_destination_account text,
  stellar_asset_code text,
  stellar_asset_issuer text,
  stellar_memo_type text,
  stellar_memo text,
  provider_more_info_url text,
  payload_digest char(64) check (payload_digest is null or payload_digest ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default now()
);

create index if not exists platform_transfer_evidence_latest_idx
  on platform.transfer_evidence_event(transfer_id, recorded_at desc);

insert into platform.payment_connector(id,provider_key,display_name,connector_kind,environment,status,capabilities)
values (
  'connector-moneygram-testnet',
  'moneygram_ramps',
  'MoneyGram Ramps',
  'stellar_anchor',
  'testnet',
  'disabled',
  '["sep10","sep24","usdc_offramp","cash_pickup","provider_receipt"]'::jsonb
)
on conflict(provider_key) do update set
  display_name=excluded.display_name,
  capabilities=excluded.capabilities,
  updated_at=now();

insert into platform.payment_method(
  id,connector_id,method_code,display_name,payout_type,country_code,destination_currency,
  destination_network,destination_asset,minimum_amount,maximum_amount,
  minimum_verification_level,capabilities,status
)
values (
  'method-moneygram-cash-ph-testnet',
  'connector-moneygram-testnet',
  'moneygram_cash_pickup_ph',
  'MoneyGram cash pickup',
  'cash_pickup',
  'PH',
  'PHP',
  'stellar_testnet',
  'USDC',
  5,
  2500,
  'verified',
  '["sep24_interactive","reference_number","provider_receipt"]'::jsonb,
  'disabled'
)
on conflict(id) do update set
  display_name=excluded.display_name,
  capabilities=excluded.capabilities,
  updated_at=now();
