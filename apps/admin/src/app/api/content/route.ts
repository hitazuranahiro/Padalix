import { NextResponse } from "next/server";
import type { SiteContent } from "@padalix/content";
import { getAdminSession } from "@/lib/admin-session";
import { getContent, saveContent } from "@/lib/content-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getContent());
}

export async function PUT(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as { content?: SiteContent; publish?: boolean };
  if (!body.content?.hero?.title || !Array.isArray(body.content.product?.features)) {
    return NextResponse.json({ error: "Invalid content document" }, { status: 400 });
  }

  await saveContent(body.content, session.user.id, body.publish === true);
  return NextResponse.json({ ok: true, published: body.publish === true });
}
