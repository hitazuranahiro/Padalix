export type PublicComponentState = "operational" | "degraded_performance" | "partial_outage" | "major_outage" | "maintenance" | "unknown";

export type PublicStatus = {
  overall: PublicComponentState;
  generatedAt: string;
  components: Array<{
    key: string;
    name: string;
    description: string;
    status: PublicComponentState;
    lastCheckedAt: string | null;
    latencyMs: number | null;
    uptime24h: number | null;
    checkCount24h: number;
  }>;
  activeIncidents: PublicIncident[];
  recentIncidents: PublicIncident[];
};

export type PublicIncident = {
  id: string;
  kind: "incident" | "maintenance";
  title: string;
  summary: string;
  impact: "maintenance" | "minor" | "major" | "critical";
  state: "scheduled" | "investigating" | "identified" | "monitoring" | "resolved";
  startedAt: string;
  resolvedAt: string | null;
  components: Array<{ key: string; name: string }>;
  updates: Array<{ id: string; state: string; message: string; createdAt: string }>;
};

function endpoint() {
  if (process.env.STATUS_API_URL) return process.env.STATUS_API_URL;
  if (!process.env.CMS_CONTENT_URL) return null;
  try {
    const url = new URL(process.env.CMS_CONTENT_URL);
    url.pathname = "/api/status";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

export async function loadPublicStatus(): Promise<PublicStatus | null> {
  const url = endpoint();
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(url, { next: { revalidate: 30 }, signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json() as PublicStatus;
    if (!Array.isArray(data.components) || !Array.isArray(data.activeIncidents)) return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
