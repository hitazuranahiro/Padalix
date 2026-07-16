import { timingSafeEqual } from "node:crypto";
import { runStatusChecks } from "@/lib/status-monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await runStatusChecks(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Status monitor failed", error);
    return Response.json({ error: "Status checks failed." }, { status: 500 });
  }
}
