import { getAdminSession } from "@/lib/admin-session";
import { createIncident, getStatus, parseIncidentInput } from "@/lib/status-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json(await getStatus(false), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Forbidden" }, { status: 403 });
  const input = parseIncidentInput(await request.json().catch(() => null));
  if (!input) return Response.json({ error: "Invalid incident." }, { status: 400 });
  try {
    const id = await createIncident(input, session.user.id);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    console.error("Incident creation failed", error);
    return Response.json({ error: "Incident could not be created." }, { status: 500 });
  }
}
