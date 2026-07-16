import { getAdminSession } from "@/lib/admin-session";
import { guardAdminMutation } from "@/lib/request-security";
import { runStatusChecks } from "@/lib/status-monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Forbidden" }, { status: 403 });
  const guarded = guardAdminMutation(request, {
    scope: "status.check.run",
    subject: session.user.id,
    limit: 6,
    windowMs: 60_000,
  });
  if (guarded) return guarded;
  try {
    return Response.json(await runStatusChecks(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Manual status check failed", error);
    return Response.json({ error: "Status checks failed." }, { status: 500 });
  }
}
