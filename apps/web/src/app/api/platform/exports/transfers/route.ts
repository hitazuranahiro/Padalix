import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRawRequest } from "@/lib/platform";

export async function GET(request: Request) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
  try {
    const upstream = await platformRawRequest(session, `/v1/exports/transfers?format=${format}`);
    if (!upstream.ok) {
      const result = await upstream.json().catch(() => ({}));
      throw new PlatformError(result.error ?? "Transfer export unavailable", upstream.status);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": upstream.headers.get("content-disposition") ?? `attachment; filename="padalix-transfers.${format}"`,
        "content-type": upstream.headers.get("content-type") ?? (format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8"),
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Transfer export unavailable" },
      { status: error instanceof PlatformError ? error.status : 503 },
    );
  }
}
