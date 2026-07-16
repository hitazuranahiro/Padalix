import { getAdminSession } from "@/lib/admin-session";
import { incidentImpacts, incidentStates, updateIncident, type IncidentImpact, type IncidentState } from "@/lib/status-store";

export const dynamic = "force-dynamic";

function validState(value: unknown): value is IncidentState {
  return typeof value === "string" && incidentStates.includes(value as IncidentState);
}

function validImpact(value: unknown): value is IncidentImpact {
  return typeof value === "string" && incidentImpacts.includes(value as IncidentImpact);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !validState(body.state) || !validImpact(body.impact)) {
    return Response.json({ error: "Invalid incident update." }, { status: 400 });
  }
  const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, 2000) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
  const componentKeys = Array.isArray(body.componentKeys)
    ? body.componentKeys.filter((value): value is string => typeof value === "string").slice(0, 30)
    : undefined;
  if (summary.length < 8 || (!message && body.state !== "resolved")) {
    return Response.json({ error: "A summary and update message are required." }, { status: 400 });
  }
  try {
    await updateIncident(id, {
      state: body.state,
      impact: body.impact,
      summary,
      message: message || "This incident has been resolved.",
      published: body.published !== false,
      componentKeys,
    }, session.user.id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Incident not found") {
      return Response.json({ error: error.message }, { status: 404 });
    }
    console.error("Incident update failed", error);
    return Response.json({ error: "Incident could not be updated." }, { status: 500 });
  }
}
