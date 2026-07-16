import { Activity, AlertTriangle, Check, Clock3 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { InteriorFooter } from "@/components/interior-footer";
import { pageMetadata } from "@/lib/metadata";
import { loadPublicStatus, type PublicComponentState } from "@/lib/status";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.padalix.com";

export const metadata = pageMetadata("Padalix System Status", "Current Padalix service health, incidents, and maintenance updates.", "/status");

const labels: Record<PublicComponentState | string, string> = {
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

function label(value: string) {
  return labels[value] ?? value.replaceAll("_", " ");
}

function observedUptime(checkCount: number, uptime: number | null) {
  if (checkCount === 0 || uptime === null) return "COLLECTING DATA";
  if (checkCount < 12) return `${checkCount} OBSERVED CHECK${checkCount === 1 ? "" : "S"}`;
  return `${uptime.toFixed(2)}% / ${checkCount} OBSERVED CHECKS`;
}

export default async function StatusPage() {
  const status = await loadPublicStatus();
  return <><SiteHeader appUrl={appUrl} /><main className="public-status-page">
    <section className="status-hero"><div><p className="eyebrow mono">PADALIX / SERVICE HEALTH</p><h1>System status.</h1><p>Observed availability and confirmed operational notices across Padalix services.</p></div><Activity size={72} aria-hidden="true" /></section>
    {!status ? <section className="status-unavailable"><AlertTriangle size={24} /><div><h2>Status data is temporarily unavailable.</h2><p>This page cannot currently retrieve the monitoring feed. No service-health conclusion is being reported.</p></div></section> : <>
      <section className={`public-overall status-${status.overall}`}>{status.overall === "operational" ? <Check size={24} /> : <AlertTriangle size={24} />}<div><span className="mono">CURRENT STATE</span><h2>{label(status.overall)}</h2></div><time className="mono">GENERATED {new Date(status.generatedAt).toLocaleString()}</time></section>
      <section className="public-components"><header><p className="section-number mono">01 / COMPONENTS</p><h2>Platform services</h2><p>Uptime values appear only after real checks have been collected. Observed checks are operational measurements, not an SLA.</p></header><div>{status.components.map((component) => <article key={component.key}><div className="component-title"><i className={`status-dot status-${component.status}`} /><h3>{component.name}</h3><b className={`status-${component.status}`}>{label(component.status)}</b></div><p>{component.description}</p><footer><span className="mono">{observedUptime(component.checkCount24h, component.uptime24h)}</span><span className="mono">{component.lastCheckedAt ? `LAST CHECK ${new Date(component.lastCheckedAt).toLocaleTimeString()}` : "NOT YET CHECKED"}</span></footer></article>)}</div></section>
      <section className="public-incidents"><header><p className="section-number mono">02 / INCIDENTS</p><h2>Service notices</h2></header>{status.activeIncidents.length === 0 ? <div className="incident-clear"><Check size={20} /><p>No active incidents are currently published.</p></div> : <div className="incident-list">{status.activeIncidents.map((incident) => <article key={incident.id}><header><span className="mono">{incident.kind.toUpperCase()} / {label(incident.state).toUpperCase()}</span><time>{new Date(incident.startedAt).toLocaleString()}</time></header><h3>{incident.title}</h3><p>{incident.summary}</p><div className="affected-components mono">AFFECTED / {incident.components.map((component) => component.name).join(" / ") || "ALL PUBLIC SERVICES"}</div><ol>{incident.updates.map((update) => <li key={update.id}><Clock3 size={15} /><div><span className="mono">{label(update.state)} / {new Date(update.createdAt).toLocaleString()}</span><p>{update.message}</p></div></li>)}</ol></article>)}</div>}</section>
      {status.recentIncidents.length > 0 && <section className="resolved-incidents"><header><p className="section-number mono">03 / HISTORY</p><h2>Resolved incidents</h2></header><div>{status.recentIncidents.map((incident) => <article key={incident.id}><Check size={16} /><div><strong>{incident.title}</strong><span className="mono">RESOLVED {incident.resolvedAt ? new Date(incident.resolvedAt).toLocaleString() : ""}</span></div></article>)}</div></section>}
    </>}
  </main><InteriorFooter appUrl={appUrl} /></>;
}
