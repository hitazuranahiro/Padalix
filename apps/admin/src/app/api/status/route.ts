import { getStatus } from "@/lib/status-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getStatus(true), {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("Public status feed failed", error);
    return Response.json(
      { error: "Status data is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
