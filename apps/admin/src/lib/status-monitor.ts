import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { database } from "@/lib/db";
import type { ComponentState } from "@/lib/status-store";

type MonitorTarget = {
  key: string;
  name: string;
  url: string;
  currentStatus: ComponentState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
};

type ProbeResult = {
  success: boolean;
  httpStatus: number | null;
  latencyMs: number;
  errorCode: string | null;
};

export type StatusCheckRun = {
  skipped: boolean;
  checkedAt: string;
  results: Array<{ component: string; success: boolean; httpStatus: number | null; latencyMs: number }>;
};

function targetAllowed(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const local = process.env.NODE_ENV !== "production" &&
      url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    const production = url.protocol === "https:" && !url.username && !url.password &&
      (!url.port || url.port === "443") &&
      (url.hostname === "padalix.com" || url.hostname.endsWith(".padalix.com"));
    return local || production;
  } catch {
    return false;
  }
}

async function probe(target: MonitorTarget): Promise<ProbeResult> {
  if (!targetAllowed(target.url)) {
    return { success: false, httpStatus: null, latencyMs: 0, errorCode: "TARGET_REJECTED" };
  }
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(target.url, {
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "Padalix-Status-Monitor/1.0" },
    });
    return {
      success: response.status >= 200 && response.status < 400,
      httpStatus: response.status,
      latencyMs: Math.round(performance.now() - started),
      errorCode: response.status >= 200 && response.status < 400 ? null : "HTTP_ERROR",
    };
  } catch (error) {
    return {
      success: false,
      httpStatus: null,
      latencyMs: Math.round(performance.now() - started),
      errorCode: error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
    };
  } finally {
    clearTimeout(timer);
  }
}

function nextComponentState(target: MonitorTarget, result: ProbeResult): {
  status: ComponentState;
  failures: number;
  successes: number;
} {
  if (result.success) {
    const successes = target.consecutiveSuccesses + 1;
    const status = target.currentStatus === "unknown" || successes >= 2 ? "operational" : target.currentStatus;
    return { status, failures: 0, successes };
  }
  const failures = target.consecutiveFailures + 1;
  const status = failures >= 3
    ? "partial_outage"
    : failures >= 2
      ? "degraded_performance"
      : target.currentStatus;
  return { status, failures, successes: 0 };
}

async function synchronizeMonitorIncident(
  client: PoolClient,
  target: MonitorTarget,
  result: ProbeResult,
  failures: number,
  successes: number,
) {
  const incidentResult = await client.query<{ id: string }>(
    `select i.id from operations.status_incident i
     join operations.status_incident_component ic on ic.incident_id = i.id
     where i.source = 'monitor' and i.resolved_at is null and ic.component_key = $1
     order by i.started_at desc limit 1`,
    [target.key],
  );
  const activeId = incidentResult.rows[0]?.id;

  if (!result.success && failures >= 3 && !activeId) {
    const id = randomUUID();
    const summary = `${target.name} did not pass three consecutive automated health checks. The operations team is investigating.`;
    await client.query(
      `insert into operations.status_incident
       (id, source, title, summary, impact, state, published, created_by)
       values ($1, 'monitor', $2, $3, 'major', 'investigating', true, 'status-monitor')`,
      [id, `${target.name} service disruption`, summary],
    );
    await client.query(
      "insert into operations.status_incident_component (incident_id, component_key) values ($1, $2)",
      [id, target.key],
    );
    await client.query(
      `insert into operations.status_incident_update (incident_id, state, message, created_by)
       values ($1, 'investigating', $2, 'status-monitor')`,
      [id, summary],
    );
    await client.query(
      `insert into audit.admin_event (actor_id, action, resource_type, resource_id, metadata)
       values ('status-monitor', 'status.incident.auto_open', 'status_incident', $1, $2::jsonb)`,
      [id, JSON.stringify({ component: target.key, threshold: 3 })],
    );
  }

  if (result.success && successes >= 2 && activeId) {
    const message = `${target.name} passed two consecutive automated health checks. Service has recovered.`;
    await client.query(
      `update operations.status_incident set state = 'resolved', resolved_at = now(), updated_at = now()
       where id = $1 and resolved_at is null`,
      [activeId],
    );
    await client.query(
      `insert into operations.status_incident_update (incident_id, state, message, created_by)
       values ($1, 'resolved', $2, 'status-monitor')`,
      [activeId, message],
    );
    await client.query(
      `insert into audit.admin_event (actor_id, action, resource_type, resource_id, metadata)
       values ('status-monitor', 'status.incident.auto_resolve', 'status_incident', $1, $2::jsonb)`,
      [activeId, JSON.stringify({ component: target.key, recoveryThreshold: 2 })],
    );
  }
}

async function persistResult(client: PoolClient, target: MonitorTarget, result: ProbeResult) {
  const next = nextComponentState(target, result);
  await client.query("begin");
  try {
    await client.query(
      `insert into operations.status_check
       (component_key, success, http_status, latency_ms, error_code)
       values ($1, $2, $3, $4, $5)`,
      [target.key, result.success, result.httpStatus, result.latencyMs, result.errorCode],
    );
    await client.query(
      `update operations.status_component set current_status = $2, last_checked_at = now(),
         last_http_status = $3, last_latency_ms = $4, last_check_success = $5,
         consecutive_failures = $6, consecutive_successes = $7, updated_at = now()
       where key = $1`,
      [target.key, next.status, result.httpStatus, result.latencyMs, result.success, next.failures, next.successes],
    );
    await synchronizeMonitorIncident(client, target, result, next.failures, next.successes);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export async function runStatusChecks(): Promise<StatusCheckRun> {
  const client = await database.connect();
  const checkedAt = new Date().toISOString();
  try {
    const lock = await client.query<{ acquired: boolean }>(
      "select pg_try_advisory_lock(hashtext('padalix-status-monitor')) as acquired",
    );
    if (!lock.rows[0]?.acquired) return { skipped: true, checkedAt, results: [] };
    try {
      const result = await client.query<{
        key: string;
        display_name: string;
        endpoint_url: string;
        current_status: ComponentState;
        consecutive_failures: number;
        consecutive_successes: number;
      }>(
        `select key, display_name, endpoint_url, current_status,
           consecutive_failures, consecutive_successes
         from operations.status_component
         where enabled = true and monitor_kind = 'http'
         order by sort_order`,
      );
      const targets = result.rows.map<MonitorTarget>((row) => ({
        key: row.key,
        name: row.display_name,
        url: row.endpoint_url,
        currentStatus: row.current_status,
        consecutiveFailures: row.consecutive_failures,
        consecutiveSuccesses: row.consecutive_successes,
      }));
      const probeResults = await Promise.all(targets.map(probe));
      for (let index = 0; index < targets.length; index += 1) {
        await persistResult(client, targets[index], probeResults[index]);
      }
      await client.query("delete from operations.status_check where checked_at < now() - interval '90 days'");
      return {
        skipped: false,
        checkedAt,
        results: targets.map((target, index) => ({
          component: target.key,
          success: probeResults[index].success,
          httpStatus: probeResults[index].httpStatus,
          latencyMs: probeResults[index].latencyMs,
        })),
      };
    } finally {
      await client.query("select pg_advisory_unlock(hashtext('padalix-status-monitor'))");
    }
  } finally {
    client.release();
  }
}
