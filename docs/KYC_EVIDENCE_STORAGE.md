# KYC Evidence Storage

Padalix stores KYC evidence in a private S3-compatible bucket. PostgreSQL stores object references, integrity metadata, workflow state, and access audit records only. Image and PDF bytes must never be written to PostgreSQL, application logs, notification payloads, or email.

## Upload lifecycle

1. The authenticated customer application sends filenames, MIME types, byte sizes, and browser-computed SHA-256 checksums to the web API.
2. The web API adds the authenticated subject, name, and email and calls the internal evidence-intent endpoint with `KYC_INGEST_SECRET`.
3. The admin service enforces the file policy, creates a 20-minute session, generates opaque object keys, and returns 10-minute presigned `PUT` URLs.
4. The browser uploads directly to private storage with signed content type, size, SHA-256 metadata, and provider-specific encryption constraints.
5. Finalization checks size, type, and signed metadata. AWS S3 returns its SHA-256 checksum; for R2 the admin service retrieves the bounded object and computes SHA-256 itself because R2 does not implement the S3 `PutObject` SHA-256 checksum header. The computed checksum must match before a KYC case is created.
6. Upload success creates a `submitted` case for manual review. It does not approve the member or grant verified capabilities.

Accepted customer evidence is JPEG or PNG. PDF is supported by the storage policy for future document channels, but selfies can never be PDF. Files must be at least 1 KB; identity documents are limited to 10 MB and selfies to 5 MB. The current browser capture flow limits both captures to 5 MB.

## Reviewer access

Reviewers never receive permanent object URLs. The admin access endpoint requires an authenticated KYC reviewer and a structured purpose, records the actor, case, object, hashed source IP, user agent, result, and timestamp, then returns a two-minute presigned `GET` URL. Storage keys are not exposed by the case API.

## Bucket controls

- Disable all public access and object ACLs.
- Require TLS and server-side encryption. Cloudflare R2 encrypts every object automatically, so use `KYC_EVIDENCE_S3_ENCRYPTION=provider`. For AWS S3 use `AES256`, or use `aws:kms` together with `KYC_EVIDENCE_S3_KMS_KEY_ID`.
- Give the admin service principal only `PutObject`, `HeadObject`, and `GetObject` for the `kyc-evidence/*` prefix. It does not need bucket listing or delete access.
- Configure bucket CORS for `PUT` from the exact customer origins. Allow `content-type`, `x-amz-checksum-sha256`, `x-amz-meta-padalix-sha256`, and the configured server-side-encryption headers. Do not use wildcard origins in production.
- Enable versioning, access logging, and an approved retention lifecycle. Deletion and legal-hold handling require a separate controlled process; application endpoints intentionally cannot delete evidence.
- Use a dedicated access key or workload identity. Never expose S3 credentials through `NEXT_PUBLIC_*` variables.

### Cloudflare R2 production configuration

Create a private `padalix-kyc-production` bucket and an Object Read & Write API
token scoped only to that bucket. Configure the admin runtime with:

```dotenv
KYC_EVIDENCE_S3_BUCKET=padalix-kyc-production
KYC_EVIDENCE_S3_REGION=auto
KYC_EVIDENCE_S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
KYC_EVIDENCE_S3_FORCE_PATH_STYLE=false
KYC_EVIDENCE_S3_ACCESS_KEY_ID=<r2-access-key-id>
KYC_EVIDENCE_S3_SECRET_ACCESS_KEY=<r2-secret-access-key>
KYC_EVIDENCE_S3_ENCRYPTION=provider
KYC_EVIDENCE_S3_KMS_KEY_ID=
```

Apply this bucket CORS rule, replacing preview origins when staging is used:

```json
[
  {
    "AllowedOrigins": ["https://app.padalix.com"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": [
      "content-type",
      "x-amz-meta-padalix-sha256"
    ],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

## Configuration and failure behavior

The required server-only variables are documented in `apps/admin/.env.example`. An optional endpoint and path-style mode support private S3-compatible services. If bucket, region, or credentials are absent, evidence-intent and reviewer-access requests fail closed with no fallback storage key or database-only submission.

The web service needs only the internal intent/finalization URLs and `KYC_INGEST_SECRET`. The browser receives individual short-lived signed URLs, never storage credentials.

## Operational checks

- Apply migration `016_kyc_evidence_storage.sql` after migration `015`.
- Confirm bucket CORS with a real browser upload in staging.
- Verify a modified byte, MIME type, size, or checksum cannot finalize.
- Verify expired sessions and expired reviewer URLs fail.
- Review `compliance.kyc_evidence_access_audit` regularly and alert on unusual access volume or repeated failures.
- Run lifecycle deletion and legal-hold exercises before accepting production identity evidence.
