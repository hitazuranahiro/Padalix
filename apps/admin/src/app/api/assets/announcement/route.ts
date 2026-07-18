import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { uploadPublicMedia } from "@/lib/media-storage";
import { guardAdminMutation } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const maximumBytes = 8 * 1024 * 1024;
const maximumFiles = 3;
const supportedTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const guarded = guardAdminMutation(request, {
    scope: "content.announcement.upload",
    subject: session.user.id,
    limit: 10,
    windowMs: 3_600_000,
  });
  if (guarded) return guarded;

  const form = await request.formData();
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  if (!files.length || files.length > maximumFiles) {
    return NextResponse.json({ error: "Choose between one and three announcement images." }, { status: 400 });
  }
  for (const file of files) {
    if (!supportedTypes[file.type]) {
      return NextResponse.json({ error: "Announcement images must be PNG, JPEG, or WebP." }, { status: 400 });
    }
    if (file.size > maximumBytes) {
      return NextResponse.json({ error: "Each announcement image must be 8 MB or smaller." }, { status: 413 });
    }
  }

  const urls = await Promise.all(files.map(async (file) => {
    const data = Buffer.from(await file.arrayBuffer());
    const digest = createHash("sha256").update(data).digest("hex").slice(0, 16);
    const extension = supportedTypes[file.type];
    return uploadPublicMedia({
      key: `announcements/${Date.now()}-${digest}.${extension}`,
      body: data,
      contentType: file.type,
      contentDisposition: `inline; filename="${file.name.replaceAll('"', "")}"`,
    });
  }));

  return NextResponse.json({ urls });
}
