import { getAdminSession } from "@/lib/admin-session";
import { listTickets } from "@/lib/support";

export async function GET(request: Request) {
  if (!await getAdminSession()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams;
  return Response.json({ tickets: await listTickets({ status: query.get("status") ?? undefined, priority: query.get("priority") ?? undefined, query: query.get("query")?.trim() || undefined }) });
}
