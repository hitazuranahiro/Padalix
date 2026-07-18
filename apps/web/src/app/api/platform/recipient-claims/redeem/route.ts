import { rejectCrossOrigin } from "@/lib/stellar-route";

export async function POST(request: Request) {
  if (rejectCrossOrigin(request)) return Response.json({ error: "Origin not allowed" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const claimToken = typeof body.claimToken === "string" ? body.claimToken.trim() : "";
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (claimToken.length < 70 || claimToken.length > 140 || idempotencyKey.length < 8 || idempotencyKey.length > 100) return Response.json({ error: "Invalid claim redemption" }, { status: 400 });
  const origin = process.env.PLATFORM_API_ORIGIN_URL;
  if (!origin) return Response.json({ error: "Claim service is not configured" }, { status: 503 });
  try {
    const upstream = await fetch(`${origin}/v1/recipient-claims/redeem`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey }, body: JSON.stringify({ claimToken }), cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const result = await upstream.json().catch(() => ({ error: "Claim service returned an invalid response" }));
    return Response.json(result, { status: upstream.status });
  } catch {
    return Response.json({ error: "Claim service unavailable" }, { status: 503 });
  }
}
