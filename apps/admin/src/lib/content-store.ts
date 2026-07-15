import { mergeSiteContent, siteContent, type SiteContent } from "@padalix/content";
import { database } from "@/lib/db";

type StoredContent = {
  draft: SiteContent;
  published: SiteContent;
  publishedAt: string | null;
  updatedAt: string;
};

export async function getContent(): Promise<StoredContent> {
  await database.query(
    `insert into content.site_document (key, draft, published)
     values ('marketing', $1::jsonb, $1::jsonb)
     on conflict (key) do nothing`,
    [JSON.stringify(siteContent)],
  );

  const result = await database.query<{
    draft: SiteContent;
    published: SiteContent;
    published_at: Date | null;
    updated_at: Date;
  }>(
    `select draft, published, published_at, updated_at
     from content.site_document where key = 'marketing'`,
  );

  const row = result.rows[0];
  return {
    draft: mergeSiteContent(row.draft),
    published: mergeSiteContent(row.published),
    publishedAt: row.published_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function saveContent(content: SiteContent, userId: string, publish: boolean) {
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into content.site_document (key, draft, published, published_at, updated_by)
       values ('marketing', $1::jsonb, $1::jsonb, case when $2 then now() else null end, $3)
       on conflict (key) do update set
         draft = excluded.draft,
         published = case when $2 then excluded.draft else content.site_document.published end,
         published_at = case when $2 then now() else content.site_document.published_at end,
         updated_at = now(),
         updated_by = $3`,
      [JSON.stringify(content), publish, userId],
    );
    await client.query(
      `insert into audit.admin_event (actor_id, action, resource_type, resource_id, metadata)
       values ($1, $2, 'site_document', 'marketing', $3::jsonb)`,
      [userId, publish ? "content.publish" : "content.draft.save", JSON.stringify({ source: "admin-cms" })],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
