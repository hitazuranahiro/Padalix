# Padalix Platform API

The platform service is the Go business API for the Padalix customer application. It owns sandbox account provisioning, wallets, recipients, quotes, transfer policy, idempotency, balance mutation, and activity records.

```bash
pnpm db:migrate
pnpm dev:platform
```

Local health endpoint: `http://127.0.0.1:8080/health`

Run the durable worker in a second process after applying all migrations:

```bash
cd services/platform
go run ./cmd/worker
```

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
- `GET /v1/stellar-wallets/{walletID}/balances`
- `GET /v1/stellar-payments/config`
- `POST /v1/stellar-payments/prepare`
- `POST /v1/stellar-payments/{paymentID}/submit`
- `GET /v1/stellar-payments/{paymentID}`

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

## Stellar Testnet Payments

The first real-network payment vertical slice is testnet-only. Padalix prepares
an exact payment envelope with a five-minute timeout and reference memo. The
customer wallet signs that envelope locally; the API verifies its hash, source,
and signature before submitting it to Stellar RPC. Confirmation writes the
transaction hash and ledger into the existing Padalix receipt evidence stream.
No customer secret key or signed envelope is stored.

Configure these server-only variables on the `services/platform` deployment:

```dotenv
STELLAR_TESTNET_PAYMENTS_ENABLED=true
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_PAYMENT_ASSET_CODE=XLM
# Required only when STELLAR_PAYMENT_ASSET_CODE is not XLM:
# STELLAR_PAYMENT_ASSET_ISSUER=G...
```

Enabling payments while `STELLAR_NETWORK` is anything other than `testnet`
causes startup to fail. Native XLM is the initial demonstration asset. A credit
asset such as testnet USDC requires its exact issuer and user trustlines before
it should be enabled.

Payment methods come from the connector catalog and are enabled per provider, environment, country, and currency. A provider cannot be activated in production without an external credential reference. Provider secrets and raw payout instruments must live in a vault, never in these tables.

Sandbox transfers remain deterministic internal ledger operations and are kept
separate from `stellar_testnet` transfers. Testnet transfers require a verified
member, a verified testnet wallet, a funded destination, and an idempotency key.
A licensed payout integration, asynchronous settlement worker, signed webhook
processing, treasury controls, and reconciliation remain production mainnet
requirements.

## Worker and Reconciliation

Migration `015_platform_worker_and_ledger.sql` adds leased outbox processing,
bounded exponential retries, stale-lock recovery, dead-letter reconciliation
exceptions, notification provider IDs, and Stellar testnet ledger state. The
API submits the customer-signed envelope directly from request memory and then
atomically records the submitted state and reconciliation job. The signed XDR
is never stored. The worker can recreate missing reconciliation jobs from the
submitted intent, so API or worker restarts do not depend on browser polling.

On chain success, one database transaction records receipt evidence, balanced
double-entry postings for the payment and network fee, member activity, and an
idempotent notification. Failed transactions are also reconciled and notified.
Jobs that exhaust retries enter `dead_letter` and create an operator-visible
`platform.reconciliation_exception` row.

Email delivery is fail-closed and remains paused by default. When enabled, the
provider endpoint must accept the JSON template contract, honor the
`Idempotency-Key` header, and return `{"id":"provider-message-id"}`:

```dotenv
WORKER_ID=padalix-worker-1
WORKER_POLL_INTERVAL=2s
WORKER_LOCK_TIMEOUT=2m
EMAIL_DELIVERY_ENABLED=false
EMAIL_PROVIDER_URL=https://email-provider.example/v1/send
EMAIL_PROVIDER_TOKEN=<server-only-provider-token>
EMAIL_FROM=notifications@padalix.com
```

The same delivery loop processes `notification.outbox` (including security
messages with a null `member_id`) and `support.notification_outbox`. Optional
product mail is suppressed unless the member preference explicitly opts in.
