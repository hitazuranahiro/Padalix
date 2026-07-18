import { customerDatabase as database } from "@/lib/database";

const currentOnboardingVersion = 1;
const supportedNotificationKeys = new Set([
  "identity:verified",
  "identity:action-required",
  "wallet:sandbox-ready",
]);

export type CustomerExperienceState = {
  onboardingComplete: boolean;
  notificationStates: Record<string, { read: boolean; dismissed: boolean }>;
};

export async function getCustomerExperience(userId: string): Promise<CustomerExperienceState> {
  const [experience, notifications] = await Promise.all([
    database.query<{ onboardingVersion: number; onboardingCompletedAt: Date | null }>(
      `select "onboardingVersion","onboardingCompletedAt"
       from customer_auth.user_experience where "userId"=$1`,
      [userId],
    ),
    database.query<{ notificationKey: string; readAt: Date | null; dismissedAt: Date | null }>(
      `select "notificationKey","readAt","dismissedAt"
       from customer_auth.user_notification_state where "userId"=$1`,
      [userId],
    ),
  ]);
  const record = experience.rows[0];
  return {
    onboardingComplete: Boolean(record?.onboardingCompletedAt && record.onboardingVersion >= currentOnboardingVersion),
    notificationStates: Object.fromEntries(notifications.rows.map((item) => [
      item.notificationKey,
      { read: Boolean(item.readAt), dismissed: Boolean(item.dismissedAt) },
    ])),
  };
}

export async function getCustomerExperienceOrDefault(userId: string): Promise<CustomerExperienceState> {
  try {
    return await getCustomerExperience(userId);
  } catch (error) {
    console.error("customer_experience_load_failed", error instanceof Error ? error.message : "unknown error");
    return { onboardingComplete: true, notificationStates: {} };
  }
}

export async function completeCustomerOnboarding(userId: string) {
  await database.query(
    `insert into customer_auth.user_experience("userId","onboardingVersion","onboardingCompletedAt")
     values($1,$2,now())
     on conflict("userId") do update set
       "onboardingVersion"=excluded."onboardingVersion",
       "onboardingCompletedAt"=excluded."onboardingCompletedAt",
       "updatedAt"=now()`,
    [userId, currentOnboardingVersion],
  );
}

export function validNotificationKeys(input: unknown): string[] {
  if (!Array.isArray(input) || input.length > 20) return [];
  return [...new Set(input.filter((key): key is string => typeof key === "string" && supportedNotificationKeys.has(key)))];
}

export async function updateCustomerNotifications(userId: string, keys: string[], dismiss: boolean) {
  if (!keys.length) return;
  await database.query(
    `insert into customer_auth.user_notification_state("userId","notificationKey","readAt","dismissedAt")
     select $1,key,now(),case when $3 then now() else null end from unnest($2::text[]) key
     on conflict("userId","notificationKey") do update set
       "readAt"=coalesce(customer_auth.user_notification_state."readAt",now()),
       "dismissedAt"=case when $3 then now() else customer_auth.user_notification_state."dismissedAt" end,
       "updatedAt"=now()`,
    [userId, keys, dismiss],
  );
}
