import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRequest } from "@/lib/platform";

type RouteContext = { params: Promise<{ reference: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { reference } = await context.params;
  const normalized = reference.trim().toUpperCase();
  if (!/^PDX-\d{4}-\d{6}$/.test(normalized)) return Response.json({ error: "Invalid transfer reference" }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  try {
    const result = await platformRequest(session, `/v1/transfers/${encodeURIComponent(normalized)}/claims`, { method: "POST", body: JSON.stringify(body) });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Claim could not be created" }, { status: error instanceof PlatformError ? error.status : 503 });
  }
}
