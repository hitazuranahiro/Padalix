import { NextResponse } from "next/server";
import { getPublicTicket } from "@/lib/support";
import { supportCors, supportJson } from "@/lib/support-http";

export const runtime = "nodejs";
export function OPTIONS(request: Request) { return new NextResponse(null, { status: 204, headers: supportCors(request) }); }

export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  const { reference } = await context.params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const ticket = token ? await getPublicTicket(reference, token) : null;
  return ticket ? supportJson(request, ticket) : supportJson(request, { error: "Ticket not found or access link is invalid." }, { status: 404 });
}
