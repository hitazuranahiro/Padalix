alter table platform.payment_connector
  drop constraint if exists payment_connector_connector_kind_check;

alter table platform.payment_connector
  add constraint payment_connector_connector_kind_check
  check (connector_kind in ('sandbox','stellar_wallet','stellar_anchor','ewallet','bank','cash_pickup','funding_checkout'));

insert into platform.payment_connector(
  id,provider_key,display_name,connector_kind,environment,status,
  credential_reference,webhook_secret_reference,capabilities
)
values (
  'connector-ganap',
  'ganap_checkout',
  'Ganap Checkout',
  'funding_checkout',
  'production',
  'disabled',
  'env:GANAP_SECRET_KEY',
  'env:GANAP_WEBHOOK_PATH_SECRET',
  '["checkout","funding_collection","webhook"]'::jsonb
)
on conflict(provider_key) do update set
  display_name=excluded.display_name,
  connector_kind=excluded.connector_kind,
  credential_reference=excluded.credential_reference,
  webhook_secret_reference=excluded.webhook_secret_reference,
  capabilities=excluded.capabilities,
  updated_at=now();

alter table platform.webhook_inbox
  add column if not exists authentication_method text not null default 'signature';

alter table platform.webhook_inbox
  drop constraint if exists webhook_inbox_authentication_method_check;

alter table platform.webhook_inbox
  add constraint webhook_inbox_authentication_method_check
  check (authentication_method in ('signature','shared_secret_header','bearer_path'));

create table if not exists platform.funding_checkout (
  id text primary key,
  connector_id text not null references platform.payment_connector(id) on delete restrict,
  account_id text not null references platform.account(id) on delete restrict,
  idempotency_key text not null,
  external_id text not null unique,
  amount numeric(30,7) not null check (amount = 0 or amount between 200 and 50000),
  currency char(3) not null default 'PHP' check (currency = 'PHP'),
  success_redirect_url text not null,
  failure_redirect_url text not null,
  checkout_url text,
  provider_reference text,
  provider_status text not null default 'created',
  status text not null default 'created'
    check (status in ('created','pending','success','failed','provider_error')),
  webhook_payload_digest char(64)
    check (webhook_payload_digest is null or webhook_payload_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (account_id,idempotency_key)
);

comment on table platform.funding_checkout is
  'Funding collection checkout state. Provider success confirms checkout collection only; it is not proof of Stellar settlement or recipient payout.';

create index if not exists platform_funding_checkout_account_idx
  on platform.funding_checkout(account_id,created_at desc);

create index if not exists platform_funding_checkout_pending_idx
  on platform.funding_checkout(updated_at)
  where status in ('created','pending','provider_error');
