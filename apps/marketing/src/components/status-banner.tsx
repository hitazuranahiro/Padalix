import { AlertTriangle, ArrowUpRight, Wrench } from "lucide-react";
import Link from "next/link";
import type { PublicStatus } from "@/lib/status";

export function StatusBanner({ status }: { status: PublicStatus | null }) {
  const incident = status?.activeIncidents[0];
  if (!incident) return null;
  const maintenance = incident.kind === "maintenance";
  return <aside className={`global-status-banner impact-${incident.impact}`} aria-live="polite">
    {maintenance ? <Wrench size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
    <strong>{incident.title}</strong>
    <span>{incident.summary}</span>
    <Link href="/status">View status <ArrowUpRight size={13} /></Link>
  </aside>;
}
