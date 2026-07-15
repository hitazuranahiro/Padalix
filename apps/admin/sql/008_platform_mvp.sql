create schema if not exists platform;

create table if not exists platform.account (
  id text primary key,
  auth_subject text not null unique,
  member_id text not null unique references identity.member(id) on delete restrict,
  status text not null default 'active' check (status in ('active','restricted','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists platform.wallet (
  id text primary key,
  account_id text not null references platform.account(id) on delete restrict,
  asset_code text not null,
  network text not null default 'sandbox',
  available_balance numeric(30,7) not null default 1000 check (available_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, asset_code, network)
);

create table if not exists platform.recipient (
  id text primary key,
  account_id text not null references platform.account(id) on delete cascade,
  display_name text not null,
  country_code char(2) not null,
  payout_method text not null check (payout_method in ('bank','wallet','cash_pickup')),
  payout_reference_masked text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists platform.quote (
  id text primary key,
  account_id text not null references platform.account(id) on delete cascade,
  source_asset text not null,
  destination_currency text not null,
  source_amount numeric(30,7) not null check (source_amount > 0),
  destination_amount numeric(30,7) not null check (destination_amount > 0),
  fee_amount numeric(30,7) not null check (fee_amount >= 0),
  rate numeric(30,7) not null check (rate > 0),
  status text not null default 'active' check (status in ('active','consumed','expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists platform.transfer (
  id text primary key,
  reference text not null unique,
  account_id text not null references platform.account(id) on delete restrict,
  quote_id text not null unique references platform.quote(id) on delete restrict,
  recipient_id text references platform.recipient(id) on delete restrict,
  recipient_name text not null,
  source_asset text not null,
  destination_currency text not null,
  source_amount numeric(30,7) not null,
  destination_amount numeric(30,7) not null,
  fee_amount numeric(30,7) not null,
  status text not null check (status in ('confirmed','failed','cancelled')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (account_id, idempotency_key)
);

create table if not exists platform.activity_event (
  id bigint generated always as identity primary key,
  account_id text not null references platform.account(id) on delete cascade,
  event_type text not null,
  resource_type text not null,
  resource_id text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists platform.ledger_account (
  id text primary key,
  account_id text references platform.account(id) on delete restrict,
  code text not null unique,
  asset_code text not null,
  created_at timestamptz not null default now()
);

create table if not exists platform.ledger_transaction (
  id text primary key,
  reference text not null unique,
  transfer_id text not null unique references platform.transfer(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists platform.ledger_posting (
  id text primary key,
  transaction_id text not null references platform.ledger_transaction(id) on delete restrict,
  ledger_account_id text not null references platform.ledger_account(id) on delete restrict,
  amount numeric(30,7) not null check (amount <> 0),
  created_at timestamptz not null default now()
);

insert into platform.ledger_account(id,code,asset_code) values
  ('system-usdc-settlement','system:settlement:usdc','USDC'),
  ('system-usdc-fees','system:fees:usdc','USDC')
on conflict(code) do nothing;

create or replace function platform.assert_balanced_ledger_transaction() returns trigger language plpgsql as $$
declare target_id text;
begin
  target_id := coalesce(new.transaction_id,old.transaction_id);
  if exists(select 1 from platform.ledger_posting where transaction_id=target_id)
    and (select coalesce(sum(amount),0) from platform.ledger_posting where transaction_id=target_id) <> 0 then
    raise exception 'ledger transaction % is not balanced',target_id;
  end if;
  return null;
end;
$$;

drop trigger if exists ledger_postings_balanced on platform.ledger_posting;
create constraint trigger ledger_postings_balanced
after insert or update or delete on platform.ledger_posting
deferrable initially deferred for each row execute function platform.assert_balanced_ledger_transaction();

create sequence if not exists platform.transfer_reference_seq start 1001;
create index if not exists platform_recipient_account_idx on platform.recipient(account_id,created_at desc);
create index if not exists platform_quote_account_idx on platform.quote(account_id,created_at desc);
create index if not exists platform_transfer_account_idx on platform.transfer(account_id,created_at desc);
create index if not exists platform_activity_account_idx on platform.activity_event(account_id,created_at desc);
create index if not exists platform_ledger_posting_transaction_idx on platform.ledger_posting(transaction_id);
