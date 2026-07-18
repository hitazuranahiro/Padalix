create schema if not exists legal;

create table if not exists identity.member_profile (
  member_id text primary key references identity.member(id) on delete cascade,
  preferred_name text,
  phone_e164 text,
  country_code char(2),
  locale text not null default 'en-PH',
  timezone text not null default 'Asia/Manila',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (preferred_name is null or char_length(preferred_name) between 2 and 80),
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  check (char_length(locale) between 2 and 16),
  check (char_length(timezone) between 3 and 64)
);

create table if not exists legal.document_version (
  id text primary key,
  document_type text not null check (document_type in ('terms_of_use','privacy_notice')),
  version text not null,
  title text not null,
  content_sha256 char(64) not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('draft','published','archived')),
  effective_at timestamptz not null,
  published_at timestamptz,
  supersedes_id text references legal.document_version(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (document_type,version),
  check (status <> 'published' or published_at is not null)
);

create unique index if not exists legal_one_published_document_type_idx
  on legal.document_version(document_type)
  where status = 'published';

create table if not exists legal.member_acceptance (
  id text primary key,
  member_id text not null references identity.member(id) on delete restrict,
  document_id text not null references legal.document_version(id) on delete restrict,
  document_version text not null,
  content_sha256 char(64) not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  acceptance_source text not null default 'web' check (acceptance_source in ('web','mobile_pwa','administrator')),
  correlation_id text,
  accepted_at timestamptz not null default now(),
  unique (member_id,document_id)
);

create index if not exists legal_member_acceptance_member_idx
  on legal.member_acceptance(member_id,accepted_at desc);

create or replace function legal.prevent_member_acceptance_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'legal acceptance records are append-only';
end;
$$;

drop trigger if exists member_acceptance_append_only on legal.member_acceptance;
create trigger member_acceptance_append_only
before update or delete on legal.member_acceptance
for each row execute function legal.prevent_member_acceptance_mutation();

insert into legal.document_version(
  id,document_type,version,title,content_sha256,status,effective_at,published_at
)
values (
  'legal-terms-2026-07-18',
  'terms_of_use',
  '2026-07-18',
  'Padalix Terms of Use',
  '096b022c0fe520fe3256836bfeebd70a5cdbdf8e8f37db1635953acf641e3f35',
  'published',
  '2026-07-18T00:00:00+08:00',
  now()
)
on conflict(document_type,version) do nothing;

comment on table legal.member_acceptance is
  'Append-only evidence that a member accepted the exact published legal document version and content digest.';
