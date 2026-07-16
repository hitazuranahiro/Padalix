create table if not exists operations.worker_heartbeat (
  worker_id text primary key,
  service text not null default 'platform-worker',
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  last_cycle_started_at timestamptz,
  last_cycle_completed_at timestamptz,
  last_cycle_duration_ms bigint,
  last_cycle_status text not null default 'starting'
    check (last_cycle_status in ('starting', 'ok', 'error', 'stopped')),
  last_error_code text,
  consecutive_errors integer not null default 0 check (consecutive_errors >= 0),
  cycles_completed bigint not null default 0 check (cycles_completed >= 0),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists worker_heartbeat_freshness_idx
  on operations.worker_heartbeat(last_seen_at desc);

comment on table operations.worker_heartbeat is
  'Current worker lease and cycle health. Monitoring must treat a stale last_seen_at as unavailable.';

insert into operations.status_component
  (key, display_name, description, endpoint_url, sort_order)
values
  ('platform-worker', 'Settlement worker', 'Durable reconciliation, notification, and operational outbox processing.', 'https://api.padalix.com/health/worker', 45)
on conflict (key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  endpoint_url = excluded.endpoint_url,
  sort_order = excluded.sort_order,
  enabled = true,
  updated_at = now();
