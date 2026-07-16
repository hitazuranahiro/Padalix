# In-house KYC and AML control plane

Padalix can own the KYC/AML workflow, policy engine, case management, audit
trail, and transaction-monitoring rules. It must not claim that an internally
built name matcher proves document authenticity, biometric liveness, or a
person's sanctions status. Authoritative list data, identity evidence, and
specialist review remain explicit inputs to the control plane.

Migration `017_compliance_control_plane.sql` adds the durable records for:

- versioned sanctions, PEP, adverse-media, law-enforcement, and internal lists;
- immutable screening runs and candidate-match dispositions;
- versioned transaction-monitoring rules and per-command evaluations;
- deduplicated risk signals and AML investigation cases;
- append-only compliance audit events.

The Go platform service adds two adapter implementations. The internal
watchlist adapter performs deterministic normalized-name triage against an
approved, versioned import. It emits only `potential_match`. The manual adapter
routes the request to review when no approved external source is configured.
`ExecuteScreening` writes the run, candidates, signals, cases, and audit event
in one database transaction. `LoadInternalWatchlistAdapter` reads only active,
effective, non-expired source versions from PostgreSQL. An empty or stale source
routes to manual review and cannot produce a clear result.

## Transaction monitoring

The initial rules are intentionally explainable and versioned:

| Rule | Initial threshold | Result |
| --- | --- | --- |
| Single transfer amount | `>= 2,500 USDC` | Flag |
| Transfers in one hour | Candidate becomes the fifth transfer | Review |
| Transfer amount in 24 hours | Candidate makes total `>= 5,000 USDC` | Review |
| Distinct recipients in seven days | `>= 8` | Flag |

Every triggered rule records the observed value, a stable reason code, risk
points, and an audit event. Review or block actions open or attach to a durable
AML case. The member-facing API returns only `transfer requires compliance
review`; it never exposes thresholds or match attributes. Monitoring snapshots
are serialized per account with a transaction-scoped advisory lock so parallel
transfer requests cannot bypass velocity thresholds.

The service starts in audit mode:

```dotenv
COMPLIANCE_ENFORCEMENT_ENABLED=false
```

In audit mode it records signals and cases but does not interrupt transfers.
Enable enforcement only after migration 017 is applied, monitoring thresholds
have been calibrated against representative traffic, reviewers own the queue,
alerts are tested, and a documented emergency disable procedure exists. With
enforcement enabled, `review` and `block` actions fail closed before funds or
the ledger are changed. Enforcement also requires an active account, a current
`clear` screening run, and no unresolved high or critical sanctions, PEP, or
adverse-media signal. Existing verified accounts must therefore be backfilled
through screening before the flag is enabled.

## Watchlist ingestion requirements

Do not scrape arbitrary websites directly into production. Each import must:

1. Come from an approved authority or contracted data supplier.
2. Record source URL, authority, retrieval time, effective time, version, and
   SHA-256 content digest in `compliance.watchlist_source`.
3. Load into a staging transaction, validate counts and identifiers, then make
   the new source active and supersede the previous version.
4. Quarantine malformed, unexpectedly empty, stale, or signature-invalid data.
5. Trigger ongoing re-screening for affected members after activation.
6. Retain enough source/version evidence to reproduce a decision without
   retaining unnecessary personal data.

Never automatically reject or permanently restrict a member from fuzzy name
matching. Sanctions, PEP, and adverse-media candidates require trained review,
documented disposition, dual control for high-risk overrides, and the approved
legal procedure.

## Still requires external capability or independent validation

- Government-source document validation and NFC/chip verification.
- Presentation-attack-resistant selfie liveness and face matching.
- Complete, current, licensed international sanctions/PEP/adverse-media data.
- Device and network intelligence where the risk model requires it.
- Independent validation of matching accuracy, false positives, fairness,
  retention, privacy notices, and jurisdiction-specific obligations.

These are adapter inputs, not reasons to outsource Padalix's decision policy or
case ownership. If an input is missing, stale, unavailable, or contradictory,
the control plane routes the case to manual review rather than treating it as
clear.

## Operations and audit

- Alert on source staleness, screening errors, open critical cases, SLA breach,
  review/block rates, false-positive rates, rule-volume changes, and queue age.
- Restrict watchlist imports, rule publication, match disposition, and case
  closure with separate staff permissions and recent MFA.
- Export audit events to immutable storage or a SIEM; the database trigger is a
  defense against accidental mutation, not protection from a database owner.
- Use four-eyes approval for sanctions overrides, critical-case closure, and
  production rule changes.
- Reconcile transfer holds and case outcomes daily and test the enforcement
  kill switch during incident exercises.

This increment provides the application control plane. It does not by itself
constitute an AML program, regulatory approval, certified identity technology,
or permission to enable a real-funds corridor.
