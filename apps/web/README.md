# Padalix Customer PWA

The customer application is a separate Next.js deployment for `app.padalix.com`. It provides the responsive product shell, account-level capability states, quote preview, payment entry points, activity, and the customer-facing `/verification` flow.

```bash
pnpm dev:web
```

Local URL: `http://localhost:3002`

The application uses customer Better Auth sessions stored in the PostgreSQL `customer_auth` schema. Its first-party API handlers authenticate the browser session and forward member identity to the standalone Go platform API using a server-only service token. The Go service is authoritative for account provisioning, balances, quotes, verification gates, recipients, transfers, idempotency, and activity.

Migration `025_customer_experience.sql` stores the current first-run onboarding
version and per-user notification read/dismissal state. The dashboard renders
the onboarding dialog only until the authenticated user completes or skips it.
Notification content is derived from current account state; the database stores
only the stable notification key and interaction timestamps, not duplicated
account or transfer details. If the migration is unavailable, dashboard loading
fails open without the onboarding overlay rather than taking the account page
offline.

For local development, configure the administrator database, auth secret, and `KYC_INGEST_SECRET` in the ignored `apps/admin/.env.local` file. Run migrations, start `pnpm dev:platform`, then start `pnpm dev:web`. The local launchers derive separate customer-auth and platform service credentials without writing them to disk. These development derivations are not a production secret-management strategy.

Captured KYC image bytes remain in the browser until private object-storage signed uploads are implemented; reviewers currently receive pending evidence metadata rather than image contents. The transfer workflow is sandbox-only and records simulated confirmation in PostgreSQL. It must not be presented as real settlement.

Production integrations must use the same-origin `/api/auth/*` and `/api/v1/*` boundaries described in `docs/DEPLOYMENT.md`.

Capability visibility is centralized in `src/lib/capabilities.ts` and mirrors `policy.account_capability`. The Go API remains authoritative for every protected command; frontend checks are usability controls only.

The installed PWA offers platform passkey enrollment and passwordless re-entry through WebAuthn. The prompt is deliberately limited to standalone display mode; browser sign-in continues to use email and password. Enrollment requires password authentication within the previous five minutes, enforced by Better Auth's server-side session freshness check as well as a client-side prompt gate. Passkeys require HTTPS, a matching `BETTER_AUTH_URL` relying-party origin, and `apps/admin/sql/011_customer_passkeys.sql` applied before deployment. Device biometrics never reach Padalix; iOS, Android, and desktop authenticators retain the private credential and return only a signed assertion.

## Stellar Wallet Linking

The `/wallet` page uses Stellar Wallets Kit to request a public address and sign
the platform API's one-time SEP-10 challenge in the customer's external wallet.
The kit is lazy-loaded only after the customer starts the flow, so its wallet
adapters are not part of the login or dashboard's initial client path. Padalix
does not receive a seed phrase and does not submit the challenge transaction.

Set the customer deployment network explicitly:

```dotenv
NEXT_PUBLIC_STELLAR_NETWORK=testnet
```

Any value other than the exact string `mainnet` falls back to `testnet`. A
mainnet web build still cannot issue a challenge unless the platform deployment
also has `STELLAR_NETWORK=mainnet` and `STELLAR_MAINNET_ENABLED=true`. These
flags enable wallet ownership verification only; they do not activate funding,
settlement, bank payouts, GCash, or Maya.
