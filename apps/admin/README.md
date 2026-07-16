# Padalix Administrator CMS

Separate Next.js administrator application intended for `admin.padalix.com`.

## Local setup

1. Copy `.env.example` to `.env.local` and set PostgreSQL plus a random `BETTER_AUTH_SECRET` of at least 32 characters.
2. Run `pnpm db:migrate` from the repository root to apply the CMS, auth, support, and KYC/compliance schemas in the correct search paths.
3. Generate the Better Auth tables with `pnpm auth:generate`, review the migration, and apply it with the auth database role using the `auth` search path.
4. Run `pnpm dev:admin` from the repository root.

## First administrator

When `BETTER_AUTH_ALLOW_SIGNUP=true`, `/signup` exposes the temporary bootstrap form and new accounts receive the `admin` role. Create the initial account, then immediately set the variable back to `false` and restart the admin application.

Never leave bootstrap sign-up enabled in a deployed environment.

## Vercel

- Root directory: `apps/admin`
- Domain: `admin.padalix.com`
- Set every variable from `.env.example` in the Vercel project.
- The marketing project uses `CMS_CONTENT_URL=https://admin.padalix.com/api/content/published` and revalidates published content every 60 seconds.

Draft saves and publishes write an append-only event to `audit.admin_event`.

Presentation PDFs are accepted through the authenticated CMS, limited to 10 MB, and stored in `content.asset`. The public presentation route uses the bundled submission until an administrator uploads and publishes a replacement URL.

## Support operations

The administrator support desk is available at `/support`. Public customer endpoints live below `/api/support/tickets` and use a per-ticket random access key; only a SHA-256 hash of that key is stored. Public requests are origin-restricted, validated, honeypot-protected, and rate-limited using a hashed reporter IP.

Set these production variables:

- `SUPPORT_ALLOWED_ORIGINS=https://padalix.com`
- `SUPPORT_TOKEN_PEPPER` to a separate long random secret
- `NEXT_PUBLIC_SUPPORT_API_URL=https://admin.padalix.com/api/support/tickets` in the marketing deployment

Ticket, message, workflow event, and notification-outbox records live in the `support` schema. Notification records are created in the same transaction as customer-visible events. Actual email delivery is intentionally provider-neutral: deploy a worker that claims pending `support.notification_outbox` rows, sends through the selected provider, and records `sent` or `failed` state with retry metadata.

## KYC review

The KYC desk is available at `/kyc`. Administrators can provision a `compliance_reviewer` from `/team`; that role can access only the KYC APIs and workspace. The standalone customer app submits document metadata through `/api/internal/kyc/cases` using `KYC_INGEST_SECRET`. Document bytes belong in encrypted private object storage and must never be sent through the admin page.

KYC member and staff notifications are written to `notification.outbox`. Configure `KYC_REVIEW_EMAIL` for the compliance queue. Email delivery still requires the Go worker and selected email provider described in the architecture plan.

Machine assessments are stored with provider, model, policy versions, normalized scores, reason codes, and recommendation. `KYC_AUTO_APPROVAL_ENABLED` defaults to `false`. Enable it only after country/document policies, screening, model validation, monitoring, and an operational kill switch have passed the production readiness gate. Automation can approve a low-risk case but never reject a member; adverse or uncertain results require human review.

## Service status

The administrator status console is available at `/status`. Migration `010_status_system.sql` creates the component, observed-check, incident, incident-update, and incident-component records. Configure a unique `CRON_SECRET`; the Vercel Pro cron invokes `/api/cron/status` every minute and the same checks can be started manually by an administrator.

Automatic notices open only after three consecutive failures and resolve after two consecutive successes. All automatic and manual incident changes are recorded in `audit.admin_event`. The public `/api/status` response includes only published incidents and public components. Observed percentages are derived from stored checks and are not an SLA.
