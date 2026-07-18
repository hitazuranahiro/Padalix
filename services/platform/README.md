# Padalix Platform API

The platform service is the Go business API for the Padalix customer application. It owns sandbox account provisioning, wallets, recipients, quotes, transfer policy, idempotency, balance mutation, and activity records.

```bash
pnpm db:migrate
pnpm dev:platform
```

Local health endpoint: `http://127.0.0.1:8080/health`

Seed an existing signed-in account for a repeatable demonstration without
creating or storing login credentials:

```bash
DATABASE_URL=<postgres-url> DEMO_AUTH_SUBJECT=<better-auth-user-id> pnpm db:seed-demo
```

The command is idempotent. It sets the existing member to `verified`, restores
the sandbox USDC balance to `1000`, and upserts three reusable Philippine demo
recipients. It never deletes transfers, receipts, ledger entries, or audit
events.

Worker liveness is available at `GET /health/worker`. It returns `503` when no
worker has registered, the latest heartbeat is more than 60 seconds old, or the
last completed cycle failed. `GET /internal/operations/metrics` requires the
platform bearer token and reports worker cycle health plus per-outbox counts
and oldest-item age for alerting and dashboards.

Run the durable worker in a second process after applying all migrations:

```bash
cd services/platform
go run ./cmd/worker
```

For a standalone Vercel container project, select `services/platform` as the
root directory. `Dockerfile.vercel` builds the service and the runtime-provided
`PORT` is used automatically. Configure `DATABASE_URL` and
`PLATFORM_INTERNAL_TOKEN` as server-only sensitive variables.

All `/v1/*` routes require the server-only `PLATFORM_INTERNAL_TOKEN` plus identity headers from the authenticated Next.js gateway, except the bearer-token recipient claim redemption route described below. Browsers must never receive the internal platform token.

Migration `024_account_preferences_and_terms.sql` adds durable member profiles,
regional and notification preferences, versioned published legal documents, and
append-only member acceptance evidence. Deploy the migration, platform API, and
web routes before setting `TERMS_ACCEPTANCE_ENFORCED=true`. With enforcement
enabled, protected platform routes return HTTP 428 until the authenticated
member accepts the current published Terms; account, profile, settings, and
legal acceptance routes remain available to resolve the gate.

## Implemented Routes

- `GET /v1/account`
- `GET /v1/dashboard`
- `GET /v1/payment-methods`
- `GET /v1/activity`
- `GET /v1/transfers`
- `GET /v1/transfers/{reference}`
- `GET /v1/transfers/{reference}/receipt`
- `POST /v1/transfers/{reference}/claims`
- `POST /v1/recipient-claims/redeem`
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
- `POST /v1/stellar-claimable-balances/prepare`
- `POST /v1/stellar-claimable-balances/{intentID}/submit`
- `GET /v1/stellar-claimable-balances/{intentID}`
- `GET /v1/family-distributions`
- `POST /v1/family-distributions`
- `GET /v1/family-distributions/{planID}`
- `POST /v1/family-distributions/{planID}/executions`

## Recipient Claims

An authenticated sender can create one active claim for a confirmed transfer
that already has a saved recipient. The recipient is inferred from the owned
transfer. The response returns a high-entropy `claimToken` once; only its
SHA-256 digest is stored. Claims expire after 24 hours by default, accept a
configurable 5-minute to 7-day lifetime, and lock after 5 failed attempts by
default (maximum 10).

`POST /v1/recipient-claims/redeem` is intentionally not authenticated with the
internal platform token. The claim token is its bearer credential and every
request must include an 8-100 character `Idempotency-Key`. Redemption locks the
claim row and records its terminal transition atomically. A retry with the same
key returns the existing redemption; a different key cannot redeem it again.
This lifecycle does not create a Stellar claimable balance or release payout
funds. A settlement adapter must perform and reconcile value movement before
the feature can be represented as recipient payout.

The separate Stellar claimable-balance endpoints build a real testnet
`CreateClaimableBalance` transaction. The verified sender wallet signs it in
the browser. The recipient can claim immediately, while the same sender wallet
becomes eligible to recover an unclaimed balance after seven days. The API
persists the deterministic balance ID and transaction hash, submits the signed
envelope without storing it, and reconciles final ledger status through the
durable worker.

## Family Distribution Execution

Family plans allocate exactly 10,000 basis points across 2-20 sender-owned
recipients. An execution performs one atomic sandbox wallet debit, creates one
confirmed transfer and balanced ledger transaction per recipient, and returns
receipt references. Amount allocation uses seven-decimal integer units and the
last member receives the rounding remainder.

This execution path is intentionally `sandbox` until every member has a
verified Stellar public key or a provider payout instrument. It must not be
described as a live bank, wallet, or on-chain payout.

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

## Ganap funding checkout

Migration `019_ganap_checkout_connector.sql` adds a provider-neutral funding
checkout record and registers Ganap as a disabled `funding_checkout` connector.
This integration collects PHP through Ganap. It is not a Stellar anchor, an
off-ramp, or evidence that a recipient was paid. A successful webhook confirms
only the Ganap checkout collection.

The API exposes authenticated customer routes at
`POST /v1/funding-checkouts` and `GET /v1/funding-checkouts/{externalID}`.
Creation requires an `Idempotency-Key`, a Ganap-valid amount (`0`, or
`200` through `50000`), and success/failure URLs whose HTTPS origin appears in
`GANAP_REDIRECT_ALLOWED_ORIGINS`. The service generates the unique provider
`externalId`; clients cannot select it. Provider references and status are
stored without persisting the API credential.

Configure the Ganap callback URL as:

```text
https://api.padalix.com/internal/connectors/ganap/webhooks/<GANAP_WEBHOOK_PATH_SECRET>
```

The documented Ganap payload does not include a signature, event ID, or
timestamp. Padalix therefore authenticates the callback with a high-entropy
unguessable URL segment and deduplicates the derived event identity in
`platform.webhook_inbox`. If Ganap supports a custom callback header, also set
`GANAP_WEBHOOK_HEADER_NAME` and `GANAP_WEBHOOK_HEADER_SECRET`; both checks then
become mandatory. This is weaker than a signed raw-body webhook: URL secrets can
appear in provider or proxy logs, and there is no cryptographic proof of payload
origin or freshness. Keep the connector disabled for unrestricted production
use until Ganap documents signed webhooks. Restrict the route at the edge to
Ganap source IPs when stable ranges are available, redact request paths in logs,
rate-limit it, monitor amount/reference conflicts, and rotate the path secret.

After migration and staging replay tests, an operator must explicitly change
`platform.payment_connector.status` for `ganap_checkout` from `disabled` to
`pilot` before checkout creation is accepted. Any Ganap key shared in chat or a
ticket must be revoked and replaced through the deployment secret manager.

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

Migration `018_worker_observability.sql` adds a durable heartbeat lease. Each
cycle records freshness, bounded error codes, duration, consecutive errors, and
the cumulative cycle count. The public worker probe contains no queue or
payment data; detailed metrics are restricted to service-authenticated callers.
Use a stable, unique `WORKER_ID` for each persistent worker replica.

Email delivery is fail-closed and remains paused by default. Amazon SES is the
production provider. The worker uses the AWS credential chain and SESv2 API,
stores the returned message ID, and attaches a hashed idempotency tag:

```dotenv
WORKER_ID=padalix-worker-1
WORKER_POLL_INTERVAL=2s
WORKER_LOCK_TIMEOUT=2m
EMAIL_DELIVERY_ENABLED=false
EMAIL_PROVIDER=ses
EMAIL_FROM=Padalix <notifications@padalix.com>
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=<ses-send-only-access-key>
AWS_SECRET_ACCESS_KEY=<ses-send-only-secret-key>
EMAIL_SES_CONFIGURATION_SET=<optional-ses-configuration-set>
```

`EMAIL_PROVIDER=webhook` remains available for a custom HTTPS provider. It
requires `EMAIL_PROVIDER_URL` and `EMAIL_PROVIDER_TOKEN`; the endpoint must
honor `Idempotency-Key` and return `{"id":"provider-message-id"}`.

The same delivery loop processes `notification.outbox` (including security
messages with a null `member_id`) and `support.notification_outbox`. Optional
product mail is suppressed unless the member preference explicitly opts in.

Build the persistent worker container with `Dockerfile.worker`. It exposes no
HTTP port and should run as a private Easypanel App service with one replica
initially and automatic restart enabled.

The complete API, worker, and SES deployment procedure is documented in
[`docs/EASYPANEL_WORKER_AND_SES.md`](../../docs/EASYPANEL_WORKER_AND_SES.md).
