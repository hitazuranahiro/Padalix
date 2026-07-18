"use client";

import { useState } from "react";
import { ArrowUpRight, CircleDollarSign, ShieldCheck } from "lucide-react";
import styles from "./fund.module.css";

type Checkout = { externalId: string; status: string; providerReference?: string; checkoutURL?: string };

export function FundingCheckout() {
  const [amount, setAmount] = useState("200");
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const numericAmount = Number(amount);
  const valid = numericAmount === 0 || (numericAmount >= 200 && numericAmount <= 50000);

  async function create() {
    if (!valid || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/platform/funding-checkouts", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ amount: numericAmount }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Checkout unavailable");
      setCheckout(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Checkout unavailable"); }
    finally { setBusy(false); }
  }

  return <section className={styles.checkout}>
    <div className={styles.inputPanel}><header><CircleDollarSign size={20} /><span><p>01 / AMOUNT</p><h2>Funding amount</h2></span></header><label><span>YOU FUND</span><div><b>PHP</b><input aria-label="Funding amount in PHP" inputMode="decimal" min="0" max="50000" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /></div><small>Free checkout or PHP 200.00 to PHP 50,000.00</small></label>{error && <p className={styles.error} role="alert">{error}</p>}</div>
    <aside><ShieldCheck size={22} /><p>GANAP CHECKOUT</p><h2>{checkout ? checkout.status.toUpperCase() : "Ready for provider handoff"}</h2><span>{checkout ? `External reference ${checkout.externalId}` : "Padalix will create a unique checkout and redirect you to the provider. Never enter a wallet seed or account password."}</span>{checkout?.checkoutURL ? <a href={checkout.checkoutURL}>Open secure checkout <ArrowUpRight size={16} /></a> : <button disabled={!valid || busy} onClick={() => void create()}>{busy ? "Creating checkout" : "Continue to Ganap"}<ArrowUpRight size={16} /></button>}</aside>
  </section>;
}
