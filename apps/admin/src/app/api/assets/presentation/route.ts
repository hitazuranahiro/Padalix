import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { database } from "@/lib/db";
import { guardAdminMutation } from "@/lib/request-security";
import { createHash } from "node:crypto";
import { uploadPublicMedia } from "@/lib/media-storage";

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
  const digest = createHash("sha256").update(data).digest("hex").slice(0, 16);
  const url = await uploadPublicMedia({
    key: `documents/padalix-presentation-${digest}.pdf`,
    body: data,
    contentType: file.type,
    contentDisposition: `inline; filename="${file.name.replaceAll('"', "")}"`,
  });
  return NextResponse.json({ url, filename: file.name, size: file.size });
}
