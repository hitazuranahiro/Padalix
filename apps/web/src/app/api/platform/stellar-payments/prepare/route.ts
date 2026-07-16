import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRequest } from "@/lib/platform";
import type { StellarPayment } from "@/lib/stellar";

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  const body = await request.json().catch(() => null);
  try {
    const result = await platformRequest<StellarPayment>(session, "/v1/stellar-payments/prepare", {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify(body),
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Stellar payment could not be prepared" },
      { status: error instanceof PlatformError ? error.status : 503 },
    );
  }
}
