"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, CheckCircle2, CircleDollarSign, LoaderCircle, RadioTower, ShieldCheck, TriangleAlert, WalletCards } from "lucide-react";
import type { StellarBalance, StellarBalanceList, StellarPayment, StellarPaymentConfig, StellarWalletLink } from "@/lib/stellar";
import styles from "@/app/testnet/testnet.module.css";

type Phase = "idle" | "preparing" | "signing" | "submitting" | "reconciling" | "confirmed" | "error";

function compact(value: string) {
  return `${value.slice(0, 9)}...${value.slice(-7)}`;
}

function paymentError(error: unknown) {
  return error instanceof Error && error.message ? error.message : "The Stellar testnet payment could not be completed.";
}

async function responseBody<T>(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The platform request failed.");
  return body as T;
}

const delay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export function StellarTestnetPayment({ wallets, config, allowed }: { wallets: StellarWalletLink[]; config: StellarPaymentConfig; allowed: boolean }) {
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("1.0000000");
  const [balanceData, setBalanceData] = useState<{ walletId: string; balances: StellarBalance[] }>({ walletId: "", balances: [] });
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [payment, setPayment] = useState<StellarPayment | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const activeWallet = wallets.find((wallet) => wallet.id === walletId);
  const busy = ["preparing", "signing", "submitting", "reconciling"].includes(phase);
  const currentBalances = balanceData.walletId === walletId ? balanceData.balances : [];
  const assetBalance = currentBalances.find((item) => item.assetCode === config.assetCode && (config.assetCode === "XLM" || item.issuer === config.issuer));

  useEffect(() => {
    if (!walletId || !config.enabled) {
      return;
    }
    let cancelled = false;
    fetch(`/api/platform/stellar-wallets/${encodeURIComponent(walletId)}/balances`, { cache: "no-store" })
      .then((response) => responseBody<StellarBalanceList>(response))
      .then((data) => { if (!cancelled) setBalanceData({ walletId, balances: data.balances }); })
      .catch((error) => { if (!cancelled) setMessage(paymentError(error)); });
    return () => { cancelled = true; };
  }, [walletId, config.enabled]);

  async function signAndSubmit(prepared: StellarPayment) {
    setPhase("signing");
    setMessage("");
    const [{ StellarWalletsKit }, { defaultModules }, { Networks }] = await Promise.all([
      import("@creit.tech/stellar-wallets-kit/sdk"),
      import("@creit.tech/stellar-wallets-kit/modules/utils"),
      import("@creit.tech/stellar-wallets-kit/types"),
    ]);
    StellarWalletsKit.init({
      modules: defaultModules(),
      network: Networks.TESTNET,
      authModal: { showInstallLabel: true, hideUnsupportedWallets: false },
    });
    const { address } = await StellarWalletsKit.authModal();
    if (address.trim() !== prepared.source) throw new Error("Choose the same wallet that prepared this payment.");
    const { signedTxXdr, signerAddress } = await StellarWalletsKit.signTransaction(prepared.transaction, {
      networkPassphrase: prepared.networkPassphrase,
      address: prepared.source,
    });
    if (!signedTxXdr || (signerAddress && signerAddress !== prepared.source)) {
      throw new Error("The selected wallet did not sign the prepared payment.");
    }

    setPhase("submitting");
    const submitted = await responseBody<StellarPayment>(await fetch(`/api/platform/stellar-payments/${encodeURIComponent(prepared.id)}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transaction: signedTxXdr }),
    }));
    setPayment(submitted);
    await reconcile(submitted);
  }

  async function reconcile(submitted: StellarPayment) {
    setPhase("reconciling");
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await delay(attempt === 0 ? 800 : 1500);
      const current = await responseBody<StellarPayment>(await fetch(`/api/platform/stellar-payments/${encodeURIComponent(submitted.id)}`, { cache: "no-store" }));
      setPayment(current);
      if (current.status === "confirmed") {
        setPhase("confirmed");
        setMessage("Stellar testnet confirmed the payment and Padalix reconciled the receipt.");
        return;
      }
      if (current.status === "failed" || current.status === "expired") {
        throw new Error(`The Stellar payment is ${current.status}.`);
      }
    }
    setPhase("error");
    setMessage("The transaction was submitted but confirmation is taking longer than expected. Continue checking the same payment.");
  }

  async function startPayment() {
    if (busy) return;
    setMessage("");
    try {
      if (payment?.status === "prepared") {
        await signAndSubmit(payment);
        return;
      }
      if (payment?.status === "submitted") {
        await reconcile(payment);
        return;
      }
      setPhase("preparing");
      const requestKey = idempotencyKey || crypto.randomUUID();
      if (!idempotencyKey) setIdempotencyKey(requestKey);
      const prepared = await responseBody<StellarPayment>(await fetch("/api/platform/stellar-payments/prepare", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": requestKey },
        body: JSON.stringify({ walletId, destination: destination.trim(), amount }),
      }));
      setPayment(prepared);
      await signAndSubmit(prepared);
    } catch (error) {
      setPhase("error");
      setMessage(paymentError(error));
    }
  }

  function resetPayment() {
    setPayment(null);
    setPhase("idle");
    setMessage("");
    setIdempotencyKey("");
  }

  const canStart = config.enabled && allowed && Boolean(activeWallet) && /^G[A-Z2-7]{55}$/.test(destination.trim()) && Number(amount) > 0;
  const actionLabel = payment?.status === "prepared" ? "SIGN PREPARED PAYMENT" : payment?.status === "submitted" ? "CHECK CONFIRMATION" : "PREPARE TESTNET PAYMENT";

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div><p>STELLAR TESTNET</p><h1>Send on testnet</h1><span>Prepare a genuine Stellar testnet payment, review it in your wallet, and track its confirmation.</span></div>
        <aside data-enabled={config.enabled}><RadioTower size={20} /><span><small>EXECUTION MODE</small><strong>{config.enabled ? "TESTNET ACTIVE" : "DISABLED"}</strong></span></aside>
      </header>

      <div className={styles.safety}><ShieldCheck size={18} /><span><strong>Mainnet remains blocked.</strong> Padalix prepares the exact transaction; your selected wallet reviews and signs it locally.</span></div>

      <section className={styles.workspace}>
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void startPayment(); }}>
          <header><p>01 / PAYMENT INPUT</p><h2>Prepare one testnet transfer.</h2></header>
          {!config.enabled ? <div className={styles.blocked}><TriangleAlert size={18} /><span>Stellar testnet payment execution is not enabled on the platform service.</span></div> : null}
          {!allowed ? <div className={styles.blocked}><TriangleAlert size={18} /><span>A verified Padalix account is required before a testnet transaction can be prepared.</span></div> : null}
          {!wallets.length ? <div className={styles.blocked}><WalletCards size={18} /><span>Link and verify a Stellar testnet wallet first. <Link href="/wallet">Open wallet setup</Link></span></div> : null}

          <label><span>SOURCE WALLET</span><select value={walletId} onChange={(event) => { setWalletId(event.target.value); resetPayment(); }} disabled={busy || !wallets.length}>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{compact(wallet.publicKey)}</option>)}</select></label>
          <div className={styles.balance}><span>AVAILABLE {config.assetCode}</span><strong>{balanceData.walletId !== walletId ? "LOADING" : assetBalance ? Number(assetBalance.balance).toLocaleString(undefined, { maximumFractionDigits: 7 }) : "NOT AVAILABLE"}</strong></div>
          <label><span>DESTINATION STELLAR ACCOUNT</span><input value={destination} onChange={(event) => { setDestination(event.target.value.toUpperCase()); resetPayment(); }} placeholder="G..." spellCheck={false} autoCapitalize="characters" disabled={busy} /></label>
          <label><span>AMOUNT / {config.assetCode}</span><input value={amount} onChange={(event) => { setAmount(event.target.value); resetPayment(); }} inputMode="decimal" disabled={busy} /></label>
          {config.issuer ? <div className={styles.issuer}><span>ASSET ISSUER</span><code>{config.issuer}</code></div> : <div className={styles.issuer}><span>ASSET</span><code>NATIVE XLM / TESTNET</code></div>}
          <button type="submit" disabled={!canStart || busy}>{busy ? <LoaderCircle className={styles.spin} size={17} /> : <CircleDollarSign size={17} />}<span>{busy ? phase.toUpperCase() : actionLabel}</span><ArrowRight size={16} /></button>
          {message ? <p className={phase === "confirmed" ? styles.success : styles.error} role="status">{message}</p> : null}
        </form>

        <aside className={styles.status}>
          <header><p>02 / NETWORK EVIDENCE</p><h2>{payment?.reference ?? "Awaiting payment"}</h2></header>
          <ol>
            {[{ key: "prepared", label: "Prepared", detail: "Immutable XDR and hash" }, { key: "submitted", label: "Submitted", detail: "Accepted by Stellar RPC" }, { key: "confirmed", label: "Confirmed", detail: "Included in a testnet ledger" }].map((step, index) => {
              const order = ["idle", "prepared", "submitted", "confirmed"];
              const current = payment?.status ?? "idle";
              const complete = order.indexOf(current) >= order.indexOf(step.key);
              return <li key={step.key} data-complete={complete}><i>{String(index + 1).padStart(2, "0")}</i><span><strong>{step.label}</strong><small>{step.detail}</small></span>{complete ? <CheckCircle2 size={17} /> : null}</li>;
            })}
          </ol>
          <dl>
            <div><dt>Network</dt><dd>STELLAR TESTNET</dd></div>
            <div><dt>Transaction hash</dt><dd>{payment ? compact(payment.transactionHash) : "NOT PREPARED"}</dd></div>
            <div><dt>Ledger</dt><dd>{payment?.ledger || "NOT CONFIRMED"}</dd></div>
          </dl>
          {payment?.explorerUrl && payment.status !== "prepared" ? <a href={payment.explorerUrl} target="_blank" rel="noreferrer">OPEN STELLAR EXPLORER <ArrowUpRight size={15} /></a> : null}
          {payment?.receiptUrl ? <Link href={payment.receiptUrl}>VIEW PADALIX RECEIPT <ArrowRight size={15} /></Link> : null}
          {payment && !busy ? <button type="button" onClick={resetPayment}>START ANOTHER PAYMENT</button> : null}
        </aside>
      </section>
    </main>
  );
}
