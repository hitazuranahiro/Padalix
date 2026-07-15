# Padalix Notifications and Compliance Boundary

## Notification audiences

Padalix does not send every operational event to every member. Notifications are routed to the smallest appropriate audience.

| Event | Member recipient | Staff recipient | Delivery class |
| --- | --- | --- | --- |
| Registration and email verification | Registering member | None | Security, mandatory |
| Password or account security change | Affected member | Security operations on escalation | Security, mandatory |
| KYC submitted | Affected member | Compliance queue | Compliance, mandatory |
| KYC information request or decision | Affected member | Assigned reviewer or escalation queue | Compliance, mandatory |
| Transfer status, receipt, or failure | Transfer participants allowed by policy | Operations on exception | Transactional, mandatory |
| Support reply | Ticket requester | Assigned support agent | Transactional, mandatory |
| Product announcement | Consenting members only | None | Product, optional |
| Service-wide security incident | Affected or all members, depending on scope | Security and operations | Security, mandatory |

The `notification.outbox` table is the delivery contract for member and staff email. The Go worker should claim rows with `FOR UPDATE SKIP LOCKED`, render versioned templates, send through the configured provider, and record retries without duplicating delivery. Product messages must honor `notification.member_preference.product_email`; compliance, security, and transactional notices must not be repurposed for marketing.

Detailed country/document policy, automation thresholds, and capability tiers are defined in [International Identity Automation and Account Tiers](./KYC_AUTOMATION_AND_ACCOUNT_TIERS.md).

## Identity boundary

- Customer registration belongs to the standalone Better Auth service used by the main PWA.
- The customer auth subject is mapped to `identity.member.auth_subject` in the platform database.
- Administrator and reviewer accounts remain in the back-office Better Auth tenant and never become customer members automatically.
- The customer PWA and Go API never receive administrator session cookies.
- A service-authenticated integration submits KYC packages after private object-storage upload.
- The ingestion API accepts object keys and checksums, not raw document bytes.

## KYC role and workflow

`compliance_reviewer` is a least-privilege back-office role. It can list and review KYC cases but cannot access CMS, support administration, or staff provisioning.

```text
submitted -> in_review -> needs_information -> in_review
                       -> approved
                       -> rejected
                       -> expired
```

Every assignment, risk change, note, information request, and decision produces an append-only compliance event. Critical-risk approvals and rejections require an administrator. Before a regulated pilot, add vendor webhooks, sanctions and PEP screening, liveness results, dual approval where required, retention/deletion policies, document-access logging, and corridor-specific legal review.

## Payment gateway expansion

KYC status must become a policy input rather than a UI-only flag. The Go API must enforce KYC tier, account restrictions, transaction limits, sanctions results, merchant verification, and enhanced due-diligence requirements before quote confirmation or settlement. Merchant webhooks require signed payloads, idempotency keys, delivery retries, and a separate developer credential lifecycle.
