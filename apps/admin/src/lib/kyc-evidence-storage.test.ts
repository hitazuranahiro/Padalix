import assert from "node:assert/strict";
import test from "node:test";
import { createEvidenceUpload, hashSourceIp } from "./kyc-evidence-storage";

test("fails closed when private evidence storage is not configured", async () => {
  const names = [
    "KYC_EVIDENCE_S3_BUCKET",
    "KYC_EVIDENCE_S3_REGION",
    "KYC_EVIDENCE_S3_ACCESS_KEY_ID",
    "KYC_EVIDENCE_S3_SECRET_ACCESS_KEY",
  ] as const;
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  for (const name of names) delete process.env[name];
  try {
    await assert.rejects(
      createEvidenceUpload({
        key: "test",
        mimeType: "image/jpeg",
        sizeBytes: 1_024,
        checksumSha256: "a".repeat(64),
      }),
      /not configured/,
    );
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test("hashes audit IP addresses only with a configured pepper", () => {
  const previous = process.env.KYC_AUDIT_IP_PEPPER;
  delete process.env.KYC_AUDIT_IP_PEPPER;
  assert.throws(() => hashSourceIp("203.0.113.9"), /not configured/);
  process.env.KYC_AUDIT_IP_PEPPER = "test-only-pepper";
  const hashed = hashSourceIp("203.0.113.9");
  assert.match(hashed ?? "", /^[0-9a-f]{64}$/);
  assert.notEqual(hashed, "203.0.113.9");
  if (previous === undefined) delete process.env.KYC_AUDIT_IP_PEPPER;
  else process.env.KYC_AUDIT_IP_PEPPER = previous;
});

test("uses provider-managed encryption for Cloudflare R2 uploads", async () => {
  const values = {
    KYC_EVIDENCE_S3_BUCKET: "padalix-kyc-production",
    KYC_EVIDENCE_S3_REGION: "auto",
    KYC_EVIDENCE_S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
    KYC_EVIDENCE_S3_ACCESS_KEY_ID: "test-access-key",
    KYC_EVIDENCE_S3_SECRET_ACCESS_KEY: "test-secret-key",
    KYC_EVIDENCE_S3_ENCRYPTION: "provider",
  };
  const previous = Object.fromEntries(
    Object.keys(values).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, values);
  try {
    const upload = await createEvidenceUpload({
      key: "kyc-evidence/test/document.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1_024,
      checksumSha256: "a".repeat(64),
    });
    assert.equal(upload.headers["x-amz-server-side-encryption"], undefined);
    assert.equal(upload.headers["x-amz-checksum-sha256"], undefined);
    assert.match(upload.url, /r2\.cloudflarestorage\.com/);
    assert.doesNotMatch(upload.url, /x-amz-checksum-crc32/i);
    assert.doesNotMatch(upload.url, /x-amz-sdk-checksum-algorithm/i);
    assert.doesNotMatch(upload.url, /x-amz-meta-padalix-sha256=/i);
    const signedHeaders =
      new URL(upload.url).searchParams.get("X-Amz-SignedHeaders") ?? "";
    assert.match(signedHeaders, /content-type/);
    assert.match(signedHeaders, /x-amz-meta-padalix-sha256/);
  } finally {
    for (const name of Object.keys(values)) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
