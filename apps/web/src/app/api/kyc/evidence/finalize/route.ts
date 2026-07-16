import { customerEvidenceRequest } from "@/lib/kyc-evidence-route";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return customerEvidenceRequest(
    request,
    process.env.KYC_EVIDENCE_FINALIZE_URL,
    { sessionId: body.sessionId },
  );
}
