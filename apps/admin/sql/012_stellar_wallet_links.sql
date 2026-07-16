create table if not exists platform.stellar_wallet_link (
  id text primary key,
  account_id text not null references platform.account(id) on delete restrict,
  public_key text not null check (public_key ~ '^G[A-Z2-7]{55}$'),
  network text not null check (network in ('testnet','mainnet')),
  verified_at timestamptz not null default now(),
  unlinked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (unlinked_at is null or unlinked_at >= verified_at)
);

create unique index if not exists platform_stellar_wallet_active_key_idx
  on platform.stellar_wallet_link(network, public_key)
  where unlinked_at is null;

create index if not exists platform_stellar_wallet_account_idx
  on platform.stellar_wallet_link(account_id, verified_at desc)
  where unlinked_at is null;

create table if not exists platform.stellar_wallet_challenge (
  id text primary key,
  account_id text not null references platform.account(id) on delete cascade,
  public_key text not null check (public_key ~ '^G[A-Z2-7]{55}$'),
  network text not null check (network in ('testnet','mainnet')),
  transaction_hash char(64) not null unique check (transaction_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (consumed_at is null or consumed_at >= created_at)
);

create index if not exists platform_stellar_challenge_account_idx
  on platform.stellar_wallet_challenge(account_id, created_at desc);

create unique index if not exists platform_stellar_challenge_active_idx
  on platform.stellar_wallet_challenge(account_id, public_key, network)
  where consumed_at is null;

create index if not exists platform_stellar_challenge_expiry_idx
  on platform.stellar_wallet_challenge(expires_at)
  where consumed_at is null;
