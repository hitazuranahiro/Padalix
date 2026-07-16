import { getCustomerSession } from "@/lib/session";
import { PlatformError, platformRawRequest } from "@/lib/platform";

type RouteContext = { params: Promise<{ reference: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { reference } = await context.params;
  const normalizedReference = reference.trim().toUpperCase();
  if (!/^PDX-\d{4}-\d{6}$/.test(normalizedReference)) {
    return Response.json({ error: "Invalid transfer reference" }, { status: 400 });
  }

  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
  try {
    const upstream = await platformRawRequest(
      session,
      `/v1/transfers/${encodeURIComponent(normalizedReference)}/receipt?format=${format}`,
    );
    if (!upstream.ok) {
      const result = await upstream.json().catch(() => ({}));
      throw new PlatformError(result.error ?? "Receipt unavailable", upstream.status);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": upstream.headers.get("content-disposition") ?? `attachment; filename="${normalizedReference}.${format}"`,
        "content-type": upstream.headers.get("content-type") ?? (format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8"),
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Receipt unavailable" },
      { status: error instanceof PlatformError ? error.status : 503 },
    );
  }
}
