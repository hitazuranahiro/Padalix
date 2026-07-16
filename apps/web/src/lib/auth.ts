import { betterAuth } from "better-auth";
import { passkey } from "@better-auth/passkey";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";

const authBaseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3002";
const authURL = new URL(authBaseURL);

const trustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "http://localhost:3002")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const authDatabase = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c search_path=customer_auth",
  max: 5,
});

export const auth = betterAuth({
  appName: "Padalix",
  baseURL: authBaseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: authDatabase,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    autoSignIn: true,
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
