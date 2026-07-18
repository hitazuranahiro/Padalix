import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRequest } from "@/lib/platform";
import type { StellarClaimableBalance } from "@/lib/stellar";

type RouteContext = { params: Promise<{ intentId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { intentId } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(intentId)) return Response.json({ error: "Invalid claimable balance" }, { status: 400 });
  const body = await request.json().catch(() => null);
  try {
    const result = await platformRequest<StellarClaimableBalance>(session, `/v1/stellar-claimable-balances/${encodeURIComponent(intentId)}/submit`, { method: "POST", body: JSON.stringify(body) });
    return Response.json(result, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Claimable balance could not be submitted" }, { status: error instanceof PlatformError ? error.status : 503 });
  }
}
