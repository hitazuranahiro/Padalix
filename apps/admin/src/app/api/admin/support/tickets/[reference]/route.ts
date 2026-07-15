import { getAdminSession } from "@/lib/admin-session";
import { getAdminTicket, ticketPriorities, ticketStatuses, updateTicket, type TicketPriority, type TicketStatus } from "@/lib/support";

export async function GET(_: Request, context: { params: Promise<{ reference: string }> }) {
  if (!await getAdminSession()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ticket = await getAdminTicket((await context.params).reference);
  return ticket ? Response.json(ticket) : Response.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(request: Request, context: { params: Promise<{ reference: string }> }) {
  const session = await getAdminSession(); if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const status = ticketStatuses.includes(body.status as TicketStatus) ? body.status as TicketStatus : undefined;
  const priority = ticketPriorities.includes(body.priority as TicketPriority) ? body.priority as TicketPriority : undefined;
  const assignedTo = body.assignedTo === null || typeof body.assignedTo === "string" ? body.assignedTo?.trim().slice(0, 100) || null : undefined;
  if (!status && !priority && assignedTo === undefined) return Response.json({ error: "No valid changes supplied" }, { status: 400 });
  const ticket = await updateTicket((await context.params).reference, { status, priority, assignedTo }, { id: session.user.id, name: session.user.name });
  return ticket ? Response.json(ticket) : Response.json({ error: "Not found" }, { status: 404 });
}
