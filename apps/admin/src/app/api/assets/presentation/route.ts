import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { database } from "@/lib/db";
import { guardAdminMutation } from "@/lib/request-security";

export const dynamic = "force-dynamic";
const maximumBytes = 10 * 1024 * 1024;

export async function GET() {
  const result = await database.query<{ filename: string; mime_type: string; data: Buffer }>(
    "select filename, mime_type, data from content.asset where key = 'presentation-pdf'",
  );
  const asset = result.rows[0];
  if (!asset) return NextResponse.json({ error: "Presentation not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.mime_type,
      "Content-Disposition": `inline; filename="${asset.filename.replaceAll('"', '')}"`,
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}

export async function PUT(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const guarded = guardAdminMutation(request, { scope: "content.presentation.upload", subject: session.user.id, limit: 5, windowMs: 3_600_000 });
  if (guarded) return guarded;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") return NextResponse.json({ error: "A PDF file is required" }, { status: 400 });
  if (file.size > maximumBytes) return NextResponse.json({ error: "PDF must be 10 MB or smaller" }, { status: 413 });
  const data = Buffer.from(await file.arrayBuffer());
  await database.query(
    `insert into content.asset (key, filename, mime_type, byte_size, data, updated_by)
     values ('presentation-pdf', $1, $2, $3, $4, $5)
     on conflict (key) do update set filename=$1, mime_type=$2, byte_size=$3, data=$4, updated_at=now(), updated_by=$5`,
    [file.name, file.type, file.size, data, session.user.id],
  );
  return NextResponse.json({ url: new URL("/api/assets/presentation", request.url).toString(), filename: file.name, size: file.size });
}
