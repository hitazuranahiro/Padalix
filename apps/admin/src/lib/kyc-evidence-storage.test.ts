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
