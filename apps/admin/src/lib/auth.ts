import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";

const trustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "http://localhost:3001")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const adminUserIds = (process.env.BETTER_AUTH_ADMIN_USER_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
const bootstrapSignupEnabled = process.env.BETTER_AUTH_ALLOW_SIGNUP === "true";

const authDatabase = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://padalix:padalix@localhost:5432/padalix",
  options: "-c search_path=auth",
  max: 5,
});

export const auth = betterAuth({
  appName: "Padalix Administration",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: authDatabase,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    disableSignUp: !bootstrapSignupEnabled,
    minPasswordLength: 12,
    autoSignIn: false,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
  },
  session: {
    expiresIn: 60 * 60 * 12,
    updateAge: 60 * 60,
    freshAge: 60 * 5,
  },
  plugins: [
    admin({
      adminRoles: ["admin"],
      adminUserIds,
      defaultRole: bootstrapSignupEnabled ? "admin" : "user",
    }),
    nextCookies(),
  ],
});
