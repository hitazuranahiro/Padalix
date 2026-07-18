"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import styles from "@/app/receipts/[reference]/receipt.module.css";

export function ClaimLinkCreator({ reference }: { reference: string }) {
  const [claimUrl, setClaimUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/platform/transfers/${encodeURIComponent(reference)}/claims`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Claim could not be created");
      setClaimUrl(`${window.location.origin}/claim#token=${encodeURIComponent(result.claimToken)}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Claim could not be created"); }
    finally { setBusy(false); }
  }

  async function copy() {
    await navigator.clipboard.writeText(claimUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  }

  return <section className={styles.claimSection}>
    <div><Link2 size={20} /><span><strong>Recipient claim link</strong><small>Create a single-use acknowledgement link for this transfer. This does not release payout funds.</small></span></div>
    {claimUrl ? <div className={styles.claimResult}><code>{claimUrl}</code><button onClick={() => void copy()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy link"}</button></div> : <button disabled={busy} onClick={() => void create()}><Link2 size={15} />{busy ? "Creating" : "Create claim link"}</button>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
