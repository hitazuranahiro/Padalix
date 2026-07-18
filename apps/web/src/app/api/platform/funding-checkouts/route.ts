import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRequest } from "@/lib/platform";

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const input = await request.json().catch(() => ({}));
  const amount = typeof input.amount === "number" || typeof input.amount === "string" ? input.amount : "";
  const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN;
  if (!appOrigin?.startsWith("https://")) return Response.json({ error: "Production app origin is not configured" }, { status: 503 });
  const idempotencyKey = request.headers.get("idempotency-key") ?? crypto.randomUUID();
  try {
    const result = await platformRequest(session, "/v1/funding-checkouts", {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify({ amount, successRedirectURL: `${appOrigin}/fund?checkout=success`, failureRedirectURL: `${appOrigin}/fund?checkout=failed` }),
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Funding checkout unavailable" }, { status: error instanceof PlatformError ? error.status : 503 });
  }
}
