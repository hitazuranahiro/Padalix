import { getAdminSession } from "@/lib/admin-session";
import { resolveReconciliationException } from "@/lib/operations";
import { guardAdminMutation } from "@/lib/request-security";
import { isSessionRecentlyAuthenticated, recentAuthenticationRequiredResponse } from "@/lib/session-security";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!isSessionRecentlyAuthenticated(session.session.createdAt)) {
    return recentAuthenticationRequiredResponse();
  }
  const guarded = guardAdminMutation(request, {
    scope: "operations.exception.resolve",
    subject: session.user.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (guarded) return guarded;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Invalid exception" }, { status: 400 });
  const body = await request.json().catch(() => null) as { note?: unknown } | null;
  if (typeof body?.note !== "string" || body.note.trim().length < 8) return Response.json({ error: "Resolution note required." }, { status: 400 });
  try {
    await resolveReconciliationException(id, body.note, session.user.id);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Exception could not be resolved." }, { status: 409 });
  }
}
