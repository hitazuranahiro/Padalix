"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, CheckCircle2, Gift, LoaderCircle, ShieldCheck, TriangleAlert, WalletCards } from "lucide-react";
import type { StellarBalance, StellarBalanceList, StellarClaimableBalance, StellarPaymentConfig, StellarWalletLink } from "@/lib/stellar";
import styles from "@/app/testnet/testnet.module.css";

type Phase = "idle" | "preparing" | "signing" | "submitting" | "reconciling" | "confirmed" | "error";
const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const compact = (value: string) => value.length > 20 ? `${value.slice(0, 9)}...${value.slice(-7)}` : value;

async function responseBody<T>(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The platform request failed.");
  return body as T;
}

export function StellarClaimableBalanceFlow({ wallets, config, allowed }: { wallets: StellarWalletLink[]; config: StellarPaymentConfig; allowed: boolean }) {
  const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
  const [claimant, setClaimant] = useState("");
  const [amount, setAmount] = useState("1.0000000");
  const [balances, setBalances] = useState<{ walletId: string; funded: boolean | null; items: StellarBalance[] }>({ walletId: "", funded: null, items: [] });
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [intent, setIntent] = useState<StellarClaimableBalance | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const busy = ["preparing", "signing", "submitting", "reconciling"].includes(phase);
  const activeWallet = wallets.find((wallet) => wallet.id === walletId);
  const assetBalance = balances.walletId === walletId ? balances.items.find((item) => item.assetCode === config.assetCode && (config.assetCode === "XLM" || item.issuer === config.issuer)) : undefined;
  const balanceLoaded = balances.walletId === walletId;
  const sourceFunded = balanceLoaded && balances.funded !== false;

  useEffect(() => {
    if (!walletId || !config.enabled) return;
    let cancelled = false;
    fetch(`/api/platform/stellar-wallets/${encodeURIComponent(walletId)}/balances`, { cache: "no-store" }).then((response) => responseBody<StellarBalanceList>(response)).then((body) => { if (!cancelled) { const funded = body.funded ?? true; setBalances({ walletId, funded, items: body.balances }); if (!funded) setMessage("This wallet is linked but not funded on Stellar testnet. Use Friendbot, then reload the balance."); } }).catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Balance unavailable"); });
    return () => { cancelled = true; };
  }, [walletId, config.enabled]);

  async function sign(prepared: StellarClaimableBalance) {
    setPhase("signing");
    const [{ StellarWalletsKit }, { defaultModules }, { Networks }] = await Promise.all([import("@creit.tech/stellar-wallets-kit/sdk"), import("@creit.tech/stellar-wallets-kit/modules/utils"), import("@creit.tech/stellar-wallets-kit/types")]);
    StellarWalletsKit.init({ modules: defaultModules(), network: Networks.TESTNET, authModal: { showInstallLabel: true, hideUnsupportedWallets: false } });
    const { address } = await StellarWalletsKit.authModal();
    if (address.trim() !== prepared.source) throw new Error("Choose the wallet that prepared this claimable balance.");
    const { signedTxXdr, signerAddress } = await StellarWalletsKit.signTransaction(prepared.transaction, { networkPassphrase: prepared.networkPassphrase, address: prepared.source });
    if (!signedTxXdr || (signerAddress && signerAddress !== prepared.source)) throw new Error("The selected wallet did not sign the prepared balance.");
    setPhase("submitting");
    const submitted = await responseBody<StellarClaimableBalance>(await fetch(`/api/platform/stellar-claimable-balances/${encodeURIComponent(prepared.id)}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transaction: signedTxXdr }) }));
    setIntent(submitted);
    await reconcile(submitted);
  }

  async function reconcile(submitted: StellarClaimableBalance) {
    setPhase("reconciling");
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await wait(attempt === 0 ? 800 : 1500);
      const current = await responseBody<StellarClaimableBalance>(await fetch(`/api/platform/stellar-claimable-balances/${encodeURIComponent(submitted.id)}`, { cache: "no-store" }));
      setIntent(current);
      if (current.status === "confirmed") { setPhase("confirmed"); setMessage("The claimable balance is now recorded on Stellar testnet."); return; }
      if (current.status === "failed" || current.status === "expired") throw new Error(`The claimable balance is ${current.status}.`);
    }
    setPhase("error"); setMessage("Submitted successfully; durable reconciliation is continuing in the background.");
  }

  async function start() {
    if (busy) return;
    setMessage("");
    try {
      if (intent?.status === "prepared") return await sign(intent);
      if (intent?.status === "submitted") return await reconcile(intent);
      setPhase("preparing");
      const key = idempotencyKey || crypto.randomUUID();
      if (!idempotencyKey) setIdempotencyKey(key);
      const prepared = await responseBody<StellarClaimableBalance>(await fetch("/api/platform/stellar-claimable-balances/prepare", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify({ walletId, claimant: claimant.trim(), amount }) }));
      setIntent(prepared);
      await sign(prepared);
    } catch (error) { setPhase("error"); setMessage(error instanceof Error ? error.message : "Claimable balance could not be completed."); }
  }

  function reset() { setIntent(null); setPhase("idle"); setMessage(""); setIdempotencyKey(""); }
  const canStart = config.enabled && allowed && Boolean(activeWallet) && sourceFunded && /^G[A-Z2-7]{55}$/.test(claimant.trim()) && claimant.trim() !== activeWallet?.publicKey && Number(amount) > 0;

  return <main className={styles.page}>
    <header className={styles.hero}><div><p>STELLAR CLAIMABLE BALANCE</p><h1>Send now. Claim later.</h1><span>Create a real testnet balance the recipient can claim immediately. If untouched, the sender becomes eligible to reclaim it after seven days.</span></div><aside data-enabled={config.enabled}><Gift size={20} /><span><small>EXECUTION MODE</small><strong>{config.enabled ? "TESTNET ACTIVE" : "DISABLED"}</strong></span></aside></header>
    <div className={styles.safety}><ShieldCheck size={18} /><span><strong>Wallet-signed and non-custodial.</strong> Padalix stores public evidence and never receives the customer seed.</span></div>
    <section className={styles.workspace}>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void start(); }}><header><p>01 / CREATE BALANCE</p><h2>Set the claimant and amount.</h2></header>
        {!config.enabled ? <div className={styles.blocked}><TriangleAlert size={18} />Stellar testnet execution is disabled.</div> : null}
        {!allowed ? <div className={styles.blocked}><TriangleAlert size={18} />A verified Padalix account is required.</div> : null}
        {!wallets.length ? <div className={styles.blocked}><WalletCards size={18} /><span>Link a testnet wallet first. <Link href="/wallet">Open wallet setup</Link></span></div> : null}
        <label><span>SOURCE WALLET</span><select value={walletId} onChange={(event) => { setWalletId(event.target.value); reset(); }} disabled={busy}>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{compact(wallet.publicKey)}</option>)}</select></label>
        <div className={styles.balance}><span>AVAILABLE {config.assetCode}</span><strong>{!balanceLoaded ? "LOADING" : balances.funded === false ? "NOT FUNDED" : assetBalance ? Number(assetBalance.balance).toLocaleString(undefined, { maximumFractionDigits: 7 }) : "NOT AVAILABLE"}</strong></div>
        {balanceLoaded && balances.funded === false && activeWallet ? <div className={styles.blocked}><TriangleAlert size={18} /><span>This account does not exist on Stellar testnet yet. <a href={`https://friendbot.stellar.org/?addr=${encodeURIComponent(activeWallet.publicKey)}`} target="_blank" rel="noreferrer">Fund with Friendbot</a>, then reload this page.</span></div> : null}
        <label><span>RECIPIENT STELLAR ACCOUNT</span><input value={claimant} onChange={(event) => { setClaimant(event.target.value.toUpperCase()); reset(); }} placeholder="G..." spellCheck={false} disabled={busy} /></label>
        <label><span>AMOUNT / {config.assetCode}</span><input value={amount} onChange={(event) => { setAmount(event.target.value); reset(); }} inputMode="decimal" disabled={busy} /></label>
        <button disabled={!canStart || busy}>{busy ? <LoaderCircle className={styles.spin} size={17} /> : <Gift size={17} />}<span>{busy ? phase.toUpperCase() : intent?.status === "prepared" ? "SIGN PREPARED BALANCE" : "CREATE CLAIMABLE BALANCE"}</span><ArrowRight size={16} /></button>
        {message ? <p className={phase === "confirmed" ? styles.success : styles.error} role="status">{message}</p> : null}
      </form>
      <aside className={styles.status}><header><p>02 / ON-CHAIN EVIDENCE</p><h2>{intent?.reference ?? "Awaiting creation"}</h2></header><ol>{[{ key: "prepared", label: "Prepared", detail: "Balance ID derived" }, { key: "submitted", label: "Submitted", detail: "Accepted by Stellar RPC" }, { key: "confirmed", label: "Created", detail: "Available to claimant" }].map((step, index) => { const order = ["idle", "prepared", "submitted", "confirmed"]; const complete = order.indexOf(intent?.status ?? "idle") >= order.indexOf(step.key); return <li key={step.key} data-complete={complete}><i>{String(index + 1).padStart(2, "0")}</i><span><strong>{step.label}</strong><small>{step.detail}</small></span>{complete ? <CheckCircle2 size={17} /> : null}</li>; })}</ol><dl><div><dt>Balance ID</dt><dd>{intent ? compact(intent.claimableBalanceId) : "NOT PREPARED"}</dd></div><div><dt>Reclaim window</dt><dd>7 DAYS</dd></div><div><dt>Ledger</dt><dd>{intent?.ledger || "NOT CONFIRMED"}</dd></div></dl>{intent?.explorerUrl && intent.status !== "prepared" ? <a href={intent.explorerUrl} target="_blank" rel="noreferrer">OPEN STELLAR EXPLORER <ArrowUpRight size={15} /></a> : null}{intent?.receiptUrl ? <Link href={intent.receiptUrl}>VIEW PADALIX RECEIPT <ArrowRight size={15} /></Link> : null}{intent && !busy ? <button type="button" onClick={reset}>START ANOTHER BALANCE</button> : null}</aside>
    </section>
  </main>;
}
