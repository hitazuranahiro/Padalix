import { mergeSiteContent, siteContent, type SiteContent } from "@padalix/content";

export async function loadSiteContent(): Promise<SiteContent> {
  const endpoint = process.env.CMS_CONTENT_URL;
  if (!endpoint) return siteContent;

  try {
    const response = await fetch(endpoint, { next: { revalidate: 60 } });
    if (!response.ok) return siteContent;
    return mergeSiteContent(await response.json());
  } catch {
    return siteContent;
  }
}
