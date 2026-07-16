import { getKycReviewerSession } from "@/lib/admin-session";
import {
  getKycCase,
  kycRisks,
  reviewKycCase,
  type KycRisk,
} from "@/lib/kyc";
import { guardAdminMutation } from "@/lib/request-security";

type RouteContext = { params: Promise<{ reference: string }> };

export async function GET(_: Request, context: RouteContext) {
  if (!(await getKycReviewerSession()))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await getKycCase((await context.params).reference);
  return result
    ? Response.json(result)
    : Response.json({ error: "Not found" }, { status: 404 });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getKycReviewerSession();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const guarded = guardAdminMutation(request, {
    scope: "kyc.case.review",
    subject: session.user.id,
    limit: 30,
    windowMs: 60_000,
  });
  if (guarded) return guarded;

  const body = await request.json().catch(() => ({}));
  const riskLevel = kycRisks.includes(body.riskLevel as KycRisk)
    ? (body.riskLevel as KycRisk)
    : undefined;
  try {
    const result = await reviewKycCase(
      (await context.params).reference,
      {
        action: typeof body.action === "string" ? body.action : "",
        note:
          typeof body.note === "string"
            ? body.note.trim().slice(0, 5000)
            : undefined,
        reasonCode:
          typeof body.reasonCode === "string"
            ? body.reasonCode.trim().slice(0, 100)
            : undefined,
        riskLevel,
        assignedTo:
          body.assignedTo === null || typeof body.assignedTo === "string"
            ? body.assignedTo?.trim().slice(0, 100) || null
            : undefined,
      },
      {
        id: session.user.id,
        name: session.user.name,
        role: session.user.role ?? "compliance_reviewer",
      },
    );
    return result
      ? Response.json(result)
      : Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Review failed" },
      { status: 400 },
    );
  }
}
