"use client";

import { useState, type FormEvent } from "react";
import { Activity, AlertTriangle, Check, RefreshCw, Send } from "lucide-react";
import type { IncidentImpact, IncidentState, PublicStatus, StatusIncident } from "@/lib/status-store";

const stateLabels: Record<string, string> = {
  operational: "Operational",
  degraded_performance: "Degraded performance",
  partial_outage: "Partial outage",
  major_outage: "Major outage",
  maintenance: "Maintenance",
  unknown: "Collecting data",
  scheduled: "Scheduled",
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

const incidentStates: IncidentState[] = ["scheduled", "investigating", "identified", "monitoring", "resolved"];
const impacts: IncidentImpact[] = ["maintenance", "minor", "major", "critical"];

function label(value: string) {
  return stateLabels[value] ?? value.replaceAll("_", " ");
}

function IncidentControl({ incident, onSaved }: { incident: StatusIncident; onSaved: () => Promise<void> }) {
  const [state, setState] = useState(incident.state);
  const [impact, setImpact] = useState(incident.impact);
  const [summary, setSummary] = useState(incident.summary);
  const [message, setMessage] = useState("");
  const [published, setPublished] = useState(incident.published);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch(`/api/admin/status/incidents/${incident.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, impact, summary, message, published }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setError(body.error ?? "Update failed.");
      setSaving(false);
      return;
    }
    setMessage("");
    await onSaved();
    setSaving(false);
  }

  return <article className="status-incident-control">
    <header><div><span>{incident.source.toUpperCase()} / {incident.kind.toUpperCase()}</span><h3>{incident.title}</h3></div><b className={`status-pill status-${incident.state}`}>{label(incident.state)}</b></header>
    <p>{incident.components.map((component) => component.name).join(" / ") || "All public services"}</p>
    <form onSubmit={submit}>
      <div className="status-control-grid">
        <label><span>State</span><select value={state} onChange={(event) => setState(event.target.value as IncidentState)}>{incidentStates.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label>
        <label><span>Impact</span><select value={impact} onChange={(event) => setImpact(event.target.value as IncidentImpact)}>{impacts.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label>
        <label className="status-publish"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /><span>Publish on status page and banner</span></label>
      </div>
      <label><span>Current summary</span><textarea rows={2} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
      <label><span>Public update</span><textarea rows={3} placeholder="Describe what changed and what users should expect." value={message} onChange={(event) => setMessage(event.target.value)} /></label>
      {error && <p className="status-form-error" role="alert">{error}</p>}
      <button disabled={saving} type="submit"><Send size={14} /> {saving ? "PUBLISHING" : state === "resolved" ? "RESOLVE INCIDENT" : "PUBLISH UPDATE"}</button>
    </form>
    {incident.updates.length > 0 && <div className="status-update-log">{incident.updates.slice(0, 4).map((update) => <div key={update.id}><span>{label(update.state)} / {new Date(update.createdAt).toLocaleString()}</span><p>{update.message}</p></div>)}</div>}
  </article>;
}

export function StatusConsole({ initialStatus }: { initialStatus: PublicStatus }) {
  const [data, setData] = useState(initialStatus);
  const [running, setRunning] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin/status", { cache: "no-store" });
    if (!response.ok) throw new Error("Status refresh failed.");
    setData(await response.json() as PublicStatus);
  }

  async function runChecks() {
    setRunning(true);
    setError("");
    const response = await fetch("/api/admin/status/checks", { method: "POST" });
    if (!response.ok) setError("The health check run failed. Review function logs before changing an incident.");
    else await refresh();
    setRunning(false);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: form.get("kind"),
        impact: form.get("impact"),
        state: form.get("state"),
        title: form.get("title"),
        summary: form.get("summary"),
        published: form.get("published") === "on",
        componentKeys: form.getAll("components"),
      }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(body.error ?? "Incident creation failed.");
    else {
      event.currentTarget.reset();
      await refresh();
    }
    setCreating(false);
  }

  return <div className="status-admin">
    <section className="status-overview">
      <header><div><p>RELIABILITY / LIVE CONTROL</p><h1>Service status</h1></div><button type="button" onClick={runChecks} disabled={running}><RefreshCw className={running ? "spin" : ""} size={15} />{running ? "CHECKING" : "RUN CHECKS"}</button></header>
      {error && <p className="status-form-error status-page-error" role="alert">{error}</p>}
      <div className={`status-overall status-${data.overall}`}><Activity size={22} /><span><small>OVERALL STATE</small><strong>{label(data.overall)}</strong></span><time>UPDATED {new Date(data.generatedAt).toLocaleString()}</time></div>
      <div className="status-component-list">{data.components.map((component) => <article key={component.key}><i className={`status-dot status-${component.status}`} /><div><strong>{component.name}</strong><p>{component.description}</p></div><span><b>{label(component.status)}</b><small>{component.checkCount24h > 0 ? `${component.checkCount24h} CHECKS / 24H` : "NO CHECK HISTORY"}</small></span></article>)}</div>
      <section className="status-incidents-admin"><header><h2>Active incidents</h2><span>{data.activeIncidents.length} OPEN</span></header>{data.activeIncidents.length ? data.activeIncidents.map((incident) => <IncidentControl incident={incident} key={incident.id} onSaved={refresh} />) : <div className="status-empty"><Check size={20} /><p>No active incidents are published or under review.</p></div>}</section>
    </section>

    <aside className="status-create">
      <header><AlertTriangle size={20} /><div><p>PUBLIC NOTICE</p><h2>Create incident</h2></div></header>
      <p>Publish confirmed service impact or scheduled maintenance. Do not use this channel for marketing announcements.</p>
      <form onSubmit={create}>
        <div className="status-control-grid">
          <label><span>Type</span><select name="kind" defaultValue="incident"><option value="incident">Incident</option><option value="maintenance">Maintenance</option></select></label>
          <label><span>Impact</span><select name="impact" defaultValue="minor">{impacts.map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label>
          <label><span>State</span><select name="state" defaultValue="investigating">{incidentStates.filter((value) => value !== "resolved").map((value) => <option value={value} key={value}>{label(value)}</option>)}</select></label>
        </div>
        <label><span>Title</span><input name="title" required minLength={4} maxLength={160} /></label>
        <label><span>Public summary</span><textarea name="summary" required minLength={8} maxLength={2000} rows={4} /></label>
        <fieldset><legend>Affected components</legend>{data.components.map((component) => <label key={component.key}><input type="checkbox" name="components" value={component.key} /><span>{component.name}</span></label>)}</fieldset>
        <label className="status-publish"><input type="checkbox" name="published" defaultChecked /><span>Publish immediately</span></label>
        <button type="submit" disabled={creating}><Send size={14} />{creating ? "CREATING" : "CREATE INCIDENT"}</button>
      </form>
    </aside>
  </div>;
}
