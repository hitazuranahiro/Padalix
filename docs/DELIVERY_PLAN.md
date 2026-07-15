# Padalix MVP Delivery Plan

## 1. Delivery Strategy

Build one thin, complete transfer journey before adding breadth:

```text
register
  -> verify identity
  -> view testnet balance
  -> create recipient
  -> request quote
  -> review fee and receive amount
  -> confirm transfer
  -> submit to Stellar testnet
  -> reconcile result
  -> view activity detail
```

This vertical slice is the first product milestone. Family distribution, claim flows, escrow, and CMS features should build on this proven transfer lifecycle rather than being developed as disconnected demos.

## 2. MVP Scope

### Included

- Installable responsive customer PWA.
- Email/password registration, verification, sign-in, and password reset.
- Testnet wallet/account and balance display.
- Saved recipients.
- Transparent quote with send amount, receive amount, rate, fee, and expiry.
- Single-recipient Stellar testnet transfer.
- Activity list and transfer-status detail.
- Smart Family Distribution using multiple transfer legs.
- Receive Without Bank demonstration using claim code and claimable balance.
- One milestone escrow demonstration using Soroban.
- Admin content, feature flags, user lookup, transfer lookup, and audit view.
- Structured logs, metrics, health checks, and test coverage for critical paths.

### Explicitly excluded

- Mainnet funds.
- Real PHP stablecoin promises without an issuer and liquidity agreement.
- Live bank, GCash, or cash-pickup settlement.
- Production KYC/AML or sanctions-vendor integration.
- Production custody.
- AI routing.
- Multi-corridor operation.
- Business payroll and public developer APIs.
- Offline transfer submission.

The interface may preview future payout methods, but unavailable methods must be labeled as demo or coming later.

## 3. Assumptions

The schedule below assumes a focused team of two or three engineers with shared product/design ownership. A single developer should expect roughly 12 to 16 weeks for the same scope. External partner and compliance work is not included in the MVP estimate.

## 4. Phase Plan

### Phase 0: Product and Risk Decisions

**Target:** 3 to 5 working days

Deliverables:

- Confirm MVP users, corridor, demo assets, and exact judging flow.
- Confirm that all money movement is testnet-only.
- Approve the temporary managed-wallet model.
- Freeze the MVP feature list and post-MVP list.
- Define success metrics and demo script.
- Create the initial architecture decision records.

Exit gate:

- Every MVP feature has an owner and acceptance criterion.
- Custody, asset, payout, and compliance limitations are written in product copy.
- No unresolved decision blocks repository scaffolding.

### Phase 1: Engineering Foundation

**Target:** Week 1

Deliverables:

- Create the monorepo structure.
- Move the existing landing page into `apps/marketing` without redesigning it.
- Scaffold customer PWA, admin app, auth service, Go API, Go worker, and Soroban workspace.
- Add Docker Compose with PostgreSQL and a local mail sandbox.
- Establish database roles and schemas.
- Add formatting, linting, unit-test, build, and migration checks.
- Add health and readiness endpoints.
- Publish the first OpenAPI document and generated TypeScript client.

Exit gate:

- A new developer can run the complete stack using documented commands.
- CI builds every application and runs isolated database migrations.
- PWA and admin can call the API readiness endpoint through the local edge proxy.
- Authenticated route wiring is represented by a stub and completed in Phase 2.

### Phase 2: Authentication and Product Shell

**Target:** Week 2

Deliverables:

- Better Auth registration, verification, sign-in, reset, and sign-out.
- JWT/JWKS integration between auth and Go.
- Padalix profile creation on first authenticated API access.
- Responsive PWA navigation and dashboard shell based on the approved mockup.
- Admin authentication and initial role enforcement.
- PWA manifest, install metadata, offline banner, and secure service-worker policy.
- Shared design tokens and core accessible components.

Exit gate:

- Registration through dashboard works on current Chrome, Safari, Firefox, and Edge.
- Mobile layouts work at narrow viewports without overflow.
- Unauthorized and wrong-role requests fail at the API, not only in the UI.
- No auth tokens are stored in browser local storage.

### Phase 3: First End-to-End Transfer

**Target:** Weeks 3 and 4

Deliverables:

- Asset and testnet-wallet data model.
- Recipient creation and selection.
- Immutable quote creation with expiry.
- Review screen with exact fee and receive amount.
- Transfer state machine and idempotent confirmation endpoint.
- Ledger transaction and balanced postings.
- Outbox job for Stellar submission.
- Worker submission and reconciliation through Stellar RPC.
- Activity list and transfer detail.
- Seeded demo accounts and repeatable demo reset.

Exit gate:

- The complete vertical slice succeeds against Stellar testnet.
- Repeated confirmation with the same idempotency key cannot duplicate a transfer.
- A failed or timed-out network call is retried without creating a second ledger transaction.
- The database, ledger, and Stellar reference reconcile after success.
- Playwright covers desktop and mobile happy paths.

This is the first meaningful internal release. Do not start Family Distribution until this gate passes.

### Phase 4: Differentiating MVP Features

**Target:** Weeks 5 and 6

Deliverables:

- Family rules with percentage and fixed-amount validation.
- Atomic creation of one parent transfer and multiple transfer legs.
- Claim-code generation, hashing, expiry, attempt limits, and redemption state.
- Stellar claimable-balance creation with a recovery claimant.
- Soroban milestone escrow contract and contract tests.
- Escrow creation, funding, release, refund, and activity views.
- Clear testnet and simulated-flow labels throughout the UI.

Exit gate:

- Family allocations must total correctly before confirmation.
- Retrying a family transfer never duplicates a leg.
- Expired or reused claim codes are rejected.
- Unclaimed balances have a tested recovery path.
- Escrow contract invariants pass automated tests.

### Phase 5: Admin, CMS, and Operations

**Target:** Week 7

Deliverables:

- Content entries with draft and published states.
- FAQs, announcements, legal content, and maintenance notice management.
- Feature flag and demo-asset configuration.
- User, transfer, claim, job, and escrow search.
- Controlled job retry and manual-review commands.
- Append-only audit view with actor and correlation ID.
- Operational dashboards for stuck transfers and failed jobs.

Exit gate:

- Every admin mutation is authorized and audited.
- Operators can diagnose a failed demo transfer without database access.
- Content changes require publishing and support rollback to the previous version.

### Phase 6: MVP Hardening and Demo Release

**Target:** Week 8

Deliverables:

- Complete empty, loading, failure, retry, and offline states.
- Accessibility and responsive-layout audit.
- Rate limits and abuse protections.
- Security headers and content security policy.
- Database backup and restore rehearsal.
- Load test for expected demo traffic.
- Dependency and secret scan.
- Error monitoring, metrics, and alert thresholds.
- Stable staging and demo deployments.
- Demo runbook, fallback video, seeded accounts, and known-limitations page.

Exit gate:

- All critical-path automated tests pass from a clean environment.
- No open severity-one or severity-two defects.
- The demo can be reset and repeated without manual database editing.
- The product never presents simulated payout capability as live.

## 5. Post-MVP Polish

### Phase 7: Product Polish

**Target:** 2 to 3 weeks

- Refine the Wise-inspired information hierarchy without copying its brand.
- Run usability sessions with OFWs, freelancers, and recipient-side users.
- Improve transfer comprehension, fee explanations, and recovery messages.
- Add Filipino localization and locale-aware currency formatting.
- Add web push only for meaningful transfer-status events.
- Improve perceived performance, skeletons, and route-level caching.
- Complete WCAG 2.2 AA remediation.

### Phase 8: Controlled Pilot Readiness

**Duration:** Determined by partners and regulatory work

- Select licensed on/off-ramp and payout partners.
- Design KYC, AML, sanctions, fraud, dispute, and case-management workflows.
- Complete custody architecture and key-management review.
- Integrate real quotes using applicable Anchor Platform protocols.
- Add treasury, liquidity, settlement, and daily reconciliation controls.
- Run application penetration testing and smart-contract audit.
- Define incident response, support escalation, and data-retention policies.
- Conduct legal review for each corridor and product claim.

No public mainnet launch occurs before this gate.

### Phase 9: Mainnet Pilot

- Limit participants, amounts, assets, corridor, and payout methods.
- Use allowlists and conservative limits.
- Require daily operational reconciliation.
- Monitor failure, fraud, payout time, quote accuracy, and support rates.
- Add rollback and partner-outage procedures.
- Expand only after the pilot meets agreed reliability and compliance metrics.

### Phase 10: Platform Expansion

- Business payroll and contractor payments.
- Partner API keys, webhooks, and developer portal.
- Additional payout partners and corridors.
- Liquidity-aware routing based on actual quotes.
- Separate services only where load, ownership, or regulation requires them.

## 6. Testing Strategy

| Layer | Coverage |
| --- | --- |
| Unit | Quote math, allocation rules, state transitions, permissions, decimal handling |
| Database integration | Constraints, migrations, ledger balance, idempotency, outbox behavior |
| API contract | OpenAPI request, response, and error compatibility |
| Auth integration | Cookie flow, JWT validation, role enforcement, revoked/expired sessions |
| Stellar integration | Transaction build, submit, reconcile, claimable balance, failure mapping |
| Contract | Soroban escrow invariants and authorization |
| End to end | Registration, transfer, family split, claim, escrow, admin inspection |
| Visual | Desktop and mobile screenshots at agreed breakpoints |
| Security | Dependency scan, secret scan, authorization tests, rate-limit tests |

Testnet network tests should be kept separate from deterministic CI tests because public infrastructure can be unavailable or rate-limited.

## 7. CI/CD Gates

Every pull request should run:

- Formatting and lint checks.
- Go unit and integration tests.
- TypeScript tests and production builds.
- Database migration up/down verification where rollback is supported.
- OpenAPI compatibility and generated-client drift check.
- Soroban contract tests.
- Dependency and secret scanning.
- Targeted Playwright smoke tests.

Deployment order:

1. Apply backward-compatible database migrations.
2. Deploy auth and API/worker.
3. Verify readiness and contract compatibility.
4. Deploy PWA and admin.
5. Run post-deployment smoke tests.

## 8. MVP Definition of Done

Padalix MVP is complete when:

- A user can install or use the PWA on mobile and desktop.
- Authentication, recovery, and authorization work end to end.
- A user can complete a transparent Stellar testnet transfer.
- The transfer has a balanced internal ledger record and reconciled Stellar reference.
- Family Distribution, claimable transfer, and escrow demos are functional rather than static UI.
- Admin users can inspect and support the flow without direct database access.
- Critical errors, retries, offline conditions, and expired data have designed states.
- Automated tests cover money math, idempotency, permissions, and primary journeys.
- Staging and demo are observable, repeatable, and documented.
- Product copy clearly separates live functionality, testnet functionality, and simulated integrations.

## 9. Suggested Workstreams

For a small team, organize work by responsibility rather than by service:

| Workstream | Primary responsibility |
| --- | --- |
| Product and design | Flow decisions, mockups, content, acceptance tests |
| Web platform | PWA, admin, shared UI, generated API client |
| Core platform | Go API, database, ledger, worker, OpenAPI |
| Stellar | Wallet abstraction, transactions, RPC reconciliation, Soroban |
| Quality and operations | CI, E2E, security baseline, environments, monitoring |

One person may own multiple workstreams, but each deliverable needs one accountable owner.

## 10. Immediate Next Actions

1. Approve the architecture decisions in `docs/ARCHITECTURE.md`.
2. Confirm the MVP signing model is testnet-only managed accounts.
3. Confirm the eight-week team schedule or replace it with a solo timeline.
4. Freeze the Phase 3 vertical-slice acceptance criteria.
5. Scaffold the repository and local environment.
6. Convert the generated mockup into design tokens and responsive application screens.
