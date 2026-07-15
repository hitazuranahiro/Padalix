import { NextResponse } from "next/server";
import { addCustomerReply } from "@/lib/support";
import { supportCors, supportJson } from "@/lib/support-http";

export const runtime = "nodejs";
export function OPTIONS(request: Request) { return new NextResponse(null, { status: 204, headers: supportCors(request) }); }

export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  const { reference } = await context.params;
  const payload = await request.json().catch(() => ({}));
  const token = typeof payload.token === "string" ? payload.token : "";
  const body = typeof payload.message === "string" ? payload.message.trim().slice(0, 8000) : "";
  if (body.length < 2) return supportJson(request, { error: "Reply cannot be empty." }, { status: 400 });
  const ticket = await addCustomerReply(reference, token, body);
  return ticket ? supportJson(request, ticket, { status: 201 }) : supportJson(request, { error: "Ticket is unavailable, closed, or the access link is invalid." }, { status: 404 });
}
