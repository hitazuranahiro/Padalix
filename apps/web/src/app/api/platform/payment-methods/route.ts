import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRequest } from "@/lib/platform";

export async function GET(request: Request) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const country = url.searchParams.get("country") ?? "PH";
  const currency = url.searchParams.get("currency") ?? "PHP";
  try {
    return Response.json(await platformRequest(session, `/v1/payment-methods?country=${encodeURIComponent(country)}&currency=${encodeURIComponent(currency)}`));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Payment methods unavailable" }, { status: error instanceof PlatformError ? error.status : 503 });
  }
}
