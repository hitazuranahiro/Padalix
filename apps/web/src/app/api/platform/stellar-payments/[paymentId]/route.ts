import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRequest } from "@/lib/platform";
import type { StellarPayment } from "@/lib/stellar";

type RouteContext = { params: Promise<{ paymentId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { paymentId } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(paymentId)) return Response.json({ error: "Invalid payment" }, { status: 400 });
  try {
    return Response.json(await platformRequest<StellarPayment>(session, `/v1/stellar-payments/${encodeURIComponent(paymentId)}`));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Stellar payment unavailable" },
      { status: error instanceof PlatformError ? error.status : 503 },
    );
  }
}
