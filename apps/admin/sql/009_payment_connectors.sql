create table if not exists platform.payment_connector (
  id text primary key,
  provider_key text not null unique,
  display_name text not null,
  connector_kind text not null check (connector_kind in ('sandbox','stellar_wallet','stellar_anchor','ewallet','bank','cash_pickup')),
  environment text not null check (environment in ('sandbox','testnet','production')),
  status text not null default 'disabled' check (status in ('disabled','pilot','active','degraded')),
  credential_reference text,
  webhook_secret_reference text,
  capabilities jsonb not null default '[]'::jsonb check (jsonb_typeof(capabilities) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (environment <> 'production' or credential_reference is not null)
);

create table if not exists platform.payment_method (
  id text primary key,
  connector_id text not null references platform.payment_connector(id) on delete restrict,
  method_code text not null,
  display_name text not null,
  payout_type text not null check (payout_type in ('stellar_wallet','wallet','bank','cash_pickup')),
  country_code char(2) not null,
  destination_currency text not null,
  destination_network text,
  destination_asset text,
  minimum_amount numeric(30,7) check (minimum_amount is null or minimum_amount > 0),
  maximum_amount numeric(30,7) check (maximum_amount is null or maximum_amount > 0),
  minimum_verification_level text not null default 'verified' check (minimum_verification_level in ('basic','verified','enhanced','business')),
  capabilities jsonb not null default '[]'::jsonb check (jsonb_typeof(capabilities) = 'array'),
  status text not null default 'disabled' check (status in ('disabled','pilot','active','degraded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connector_id, method_code, country_code, destination_currency),
  check (maximum_amount is null or minimum_amount is null or maximum_amount >= minimum_amount)
);

create table if not exists platform.payment_corridor (
  id text primary key,
  corridor_code text not null unique,
  source_asset text not null,
  source_network text not null,
  destination_currency text not null,
  destination_country_code char(2) not null,
  minimum_amount numeric(30,7) not null check (minimum_amount > 0),
  maximum_amount numeric(30,7) not null check (maximum_amount >= minimum_amount),
  quote_ttl_seconds integer not null default 300 check (quote_ttl_seconds between 30 and 3600),
  status text not null default 'disabled' check (status in ('disabled','pilot','active','degraded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists platform.corridor_route (
  corridor_id text not null references platform.payment_corridor(id) on delete cascade,
  payment_method_id text not null references platform.payment_method(id) on delete restrict,
  priority integer not null default 100 check (priority > 0),
  status text not null default 'disabled' check (status in ('disabled','pilot','active','degraded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (corridor_id, payment_method_id)
);

create table if not exists platform.payout_instrument (
  id text primary key,
  account_id text not null references platform.account(id) on delete restrict,
  recipient_id text references platform.recipient(id) on delete cascade,
  payment_method_id text not null references platform.payment_method(id) on delete restrict,
  vault_reference text not null,
  fingerprint text not null,
  display_mask text not null,
  status text not null default 'active' check (status in ('active','disabled','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, payment_method_id, fingerprint)
);

alter table platform.recipient add column if not exists payment_method_id text references platform.payment_method(id) on delete restrict;

create table if not exists platform.outbox_job (
  id text primary key,
  topic text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists platform.settlement_attempt (
  id text primary key,
  transfer_id text not null references platform.transfer(id) on delete restrict,
  connector_id text not null references platform.payment_connector(id) on delete restrict,
  payment_method_id text not null references platform.payment_method(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  idempotency_key text not null unique,
  request_fingerprint text not null,
  provider_reference text,
  status text not null check (status in ('queued','submitted','pending','confirmed','failed','requires_review','cancelled')),
  failure_code text,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transfer_id, attempt_number)
);

create table if not exists platform.webhook_inbox (
  id text primary key,
  connector_id text not null references platform.payment_connector(id) on delete restrict,
  provider_event_id text not null,
  event_type text not null,
  payload_digest text not null,
  encrypted_payload_reference text,
  signature_verified boolean not null,
  status text not null default 'pending' check (status in ('pending','processing','processed','failed','dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (connector_id, provider_event_id)
);

create table if not exists platform.reconciliation_run (
  id text primary key,
  connector_id text not null references platform.payment_connector(id) on delete restrict,
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null check (status in ('running','matched','exceptions','failed')),
  matched_count integer not null default 0 check (matched_count >= 0),
  exception_count integer not null default 0 check (exception_count >= 0),
  report_reference text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check (period_end > period_start)
);

insert into platform.payment_connector(id,provider_key,display_name,connector_kind,environment,status,capabilities)
values ('connector-sandbox','padalix_sandbox','Padalix Sandbox','sandbox','sandbox','active','["quote","payout","reconcile"]'::jsonb)
on conflict(provider_key) do update set display_name=excluded.display_name,capabilities=excluded.capabilities,updated_at=now();

insert into platform.payment_method(id,connector_id,method_code,display_name,payout_type,country_code,destination_currency,minimum_amount,maximum_amount,minimum_verification_level,capabilities,status)
values
  ('method-sandbox-wallet-ph','connector-sandbox','wallet_ph','Sandbox digital wallet','wallet','PH','PHP',1,10000,'verified','["instant","phone_reference"]'::jsonb,'active'),
  ('method-sandbox-bank-ph','connector-sandbox','bank_ph','Sandbox bank account','bank','PH','PHP',1,10000,'verified','["account_reference"]'::jsonb,'active'),
  ('method-sandbox-cash-ph','connector-sandbox','cash_pickup_ph','Sandbox cash pickup','cash_pickup','PH','PHP',1,10000,'verified','["claim_reference"]'::jsonb,'active')
on conflict(id) do update set display_name=excluded.display_name,capabilities=excluded.capabilities,status=excluded.status,updated_at=now();

insert into platform.payment_corridor(id,corridor_code,source_asset,source_network,destination_currency,destination_country_code,minimum_amount,maximum_amount,quote_ttl_seconds,status)
values ('corridor-usdc-sandbox-php-ph','USDC-SANDBOX-PHP-PH','USDC','sandbox','PHP','PH',1,10000,300,'active')
on conflict(corridor_code) do update set minimum_amount=excluded.minimum_amount,maximum_amount=excluded.maximum_amount,quote_ttl_seconds=excluded.quote_ttl_seconds,updated_at=now();

insert into platform.corridor_route(corridor_id,payment_method_id,priority,status)
values
  ('corridor-usdc-sandbox-php-ph','method-sandbox-wallet-ph',10,'active'),
  ('corridor-usdc-sandbox-php-ph','method-sandbox-bank-ph',20,'active'),
  ('corridor-usdc-sandbox-php-ph','method-sandbox-cash-ph',30,'active')
on conflict(corridor_id,payment_method_id) do update set priority=excluded.priority,status=excluded.status,updated_at=now();

create index if not exists platform_payment_method_catalog_idx on platform.payment_method(country_code,destination_currency,status);
create index if not exists platform_corridor_route_priority_idx on platform.corridor_route(corridor_id,status,priority);
create index if not exists platform_outbox_claim_idx on platform.outbox_job(status,available_at,created_at);
create index if not exists platform_settlement_transfer_idx on platform.settlement_attempt(transfer_id,created_at desc);
create index if not exists platform_webhook_claim_idx on platform.webhook_inbox(status,received_at);
create index if not exists platform_reconciliation_connector_idx on platform.reconciliation_run(connector_id,started_at desc);
