create table if not exists customer_auth.user_experience (
  "userId" text primary key references customer_auth."user"("id") on delete cascade,
  "onboardingVersion" integer not null default 0 check ("onboardingVersion" >= 0),
  "onboardingCompletedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists customer_auth.user_notification_state (
  "userId" text not null references customer_auth."user"("id") on delete cascade,
  "notificationKey" text not null check (char_length("notificationKey") between 1 and 120),
  "readAt" timestamptz,
  "dismissedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  primary key ("userId", "notificationKey"),
  check ("dismissedAt" is null or "readAt" is not null)
);

create index if not exists customer_notification_state_active_idx
  on customer_auth.user_notification_state("userId", "createdAt" desc)
  where "dismissedAt" is null;

