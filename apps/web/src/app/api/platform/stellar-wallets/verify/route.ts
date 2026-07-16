import { getCustomerSession } from "@/lib/session";
import { platformRequest } from "@/lib/platform";
import type { StellarWalletLink } from "@/lib/stellar";
import { rejectCrossOrigin, stellarRouteError } from "@/lib/stellar-route";

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (rejectCrossOrigin(request)) return Response.json({ error: "Origin not allowed" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim().slice(0, 100) : "";
  const transaction = typeof body.transaction === "string" ? body.transaction.trim() : "";
  if (!challengeId || !transaction || transaction.length > 100_000) {
    return Response.json({ error: "Invalid signed Stellar challenge" }, { status: 400 });
  }

  try {
    const wallet = await platformRequest<StellarWalletLink>(session, "/v1/stellar-wallets/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId, transaction }),
    });
    return Response.json(wallet, { status: 201 });
  } catch (error) {
    return stellarRouteError(error, "Stellar verification unavailable");
  }
}
