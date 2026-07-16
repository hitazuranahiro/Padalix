export const evidenceMimeTypes = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;
export const evidenceRoles = ["identity_document", "selfie"] as const;
export const customerDocumentTypes = [
  "passport",
  "national_id",
  "drivers_license",
] as const;

export type EvidenceRole = (typeof evidenceRoles)[number];
export type EvidenceMimeType = (typeof evidenceMimeTypes)[number];
export type CustomerDocumentType = (typeof customerDocumentTypes)[number];

export const evidencePolicy = {
  minimumBytes: 1_024,
  identityDocumentMaximumBytes: 10 * 1_024 * 1_024,
  selfieMaximumBytes: 5 * 1_024 * 1_024,
  uploadUrlSeconds: 10 * 60,
  reviewerUrlSeconds: 2 * 60,
  sessionSeconds: 20 * 60,
} as const;

export type EvidenceFileInput = {
  role: EvidenceRole;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
};

export function validateEvidenceFile(input: EvidenceFileInput) {
  if (!evidenceRoles.includes(input.role)) return "Unsupported evidence role.";
  if (!evidenceMimeTypes.includes(input.mimeType as EvidenceMimeType))
    return "Only JPEG, PNG, or PDF evidence is accepted.";
  if (input.role === "selfie" && input.mimeType === "application/pdf")
    return "Selfies must be JPEG or PNG images.";
  if (
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < evidencePolicy.minimumBytes
  )
    return "Evidence file is too small.";
  const maximum =
    input.role === "selfie"
      ? evidencePolicy.selfieMaximumBytes
      : evidencePolicy.identityDocumentMaximumBytes;
  if (input.sizeBytes > maximum)
    return `Evidence file exceeds the ${maximum / 1_024 / 1_024} MB limit.`;
  if (!/^[0-9a-f]{64}$/.test(input.checksumSha256))
    return "A lowercase SHA-256 checksum is required.";
  if (
    !input.filename.trim() ||
    input.filename.length > 200 ||
    /[\\/\0]/.test(input.filename)
  )
    return "Evidence filename is invalid.";
  return null;
}

export function extensionForMimeType(mimeType: EvidenceMimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "pdf";
}
