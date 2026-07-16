import { addCustomerReply, SupportRateLimitError } from "@/lib/support";
import { guardSupportOrigin, guardSupportRateLimit, supportJson, supportPreflight } from "@/lib/support-http";

export const runtime = "nodejs";
export function OPTIONS(request: Request) { return supportPreflight(request); }

export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  const originGuard = guardSupportOrigin(request);
  if (originGuard) return originGuard;
  const rateGuard = guardSupportRateLimit(request, "support.ticket.reply", 30, 600_000);
  if (rateGuard) return rateGuard;
  const { reference } = await context.params;
  const payload = await request.json().catch(() => ({}));
  const token = typeof payload.token === "string" ? payload.token : "";
  const body = typeof payload.message === "string" ? payload.message.trim().slice(0, 8000) : "";
  if (body.length < 2) return supportJson(request, { error: "Reply cannot be empty." }, { status: 400 });
  try {
    const ticket = await addCustomerReply(reference, token, body);
    return ticket ? supportJson(request, ticket, { status: 201 }) : supportJson(request, { error: "Ticket is unavailable, closed, or the access link is invalid." }, { status: 404 });
  } catch (error) {
    if (error instanceof SupportRateLimitError) {
      return supportJson(request, { error: "Reply limit reached. Try again later." }, {
        status: 429,
        headers: { "Retry-After": String(error.retryAfterSeconds) },
      });
    }
    console.error("Support reply failed", error);
    return supportJson(request, { error: "The support desk could not add this reply." }, { status: 500 });
  }
}
