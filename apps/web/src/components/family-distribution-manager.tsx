"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Check, Plus, Users } from "lucide-react";
import styles from "@/app/family/family.module.css";

export type FamilyRecipient = {
  id: string;
  name: string;
  payoutMethod: string;
  payoutReferenceMasked: string;
};

export type FamilyPlan = {
  id: string;
  name: string;
  status: string;
  allocations: Array<FamilyRecipient & { recipientId: string; recipientName: string; shareBasisPoints: number }>;
  createdAt: string;
};

type FamilyExecution = {
  id: string;
  status: string;
  sourceAmount: string;
  feeAmount: string;
  items: Array<{ transferId: string; reference: string; recipientName: string; sourceAmount: string }>;
};

export function FamilyDistributionManager({
  recipients,
  initialPlans,
  allowed,
}: {
  recipients: FamilyRecipient[];
  initialPlans: FamilyPlan[];
  allowed: boolean;
}) {
  const [name, setName] = useState("Home distribution");
  const [shares, setShares] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState(initialPlans);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [executionAmounts, setExecutionAmounts] = useState<Record<string, string>>({});
  const [executions, setExecutions] = useState<Record<string, FamilyExecution>>({});
  const [executingPlan, setExecutingPlan] = useState("");
  const selected = useMemo(
    () => recipients.filter((recipient) => Number(shares[recipient.id] ?? 0) > 0),
    [recipients, shares],
  );
  const total = selected.reduce((sum, recipient) => sum + Number(shares[recipient.id] ?? 0), 0);
  const ready = name.trim().length >= 2 && selected.length >= 2 && Math.abs(total - 100) < 0.001;

  async function createPlan() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/platform/family-distributions", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          name: name.trim(),
          allocations: selected.map((recipient) => ({
            recipientId: recipient.id,
            shareBasisPoints: Math.round(Number(shares[recipient.id]) * 100),
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Plan could not be saved");
      setPlans((current) => [result, ...current]);
      setShares({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Plan could not be saved");
    } finally {
      setBusy(false);
    }
  }

  async function executePlan(plan: FamilyPlan) {
    const amount = executionAmounts[plan.id] ?? "";
    if (!allowed || Number(amount) <= 0 || executingPlan) return;
    setExecutingPlan(plan.id);
    setError("");
    try {
      const response = await fetch(`/api/platform/family-distributions/${encodeURIComponent(plan.id)}/executions`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ amount }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Distribution could not be executed");
      setExecutions((current) => ({ ...current, [plan.id]: result }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Distribution could not be executed");
    } finally {
      setExecutingPlan("");
    }
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.builder}>
        <header><div><p>NEW PLAN</p><h2>Allocate one transfer.</h2></div><span>{selected.length} SELECTED</span></header>
        <label className={styles.nameField}><span>PLAN NAME</span><input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></label>
        <div className={styles.recipients}>
          {recipients.map((recipient) => {
            const active = Number(shares[recipient.id] ?? 0) > 0;
            return <article className={active ? styles.active : ""} key={recipient.id}>
              <i>{active ? <Check size={14} /> : <Users size={15} />}</i>
              <span><strong>{recipient.name}</strong><small>{recipient.payoutMethod.replaceAll("_", " ")} / {recipient.payoutReferenceMasked}</small></span>
              <label><input aria-label={`${recipient.name} share percentage`} inputMode="decimal" min="0" max="100" step="0.01" type="number" value={shares[recipient.id] ?? ""} placeholder="0" onChange={(event) => setShares((current) => ({ ...current, [recipient.id]: event.target.value }))} /><b>%</b></label>
            </article>;
          })}
          {!recipients.length && <div className={styles.empty}>Add at least two recipients before creating a distribution.</div>}
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <footer><span><small>TOTAL ALLOCATION</small><strong className={ready ? styles.complete : ""}>{total.toFixed(2)}%</strong></span><button disabled={!ready || busy} onClick={() => void createPlan()}><Plus size={16} />{busy ? "Saving plan" : "Save distribution"}</button></footer>
      </section>
      <aside className={styles.plans}>
        <header><p>SAVED PLANS</p><strong>{plans.length}</strong></header>
        {plans.map((plan) => <article key={plan.id}><div><strong>{plan.name}</strong><small>{plan.allocations.length} RECIPIENTS / {plan.status.toUpperCase()}</small></div>{plan.allocations.map((allocation) => <span key={allocation.recipientId}><b>{allocation.recipientName}</b><em>{(allocation.shareBasisPoints / 100).toFixed(2)}%</em></span>)}{executions[plan.id] ? <div className="family-execution-result"><small>CONFIRMED / {executions[plan.id].sourceAmount} USDC</small>{executions[plan.id].items.map((item) => <Link key={item.transferId} href={`/receipts/${encodeURIComponent(item.reference)}`}>{item.recipientName}<ArrowRight size={13} /></Link>)}</div> : <div className="family-execution"><label><span>USDC</span><input aria-label={`${plan.name} execution amount`} inputMode="decimal" placeholder="100.00" value={executionAmounts[plan.id] ?? ""} onChange={(event) => setExecutionAmounts((current) => ({ ...current, [plan.id]: event.target.value }))} /></label><button disabled={!allowed || Number(executionAmounts[plan.id] ?? 0) <= 0 || Boolean(executingPlan)} onClick={() => void executePlan(plan)}>{executingPlan === plan.id ? "Processing" : allowed ? "Execute sandbox" : "Verification required"}</button></div>}</article>)}
        {!plans.length && <div className={styles.empty}>Your reusable distribution plans will appear here.</div>}
      </aside>
    </div>
  );
}
