import { createEvidenceSession } from "@/lib/kyc-evidence";
import {
  customerDocumentTypes,
  evidenceRoles,
  type CustomerDocumentType,
  type EvidenceRole,
} from "@/lib/kyc-evidence-policy";
import {
  hasInternalKycAuthorization,
  requestAuditContext,
} from "@/lib/internal-auth";

const clean = (value: unknown, maximum: number) =>
  typeof value === "string" ? value.trim().slice(0, maximum) : "";

export async function POST(request: Request) {
  if (!hasInternalKycAuthorization(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const files = Array.isArray(body.files)
    ? body.files.slice(0, 3).map((item: unknown) => {
        const file =
          item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : {};
        return {
          role: clean(file.role, 30) as EvidenceRole,
          filename: clean(file.filename, 200),
          mimeType: clean(file.mimeType, 100),
          sizeBytes:
            typeof file.sizeBytes === "number" ? file.sizeBytes : Number.NaN,
          checksumSha256: clean(file.checksumSha256, 64).toLowerCase(),
        };
      })
    : [];
  const input = {
    authSubject: clean(body.authSubject, 200),
    email: clean(body.email, 254).toLowerCase(),
    fullName: clean(body.fullName, 150),
    countryCode: clean(body.countryCode, 2).toUpperCase(),
    documentType: clean(body.documentType, 40) as CustomerDocumentType,
    files,
  };
  if (
    !input.authSubject ||
    !/^\S+@\S+\.\S+$/.test(input.email) ||
    input.fullName.length < 2 ||
    !/^[A-Z]{2}$/.test(input.countryCode) ||
    !customerDocumentTypes.includes(input.documentType) ||
    files.some(
      (file: { role: EvidenceRole }) => !evidenceRoles.includes(file.role),
    )
  ) {
    return Response.json(
      { error: "Invalid evidence upload request." },
      { status: 400 },
    );
  }
  try {
    return Response.json(
      await createEvidenceSession(input, requestAuditContext(request)),
      { status: 201 },
    );
  } catch (error) {
    console.error("KYC evidence intent failed", error);
    const message =
      error instanceof Error
        ? error.message
        : "Evidence upload could not be prepared.";
    return Response.json(
      { error: message },
      { status: message.includes("configured") ? 503 : 400 },
    );
  }
}
