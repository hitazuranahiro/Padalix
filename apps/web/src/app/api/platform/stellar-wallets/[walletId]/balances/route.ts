import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRequest } from "@/lib/platform";
import type { StellarBalanceList } from "@/lib/stellar";

type RouteContext = { params: Promise<{ walletId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { walletId } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(walletId)) return Response.json({ error: "Invalid wallet" }, { status: 400 });
  try {
    return Response.json(await platformRequest<StellarBalanceList>(session, `/v1/stellar-wallets/${encodeURIComponent(walletId)}/balances`));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Stellar balance unavailable" },
      { status: error instanceof PlatformError ? error.status : 503 },
    );
  }
}
