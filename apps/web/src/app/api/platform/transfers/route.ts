import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRequest } from "@/lib/platform";

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const idempotencyKey = request.headers.get("idempotency-key") ?? crypto.randomUUID();
  try {
    return Response.json(await platformRequest(session, "/v1/transfers", { method: "POST", headers: { "idempotency-key": idempotencyKey }, body: JSON.stringify(body) }), { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Transfer unavailable" }, { status: error instanceof PlatformError ? error.status : 503 });
  }
}
