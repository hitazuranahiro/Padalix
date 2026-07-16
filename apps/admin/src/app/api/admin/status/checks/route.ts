import { getAdminSession } from "@/lib/admin-session";
import { runStatusChecks } from "@/lib/status-monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    return Response.json(await runStatusChecks(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Manual status check failed", error);
    return Response.json({ error: "Status checks failed." }, { status: 500 });
  }
}
