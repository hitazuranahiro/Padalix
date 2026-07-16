create table if not exists compliance.kyc_evidence_session (
  id text primary key,
  auth_subject text not null,
  email text not null,
  full_name text not null,
  country_code char(2) not null,
  document_type text not null check (document_type in ('passport','national_id','drivers_license')),
  status text not null default 'pending' check (status in ('pending','finalizing','finalized','expired','rejected')),
  case_id text unique references compliance.kyc_case(id) on delete restrict,
  expires_at timestamptz not null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table if not exists compliance.kyc_evidence_object (
  id text primary key,
  session_id text not null references compliance.kyc_evidence_session(id) on delete restrict,
  case_id text references compliance.kyc_case(id) on delete restrict,
  evidence_role text not null check (evidence_role in ('identity_document','selfie')),
  document_type text not null check (document_type in ('passport','national_id','drivers_license','selfie')),
  storage_bucket text not null,
  storage_key text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','application/pdf')),
  declared_size_bytes bigint not null check (declared_size_bytes between 1024 and 10485760),
  verified_size_bytes bigint,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  storage_checksum_sha256 text,
  storage_etag text,
  upload_status text not null default 'pending' check (upload_status in ('pending','verified','rejected','quarantined')),
  rejection_reason text,
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, evidence_role)
);

create table if not exists compliance.kyc_evidence_access_audit (
  id bigint generated always as identity primary key,
  evidence_object_id text references compliance.kyc_evidence_object(id) on delete restrict,
  session_id text references compliance.kyc_evidence_session(id) on delete restrict,
  case_id text references compliance.kyc_case(id) on delete restrict,
  actor_type text not null check (actor_type in ('member','reviewer','administrator','system')),
  actor_id text,
  action text not null check (action in ('upload_intent','upload_finalize','view_intent','metadata_view','access_denied')),
  purpose text not null,
  outcome text not null check (outcome in ('allowed','denied','failed')),
  source_ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table compliance.kyc_document
  add column if not exists evidence_object_id text unique references compliance.kyc_evidence_object(id) on delete restrict;

create index if not exists kyc_evidence_session_subject_idx
  on compliance.kyc_evidence_session(auth_subject, created_at desc);
create index if not exists kyc_evidence_session_expiry_idx
  on compliance.kyc_evidence_session(status, expires_at) where status in ('pending','finalizing');
create index if not exists kyc_evidence_object_case_idx
  on compliance.kyc_evidence_object(case_id, created_at);
create index if not exists kyc_evidence_audit_case_idx
  on compliance.kyc_evidence_access_audit(case_id, created_at desc);
