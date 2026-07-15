# Padalix International Identity Automation and Account Tiers

## 1. Purpose and operating principle

This document defines the implementation contract for identity qualification, machine-assisted KYC triage, manual review, and account capability enforcement. It extends the existing `identity`, `compliance`, and `notification` boundaries without making a particular verification vendor part of Padalix's domain model.

No model or identity vendor is the final authority for an adverse decision. Automation may approve a low-risk application only when every mandatory control passes. Uncertain, conflicting, high-risk, or potentially adverse results go to a trained reviewer. A reviewer, not a model, rejects a member or applies an enduring restriction.

"International support" means Padalix maintains an explicit country and document policy for each launched corridor. It does not mean every government document is accepted everywhere. Legal and compliance owners must approve each country policy before production enablement.

## 2. Trust states and capability tiers

Authentication, identity verification, and account permissions are separate concepts:

- `auth_state` proves control of a login and email address.
- `kyc_state` records the current identity-verification result.
- `risk_state` records compliance and fraud risk.
- `account_tier` selects a policy-defined set of limits.
- `capability` is the final server-side permission for a specific action.

The Go API evaluates capabilities on every sensitive command. The PWA may hide unavailable actions for usability, but it is never the enforcement point.

### 2.1 Account tiers

| Tier | Entry requirements | Permitted capabilities | Prohibited or gated capabilities |
| --- | --- | --- | --- |
| `basic` | Registered account, verified email, accepted terms | Manage profile and security, browse supported corridors, create recipient drafts, request indicative quotes, start KYC, contact support | Hold funds, fund an account, send, receive settlement, withdraw, claim, schedule, bulk send, create API credentials |
| `verified_individual` | Approved standard KYC, no active sanctions or fraud restriction | Single-recipient transfers within corridor limits, receive permitted transfers, saved recipients, claims, normal withdrawal, transaction history | Bulk payouts, payment-gateway credentials, business settlement, activity above enhanced limits |
| `enhanced_individual` | Approved enhanced due diligence, source-of-funds evidence when required | Higher policy limits, scheduled transfers, family distribution, bounded multi-recipient send where legally permitted | Merchant acquiring, business payout API, activity above enhanced limits |
| `verified_business` | Approved KYB, verified beneficial owners and controllers, approved use case | Business settlement, batch payouts, scoped API credentials, signed webhooks, payment-gateway features explicitly enabled for the merchant | Unapproved corridors, products, settlement currencies, or volume bands |
| `restricted` | Compliance, fraud, security, legal, or operational hold | Login, security controls, support, KYC remediation, view records as policy permits | All money movement and credential issuance unless an explicit restriction exception exists |

Limits are configuration, not hard-coded tier behavior. At minimum, policy keys include per-transaction, daily, rolling 30-day, recipient-count, velocity, corridor, asset, funding-source, and payout-method limits.

### 2.2 Capability decision

Every protected command requests a decision such as:

```json
{
  "memberId": "mem_123",
  "capability": "transfers.create",
  "context": {
    "amountMinor": 50000,
    "currency": "PHP",
    "destinationCountry": "PH",
    "recipientCount": 1,
    "fundingMethod": "bank"
  }
}
```

The policy engine returns:

```json
{
  "allowed": false,
  "reasonCode": "KYC_REQUIRED",
  "requiredTier": "verified_individual",
  "currentTier": "basic",
  "nextAction": "START_KYC",
  "policyVersion": "ph-remittance-2026-01"
}
```

Denials use stable reason codes and safe member-facing messages. Internal risk features, sanctions match details, model internals, and reviewer notes must not be returned to the PWA.

## 3. International country and document policy

Maintain versioned policy records rather than embedding country rules in application code.

### 3.1 Country policy

Each ISO 3166-1 alpha-2 country record defines:

- lifecycle: `draft`, `test`, `enabled`, `suspended`, or `retired`;
- permitted residency, nationality, origin, and destination combinations;
- minimum age and local age-calculation rules;
- accepted document types and issuing countries;
- required evidence by tier, including proof of address and source of funds;
- document freshness, expiry, and remaining-validity rules;
- transliteration and supported-script rules;
- liveness and biometric-consent requirements;
- sanctions, PEP, adverse-media, and local-watchlist requirements;
- enhanced due-diligence triggers;
- tier limits and capability overrides;
- retention period, residency requirements, and deletion/legal-hold rules;
- policy owner, approver, effective date, and immutable version.

A country without an approved `enabled` policy is unavailable. Fallback to a global default must never silently enable money movement.

### 3.2 Document policy

The document catalog keys each rule by issuing country, document type, and version. It records machine-readable-zone availability, barcode or chip expectations, required front/back images, accepted languages/scripts, security-feature checks, maximum age, expiry behavior, and vendor coverage.

Examples include passport, national identity card, driver's license where legally acceptable, residence permit, and country-specific voter or tax identity documents only after legal approval. Proof of address and business records are supporting evidence, not automatically identity documents.

When no approved document is supported, the member receives `DOCUMENT_NOT_SUPPORTED` and may use a policy-approved alternative or support path. The system must not guess a document type from appearance alone.

## 4. Verification pipeline

The orchestration service owns the case state. Vendors provide evidence signals and do not directly mutate a member's tier.

```text
registration
  -> country/document eligibility
  -> consent and evidence capture
  -> file safety and quality checks
  -> document authenticity and data extraction
  -> biometric/liveness comparison when required
  -> identity consistency and duplicate detection
  -> sanctions/PEP/watchlist screening
  -> fraud and velocity signals
  -> deterministic policy evaluation
  -> automated approval OR manual review
  -> capability grant/restriction
  -> ongoing monitoring and reverification
```

### 4.1 Vendor-neutral evidence adapter

Each provider adapter normalizes provider output into Padalix signals:

```json
{
  "provider": "configured-provider",
  "providerCaseId": "external-reference",
  "signalVersion": "1",
  "capturedAt": "2026-07-16T00:00:00Z",
  "signals": [
    {
      "code": "DOCUMENT_AUTHENTICITY",
      "outcome": "pass",
      "confidence": 0.97,
      "reasonCodes": ["SECURITY_FEATURES_PRESENT"],
      "evidenceRefs": ["evidence_123"]
    }
  ]
}
```

Raw vendor payloads are encrypted, access-controlled, retention-limited, and referenced by object key. Normalized signals, provider/model versions, policy version, timestamps, and reason codes remain available for audit and replay.

### 4.2 Required signal families

| Signal family | Examples | Mandatory result behavior |
| --- | --- | --- |
| Capture quality | Blur, glare, crop, resolution, unsupported file, suspected injection | Retry capture for remediable quality failures; manual review for persistent or contradictory results |
| Document integrity | Template match, security features, MRZ/barcode consistency, tampering, expiry | Failed authenticity or tampering can never auto-approve |
| Data extraction | Name, birth date, document number, issuing country, expiry | Low-confidence or conflicting required fields require recapture or review |
| Person match | Selfie-to-document similarity, age consistency | Below the calibrated review boundary requires human review; do not expose a biometric score to the member |
| Liveness | Presentation attack, replay, deepfake/injection indicators | Failed or inconclusive required liveness blocks automation |
| Identity consistency | Registration/profile match, duplicate identity, reused document, device/account linkage | Material mismatch or suspected duplicate requires review |
| Screening | Sanctions, PEP, adverse media, law-enforcement or local lists where lawful | Potential sanctions match immediately restricts money movement and requires specialist review; never auto-reject from fuzzy matching alone |
| Fraud/behavior | Device integrity, impossible velocity, network reputation, synthetic identity indicators | Elevated risk routes to review or security restriction according to policy |

## 5. Machine-assisted decisioning

Padalix uses deterministic mandatory gates plus calibrated model signals. A single opaque model score is insufficient for approval.

### 5.1 Normalized scoring

Provider-specific confidence values are calibrated on Padalix validation data before production use. The decision service stores normalized values:

- `identity_confidence`: 0.00 to 1.00, higher is better;
- `document_confidence`: 0.00 to 1.00, higher is better;
- `biometric_confidence`: 0.00 to 1.00, higher is better;
- `fraud_risk`: 0.00 to 1.00, higher is riskier;
- `overall_risk_points`: 0 to 100, higher is riskier;
- independent categorical screening outcomes: `clear`, `potential_match`, `confirmed_match`, or `unavailable`.

Thresholds are versioned per country, document, vendor/model version, and capture channel. Initial values below are launch guardrails, not universal biometric truth:

| Automated outcome | Required conditions |
| --- | --- |
| Approve standard KYC | Country/document policy enabled; all required evidence present; document, identity, and required biometric confidence each `>= 0.92`; fraud risk `<= 0.15`; overall risk points `<= 20`; screening `clear`; no hard stop or conflicting data; model/provider version approved for automation |
| Manual review | Any confidence in the review band `0.70-0.919`; fraud risk `0.151-0.60`; risk points `21-69`; PEP or adverse-media result; potential sanctions/watchlist match; duplicate suspicion; material data conflict; required signal unavailable; random quality-control sample |
| Recapture/information request | Remediable image quality failure, missing side/page, unreadable field, expired supporting evidence, or member-correctable mismatch |
| Immediate restriction and specialist review | Confirmed or high-confidence sanctions escalation, fraud risk `> 0.60`, risk points `>= 70`, detected presentation/injection attack, document tampering, or policy hard stop |

The final row is not an automatic account rejection. It blocks new money movement, preserves relevant evidence, and creates a priority review. Confirmed sanctions handling follows the approved legal procedure.

### 5.2 Hard stops

Hard stops override the aggregate score:

- unsupported or disabled country/corridor;
- member below permitted age;
- expired identity document when the policy requires validity;
- failed required document authenticity;
- failed required liveness or detected injection attack;
- confirmed duplicate identity used contrary to policy;
- active legal or account restriction;
- unresolved sanctions screening;
- incomplete mandatory consent.

### 5.3 Model governance

Before a model or provider version can auto-approve, compliance and engineering record:

- intended use and prohibited uses;
- training/evaluation provenance available from the provider;
- validation by country, document type, capture device, skin tone/appearance cohorts where lawful, age bands, and supported scripts;
- false-accept, false-reject, review-rate, and calibration results;
- decision thresholds and approval owner;
- monitoring limits, rollback version, and kill switch;
- change log and expiration/revalidation date.

Monitor approval rate, review rate, false-accept proxies, member retry rate, reviewer overturn rate, drift, latency, and failures by supported cohort. Material disparity, drift, vendor outage, missing signals, or unapproved model versions disables automated approval and sends cases to manual review. Do not train on production identity evidence without an explicit lawful basis, approved retention, and documented consent where required.

## 6. Explainability and human oversight

Every automated recommendation records:

- policy, ruleset, provider, model, and threshold versions;
- input signal codes and normalized outcomes;
- hard stops and weighted contributions;
- recommendation: `approve`, `review`, `recapture`, or `restrict_review`;
- stable reason codes;
- evidence references and correlation ID;
- execution time and whether any signal was unavailable.

Reviewer UI presents evidence and reason codes, not only an aggregate score. It must show conflicts, image/evidence access audit status, screening escalation, previous decisions, and the effect of a proposed decision on account capabilities.

Reviewers may approve, request information, reject, restrict, or escalate within their authority. They must select a reason code and provide a decision summary. A reviewer cannot approve their own test account or a case they manually modified outside the workflow.

The following require dual control by two distinct authorized staff members:

- critical-risk approval;
- confirmed sanctions resolution or override;
- high-limit enhanced/business activation;
- reversal of a compliance restriction;
- manual override of failed authenticity or liveness controls.

Members receive a plain-language outcome, remediation path, and appeal/contact route where applicable. They do not receive sensitive fraud logic, watchlist matching attributes, or information that would facilitate evasion.

## 7. Case state machine

Extend the current lifecycle without replacing its existing public states:

```text
draft -> submitted -> automated_checks
                     -> needs_information -> submitted
                     -> in_review -> escalated
                                  -> pending_second_approval
                                  -> approved
                                  -> rejected
                                  -> restricted
approved -> reverification_due -> submitted
approved -> expired
```

External provider callbacks are authenticated, timestamp checked, idempotent, and stored before processing. A stale callback cannot overwrite a newer case decision. Terminal decisions require an immutable event and transactional capability-policy update.

Reverification triggers include document expiry, material profile change, sanctions-list update, risk/velocity threshold, dormant-account reactivation, new corridor or product, business ownership change, and periodic country-policy review.

## 8. Data model additions

The current `compliance.kyc_case`, `kyc_document`, `kyc_review`, and `kyc_event` tables remain the case-system foundation. The Go-owned migration should add:

| Record | Required fields |
| --- | --- |
| `compliance.country_policy` | country code, version, lifecycle, effective dates, requirements JSON, limits JSON, owner, approver |
| `compliance.document_policy` | issuing country, document type/version, lifecycle, capture and validation requirements, provider coverage |
| `compliance.verification_run` | case, attempt, provider/model/policy versions, state, recommendation, normalized scores, hard stops, correlation ID |
| `compliance.verification_signal` | run, signal code, outcome, confidence/risk, reason codes, evidence references, source timestamp |
| `compliance.screening_result` | case, screening type, provider reference, outcome, match strength, list/version timestamp, resolution state |
| `compliance.decision` | case, recommendation/final decision, actor type/id, reason codes, summary, policy version, superseded decision |
| `compliance.approval` | decision, reviewer, approval type, created time, uniqueness constraint per reviewer |
| `identity.account_policy_state` | member, tier, restrictions, policy version, granted/review/expiry timestamps |
| `identity.capability_override` | member, capability, allow/deny, reason, approver, effective and expiry times |

Personally identifying fields that support search should use deterministic keyed hashes or tokenization; document numbers and biometric templates must not be stored in plaintext. Raw images remain in encrypted private object storage with short-lived access, malware/content validation, access logging, retention schedules, and deletion/legal-hold workflows.

## 9. Service and event contracts

Recommended Go API commands:

```text
POST /api/v1/identity/verification-cases
POST /api/v1/identity/verification-cases/{reference}/evidence
POST /api/v1/identity/verification-cases/{reference}/submit
GET  /api/v1/identity/verification-cases/current
POST /api/v1/internal/verification/providers/{provider}/webhooks
POST /api/v1/admin/compliance/cases/{reference}/decisions
POST /api/v1/admin/compliance/cases/{reference}/approvals
POST /api/v1/policy/capability-decisions
```

The evidence endpoint returns presigned upload instructions and accepts only metadata/checksums after upload. It does not proxy identity-document bytes through the admin or public Next.js applications.

Domain events written through the transactional outbox include:

- `identity.verification_submitted`
- `identity.verification_check_completed`
- `identity.verification_information_requested`
- `identity.verification_approved`
- `identity.verification_rejected`
- `identity.reverification_required`
- `identity.account_tier_changed`
- `identity.capability_restricted`
- `compliance.case_escalated`

Consumers must be idempotent. Notification recipients remain scoped to the affected member and authorized staff; KYC evidence or sensitive reason details must never enter email payloads.

## 10. Authorization and operational security

- Main-app members and back-office reviewers use separate Better Auth tenants and cookies.
- `compliance_reviewer` may review assigned queues but cannot manage users, CMS, support, secrets, policy publication, or transaction execution.
- `senior_compliance_reviewer` may complete configured second approvals but cannot approve their own first decision.
- Only `compliance_policy_admin` may publish signed country and threshold policies; publication itself requires dual approval.
- Evidence access is just-in-time, purpose-bound, and audited with member, case, reviewer, timestamp, and reason.
- Production identity data is never copied to local development, analytics tools, error trackers, or model-training stores.
- Service credentials, webhook secrets, encryption keys, and signing keys are environment-specific and rotated.
- The admin domain is network/risk controlled, uses phishing-resistant MFA for privileged staff, short sessions, and step-up authentication for critical decisions.

## 11. Failure behavior

- Vendor timeout or outage: preserve submission, show `checks_pending`, retry with bounded backoff, then route to review; never approve on missing evidence.
- Screening service unavailable: block approval and money movement until screening completes.
- Model/version not approved: disable automation for that scope and route to review.
- Policy missing or expired: deny the capability with `POLICY_UNAVAILABLE` and alert operations.
- Conflicting provider results: preserve all results and escalate; do not select the more favorable result automatically.
- Compromised provider or key: disable the adapter, reject new callbacks, rotate secrets, and replay preserved events after incident review.

## 12. Delivery phases

### Phase A: policy-enforced basic accounts

- Add server-side capability decisions and make every money-movement endpoint require `verified_individual` or higher.
- Implement versioned country/document policies with one approved pilot corridor.
- Preserve the existing manual review workflow and add mandatory reason codes.
- Add capability and decision audit events.

### Phase B: vendor-assisted review

- Integrate one provider through the normalized adapter.
- Add document authenticity, extraction, liveness, face comparison, and screening signals.
- Route all cases to reviewers while collecting calibration and overturn data.
- Implement provider webhook authentication, idempotency, and replay.

### Phase C: controlled automated approval

- Enable low-risk auto-approval only for validated country/document/device combinations.
- Start with a small percentage, including a random reviewer quality-control sample.
- Add drift, disparity, error-budget, vendor-health, and approval-rate monitors with a kill switch.
- Keep all uncertain and adverse outcomes human-reviewed.

### Phase D: enhanced individuals and business gateway

- Add source-of-funds/source-of-wealth workflows and transaction monitoring.
- Add KYB, beneficial-owner verification, business risk, and dual approvals.
- Enable batch payouts and payment-gateway credentials only through explicit business capability grants.
- Complete corridor-specific legal review, custody controls, dispute handling, and regulatory reporting before launch.

## 13. Acceptance criteria

- A `basic` member cannot create, confirm, fund, settle, claim, withdraw, schedule, or batch a transfer through any API path.
- Changing client state, JWT custom fields, or request payload cannot grant a tier or capability.
- Every automated approval can be reproduced from stored normalized signals and immutable policy/model versions.
- Missing, unavailable, contradictory, or out-of-scope signals never result in automated approval.
- A potential sanctions match restricts money movement and reaches the specialist queue without an automatic rejection.
- Critical or configured high-limit decisions require two distinct authorized reviewers.
- Reviewer overrides record the original recommendation, reasons, actor, evidence access, and resulting capability change.
- Country/document combinations not explicitly enabled fail closed.
- Vendor callbacks are authenticated, idempotent, replayable, and cannot regress a terminal decision.
- Automated approval can be disabled globally or by country, document, provider, model version, and capture channel without a deployment.
- Notifications contain no document images, document numbers, biometric data, detailed watchlist results, or internal fraud features.
- Retention expiry removes eligible evidence while preserving the minimum legally required decision and audit record.

## 14. Production readiness gate

Machine-assisted KYC is not production-ready until Padalix has selected regulated operating entities and corridors, obtained legal advice for those jurisdictions, completed vendor due diligence and data-processing agreements, approved biometric and privacy notices, documented model governance, trained reviewers, tested incident and appeal procedures, and validated capability enforcement with independent security testing.
