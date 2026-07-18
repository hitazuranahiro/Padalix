import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRequest } from "@/lib/platform";

type RouteContext = { params: Promise<{ planId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { planId } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(planId)) return Response.json({ error: "Invalid family distribution" }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const idempotencyKey = request.headers.get("idempotency-key") ?? crypto.randomUUID();
  try {
    const result = await platformRequest(session, `/v1/family-distributions/${encodeURIComponent(planId)}/executions`, { method: "POST", headers: { "idempotency-key": idempotencyKey }, body: JSON.stringify(body) });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Family distribution could not be executed" }, { status: error instanceof PlatformError ? error.status : 503 });
  }
}
