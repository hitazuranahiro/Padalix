create schema if not exists compliance;

create sequence if not exists compliance.aml_case_reference_seq start 1001;

create table if not exists compliance.watchlist_source (
  id text primary key,
  source_key text not null unique,
  display_name text not null,
  list_kind text not null check (list_kind in ('sanctions','pep','adverse_media','law_enforcement','internal')),
  authority text not null,
  source_url text,
  version text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  retrieved_at timestamptz not null,
  effective_at timestamptz not null,
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active','superseded','expired','quarantined')),
  created_at timestamptz not null default now()
);

create table if not exists compliance.watchlist_entry (
  id text primary key,
  source_id text not null references compliance.watchlist_source(id) on delete restrict,
  external_id text not null,
  entity_type text not null check (entity_type in ('person','organization','vessel','other')),
  primary_name text not null,
  normalized_name text not null,
  aliases jsonb not null default '[]'::jsonb,
  birth_dates jsonb not null default '[]'::jsonb,
  countries jsonb not null default '[]'::jsonb,
  programs jsonb not null default '[]'::jsonb,
  attributes jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create table if not exists compliance.screening_run (
  id text primary key,
  member_id text not null references identity.member(id) on delete restrict,
  kyc_case_id text references compliance.kyc_case(id) on delete restrict,
  purpose text not null check (purpose in ('onboarding','ongoing','pre_transaction','manual_review')),
  adapter_key text not null,
  adapter_version text not null,
  policy_version text not null,
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  source_versions jsonb not null default '{}'::jsonb,
  status text not null check (status in ('pending','clear','potential_match','confirmed_match','manual_review','error')),
  reason_codes jsonb not null default '[]'::jsonb,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists compliance.screening_match (
  id text primary key,
  screening_run_id text not null references compliance.screening_run(id) on delete restrict,
  watchlist_entry_id text references compliance.watchlist_entry(id) on delete restrict,
  external_match_reference text,
  match_kind text not null check (match_kind in ('sanctions','pep','adverse_media','law_enforcement','internal')),
  confidence numeric(5,4) check (confidence between 0 and 1),
  matched_fields jsonb not null default '[]'::jsonb,
  status text not null default 'potential' check (status in ('potential','confirmed','false_positive','inconclusive')),
  disposition_reason_code text,
  disposition_actor_id text,
  disposition_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists compliance.monitoring_rule (
  id text primary key,
  rule_code text not null,
  version integer not null check (version > 0),
  event_type text not null check (event_type in ('pre_transfer','post_transfer','profile_change','screening_update')),
  rule_type text not null check (rule_type in ('single_amount','velocity_count','velocity_amount','recipient_count','screening_state','risk_signal')),
  action text not null check (action in ('record','flag','review','block')),
  severity text not null check (severity in ('low','medium','high','critical')),
  parameters jsonb not null,
  enabled boolean not null default false,
  effective_at timestamptz not null default now(),
  retired_at timestamptz,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  unique (rule_code, version)
);

create table if not exists compliance.monitoring_evaluation (
  id text primary key,
  member_id text not null references identity.member(id) on delete restrict,
  transfer_id text references platform.transfer(id) on delete restrict,
  command_id text not null,
  rule_id text not null references compliance.monitoring_rule(id) on delete restrict,
  outcome text not null check (outcome in ('passed','flagged','review','blocked','error')),
  observed jsonb not null default '{}'::jsonb,
  reason_codes jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now(),
  unique (command_id, rule_id)
);

create table if not exists compliance.risk_signal (
  id text primary key,
  deduplication_key text not null unique,
  member_id text not null references identity.member(id) on delete restrict,
  transfer_id text references platform.transfer(id) on delete restrict,
  screening_run_id text references compliance.screening_run(id) on delete restrict,
  evaluation_id text references compliance.monitoring_evaluation(id) on delete restrict,
  signal_code text not null,
  category text not null check (category in ('sanctions','pep','adverse_media','transaction','fraud','identity','security','manual')),
  severity text not null check (severity in ('low','medium','high','critical')),
  risk_points integer not null check (risk_points between 0 and 100),
  status text not null default 'active' check (status in ('active','under_review','resolved','expired')),
  evidence jsonb not null default '{}'::jsonb,
  source text not null,
  detected_at timestamptz not null default now(),
  expires_at timestamptz,
  resolved_at timestamptz,
  resolved_by text,
  resolution_reason_code text
);

create table if not exists compliance.aml_case (
  id text primary key,
  reference text not null unique,
  member_id text not null references identity.member(id) on delete restrict,
  transfer_id text references platform.transfer(id) on delete restrict,
  case_type text not null check (case_type in ('screening','transaction_monitoring','fraud','enhanced_due_diligence')),
  severity text not null check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','assigned','investigating','awaiting_information','escalated','closed')),
  summary_code text not null,
  assigned_to text,
  disposition text check (disposition in ('cleared','false_positive','reported','restricted','closed_no_action')),
  disposition_reason_code text,
  opened_at timestamptz not null default now(),
  due_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists compliance.aml_case_signal (
  case_id text not null references compliance.aml_case(id) on delete restrict,
  signal_id text not null references compliance.risk_signal(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (case_id, signal_id)
);

create table if not exists compliance.control_audit_event (
  id bigint generated always as identity primary key,
  event_id text not null unique,
  actor_type text not null check (actor_type in ('member','reviewer','administrator','system','worker','provider')),
  actor_id text,
  event_type text not null,
  resource_type text not null,
  resource_id text not null,
  correlation_id text,
  reason_code text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create or replace function compliance.prevent_control_audit_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'compliance control audit events are append-only';
end;
$$;

drop trigger if exists control_audit_event_append_only on compliance.control_audit_event;
create trigger control_audit_event_append_only
before update or delete on compliance.control_audit_event
for each row execute function compliance.prevent_control_audit_mutation();

insert into compliance.monitoring_rule (
  id,rule_code,version,event_type,rule_type,action,severity,parameters,enabled,created_by
) values
  ('aml-rule-single-amount-v1','single_transfer_amount',1,'pre_transfer','single_amount','flag','medium',
   '{"amount":"2500.00","currency":"USDC"}'::jsonb,true,'migration:017'),
  ('aml-rule-hourly-count-v1','hourly_transfer_count',1,'pre_transfer','velocity_count','review','high',
   '{"window":"1h","count":5}'::jsonb,true,'migration:017'),
  ('aml-rule-daily-amount-v1','daily_transfer_amount',1,'pre_transfer','velocity_amount','review','high',
   '{"window":"24h","amount":"5000.00","currency":"USDC"}'::jsonb,true,'migration:017'),
  ('aml-rule-recipient-count-v1','weekly_recipient_count',1,'pre_transfer','recipient_count','flag','medium',
   '{"window":"168h","count":8}'::jsonb,true,'migration:017')
on conflict (rule_code,version) do nothing;

create index if not exists watchlist_entry_normalized_name_idx on compliance.watchlist_entry(normalized_name) where active;
create index if not exists watchlist_entry_source_idx on compliance.watchlist_entry(source_id,active);
create index if not exists screening_run_member_idx on compliance.screening_run(member_id,created_at desc);
create index if not exists screening_run_queue_idx on compliance.screening_run(status,created_at) where status in ('potential_match','manual_review','error');
create index if not exists screening_match_run_idx on compliance.screening_match(screening_run_id,status);
create index if not exists monitoring_rule_active_idx on compliance.monitoring_rule(event_type,enabled,effective_at) where enabled;
create index if not exists monitoring_evaluation_member_idx on compliance.monitoring_evaluation(member_id,evaluated_at desc);
create index if not exists risk_signal_member_active_idx on compliance.risk_signal(member_id,severity,detected_at desc) where status in ('active','under_review');
create index if not exists aml_case_queue_idx on compliance.aml_case(status,severity,due_at) where status <> 'closed';
create index if not exists control_audit_resource_idx on compliance.control_audit_event(resource_type,resource_id,occurred_at desc);
