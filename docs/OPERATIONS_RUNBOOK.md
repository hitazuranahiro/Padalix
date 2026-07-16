# Padalix Operations Runbook

## Purpose and Ownership

This runbook covers the platform API, persistent worker, PostgreSQL outboxes,
Stellar reconciliation, transactional email, and the public status system. The
on-call operations owner is incident commander until engineering, security, or
compliance explicitly assumes that role. Never declare a transfer successful
from provider acceptance alone; receipt evidence, ledger state, and
reconciliation must agree.

## Initial Service Objectives

These are pilot targets, not customer contractual SLAs:

| Signal | Objective | Page threshold |
| --- | --- | --- |
| API availability | 99.9% over 30 days | Three failed one-minute probes |
| Worker freshness | Heartbeat age below 60 seconds | `/health/worker` returns `503` |
| Platform reconciliation queue | Oldest pending job below 60 seconds | Above 60 seconds for 5 minutes |
| Notification queues | Oldest transactional item below 5 minutes | Above 5 minutes for 15 minutes |
| Dead-letter jobs | Zero unresolved | Any new item |
| Reconciliation exceptions | Zero unassigned after 15 minutes | Any unassigned item at 15 minutes |
| Support first response | Per configured ticket priority | Any SLA breach |

Measure objectives from `operations.status_check`,
`operations.worker_heartbeat`, the authenticated
`/internal/operations/metrics` endpoint, and the administrator operations
console. A lack of telemetry is an incident, not proof of availability.

## Alert Routing

1. **P1:** suspected duplicate or incorrect money movement, ledger imbalance,
   credential compromise, or confirmed sensitive-data exposure. Page
   engineering, security, operations, and compliance immediately. Disable the
   affected corridor or command before investigation.
2. **P2:** worker unavailable, reconciliation backlog, provider outage, database
   degradation, or customer transfers unable to progress. Page engineering and
   operations; publish an incident when customer impact is confirmed or the
   status monitor opens one automatically.
3. **P3:** notification delay, isolated support workflow failure, or elevated
   latency without failed transactions. Notify the owning team during the
   active support window and monitor for escalation.

All pages must contain the affected component, start time, correlation ID or
job/reference identifiers, observed impact, and current owner. Never place
customer PII, identity evidence, credentials, or full payout instruments in an
alert.

## Worker or Queue Incident

1. Check `https://api.padalix.com/health`, then
   `https://api.padalix.com/health/worker`. API `200` with worker `503` means the
   database is reachable but no fresh successful worker cycle is recorded.
2. Inspect the admin operations console for heartbeat age, consecutive errors,
   pending age, failed jobs, and reconciliation exceptions.
3. Inspect container logs by `WORKER_ID` and error code. Restart one replica only
   after confirming another deployment is not actively processing its lease.
4. If backlog age continues rising, pause new transfer submission or the
   affected corridor. Do not repeatedly retry dead-letter jobs without
   documenting the cause.
5. Resolve the dependency, then confirm two successful status probes, a fresh
   heartbeat, falling queue age, and matched ledger/provider/Stellar evidence.
6. Record the timeline and remediation in the incident. Resolve the public
   incident only after customer processing is verified, not merely after a
   process restart.

## Reconciliation Mismatch

1. Freeze automated retries for the affected transfer or corridor.
2. Compare the immutable transfer receipt, provider reference, Stellar
   transaction hash and ledger, and Padalix double-entry postings.
3. Never edit ledger postings in place. Correct them with an approved balancing
   transaction and retain the original evidence.
4. Require a second operator for a production-value correction. Record the
   evidence and approvers in the reconciliation exception before resolving it.
5. Escalate suspected duplication, loss, sanctions exposure, or unauthorized
   movement as P1 and notify compliance.

## Status Communication

The status cron probes enabled `operations.status_component` records every
minute. Three failures open an incident; two successes resolve its automated
component condition. Operators must add plain-language impact and progress
updates at least every 30 minutes for P1 and every 60 minutes for P2. Never
promise a recovery time until the responsible engineer confirms it.

## Backup and Disaster Recovery

Pilot recovery objectives are **RPO 15 minutes** and **RTO 4 hours** for the
platform database. Production activation requires managed point-in-time
recovery, encrypted backups in a separate failure domain, and an operator-owned
inventory of database, R2, SES, Vercel, DNS, and container recovery access.

Perform a quarterly restore exercise into an isolated environment:

1. Restore the selected recovery point without connecting workers or email.
2. Apply forward migrations and run integrity checks for ledger balance,
   transfer/receipt linkage, outbox idempotency, KYC evidence metadata, and
   audit history.
3. Start the API in read-only validation mode, then one worker with outbound
   providers disabled.
4. Record achieved RPO/RTO, row counts, failed checks, and approvers. Delete the
   exercise environment under the documented retention policy.
5. A restore exercise is not successful until transfer, ledger, reconciliation,
   support, status, and KYC metadata checks pass. R2 object recovery and access
   must be tested separately without exposing identity evidence publicly.

## Change and Evidence Requirements

Every production release needs migration validation, Go and application tests,
an owner, rollback or forward-fix procedure, and a link to the release record.
Retain status incidents, restore reports, access reviews, reconciliation
approvals, and security-event evidence according to the approved compliance
retention schedule. Rotate service credentials after any suspected exposure.
