create schema if not exists auth;
create schema if not exists content;
create schema if not exists audit;

create table if not exists content.site_document (
  key text primary key,
  draft jsonb not null,
  published jsonb not null,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists audit.admin_event (
  id bigint generated always as identity primary key,
  actor_id text not null,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_event_actor_created_idx
  on audit.admin_event (actor_id, created_at desc);
