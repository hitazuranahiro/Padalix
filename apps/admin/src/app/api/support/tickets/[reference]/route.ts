import { getPublicTicket } from "@/lib/support";
import { guardSupportOrigin, guardSupportRateLimit, supportJson, supportPreflight } from "@/lib/support-http";

export const runtime = "nodejs";
export function OPTIONS(request: Request) { return supportPreflight(request); }

export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  const originGuard = guardSupportOrigin(request);
  if (originGuard) return originGuard;
  const rateGuard = guardSupportRateLimit(request, "support.ticket.read", 60, 600_000);
  if (rateGuard) return rateGuard;
  const { reference } = await context.params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const ticket = token ? await getPublicTicket(reference, token) : null;
  return ticket ? supportJson(request, ticket) : supportJson(request, { error: "Ticket not found or access link is invalid." }, { status: 404 });
}
