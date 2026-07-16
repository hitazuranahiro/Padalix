"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, RotateCcw } from "lucide-react";
import type { OperationsSnapshot } from "@/lib/operations";

const compact = (value: string) => value ? `${value.slice(0, 8)}...${value.slice(-7)}` : "-";

export function OperationsConsole({ snapshot }: { snapshot: OperationsSnapshot }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const problemJobs = snapshot.jobs.filter((job) => ["dead_letter", "failed"].includes(job.status));
  const openExceptions = snapshot.exceptions.filter((item) => ["open", "investigating"].includes(item.status));
  const workerHealthy = snapshot.workers.some((worker) => worker.healthy);
  const workerState = !snapshot.workerTelemetryReady ? "SETUP" : workerHealthy ? "LIVE" : "DOWN";

  async function act(path: string, body?: Record<string, string>) {
    setBusy(path);
    setError("");
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) setError(result.error ?? "Operations command failed.");
    else router.refresh();
    setBusy("");
  }

  return <div className="operations-console">
    <section className="operations-summary">
      <header><div><p>SETTLEMENT / CONTROL PLANE</p><h1>Payment operations</h1></div><span>UPDATED {new Date(snapshot.generatedAt).toLocaleString()}</span></header>
      {error ? <p className="operations-error" role="alert">{error}</p> : null}
      <div className="operations-metrics"><article><strong>{snapshot.transfers.length}</strong><span>RECENT TRANSFERS</span></article><article data-alert={snapshot.queue.failed > 0}><strong>{snapshot.queue.failed}</strong><span>FAILED JOBS</span></article><article data-alert={openExceptions.length > 0}><strong>{openExceptions.length}</strong><span>OPEN EXCEPTIONS</span></article><article data-alert={!workerHealthy}><strong>{workerState}</strong><span>WORKER RUNTIME</span></article><article data-alert={snapshot.queue.oldestPendingSeconds > 60}><strong>{snapshot.queue.pending}</strong><span>PENDING / {snapshot.queue.oldestPendingSeconds}S OLDEST</span></article></div>
      <div className="operations-table"><header><span>REFERENCE</span><span>MODE</span><span>AMOUNT</span><span>STATUS</span><span>RECONCILIATION</span><span>TRANSACTION</span></header>{snapshot.transfers.map((transfer) => <article key={transfer.reference}><strong>{transfer.reference}</strong><span>{transfer.settlementMode.replaceAll("_", " ").toUpperCase()}</span><span>{transfer.sourceAmount} {transfer.sourceAsset}</span><b>{transfer.status.toUpperCase()}</b><b>{transfer.reconciliationStatus.replaceAll("_", " ").toUpperCase()}</b><code title={transfer.transactionHash}>{compact(transfer.transactionHash)}</code></article>)}</div>
    </section>
    <aside className="operations-queue">
      <section><header><Activity size={18} /><div><p>RUNTIME</p><h2>Worker heartbeat</h2></div></header>{!snapshot.workerTelemetryReady ? <p className="operations-empty operations-alert"><AlertTriangle size={16} />Apply database migration 018 to enable worker telemetry.</p> : snapshot.workers.length ? snapshot.workers.map((worker) => <article className="operations-worker" data-alert={!worker.healthy} key={worker.id}><span>{worker.healthy ? "HEALTHY" : "UNAVAILABLE"} / {worker.id}</span><strong>{worker.heartbeatAgeSeconds}S SINCE HEARTBEAT</strong><small>{worker.lastCycleStatus.toUpperCase()} / {worker.cyclesCompleted} CYCLES / {worker.consecutiveErrors} CONSECUTIVE ERRORS</small>{worker.lastErrorCode ? <small>{worker.lastErrorCode.replaceAll("_", " ").toUpperCase()}</small> : null}</article>) : <p className="operations-empty operations-alert"><AlertTriangle size={16} />No worker heartbeat recorded.</p>}</section>
      <section><header><AlertTriangle size={18} /><div><p>EXCEPTIONS</p><h2>Manual review</h2></div></header>{openExceptions.length ? openExceptions.map((item) => <article className="operations-exception" key={item.id}><span>{item.reference} / {item.exceptionCode.replaceAll("_", " ").toUpperCase()}</span><strong>{compact(item.transactionHash)}</strong><textarea value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Document the evidence used to reconcile this transfer." rows={3} /><button disabled={busy !== "" || (notes[item.id]?.trim().length ?? 0) < 8} onClick={() => void act(`/api/admin/operations/exceptions/${item.id}/resolve`, { note: notes[item.id] ?? "" })}><CheckCircle2 size={14} />RESOLVE AS MATCHED</button></article>) : <p className="operations-empty"><CheckCircle2 size={16} />No reconciliation exceptions.</p>}</section>
      <section><header><RefreshCw size={18} /><div><p>OUTBOX</p><h2>Failed jobs</h2></div></header>{problemJobs.length ? problemJobs.map((job) => <article className="operations-job" key={job.id}><span>{job.topic.toUpperCase()}</span><strong>{compact(job.aggregateId)}</strong><small>{job.lastErrorCode.replaceAll("_", " ").toUpperCase()} / {job.attempts} ATTEMPTS</small><button disabled={busy !== ""} onClick={() => void act(`/api/admin/operations/jobs/${job.id}/retry`)}><RotateCcw size={14} />RETRY JOB</button></article>) : <p className="operations-empty"><CheckCircle2 size={16} />No failed jobs.</p>}</section>
    </aside>
  </div>;
}
