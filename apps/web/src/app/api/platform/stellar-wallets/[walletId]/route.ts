import { getCustomerSession } from "@/lib/session";
import { platformRequest } from "@/lib/platform";
import { rejectCrossOrigin, stellarRouteError } from "@/lib/stellar-route";

type RouteContext = { params: Promise<{ walletId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (rejectCrossOrigin(request)) return Response.json({ error: "Origin not allowed" }, { status: 403 });

  const { walletId } = await context.params;
  const id = walletId.trim();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
    return Response.json({ error: "Invalid Stellar wallet id" }, { status: 400 });
  }

  try {
    await platformRequest(session, `/v1/stellar-wallets/${encodeURIComponent(id)}`, { method: "DELETE" });
    return new Response(null, { status: 204 });
  } catch (error) {
    return stellarRouteError(error, "Stellar wallet could not be unlinked");
  }
}
