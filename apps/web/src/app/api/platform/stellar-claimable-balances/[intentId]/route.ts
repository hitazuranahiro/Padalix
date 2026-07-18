import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRequest } from "@/lib/platform";
import type { StellarClaimableBalance } from "@/lib/stellar";

type RouteContext = { params: Promise<{ intentId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { intentId } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(intentId)) return Response.json({ error: "Invalid claimable balance" }, { status: 400 });
  try {
    return Response.json(await platformRequest<StellarClaimableBalance>(session, `/v1/stellar-claimable-balances/${encodeURIComponent(intentId)}`));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Claimable balance unavailable" }, { status: error instanceof PlatformError ? error.status : 503 });
  }
}
