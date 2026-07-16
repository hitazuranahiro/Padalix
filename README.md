# Padalix

Padalix is a Stellar-powered remittance platform designed to connect stablecoin settlement with practical recipient payout experiences for Filipino families.

The current workspace contains the paste-ready [project description](./PROJECT_DESCRIPTION.md), including short and full versions, presentation copy, MVP boundaries, Stellar integration details, roadmap, metadata, and supporting sources.

## Engineering plan

- [System architecture](./docs/ARCHITECTURE.md)
- [MVP delivery plan](./docs/DELIVERY_PLAN.md)
- [International KYC and account tiers](./docs/KYC_AUTOMATION_AND_ACCOUNT_TIERS.md)
- [Notifications and compliance boundary](./docs/NOTIFICATIONS_AND_COMPLIANCE.md)
- [Deployment runbook](./docs/DEPLOYMENT.md)
- [Production MVP and wallet connector plan](./docs/PRODUCTION_MVP.md)

## Administrator CMS

The production CMS foundation now lives in `apps/admin` and is designed for `admin.padalix.com`. It uses Better Auth with PostgreSQL sessions and administrator roles, stores separate draft and published documents, and records administrative mutations in an append-only audit table.

Public content routes include `/about`, `/presentation`, `/docs`, and `/help`. Their content is part of the shared CMS document and follows the same draft and publish workflow as the landing page.

The Help Center includes a secure support ticket workflow. Customers can create a categorized case, retain a private tracking link, follow status changes, and reply without an account. Administrators manage the queue at `http://localhost:3001/support` with status, priority, assignment, SLA, public replies, internal notes, and an immutable activity history.

The back office also includes a KYC review desk at `http://localhost:3001/kyc` and administrator-only reviewer provisioning at `http://localhost:3001/team`. Customer identities remain separate from staff authentication. See [Notifications and Compliance Boundary](./docs/NOTIFICATIONS_AND_COMPLIANCE.md) for member email routing, KYC controls, and the future payment-gateway boundary.

Local commands:

```bash
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev:marketing
pnpm dev:admin
pnpm dev:platform
pnpm dev:web
```

See `apps/admin/README.md` for PostgreSQL, first-administrator, and Vercel setup.

## Next.js marketing application

The Vercel-ready marketing application is now located in [`apps/marketing`](./apps/marketing). It is deployed separately from the future customer PWA and links to that product through `NEXT_PUBLIC_APP_URL`.

For Vercel, use `apps/marketing` as the marketing project root and `padalix.com` as its production domain.

## Customer PWA

The customer application lives in [`apps/web`](./apps/web) and runs separately at `app.padalix.com`. It now includes customer Better Auth sessions, PostgreSQL-backed sandbox accounts and wallets, exact server-generated quotes, saved recipients, verified-only idempotent transfers, activity history, account capability gates, and international identity verification. The standalone Go service is in [`services/platform`](./services/platform).

KYC submissions create cases in the protected reviewer queue through a server-only ingestion proxy. Captured image bytes will move to private object storage when signed uploads are connected; the current handoff records identity fields and pending evidence metadata. Money movement is an explicit sandbox ledger and is not a connection to a licensed payment rail.
