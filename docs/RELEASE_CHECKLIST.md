# Release Checklist

This checklist turns the architecture and deployment runbook into an auditable staging-to-production release. Mainnet payment features remain disabled until the legal, compliance, provider, custody, and operational gates in `MAINNET_PILOT.md` are approved.

## 1. Required CI Gates

Every release commit must pass the GitHub `CI` workflow:

- frozen dependency installation;
- administrator unit tests;
- TypeScript type checks, ESLint, and production builds for every web surface;
- Go tests, race detection, static analysis, and builds;
- sequential migration validation plus two clean PostgreSQL applications;
- tracked-secret and deployment-metadata scan;
- production dependency audit with no high or critical advisory.

Protect `main` and require all three jobs: `verify`, `security`, and `migrations`. Do not bypass a gate for a production release.

## 2. Environment Isolation

Staging and production use separate databases, buckets, encryption keys, Better Auth secrets, support peppers, service tokens, email credentials, provider accounts, and allowlists. Preview deployments must never receive production secrets.

Before staging:

1. Rotate any credential shared in chat, a terminal transcript, an issue, or a previous deployment screen.
2. Confirm `.env` and `.vercel/` files are untracked with `bash scripts/check-secrets.sh`.
3. Keep administrator bootstrap sign-up disabled.
4. Keep KYC automatic approval and every mainnet/production connector disabled.
5. Configure the exact marketing, customer, admin, auth, and API origins; do not use wildcard CORS.

## 3. Preflight

Run from a clean checkout of the release commit:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @padalix/admin test
pnpm typecheck
pnpm lint
pnpm build
bash scripts/check-migrations.sh
bash scripts/check-secrets.sh
pnpm audit --prod --audit-level high
(cd services/platform && go test -race ./... && go vet ./...)
```

The current dependency audit may report lower-severity transitive advisories. Record their dependency paths, exploitability assessment, owner, and review date. A high or critical finding blocks release.

## 4. Database Release

1. Record the database engine version, migration role, backup identifier, and restore test evidence.
2. Take a point-in-time recovery checkpoint before applying migrations.
3. Apply migrations to an empty staging database, then replay them to verify idempotency.
4. Apply migrations to the existing staging database and run application smoke tests.
5. Review lock duration, row rewrites, and backward compatibility before production.
6. Apply production migrations once using the migrator role. Application runtimes must not own schema changes.

Do not roll back destructive SQL. Use a forward repair migration and roll back application code only when the active schema remains compatible.

## 5. Staging Deployment

Deploy in this order:

1. PostgreSQL migrations and private storage policy.
2. Go API with financial and KYC feature flags disabled.
3. Go worker with outbound email/provider jobs paused.
4. Administrator application.
5. Marketing application.
6. Customer PWA.
7. Enable staging-only worker/provider delivery after synthetic records pass.

Validate the deployed boundaries:

```bash
bash scripts/validate-deployment.sh staging \
  https://staging.padalix.com \
  https://app.staging.padalix.com \
  https://admin.staging.padalix.com \
  https://api.staging.padalix.com
```

The command checks HTTPS, CSP, HSTS, content sniffing protection, correlation IDs, API health, the public status route, and exact-origin support preflight.

Manually verify:

- registration, verification email, password recovery, sign-in, passkey enrollment, and logout;
- installable PWA behavior on current iOS and Android devices;
- basic-account capability denial and verified-account capability enforcement by the API;
- KYC direct upload, checksum failure, unsupported media, reviewer authorization, evidence-view audit, expiry, and deletion;
- support creation, private tracking, reply throttling, staff reply, and notification delivery;
- status probe failure, automatic incident opening, public banner propagation, recovery, and manual update;
- wallet connection and signed testnet transaction without exposing or storing a private key;
- worker restart, retry, dead letter, reconciliation exception, ledger balance, and idempotent replay.

## 6. Security Review

- Confirm browser mutation routes reject missing and foreign `Origin` values.
- Confirm edge/WAF rules cover auth, recovery, support, KYC intents, payments, and admin mutations. Application memory limits are defense in depth and do not provide global serverless enforcement.
- Confirm support successful-ticket and reply limits are serialized in PostgreSQL.
- Trace one `X-Correlation-ID` through the PWA, Go API, worker, and provider logs without recording credentials, KYC data, or payment details.
- Review the CSP report and wallet/camera flows. The compatibility policy currently permits inline scripts/styles; migrate to nonce-based CSP after the Next.js rendering path is prepared.
- Verify staff MFA, role separation, recent-auth requirements, document-access audits, and break-glass ownership.
- Confirm object storage blocks public access and enforces encryption, content limits, signed URL expiry, malware scanning, and retention.

## 7. Production Approval

Record named approval from engineering, security, operations, compliance, legal, and the regulated payout/custody partner. A production release does not enable mainnet by itself.

Before enabling any real-funds corridor, all conditions in `PRODUCTION_MVP.md` and `MAINNET_PILOT.md` must pass, including licensing analysis, partner certification, KYB, safeguarding/custody, sanctions and transaction monitoring, reconciliation, disputes, limits, incident response, and a tested shutdown procedure.

## 8. Production Deployment and Rollback

1. Announce the change window and freeze unrelated administrative changes.
2. Apply the approved database release.
3. Deploy API, worker, admin, marketing, then customer PWA.
4. Run `scripts/validate-deployment.sh production` with the production origins.
5. Run read-only and synthetic smoke tests before gradually enabling approved server-side flags.
6. Monitor HTTP errors, latency, status probes, auth failures, rate-limit responses, outbox age, worker retries, dead letters, reconciliation exceptions, and ledger imbalance alerts.

Rollback triggers include elevated authentication failures, evidence-access violations, persistent API errors, ledger imbalance, duplicate settlement, reconciliation drift, notification leakage, or status propagation failure. Disable the affected server-side command first, pause workers/providers when required, preserve evidence, then roll back the application deployment. Start the incident process and publish an accurate status update.

For each release, retain the commit SHA, CI run, migration output, backup/restore evidence, environment changes, deployment identifiers, validation output, manual test results, approvals, incidents, and rollback decision.
