import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRequest } from "@/lib/platform";
import type { StellarClaimableBalance } from "@/lib/stellar";

export async function POST(request: Request) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  try {
    const result = await platformRequest<StellarClaimableBalance>(session, "/v1/stellar-claimable-balances/prepare", { method: "POST", headers: { "idempotency-key": idempotencyKey }, body: JSON.stringify(body) });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Claimable balance could not be prepared" }, { status: error instanceof PlatformError ? error.status : 503 });
  }
}
