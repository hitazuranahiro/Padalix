import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { database } from "@/lib/db";

export const componentStates = ["operational", "degraded_performance", "partial_outage", "major_outage", "maintenance", "unknown"] as const;
export const incidentStates = ["scheduled", "investigating", "identified", "monitoring", "resolved"] as const;
export const incidentImpacts = ["maintenance", "minor", "major", "critical"] as const;

export type ComponentState = typeof componentStates[number];
export type IncidentState = typeof incidentStates[number];
export type IncidentImpact = typeof incidentImpacts[number];

export type StatusComponent = {
  key: string;
  name: string;
  description: string;
  monitorKind: "http" | "manual";
  status: ComponentState;
  lastCheckedAt: string | null;
  latencyMs: number | null;
  uptime24h: number | null;
  checkCount24h: number;
};

export type StatusIncident = {
  id: string;
  kind: "incident" | "maintenance";
  source: "manual" | "monitor";
  title: string;
  summary: string;
  impact: IncidentImpact;
  state: IncidentState;
  published: boolean;
  startedAt: string;
  resolvedAt: string | null;
  components: Array<{ key: string; name: string }>;
  updates: Array<{ id: string; state: IncidentState; message: string; createdAt: string }>;
};

export type PublicStatus = {
  overall: ComponentState;
  generatedAt: string;
  components: StatusComponent[];
  activeIncidents: StatusIncident[];
  recentIncidents: StatusIncident[];
};

type IncidentInput = {
  kind: "incident" | "maintenance";
  title: string;
  summary: string;
  impact: IncidentImpact;
  state: IncidentState;
  componentKeys: string[];
  published: boolean;
};

function isIncidentState(value: string): value is IncidentState {
  return incidentStates.includes(value as IncidentState);
}

function isIncidentImpact(value: string): value is IncidentImpact {
  return incidentImpacts.includes(value as IncidentImpact);
}

function overallState(components: StatusComponent[], incidents: StatusIncident[]): ComponentState {
  const incidentPriority: Record<IncidentImpact, ComponentState> = {
    maintenance: "maintenance",
    minor: "degraded_performance",
    major: "partial_outage",
    critical: "major_outage",
  };
  const stateRank: Record<ComponentState, number> = {
    operational: 0,
    unknown: 1,
    maintenance: 2,
    degraded_performance: 3,
    partial_outage: 4,
    major_outage: 5,
  };
  const observed = [
    ...components.map((component) => component.status),
    ...incidents.map((incident) => incidentPriority[incident.impact]),
  ];
  return observed.reduce<ComponentState>((current, next) => stateRank[next] > stateRank[current] ? next : current, "operational");
}

async function loadIncidents(publishedOnly: boolean): Promise<StatusIncident[]> {
  const result = await database.query<{
    id: string;
    kind: "incident" | "maintenance";
    source: "manual" | "monitor";
    title: string;
    summary: string;
    impact: IncidentImpact;
    state: IncidentState;
    published: boolean;
    started_at: Date;
    resolved_at: Date | null;
    components: Array<{ key: string; name: string }> | null;
    updates: Array<{ id: string; state: IncidentState; message: string; createdAt: string }> | null;
  }>(
    `select i.id, i.kind, i.source, i.title, i.summary, i.impact, i.state, i.published,
       i.started_at, i.resolved_at,
       coalesce((select jsonb_agg(jsonb_build_object('key', c.key, 'name', c.display_name) order by c.sort_order)
         from operations.status_incident_component ic
         join operations.status_component c on c.key = ic.component_key
         where ic.incident_id = i.id), '[]'::jsonb) as components,
       coalesce((select jsonb_agg(jsonb_build_object('id', u.id::text, 'state', u.state, 'message', u.message, 'createdAt', u.created_at) order by u.created_at desc)
         from operations.status_incident_update u where u.incident_id = i.id), '[]'::jsonb) as updates
     from operations.status_incident i
     where ($1::boolean = false or i.published = true)
       and (i.resolved_at is null or i.resolved_at >= now() - interval '90 days')
     order by (i.resolved_at is null) desc, i.started_at desc`,
    [publishedOnly],
  );
  return result.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    source: row.source,
    title: row.title,
    summary: row.summary,
    impact: row.impact,
    state: row.state,
    published: row.published,
    startedAt: row.started_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    components: row.components ?? [],
    updates: row.updates ?? [],
  }));
}

export async function getStatus(publishedOnly = true): Promise<PublicStatus> {
  const [componentResult, incidents] = await Promise.all([
    database.query<{
      key: string;
      display_name: string;
      description: string;
      monitor_kind: "http" | "manual";
      current_status: ComponentState;
      last_checked_at: Date | null;
      last_latency_ms: number | null;
      check_count: string;
      uptime: string | null;
    }>(
      `select c.key, c.display_name, c.description, c.monitor_kind, c.current_status,
         c.last_checked_at, c.last_latency_ms,
         count(ch.id)::text as check_count,
         round(100.0 * count(ch.id) filter (where ch.success) / nullif(count(ch.id), 0), 2)::text as uptime
       from operations.status_component c
       left join operations.status_check ch on ch.component_key = c.key
         and ch.checked_at >= now() - interval '24 hours'
       where c.enabled = true and ($1::boolean = false or c.public = true)
       group by c.key
       order by c.sort_order, c.display_name`,
      [publishedOnly],
    ),
    loadIncidents(publishedOnly),
  ]);
  const components = componentResult.rows.map<StatusComponent>((row) => ({
    key: row.key,
    name: row.display_name,
    description: row.description,
    monitorKind: row.monitor_kind,
    status: row.current_status,
    lastCheckedAt: row.last_checked_at?.toISOString() ?? null,
    latencyMs: row.last_latency_ms,
    uptime24h: row.uptime === null ? null : Number(row.uptime),
    checkCount24h: Number(row.check_count),
  }));
  const activeIncidents = incidents.filter((incident) => incident.resolvedAt === null);
  return {
    overall: overallState(components, activeIncidents.filter((incident) => incident.published || !publishedOnly)),
    generatedAt: new Date().toISOString(),
    components,
    activeIncidents,
    recentIncidents: incidents.filter((incident) => incident.resolvedAt !== null).slice(0, 20),
  };
}

async function setIncidentComponents(client: PoolClient, incidentId: string, componentKeys: string[]) {
  await client.query("delete from operations.status_incident_component where incident_id = $1", [incidentId]);
  if (!componentKeys.length) return;
  await client.query(
    `insert into operations.status_incident_component (incident_id, component_key)
     select $1, key from operations.status_component where key = any($2::text[])`,
    [incidentId, componentKeys],
  );
}

export async function createIncident(input: IncidentInput, actorId: string) {
  const id = randomUUID();
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into operations.status_incident
       (id, kind, source, title, summary, impact, state, published, resolved_at, created_by)
       values ($1, $2, 'manual', $3, $4, $5, $6, $7,
         case when $6 = 'resolved' then now() else null end, $8)`,
      [id, input.kind, input.title, input.summary, input.impact, input.state, input.published, actorId],
    );
    await setIncidentComponents(client, id, input.componentKeys);
    await client.query(
      `insert into operations.status_incident_update (incident_id, state, message, created_by)
       values ($1, $2, $3, $4)`,
      [id, input.state, input.summary, actorId],
    );
    await client.query(
      `insert into audit.admin_event (actor_id, action, resource_type, resource_id, metadata)
       values ($1, 'status.incident.create', 'status_incident', $2, $3::jsonb)`,
      [actorId, id, JSON.stringify({ impact: input.impact, state: input.state, published: input.published })],
    );
    await client.query("commit");
    return id;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateIncident(id: string, input: {
  state: IncidentState;
  impact: IncidentImpact;
  summary: string;
  message: string;
  published: boolean;
  componentKeys?: string[];
}, actorId: string) {
  const client = await database.connect();
  try {
    await client.query("begin");
    const result = await client.query(
      `update operations.status_incident set state = $2, impact = $3, summary = $4,
         published = $5, resolved_at = case when $2 = 'resolved' then coalesce(resolved_at, now()) else null end,
         updated_at = now()
       where id = $1 returning id`,
      [id, input.state, input.impact, input.summary, input.published],
    );
    if (!result.rowCount) throw new Error("Incident not found");
    if (input.componentKeys) await setIncidentComponents(client, id, input.componentKeys);
    if (input.message.trim()) {
      await client.query(
        `insert into operations.status_incident_update (incident_id, state, message, created_by)
         values ($1, $2, $3, $4)`,
        [id, input.state, input.message.trim(), actorId],
      );
    }
    await client.query(
      `insert into audit.admin_event (actor_id, action, resource_type, resource_id, metadata)
       values ($1, 'status.incident.update', 'status_incident', $2, $3::jsonb)`,
      [actorId, id, JSON.stringify({ impact: input.impact, state: input.state, published: input.published })],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export function parseIncidentInput(value: unknown): IncidentInput | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const kind = body.kind === "maintenance" ? "maintenance" : body.kind === "incident" ? "incident" : null;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
  const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, 2000) : "";
  const impact = typeof body.impact === "string" && isIncidentImpact(body.impact) ? body.impact : null;
  const state = typeof body.state === "string" && isIncidentState(body.state) ? body.state : null;
  const componentKeys = Array.isArray(body.componentKeys)
    ? body.componentKeys.filter((key): key is string => typeof key === "string").slice(0, 30)
    : [];
  if (!kind || title.length < 4 || summary.length < 8 || !impact || !state) return null;
  return { kind, title, summary, impact, state, componentKeys, published: body.published !== false };
}
