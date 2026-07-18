# Easypanel Worker and Amazon SES

This runbook deploys the Padalix Go API and persistent outbox worker as separate
Easypanel services. The worker must not run as a Vercel Function or Cron Job.

## Runtime topology

| Easypanel service | Build context | Dockerfile | Public access | Replicas |
| --- | --- | --- | --- | --- |
| `platform-api` | `services/platform` | `Dockerfile` | `api.padalix.com`, proxy port `8080` | 1 initially |
| `platform-worker` | `services/platform` | `Dockerfile.worker` | None | 1 |

Both services use the same migrated PostgreSQL database. They are separate
containers because the API serves HTTP while the worker continuously leases and
processes durable outbox jobs.

Before deploying either service, apply all migrations from the repository root
with Neon's direct, TLS-enabled connection string (not the pooled runtime URL):

```bash
DATABASE_URL='<neon-direct-url-with-sslmode-require>' pnpm db:migrate
```

Run `bash scripts/check-migrations.sh` first when preparing a release. The
migration command stops on the first PostgreSQL error.

## 1. Deploy the API

In Easypanel:

1. Create a project named `padalix-production`.
2. Add an **App** service named `platform-api`.
3. Select the Padalix GitHub repository and production branch.
4. Set the build context to `services/platform` and Dockerfile to `Dockerfile`.
5. Add `api.padalix.com`, enable HTTPS, and set proxy port `8080`.
6. Start with one replica and enable automatic restart and Git auto-deploy.
7. Add the environment variables below and deploy.

```dotenv
PORT=8080
DATABASE_URL=<neon-runtime-url-with-tls>
PLATFORM_INTERNAL_TOKEN=<random-server-only-token-shared-with-app-web>

COMPLIANCE_ENFORCEMENT_ENABLED=false
TERMS_ACCEPTANCE_ENFORCED=false

STELLAR_NETWORK=testnet
STELLAR_HOME_DOMAIN=padalix.com
STELLAR_WEB_AUTH_DOMAIN=api.padalix.com
STELLAR_WEB_AUTH_SIGNING_SEED=<sep-10-server-signing-seed>
STELLAR_MAINNET_ENABLED=false
STELLAR_TESTNET_PAYMENTS_ENABLED=true
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_PAYMENT_ASSET_CODE=XLM

GANAP_CHECKOUT_ENABLED=false
```

The customer Vercel project needs matching server-only values:

```dotenv
PLATFORM_API_ORIGIN_URL=https://api.padalix.com
PLATFORM_INTERNAL_TOKEN=<same-token-as-platform-api>
```

Never prefix the platform token with `NEXT_PUBLIC_`.

Verify the API before deploying the worker:

```bash
curl --fail --show-error https://api.padalix.com/health
```

## 2. Provision Amazon SES

Provision SES in the same region configured on the worker, initially
`ap-southeast-1`:

1. Verify `padalix.com` or a dedicated transactional mail subdomain.
2. Publish the SES Easy DKIM records and configure SPF and DMARC.
3. Confirm `notifications@padalix.com` is covered by the verified identity.
4. Request SES production access in `ap-southeast-1`. Sandbox accounts can send
   only to verified recipients.
5. Enable the SES account-level suppression list for bounces and complaints.
6. Create an SES configuration set named `padalix-transactional`, publish bounce
   and complaint events to an operator-monitored SNS or EventBridge destination,
   and add alerts. Padalix does not yet ingest those events into member records.
7. Create a dedicated IAM principal with API-send-only access. Do not use the
   AWS root account, administrator credentials, or SES SMTP credentials.

Example least-privilege policy, replacing the account ID and identity if needed:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SendPadalixTransactionalEmail",
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": "arn:aws:ses:ap-southeast-1:<AWS_ACCOUNT_ID>:identity/padalix.com",
      "Condition": {
        "StringEquals": {
          "ses:FromAddress": "notifications@padalix.com"
        }
      }
    }
  ]
}
```

The worker uses the AWS SDK for Go and SESv2 API. It does not use SMTP.

## 3. Deploy the persistent worker

In the same Easypanel project:

1. Add an **App** service named `platform-worker`.
2. Use the same repository and branch.
3. Set the build context to `services/platform` and Dockerfile to
   `Dockerfile.worker`.
4. Do not add a domain, proxy, published port, or persistent volume.
5. Set one replica, automatic restart, and Git auto-deploy.
6. Add the worker-only environment variables below.

```dotenv
DATABASE_URL=<same-migrated-neon-runtime-url-with-tls>
WORKER_ID=padalix-worker-production-1
WORKER_POLL_INTERVAL=2s
WORKER_LOCK_TIMEOUT=2m

STELLAR_NETWORK=testnet
STELLAR_TESTNET_PAYMENTS_ENABLED=true
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_PAYMENT_ASSET_CODE=XLM

EMAIL_DELIVERY_ENABLED=false
EMAIL_PROVIDER=ses
EMAIL_FROM=Padalix <notifications@padalix.com>
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=<ses-api-send-only-access-key>
AWS_SECRET_ACCESS_KEY=<ses-api-send-only-secret-key>
EMAIL_SES_CONFIGURATION_SET=padalix-transactional
```

Add `AWS_SESSION_TOKEN` only when using temporary AWS credentials. Keep
`EMAIL_DELIVERY_ENABLED=false` for the first deployment.

SES credentials belong only to `platform-worker` in Easypanel. Do not add them
to the Vercel marketing, web, admin, or API projects, and never expose them in a
`NEXT_PUBLIC_*` variable.

## 4. Verify and enable delivery

After the worker starts, its logs should include `Padalix worker ready`. Within
60 seconds, the API heartbeat must become healthy:

```bash
curl --fail --show-error https://api.padalix.com/health/worker
```

Do not test by enabling delivery against the production database: the worker
will lease every eligible queued notification. Instead, use a separate staging
database and worker with the same migrations and SES configuration:

1. Seed only a controlled notification addressed to an SES mailbox simulator.
2. Set `EMAIL_DELIVERY_ENABLED=true` on the staging worker and redeploy it.
3. Confirm the outbox row records the SES provider message ID.
4. Send one staging notification to an operator-owned address.
5. Confirm bounce and complaint events reach the configured AWS destination and
   alert. Application-level bounce ingestion remains future work.
6. Before production enablement, inspect the production outbox for unexpected
   pending mail, then change only the production worker variable to
   `EMAIL_DELIVERY_ENABLED=true` and redeploy it.

Monitor API readiness and worker heartbeat separately. The worker intentionally
has no HTTP port; `GET /health/worker` on the API is its authoritative public
probe. Add that endpoint to Padalix status monitoring and page an operator on a
non-200 response. Easypanel restarts an exited process, but a running worker can
remain alive while its cycles fail.

## Security notes

- Apply migrations with a direct Neon connection before deploying either
  runtime. Runtime services may use a pooled URL after it is tested.
- Rotate the database credential previously exposed in chat before production.
- One shared runtime database role is acceptable for the MVP. Before a regulated
  production release, provision separate least-privilege API, worker, and
  migrator roles together with explicit grants.
- Keep one worker replica while using a static `WORKER_ID`.
- Rotate AWS access keys independently and immediately after any exposure.

References:

- [Easypanel App services](https://easypanel.io/docs/services/app)
- [Amazon SES identity verification](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html)
- [Amazon SES production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [Amazon SES IAM access](https://docs.aws.amazon.com/ses/latest/dg/control-user-access.html)
- [AWS SDK credentials](https://docs.aws.amazon.com/sdkref/latest/guide/feature-static-credentials.html)
