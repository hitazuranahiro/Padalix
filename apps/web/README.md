# Padalix Customer PWA

The customer application is a separate Next.js deployment for `app.padalix.com`. It provides the responsive product shell, account-level capability states, quote preview, payment entry points, activity, and the customer-facing `/verification` flow.

```bash
pnpm dev:web
```

Local URL: `http://localhost:3002`

The application uses customer Better Auth sessions stored in the PostgreSQL `customer_auth` schema. Its first-party API handlers authenticate the browser session and forward member identity to the standalone Go platform API using a server-only service token. The Go service is authoritative for account provisioning, balances, quotes, verification gates, recipients, transfers, idempotency, and activity.

For local development, configure the administrator database, auth secret, and `KYC_INGEST_SECRET` in the ignored `apps/admin/.env.local` file. Run migrations, start `pnpm dev:platform`, then start `pnpm dev:web`. The local launchers derive separate customer-auth and platform service credentials without writing them to disk. These development derivations are not a production secret-management strategy.

Captured KYC image bytes remain in the browser until private object-storage signed uploads are implemented; reviewers currently receive pending evidence metadata rather than image contents. The transfer workflow is sandbox-only and records simulated confirmation in PostgreSQL. It must not be presented as real settlement.

Production integrations must use the same-origin `/api/auth/*` and `/api/v1/*` boundaries described in `docs/DEPLOYMENT.md`.

Capability visibility is centralized in `src/lib/capabilities.ts` and mirrors `policy.account_capability`. The Go API remains authoritative for every protected command; frontend checks are usability controls only.
