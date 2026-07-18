"use client";

import { useState, useSyncExternalStore } from "react";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import styles from "./claim.module.css";

type ClaimResult = { transferReference: string; recipientName: string; status: string };

function subscribeToHashChange(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function claimTokenSnapshot() {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

export function ClaimRedemption() {
  const token = useSyncExternalStore(subscribeToHashChange, claimTokenSnapshot, () => "");
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function redeem() {
    if (!token || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/platform/recipient-claims/redeem", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ claimToken: token }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Claim could not be confirmed");
      setResult(body); window.history.replaceState(null, "", window.location.pathname);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Claim could not be confirmed"); }
    finally { setBusy(false); }
  }

  return <section className={styles.panel}>
    {result ? <><CheckCircle2 className={styles.success} size={30} /><p>CLAIM CONFIRMED</p><h1>Receipt acknowledged.</h1><span>{result.recipientName} confirmed claim {result.transferReference}. Funds are released only through the configured settlement provider.</span></> : <><ShieldCheck size={30} /><p>ONE-TIME CONFIRMATION</p><h1>Confirm your transfer claim.</h1><span>This securely records your acknowledgement. It does not ask for a password, wallet seed, PIN, or payment.</span><button disabled={!token || busy} onClick={() => void redeem()}><span>{busy ? "Confirming" : token ? "Confirm claim" : "Claim link is missing"}</span><ArrowRight size={17} /></button>{error && <strong role="alert">{error}</strong>}</>}
  </section>;
}
