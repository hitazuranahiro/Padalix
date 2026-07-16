"use client";

import { AlertTriangle, ArrowUpRight, Wrench } from "lucide-react";
import { useEffect, useState } from "react";

type PublicIncident = {
  id: string;
  kind: "incident" | "maintenance";
  title: string;
  summary: string;
  impact: "maintenance" | "minor" | "major" | "critical";
};

type PublicStatus = { activeIncidents?: PublicIncident[] };

function statusEndpoint() {
  if (process.env.NEXT_PUBLIC_STATUS_API_URL) return process.env.NEXT_PUBLIC_STATUS_API_URL;
  return window.location.hostname === "localhost"
    ? "http://localhost:3001/api/status"
    : "https://admin.padalix.com/api/status";
}

export function CustomerStatusBanner() {
  const [incident, setIncident] = useState<PublicIncident | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function refresh() {
      try {
        const response = await fetch(statusEndpoint(), { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const status = await response.json() as PublicStatus;
        if (active) setIncident(Array.isArray(status.activeIncidents) ? status.activeIncidents[0] ?? null : null);
      } catch {
        // Status reporting must never prevent account access.
      }
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  if (!incident) return null;
  const maintenance = incident.kind === "maintenance";
  const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://padalix.com";

  return <aside className={`customer-status-banner impact-${incident.impact}`} aria-live="polite">
    {maintenance ? <Wrench size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
    <strong>{incident.title}</strong>
    <span>{incident.summary}</span>
    <a href={`${marketingUrl}/status`}>STATUS <ArrowUpRight size={13} /></a>
  </aside>;
}
