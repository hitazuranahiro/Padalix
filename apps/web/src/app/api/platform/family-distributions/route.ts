import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRequest } from "@/lib/platform";

function errorResponse(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : "Family distributions unavailable" },
    { status: error instanceof PlatformError ? error.status : 503 },
  );
}

export async function GET() {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await platformRequest(session, "/v1/family-distributions"));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const idempotencyKey = request.headers.get("idempotency-key") ?? crypto.randomUUID();
  try {
    const result = await platformRequest(session, "/v1/family-distributions", {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify(body),
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
