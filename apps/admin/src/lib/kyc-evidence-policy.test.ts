import assert from "node:assert/strict";
import test from "node:test";
import {
  extensionForMimeType,
  validateEvidenceFile,
} from "./kyc-evidence-policy";

const validFile = {
  role: "identity_document" as const,
  filename: "passport.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 4_096,
  checksumSha256: "a".repeat(64),
};

test("accepts a bounded identity document with a SHA-256 checksum", () => {
  assert.equal(validateEvidenceFile(validFile), null);
});

test("rejects PDF selfies and oversized selfie images", () => {
  assert.match(
    validateEvidenceFile({
      ...validFile,
      role: "selfie",
      mimeType: "application/pdf",
    }) ?? "",
    /JPEG or PNG/,
  );
  assert.match(
    validateEvidenceFile({
      ...validFile,
      role: "selfie",
      sizeBytes: 5 * 1_024 * 1_024 + 1,
    }) ?? "",
    /5 MB/,
  );
});

test("rejects malformed checksums and unsafe filenames", () => {
  assert.match(
    validateEvidenceFile({ ...validFile, checksumSha256: "ABC" }) ?? "",
    /SHA-256/,
  );
  assert.match(
    validateEvidenceFile({ ...validFile, filename: "../passport.jpg" }) ?? "",
    /filename/,
  );
});

test("maps accepted MIME types to stable object extensions", () => {
  assert.equal(extensionForMimeType("image/jpeg"), "jpg");
  assert.equal(extensionForMimeType("image/png"), "png");
  assert.equal(extensionForMimeType("application/pdf"), "pdf");
});
