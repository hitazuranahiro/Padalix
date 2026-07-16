import { getCustomerSession } from "@/lib/session";
import { platformRequest } from "@/lib/platform";
import { stellarRouteError } from "@/lib/stellar-route";
import type { StellarWalletList } from "@/lib/stellar";

export async function GET() {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return Response.json(await platformRequest<StellarWalletList>(session, "/v1/stellar-wallets"));
  } catch (error) {
    return stellarRouteError(error, "Stellar wallets unavailable");
  }
}
