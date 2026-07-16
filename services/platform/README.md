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
- `GET /v1/dashboard`
- `GET /v1/payment-methods`
- `GET /v1/activity`
- `GET /v1/transfers`
- `GET /v1/transfers/{reference}`
- `GET /v1/transfers/{reference}/receipt`
- `GET /v1/exports/transfers`
- `GET /v1/recipients`
- `POST /v1/recipients`
- `POST /v1/quotes`
- `POST /v1/transfers`
- `POST /v1/stellar-wallets/challenge`
- `POST /v1/stellar-wallets/verify`
- `GET /v1/stellar-wallets`
- `DELETE /v1/stellar-wallets/{walletID}`

## Stellar Wallet Ownership

Wallet linking uses the Stellar-maintained Go SDK's SEP-10 challenge builder and
verifier. The service stores only a public key, network, one-time transaction
hash, and timestamps. It never accepts or persists a customer's secret seed.

The feature is disabled until a server signing seed is configured:

```dotenv
STELLAR_NETWORK=testnet
STELLAR_HOME_DOMAIN=padalix.com
STELLAR_WEB_AUTH_DOMAIN=api.padalix.com
STELLAR_WEB_AUTH_SIGNING_SEED=<server-only-secret-from-a-vault>
STELLAR_MAINNET_ENABLED=false
```

`STELLAR_WEB_AUTH_SIGNING_SEED` is the service's SEP-10 signing key, not a
customer or settlement wallet. Keep it in a managed secret store and publish
its public address as `SIGNING_KEY` in `/.well-known/stellar.toml` before an
external wallet relies on Padalix as a SEP-10 server. Challenges expire after
five minutes and are consumed once. Issuing a replacement invalidates any prior
unconsumed challenge for the same account and key. Challenge creation also
deletes up to 100 consumed or expired rows older than seven days; a scheduled
retention job should perform the same bounded cleanup during low traffic.

The authenticated gateway first posts `{"publicKey":"G...","network":"testnet"}`
to `/v1/stellar-wallets/challenge`. The user's wallet signs the returned
transaction XDR locally, and the gateway posts
`{"challengeId":"...","transaction":"<signed-xdr>"}` to
`/v1/stellar-wallets/verify`. Padalix verifies the issued transaction hash and
the user's signature before creating the link. The challenge transaction is
never submitted to Stellar and cannot move value.

The default and only implicit network is testnet. Setting
`STELLAR_NETWORK=mainnet` makes the service fail at startup unless
`STELLAR_MAINNET_ENABLED=true` is also present. That flag enables ownership
proofs only; it does not enable deposits, withdrawals, transaction signing, or
value movement.

Payment methods come from the connector catalog and are enabled per provider, environment, country, and currency. A provider cannot be activated in production without an external credential reference. Provider secrets and raw payout instruments must live in a vault, never in these tables.

Transfers are deterministic sandbox ledger operations. They require a verified member, an active quote, sufficient sandbox balance, and an idempotency key. A licensed payout integration, asynchronous settlement worker, signed webhook processing, and reconciliation remain production requirements.
