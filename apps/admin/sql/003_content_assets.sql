create table if not exists content.asset (
  key text primary key,
  filename text not null,
  mime_type text not null,
  byte_size integer not null,
  data bytea not null,
  updated_at timestamptz not null default now(),
  updated_by text not null
);
