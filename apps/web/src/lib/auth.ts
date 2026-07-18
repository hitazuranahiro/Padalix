import { betterAuth } from "better-auth";
import { passkey } from "@better-auth/passkey";
import { nextCookies } from "better-auth/next-js";
import { createHash } from "node:crypto";
import { customerDatabase } from "@/lib/database";

const authBaseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3002";
const authURL = new URL(authBaseURL);

const trustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "http://localhost:3002")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

async function enqueueAuthEmail(input: { email: string; name: string; template: string; payload: Record<string, string> }) {
  const digest = createHash("sha256").update(`${input.template}:${JSON.stringify(input.payload)}`).digest("hex");
  await customerDatabase.query(
    `insert into notification.outbox(member_id,category,template_key,recipient,payload,idempotency_key)
     values((select id from identity.member where lower(email)=lower($1) limit 1),'security',$2,lower($1),$3::jsonb,$4)
     on conflict(idempotency_key) do nothing`,
    [input.email, input.template, JSON.stringify({ name: input.name, ...input.payload }), `auth:${input.template}:${digest}`],
  );
}

export const auth = betterAuth({
  appName: "Padalix",
  baseURL: authBaseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: customerDatabase,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await enqueueAuthEmail({ email: user.email, name: user.name, template: "customer.password_reset", payload: { url } });
    },
    onPasswordReset: async ({ user }) => {
      await enqueueAuthEmail({
        email: user.email,
        name: user.name,
        template: "customer.password_changed",
        payload: { changedAt: new Date().toISOString() },
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      await enqueueAuthEmail({ email: user.email, name: user.name, template: "customer.email_verification", payload: { url } });
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 5,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  plugins: [
    passkey({
      rpID: authURL.hostname,
      rpName: "Padalix",
      origin: authURL.origin,
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
    }),
    nextCookies(),
  ],
});
