create schema if not exists support;

create sequence if not exists support.ticket_reference_seq start 1001;

create table if not exists support.ticket (
  id text primary key,
  reference text not null unique,
  access_token_hash text not null unique,
  requester_name text not null,
  requester_email text not null,
  subject text not null,
  category text not null check (category in ('account', 'transfer', 'receiving', 'security', 'technical', 'other')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  assigned_to text,
  first_response_due_at timestamptz not null,
  resolution_due_at timestamptz not null,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  reporter_ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists support.message (
  id text primary key,
  ticket_id text not null references support.ticket(id) on delete cascade,
  author_type text not null check (author_type in ('customer', 'admin', 'system')),
  author_id text,
  author_display text not null,
  body text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists support.event (
  id bigint generated always as identity primary key,
  ticket_id text not null references support.ticket(id) on delete cascade,
  actor_type text not null check (actor_type in ('customer', 'admin', 'system')),
  actor_id text,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists support.notification_outbox (
  id bigint generated always as identity primary key,
  ticket_id text not null references support.ticket(id) on delete cascade,
  event_type text not null,
  recipient text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_status_updated_idx on support.ticket(status, updated_at desc);
create index if not exists support_ticket_assignee_idx on support.ticket(assigned_to, status, updated_at desc);
create index if not exists support_ticket_requester_idx on support.ticket(lower(requester_email), created_at desc);
create index if not exists support_ticket_rate_limit_idx on support.ticket(reporter_ip_hash, created_at desc);
create index if not exists support_message_ticket_created_idx on support.message(ticket_id, created_at);
create index if not exists support_event_ticket_created_idx on support.event(ticket_id, created_at desc);
create index if not exists support_outbox_pending_idx on support.notification_outbox(status, available_at) where status = 'pending';
