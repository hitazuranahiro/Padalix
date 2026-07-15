# Padalix Customer PWA

The customer application is a separate Next.js deployment for `app.padalix.com`. It provides the responsive product shell, account-level capability states, quote preview, payment entry points, activity, and the customer-facing `/verification` flow.

```bash
pnpm dev:web
```

Local URL: `http://localhost:3002`

The current slice uses a basic sandbox member so UI and capability behavior can be validated before the standalone Better Auth service and Go platform API are connected. It does not submit money. The verification flow creates reviewer cases through the same-origin `/api/kyc/cases` server route, which forwards validated identity fields and evidence metadata to the protected ingestion service.

For local development, configure `KYC_INGEST_SECRET` in the ignored `apps/admin/.env.local` file and start the app with the root `pnpm dev:web` command. The local launcher reads only that ingestion secret and points the PWA at the local administrator endpoint. The secret must never be exposed as a `NEXT_PUBLIC_*` variable. Captured image bytes remain in the browser until private object-storage signed uploads are implemented; reviewers currently receive pending evidence metadata rather than image contents.

Production integrations must use the same-origin `/api/auth/*` and `/api/v1/*` boundaries described in `docs/DEPLOYMENT.md`.

Capability visibility is centralized in `src/lib/capabilities.ts` and mirrors `policy.account_capability`. The Go API remains authoritative for every protected command; frontend checks are usability controls only.
