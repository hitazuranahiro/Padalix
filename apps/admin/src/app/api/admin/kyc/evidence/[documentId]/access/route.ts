import { getKycReviewerSession } from "@/lib/admin-session";
import { createReviewerEvidenceAccess } from "@/lib/kyc-evidence";
import { requestAuditContext } from "@/lib/internal-auth";
import { guardAdminMutation } from "@/lib/request-security";

export async function POST(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const session = await getKycReviewerSession();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const guarded = guardAdminMutation(request, {
    scope: "kyc.evidence.access",
    subject: session.user.id,
    limit: 30,
    windowMs: 60_000,
  });
  if (guarded) return guarded;
  const body = await request.json().catch(() => ({}));
  const purpose =
    typeof body.purpose === "string" ? body.purpose.trim().slice(0, 64) : "";
  try {
    const { documentId } = await context.params;
    return Response.json(
      await createReviewerEvidenceAccess(
        documentId,
        {
          id: session.user.id,
          role: session.user.role ?? "compliance_reviewer",
        },
        purpose,
        requestAuditContext(request),
      ),
    );
  } catch (error) {
    console.error("KYC evidence access failed", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Evidence access failed.",
      },
      { status: 400 },
    );
  }
}
