# Padalix Platform API

The platform service is the Go business API for the Padalix customer application. It owns sandbox account provisioning, wallets, recipients, quotes, transfer policy, idempotency, balance mutation, and activity records.

```bash
pnpm db:migrate
pnpm dev:platform
```

Local health endpoint: `http://127.0.0.1:8080/health`

For a standalone Vercel container project, select `services/platform` as the
root directory. `Dockerfile.vercel` builds the service and the runtime-provided
`PORT` is used automatically. Configure `DATABASE_URL` and
`PLATFORM_INTERNAL_TOKEN` as server-only sensitive variables.

All `/v1/*` routes require the server-only `PLATFORM_INTERNAL_TOKEN` plus identity headers from the authenticated Next.js gateway. Browsers must never call this service directly or receive the internal token.

## Implemented Routes

- `GET /v1/account`
- `GET /v1/payment-methods`
- `GET /v1/activity`
- `GET /v1/recipients`
- `POST /v1/recipients`
- `POST /v1/quotes`
- `POST /v1/transfers`

Payment methods come from the connector catalog and are enabled per provider, environment, country, and currency. A provider cannot be activated in production without an external credential reference. Provider secrets and raw payout instruments must live in a vault, never in these tables.

Transfers are deterministic sandbox ledger operations. They require a verified member, an active quote, sufficient sandbox balance, and an idempotency key. A licensed payout integration, asynchronous settlement worker, signed webhook processing, and reconciliation remain production requirements.
