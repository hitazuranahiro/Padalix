import { getAdminSession } from "@/lib/admin-session";
import { retryOperationsJob } from "@/lib/operations";
import { guardAdminMutation } from "@/lib/request-security";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Forbidden" }, { status: 403 });
  const guarded = guardAdminMutation(request, {
    scope: "operations.job.retry",
    subject: session.user.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (guarded) return guarded;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Invalid job" }, { status: 400 });
  try {
    await retryOperationsJob(id, session.user.id);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Job is not retryable." }, { status: 409 });
  }
}
