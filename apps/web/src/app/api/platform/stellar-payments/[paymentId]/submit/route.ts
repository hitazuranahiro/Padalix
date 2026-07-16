import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRequest } from "@/lib/platform";
import type { StellarPayment } from "@/lib/stellar";

type RouteContext = { params: Promise<{ paymentId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { paymentId } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(paymentId)) return Response.json({ error: "Invalid payment" }, { status: 400 });
  const body = await request.json().catch(() => null);
  try {
    const result = await platformRequest<StellarPayment>(session, `/v1/stellar-payments/${encodeURIComponent(paymentId)}/submit`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return Response.json(result, { status: 202 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Stellar transaction could not be submitted" },
      { status: error instanceof PlatformError ? error.status : 503 },
    );
  }
}
