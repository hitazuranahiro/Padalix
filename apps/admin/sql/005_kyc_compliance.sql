create schema if not exists identity;
create schema if not exists compliance;
create schema if not exists notification;

create sequence if not exists compliance.kyc_reference_seq start 1001;

create table if not exists identity.member (
  id text primary key,
  auth_subject text not null unique,
  email text not null unique,
  full_name text not null,
  country_code char(2),
  account_status text not null default 'pending_verification' check (account_status in ('pending_verification','active','restricted','suspended','closed')),
  email_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists compliance.kyc_case (
  id text primary key,
  reference text not null unique,
  member_id text not null references identity.member(id) on delete restrict,
  status text not null default 'submitted' check (status in ('submitted','in_review','needs_information','approved','rejected','expired')),
  risk_level text not null default 'unrated' check (risk_level in ('unrated','low','medium','high','critical')),
  tier text not null default 'individual_basic' check (tier in ('individual_basic','individual_enhanced','business')),
  assigned_to text,
  vendor_reference text,
  submitted_at timestamptz not null default now(),
  review_due_at timestamptz not null,
  decided_at timestamptz,
  decision_reason_code text,
  decision_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists compliance.kyc_document (
  id text primary key,
  case_id text not null references compliance.kyc_case(id) on delete cascade,
  document_type text not null check (document_type in ('passport','national_id','drivers_license','proof_of_address','selfie','business_registration','other')),
  storage_key text not null,
  filename text not null,
  mime_type text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  checksum_sha256 text,
  expires_on date,
  created_at timestamptz not null default now()
);

create table if not exists compliance.kyc_review (
  id text primary key,
  case_id text not null references compliance.kyc_case(id) on delete cascade,
  reviewer_id text not null,
  reviewer_name text not null,
  action text not null check (action in ('note','request_information','approve','reject','risk_change','assign')),
  note text,
  reason_code text,
  is_internal boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists compliance.kyc_event (
  id bigint generated always as identity primary key,
  case_id text not null references compliance.kyc_case(id) on delete cascade,
  actor_type text not null check (actor_type in ('member','reviewer','administrator','system','vendor')),
  actor_id text,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists notification.member_preference (
  member_id text primary key references identity.member(id) on delete cascade,
  transactional_email boolean not null default true,
  compliance_email boolean not null default true,
  security_email boolean not null default true,
  product_email boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists notification.outbox (
  id bigint generated always as identity primary key,
  member_id text references identity.member(id) on delete cascade,
  category text not null check (category in ('transactional','compliance','security','product','staff')),
  template_key text not null,
  recipient text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','suppressed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists member_email_idx on identity.member(lower(email));
create index if not exists kyc_case_queue_idx on compliance.kyc_case(status, risk_level, review_due_at);
create index if not exists kyc_case_member_idx on compliance.kyc_case(member_id, created_at desc);
create index if not exists kyc_document_case_idx on compliance.kyc_document(case_id, created_at);
create index if not exists kyc_review_case_idx on compliance.kyc_review(case_id, created_at desc);
create index if not exists kyc_event_case_idx on compliance.kyc_event(case_id, created_at desc);
create index if not exists notification_pending_idx on notification.outbox(status, available_at) where status = 'pending';
