import { getAdminSession } from "@/lib/admin-session";
import { addAdminReply } from "@/lib/support";

export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  const session = await getAdminSession(); if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json().catch(() => ({}));
  const body = typeof payload.message === "string" ? payload.message.trim().slice(0, 8000) : "";
  if (body.length < 2) return Response.json({ error: "Message cannot be empty" }, { status: 400 });
  const ticket = await addAdminReply((await context.params).reference, { body, internal: payload.internal === true }, { id: session.user.id, name: session.user.name });
  return ticket ? Response.json(ticket, { status: 201 }) : Response.json({ error: "Ticket is unavailable or closed" }, { status: 404 });
}
