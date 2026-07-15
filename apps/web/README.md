# Padalix Customer PWA

The customer application is a separate Next.js deployment for `app.padalix.com`. It provides the responsive product shell, account-level capability states, quote preview, payment entry points, activity, and the customer-facing `/verification` flow.

```bash
pnpm dev:web
```

Local URL: `http://localhost:3002`

The current slice uses a basic sandbox member so UI and capability behavior can be validated before the standalone Better Auth service and Go platform API are connected. It does not submit money or identity documents. Production integrations must use same-origin `/api/auth/*` and `/api/v1/*` rewrites described in `docs/DEPLOYMENT.md`.

Capability visibility is centralized in `src/lib/capabilities.ts` and mirrors `policy.account_capability`. The Go API remains authoritative for every protected command; frontend checks are usability controls only.
