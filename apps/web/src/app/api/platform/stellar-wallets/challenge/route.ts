import { getCustomerSession } from "@/lib/session";
import { platformRequest } from "@/lib/platform";
import { isStellarPublicKey, STELLAR_NETWORK, type StellarWalletChallenge } from "@/lib/stellar";
import { rejectCrossOrigin, stellarRouteError } from "@/lib/stellar-route";

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (rejectCrossOrigin(request)) return Response.json({ error: "Origin not allowed" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const publicKey = typeof body.publicKey === "string" ? body.publicKey.trim() : "";
  const network = typeof body.network === "string" ? body.network.toLowerCase().trim() : STELLAR_NETWORK;
  if (!isStellarPublicKey(publicKey)) {
    return Response.json({ error: "The wallet returned an invalid Stellar public key" }, { status: 400 });
  }
  if (network !== STELLAR_NETWORK) {
    return Response.json({ error: `Only Stellar ${STELLAR_NETWORK} is enabled for this deployment` }, { status: 400 });
  }

  try {
    const challenge = await platformRequest<StellarWalletChallenge>(session, "/v1/stellar-wallets/challenge", {
      method: "POST",
      body: JSON.stringify({ publicKey, network: STELLAR_NETWORK }),
    });
    return Response.json(challenge, { status: 201 });
  } catch (error) {
    return stellarRouteError(error, "Stellar challenge unavailable");
  }
}
