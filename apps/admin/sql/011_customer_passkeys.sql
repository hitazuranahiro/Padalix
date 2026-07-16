create table if not exists customer_auth."passkey" (
  "id" text primary key,
  "name" text,
  "publicKey" text not null,
  "userId" text not null references customer_auth."user" ("id") on delete cascade,
  "credentialID" text not null,
  "counter" integer not null,
  "deviceType" text not null,
  "backedUp" boolean not null,
  "transports" text,
  "createdAt" timestamptz default current_timestamp,
  "aaguid" text
);

create index if not exists customer_passkey_user_idx on customer_auth."passkey" ("userId");
create unique index if not exists customer_passkey_credential_idx on customer_auth."passkey" ("credentialID");
