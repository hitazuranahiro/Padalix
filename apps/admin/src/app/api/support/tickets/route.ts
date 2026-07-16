import { createTicket, hashReporterIp, SupportRateLimitError, ticketCategories, ticketPriorities, type TicketCategory, type TicketPriority } from "@/lib/support";
import { clientIp, guardSupportOrigin, guardSupportRateLimit, supportJson, supportPreflight } from "@/lib/support-http";

export const runtime = "nodejs";

function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

export function OPTIONS(request: Request) { return supportPreflight(request); }

export async function POST(request: Request) {
  const originGuard = guardSupportOrigin(request);
  if (originGuard) return originGuard;
  const rateGuard = guardSupportRateLimit(request, "support.ticket.create", 20, 3_600_000);
  if (rateGuard) return rateGuard;
  try {
    const body = await request.json();
    if (text(body.website, 200)) return supportJson(request, { ok: true }, { status: 202 });
    const requesterName = text(body.requesterName, 100);
    const requesterEmail = text(body.requesterEmail, 254).toLowerCase();
    const subject = text(body.subject, 180);
    const message = text(body.message, 8000);
    const category = text(body.category, 30) as TicketCategory;
    const priority = text(body.priority, 20) as TicketPriority;
    if (requesterName.length < 2 || !/^\S+@\S+\.\S+$/.test(requesterEmail) || subject.length < 5 || message.length < 20 || !ticketCategories.includes(category) || !ticketPriorities.includes(priority)) {
      return supportJson(request, { error: "Check the required fields and provide at least 20 characters of detail." }, { status: 400 });
    }
    const ipHash = hashReporterIp(clientIp(request));
    const created = await createTicket({ requesterName, requesterEmail, subject, category, priority, body: message, ipHash });
    return supportJson(request, { reference: created.ticket.reference, token: created.token, trackingPath: `/help/ticket/${created.ticket.reference}?token=${created.token}` }, { status: 201 });
  } catch (error) {
    if (error instanceof SupportRateLimitError) {
      return supportJson(request, { error: "Ticket limit reached. Try again later or reply to an existing ticket." }, {
        status: 429,
        headers: { "Retry-After": String(error.retryAfterSeconds) },
      });
    }
    console.error("Support ticket creation failed", error);
    return supportJson(request, { error: "The support desk could not create this ticket." }, { status: 500 });
  }
}
