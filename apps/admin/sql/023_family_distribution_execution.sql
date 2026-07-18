create table if not exists platform.family_distribution_execution (
  id text primary key,
  plan_id text not null references platform.family_distribution_plan(id) on delete restrict,
  account_id text not null references platform.account(id) on delete restrict,
  idempotency_key text not null,
  source_asset text not null default 'USDC' check (source_asset = 'USDC'),
  destination_currency text not null default 'PHP' check (destination_currency = 'PHP'),
  source_amount numeric(30,7) not null check (source_amount > 0),
  fee_amount numeric(30,7) not null default 0 check (fee_amount >= 0),
  status text not null default 'processing' check (status in ('processing','confirmed','failed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (account_id, idempotency_key)
);

create table if not exists platform.family_distribution_execution_item (
  execution_id text not null references platform.family_distribution_execution(id) on delete restrict,
  recipient_id text not null references platform.recipient(id) on delete restrict,
  transfer_id text not null unique references platform.transfer(id) on delete restrict,
  share_basis_points integer not null check (share_basis_points between 1 and 10000),
  source_amount numeric(30,7) not null check (source_amount > 0),
  destination_amount numeric(30,7) not null check (destination_amount > 0),
  fee_amount numeric(30,7) not null check (fee_amount >= 0),
  position integer not null check (position >= 0),
  primary key (execution_id, recipient_id),
  unique (execution_id, position)
);

create index if not exists platform_family_execution_plan_idx
  on platform.family_distribution_execution(plan_id, created_at desc);
create index if not exists platform_family_execution_account_idx
  on platform.family_distribution_execution(account_id, created_at desc);
