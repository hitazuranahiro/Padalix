create schema if not exists operations;

create table if not exists operations.status_component (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  display_name text not null,
  description text not null,
  monitor_kind text not null default 'http' check (monitor_kind in ('http', 'manual')),
  endpoint_url text,
  enabled boolean not null default true,
  public boolean not null default true,
  sort_order integer not null default 0,
  current_status text not null default 'unknown'
    check (current_status in ('operational', 'degraded_performance', 'partial_outage', 'major_outage', 'maintenance', 'unknown')),
  last_checked_at timestamptz,
  last_http_status integer,
  last_latency_ms integer,
  last_check_success boolean,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  consecutive_successes integer not null default 0 check (consecutive_successes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (monitor_kind = 'http' and endpoint_url is not null)
    or (monitor_kind = 'manual' and endpoint_url is null)
  )
);

create table if not exists operations.status_check (
  id bigint generated always as identity primary key,
  component_key text not null references operations.status_component(key) on delete cascade,
  success boolean not null,
  http_status integer,
  latency_ms integer not null check (latency_ms >= 0),
  error_code text,
  checked_at timestamptz not null default now()
);

create table if not exists operations.status_incident (
  id text primary key,
  kind text not null default 'incident' check (kind in ('incident', 'maintenance')),
  source text not null default 'manual' check (source in ('manual', 'monitor')),
  title text not null,
  summary text not null,
  impact text not null check (impact in ('maintenance', 'minor', 'major', 'critical')),
  state text not null default 'investigating'
    check (state in ('scheduled', 'investigating', 'identified', 'monitoring', 'resolved')),
  published boolean not null default true,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'resolved' and resolved_at is not null) or (state <> 'resolved' and resolved_at is null))
);

create table if not exists operations.status_incident_component (
  incident_id text not null references operations.status_incident(id) on delete cascade,
  component_key text not null references operations.status_component(key) on delete restrict,
  primary key (incident_id, component_key)
);

create table if not exists operations.status_incident_update (
  id bigint generated always as identity primary key,
  incident_id text not null references operations.status_incident(id) on delete cascade,
  state text not null check (state in ('scheduled', 'investigating', 'identified', 'monitoring', 'resolved')),
  message text not null,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists status_check_component_time_idx
  on operations.status_check (component_key, checked_at desc);

create index if not exists status_check_retention_idx
  on operations.status_check (checked_at);

create index if not exists status_incident_public_time_idx
  on operations.status_incident (published, resolved_at, started_at desc);

create index if not exists status_incident_update_time_idx
  on operations.status_incident_update (incident_id, created_at desc);

insert into operations.status_component
  (key, display_name, description, endpoint_url, sort_order)
values
  ('marketing-web', 'Padalix website', 'Public product, documentation, and support pages.', 'https://padalix.com/', 10),
  ('customer-app', 'Customer application', 'Customer sign-in, account, recipient, and transfer experience.', 'https://app.padalix.com/login', 20),
  ('identity-verification', 'Identity verification', 'Verification web entry point availability; downstream identity-provider health is tracked separately.', 'https://app.padalix.com/verification', 30),
  ('platform-api', 'Payment platform API', 'Account, quote, recipient, transfer, and settlement API.', 'https://api.padalix.com/health', 40),
  ('documentation', 'Documentation', 'Public product and safety documentation.', 'https://padalix.com/docs', 50),
  ('support-center', 'Support center', 'Public help content and support-case entry point.', 'https://padalix.com/help', 60)
on conflict (key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  endpoint_url = excluded.endpoint_url,
  sort_order = excluded.sort_order,
  updated_at = now();

comment on table operations.status_check is
  'Observed probe results only. Percentages derived from this table are measurements, not an SLA.';
