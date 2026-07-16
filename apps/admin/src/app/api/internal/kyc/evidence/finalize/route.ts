import { finalizeEvidenceSession } from "@/lib/kyc-evidence";
import {
  hasInternalKycAuthorization,
  requestAuditContext,
} from "@/lib/internal-auth";

export async function POST(request: Request) {
  if (!hasInternalKycAuthorization(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const authSubject =
    typeof body.authSubject === "string"
      ? body.authSubject.trim().slice(0, 200)
      : "";
  if (!/^[0-9a-f-]{36}$/.test(sessionId) || !authSubject)
    return Response.json(
      { error: "Invalid evidence finalization request." },
      { status: 400 },
    );
  try {
    return Response.json(
      await finalizeEvidenceSession(
        sessionId,
        authSubject,
        requestAuditContext(request),
      ),
    );
  } catch (error) {
    console.error("KYC evidence finalization failed", error);
    const message =
      error instanceof Error
        ? error.message
        : "Evidence could not be finalized.";
    return Response.json(
      { error: message },
      { status: message.includes("configured") ? 503 : 400 },
    );
  }
}
