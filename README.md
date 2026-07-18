<p align="center">
  <a href="https://padalix.com">
    <img src="apps/marketing/public/images/padalix-social-logo.png" alt="Padalix logo" width="148" />
  </a>
</p>

<h1 align="center">Padalix</h1>

<p align="center"><strong>One gateway for crypto and cash.</strong></p>

<p align="center">
  A PWA-first remittance and settlement platform connecting transparent payment
  experiences with Stellar-powered infrastructure.
</p>

<p align="center">
  <a href="https://padalix.com"><strong>Website</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="https://app.padalix.com">Launch App</a>
  &nbsp;&middot;&nbsp;
  <a href="https://padalix.com/presentation">Presentation</a>
  &nbsp;&middot;&nbsp;
  <a href="https://padalix.com/docs">Documentation</a>
  &nbsp;&middot;&nbsp;
  <a href="https://padalix.com/status">System Status</a>
</p>

<p align="center">
  <a href="https://github.com/hitazuranahiro/Padalix/actions/workflows/ci.yml">
    <img src="https://github.com/hitazuranahiro/Padalix/actions/workflows/ci.yml/badge.svg" alt="Padalix CI status" />
  </a>
</p>

---

## Overview

Padalix is designed to make cross-border value movement clear, trackable, and
accessible for Filipino families. The product combines an installable customer
PWA, an operations and compliance back office, a Go platform API, PostgreSQL,
and Stellar testnet integrations in one modular repository.

The current release is an MVP and controlled demonstration environment. Stellar
flows run on testnet unless explicitly configured otherwise, and funding or
payout connectors remain disabled until their operational, security, and
regulatory requirements are satisfied.

## Product Surfaces

| Surface | Production URL | Responsibility |
| --- | --- | --- |
| Marketing | [padalix.com](https://padalix.com) | Product pages, announcements, documentation, support, and public status |
| Customer PWA | [app.padalix.com](https://app.padalix.com) | Accounts, identity verification, recipients, transfers, wallets, claims, and receipts |
| Admin and CMS | [admin.padalix.com](https://admin.padalix.com) | Content, support, KYC review, service operations, incidents, and audit history |
| Platform API | [api.padalix.com](https://api.padalix.com/health) | Authoritative business rules, persistence, Stellar orchestration, and background jobs |

## Current Capabilities

| Domain | What is implemented | Current boundary |
| --- | --- | --- |
| Customer experience | Responsive PWA, onboarding, profile, settings, notifications, passkeys, and session controls | Web and installed PWA |
| Transfers | Server-generated quotes, recipients, idempotent transfer records, receipts, and exports | Sandbox and Stellar testnet |
| Stellar | External-wallet linking, signed testnet payments, reconciliation, and claimable balances | Non-custodial testnet flow |
| Family distribution | Saved distribution plans and multi-recipient execution | MVP orchestration |
| Identity and compliance | Tiered account capabilities, KYC review, risk signals, manual decisions, and audit events | Human approval remains authoritative |
| Operations | Support tickets, notification outbox, status monitoring, incidents, and service health | Persistent worker required |
| Content | Draft and publish CMS, announcements, media uploads, legal content, help, and presentation pages | Restricted administrator access |
| Smart contracts | Soroban milestone escrow contract, tests, deployment metadata, and audit notes | Prototype; not a production custody product |
| Funding connector | Ganap PHP checkout adapter with signed webhook reconciliation | Disabled by default; not a payout rail |

## Architecture

Padalix uses separate deployable surfaces around a shared platform and database.
Business rules remain in the Go API; the browser applications own presentation,
session-aware interaction, and first-party API boundaries.

```mermaid
flowchart LR
    Visitor["Public visitor"] --> Marketing["Marketing site"]
    Customer["Customer"] --> PWA["Customer PWA"]
    Operator["Authorized operator"] --> Admin["Admin and CMS"]

    Marketing --> CMS["Published CMS content"]
    PWA --> Auth["Better Auth"]
    Admin --> Auth
    PWA --> API["Go platform API"]
    Admin --> API

    Auth --> DB[("PostgreSQL")]
    API --> DB
    Worker["Go worker"] --> DB
    API --> Stellar["Stellar network"]
    Worker --> Stellar
    Admin --> Storage["Private S3-compatible storage"]
    Worker --> Email["Transactional email"]
```

## Repository Structure

```text
Padalix/
|-- apps/
|   |-- marketing/            # Public Next.js website
|   |-- web/                  # Customer Next.js PWA and Better Auth
|   `-- admin/                # Administrator CMS and operations console
|-- services/
|   `-- platform/             # Go API and persistent worker
|-- contracts/
|   `-- milestone-escrow/     # Soroban contract and tests
|-- packages/
|   `-- content/              # Shared typed public content
|-- scripts/                  # Migrations, local launchers, checks, and seed data
|-- docs/                     # Architecture, deployment, compliance, and runbooks
`-- docker-compose.yml        # Local PostgreSQL
```

## Technology

- **Frontend:** Next.js 16, React 19, TypeScript
- **Authentication:** Better Auth with separate customer and administrator sessions
- **Platform:** Go 1.25, `net/http`, `pgx`
- **Database:** PostgreSQL with versioned SQL migrations
- **Network:** Stellar SDK, Horizon, RPC, and Soroban
- **Storage:** S3-compatible private evidence and public media storage
- **Email:** Amazon SES through the persistent Go worker
- **Delivery:** Vercel for Next.js surfaces; container runtime for the API and worker

## Local Development

### Prerequisites

- Node.js 22
- pnpm 11.7
- Go 1.25
- Docker with Compose
- PostgreSQL client tools (`psql`)
- Rust and Cargo only when working on the Soroban contract

### Setup

```bash
git clone https://github.com/hitazuranahiro/Padalix.git
cd Padalix
pnpm install
docker compose up -d postgres
```

Copy `apps/admin/.env.example` to `apps/admin/.env.local`, replace every
placeholder secret, and point `DATABASE_URL` to the local Compose database:

```dotenv
DATABASE_URL=postgresql://padalix:padalix-local-only@127.0.0.1:5432/padalix
```

Apply the database migrations:

```bash
pnpm db:migrate
```

Start each runtime in a separate terminal:

```bash
pnpm dev:marketing   # http://localhost:3000
pnpm dev:admin       # http://localhost:3001
pnpm dev:web         # http://localhost:3002
pnpm dev:platform    # http://localhost:8080
pnpm dev:worker
```

Environment templates are available in:

- [`apps/marketing/.env.example`](apps/marketing/.env.example)
- [`apps/web/.env.example`](apps/web/.env.example)
- [`apps/admin/.env.example`](apps/admin/.env.example)
- [`services/platform/.env.example`](services/platform/.env.example)

Never commit real credentials. Rotate any credential that has been exposed in
logs, screenshots, chat, or version history.

## Verification

Run the repository checks before opening a pull request:

```bash
pnpm typecheck
pnpm lint
pnpm build

cd services/platform
go test -race ./...
go vet ./...

cd ../../contracts/milestone-escrow
cargo test
```

CI also validates migration replay, secret scanning, and production dependency
advisories.

## Deployment

The three Next.js applications are deployed as separate Vercel projects. The Go
API and worker require a persistent container runtime and access to the same
PostgreSQL database.

Before enabling production enforcement or external connectors:

1. Apply every migration in order.
2. Confirm database TLS and least-privilege credentials.
3. Deploy and verify the persistent worker.
4. Configure private evidence storage and transactional email.
5. Keep mainnet, automatic compliance enforcement, and connectors disabled
   until their release checklists are complete.

See the [deployment guide](docs/DEPLOYMENT.md), [operations runbook](docs/OPERATIONS_RUNBOOK.md),
and [release checklist](docs/RELEASE_CHECKLIST.md).

## Documentation

- [Project description](PROJECT_DESCRIPTION.md)
- [System architecture](docs/ARCHITECTURE.md)
- [MVP delivery plan](docs/DELIVERY_PLAN.md)
- [Production MVP plan](docs/PRODUCTION_MVP.md)
- [Mainnet pilot controls](docs/MAINNET_PILOT.md)
- [KYC and AML design](docs/IN_HOUSE_KYC_AML.md)
- [KYC evidence storage](docs/KYC_EVIDENCE_STORAGE.md)
- [Notifications and compliance](docs/NOTIFICATIONS_AND_COMPLIANCE.md)
- [Smart contract audit notes](docs/SMART_CONTRACT_AUDIT.md)

## Security and Regulatory Notice

Padalix is not represented by this repository as a licensed remittance operator,
bank, custodian, or payment gateway. Production money movement must use approved
partners, documented compliance controls, legal review, and jurisdiction-specific
licensing. Testnet assets and sandbox balances have no monetary value.

Security issues should not be disclosed in a public GitHub issue. Contact the
project maintainers through [padalix.com](https://padalix.com).

---

<p align="center">
  <strong><a href="https://padalix.com">Padalix</a></strong><br />
  Proudly created by <strong>Tomeku</strong> (<a href="https://tomeku.com">Tomeku.com</a>).
</p>
