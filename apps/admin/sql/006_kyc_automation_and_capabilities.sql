create schema if not exists policy;

alter table identity.member
  add column if not exists verification_level text not null default 'basic'
  check (verification_level in ('basic','verified','enhanced','business'));

create table if not exists compliance.country_document_rule (
  country_code char(2) not null,
  document_type text not null,
  accepted boolean not null default true,
  requires_nfc boolean not null default false,
  requires_proof_of_address boolean not null default false,
  minimum_age integer not null default 18,
  rule_version text not null,
  effective_at timestamptz not null default now(),
  primary key (country_code, document_type, rule_version)
);

create table if not exists compliance.kyc_automation_assessment (
  id text primary key,
  case_id text not null references compliance.kyc_case(id) on delete cascade,
  provider text not null,
  model_name text not null,
  model_version text not null,
  policy_version text not null,
  document_authenticity_score numeric(5,4),
  face_match_score numeric(5,4),
  liveness_score numeric(5,4),
  data_consistency_score numeric(5,4),
  evidence_safety_clear boolean not null default false,
  sanctions_clear boolean,
  pep_clear boolean,
  adverse_media_clear boolean,
  country_supported boolean not null default false,
  recommendation text not null check (recommendation in ('auto_approve','manual_review','escalate')),
  reason_codes jsonb not null default '[]'::jsonb,
  raw_result_reference text,
  created_at timestamptz not null default now()
);

alter table compliance.kyc_automation_assessment
  add column if not exists evidence_safety_clear boolean not null default false;

create table if not exists policy.account_capability (
  capability text primary key,
  minimum_verification_level text not null check (minimum_verification_level in ('basic','verified','enhanced','business')),
  enabled boolean not null default true,
  description text not null,
  updated_at timestamptz not null default now()
);

insert into policy.account_capability (capability,minimum_verification_level,description) values
  ('profile.manage','basic','Manage account profile and security settings.'),
  ('wallet.view','basic','View wallet and supported asset information.'),
  ('quote.preview','basic','Preview indicative transfer quotes without settlement.'),
  ('transfer.send','verified','Send a single recipient transfer within verified limits.'),
  ('fiat.cashout','verified','Use an approved fiat payout method.'),
  ('family_distribution.send','verified','Create a verified family distribution transfer.'),
  ('limits.increase','enhanced','Request enhanced transfer and account limits.'),
  ('mass_payment.send','enhanced','Send a controlled batch or mass payment.'),
  ('merchant.gateway','business','Accept payments through merchant gateway products.'),
  ('developer.api_keys','business','Create production merchant API credentials.')
on conflict (capability) do update set minimum_verification_level=excluded.minimum_verification_level,description=excluded.description,updated_at=now();

create index if not exists kyc_assessment_case_created_idx on compliance.kyc_automation_assessment(case_id,created_at desc);
create index if not exists member_verification_level_idx on identity.member(verification_level,account_status);
