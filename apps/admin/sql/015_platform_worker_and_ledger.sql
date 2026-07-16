alter table platform.outbox_job
  add column if not exists max_attempts integer not null default 12 check (max_attempts > 0),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists platform_outbox_pending_idx
  on platform.outbox_job(available_at, created_at)
  where status = 'pending';

create index if not exists platform_outbox_stale_idx
  on platform.outbox_job(locked_at)
  where status = 'processing';

alter table platform.stellar_payment_intent
  add column if not exists reconciliation_status text not null default 'pending',
  add column if not exists reconciled_at timestamptz;

alter table platform.stellar_payment_intent drop constraint if exists stellar_payment_reconciliation_status_check;
alter table platform.stellar_payment_intent add constraint stellar_payment_reconciliation_status_check
  check (reconciliation_status in ('pending','matched','exception'));

create table if not exists platform.reconciliation_exception (
  id text primary key,
  transfer_id text not null references platform.transfer(id) on delete restrict,
  payment_intent_id text not null references platform.stellar_payment_intent(id) on delete restrict,
  exception_code text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','investigating','resolved','ignored')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (payment_intent_id, exception_code)
);

create index if not exists platform_reconciliation_exception_queue_idx
  on platform.reconciliation_exception(status, created_at)
  where status in ('open','investigating');

alter table notification.outbox
  add column if not exists idempotency_key text,
  add column if not exists provider_message_id text,
  add column if not exists max_attempts integer not null default 8 check (max_attempts > 0),
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists updated_at timestamptz not null default now();

drop index if exists notification.notification_outbox_idempotency_idx;
create unique index notification_outbox_idempotency_idx
  on notification.outbox(idempotency_key);

create index if not exists notification_outbox_stale_idx
  on notification.outbox(locked_at)
  where status = 'processing';

create index if not exists notification_outbox_delivery_idx
  on notification.outbox(available_at, created_at)
  where status = 'pending';

alter table support.notification_outbox
  add column if not exists idempotency_key text,
  add column if not exists provider_message_id text,
  add column if not exists max_attempts integer not null default 8 check (max_attempts > 0),
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists updated_at timestamptz not null default now();

update support.notification_outbox
set idempotency_key = 'support:' || id::text
where idempotency_key is null;

alter table support.notification_outbox alter column idempotency_key set not null;

create unique index if not exists support_notification_outbox_idempotency_idx
  on support.notification_outbox(idempotency_key);

create index if not exists support_notification_outbox_stale_idx
  on support.notification_outbox(locked_at)
  where status = 'processing';
