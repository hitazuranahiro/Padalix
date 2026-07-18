create table if not exists platform.family_distribution_plan (
  id text primary key,
  account_id text not null references platform.account(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 100),
  status text not null default 'active' check (status in ('active','archived')),
  idempotency_key text not null,
  request_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, idempotency_key),
  unique (id, account_id)
);

create unique index if not exists platform_recipient_id_account_uidx
  on platform.recipient(id, account_id);

create table if not exists platform.family_distribution_member (
  plan_id text not null,
  account_id text not null,
  recipient_id text not null,
  share_basis_points integer not null check (share_basis_points between 1 and 10000),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (plan_id, recipient_id),
  unique (plan_id, position),
  foreign key (plan_id, account_id) references platform.family_distribution_plan(id, account_id) on delete cascade,
  foreign key (recipient_id, account_id) references platform.recipient(id, account_id) on delete restrict
);

create or replace function platform.assert_family_distribution_total() returns trigger language plpgsql as $$
declare target_plan_id text;
begin
  if tg_table_name = 'family_distribution_plan' then
    target_plan_id := coalesce(new.id, old.id);
  else
    target_plan_id := coalesce(new.plan_id, old.plan_id);
  end if;
  if exists(select 1 from platform.family_distribution_plan where id=target_plan_id)
    and (select coalesce(sum(share_basis_points), 0) from platform.family_distribution_member where plan_id=target_plan_id) <> 10000 then
    raise exception 'family distribution plan % must total 10000 basis points', target_plan_id;
  end if;
  return null;
end;
$$;

drop trigger if exists family_distribution_total on platform.family_distribution_member;
create constraint trigger family_distribution_total
after insert or update or delete on platform.family_distribution_member
deferrable initially deferred for each row execute function platform.assert_family_distribution_total();

drop trigger if exists family_distribution_plan_total on platform.family_distribution_plan;
create constraint trigger family_distribution_plan_total
after insert or update on platform.family_distribution_plan
deferrable initially deferred for each row execute function platform.assert_family_distribution_total();

create index if not exists platform_family_distribution_account_idx
  on platform.family_distribution_plan(account_id, created_at desc);
create index if not exists platform_family_distribution_recipient_idx
  on platform.family_distribution_member(recipient_id);
