import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Ban, Check, CircleDollarSign, FileCheck2, ShieldCheck, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { platformRequest, type PlatformAccount } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";
import { STELLAR_NETWORK, type StellarWalletList } from "@/lib/stellar";
import styles from "./moneygram.module.css";

export const metadata: Metadata = {
  title: "MoneyGram Ramp",
  description: "Padalix MoneyGram Ramps and SEP-24 integration readiness.",
};

export default async function MoneyGramRampPage() {
  const session = await requireCustomerSession();
  const [account, walletData] = await Promise.all([
    platformRequest<PlatformAccount>(session, "/v1/account"),
    platformRequest<StellarWalletList>(session, "/v1/stellar-wallets"),
  ]);
  const environment = process.env.MONEYGRAM_RAMP_ENV ?? "disabled";
  const allowlisted = process.env.MONEYGRAM_RAMP_ALLOWLISTED === "true";
  const clientSigningConfigured = Boolean(process.env.MONEYGRAM_CLIENT_SIGNING_SEED);
  const wallet = walletData.wallets.find((item) => item.network === STELLAR_NETWORK);
  const integrationReady = environment !== "disabled" && allowlisted && clientSigningConfigured && Boolean(wallet);

  const checks = [
    { label: "Verified Stellar wallet", ready: Boolean(wallet), detail: wallet ? `${wallet.publicKey.slice(0, 10)}...${wallet.publicKey.slice(-8)}` : "No linked wallet on the active network" },
    { label: "MoneyGram domain allowlist", ready: allowlisted, detail: allowlisted ? "Padalix client domain approved" : "Awaiting MoneyGram approval for padalix.com" },
    { label: "Client-domain signing", ready: clientSigningConfigured, detail: clientSigningConfigured ? "Server signing key configured" : "Signing seed is not configured" },
    { label: "Ramp environment", ready: environment !== "disabled", detail: environment.toUpperCase() },
  ];

  return (
    <AppShell active="/ramps/moneygram" member={{ name: account.name, level: account.verificationLevel }}>
      <main className={styles.page}>
        <header className={styles.hero}>
          <div>
            <p>MONEYGRAM RAMPS / SEP-24</p>
            <h1>Cash access, without custody.</h1>
            <span>Padalix connects a user-controlled Stellar wallet to MoneyGram&apos;s hosted cash-in and cash-out flow.</span>
          </div>
          <aside data-ready={integrationReady}>
            {integrationReady ? <Check size={20} /> : <Ban size={20} />}
            <span><small>INTEGRATION STATE</small><strong>{integrationReady ? "READY" : "BLOCKED"}</strong></span>
          </aside>
        </header>

        <div className={styles.notice}>
          <ShieldCheck size={18} />
          <span><strong>No Padalix smart contract is required.</strong> MoneyGram Ramps uses classic Stellar USDC transactions, SEP-10 authentication, and a SEP-24 hosted flow.</span>
        </div>

        <section className={styles.workspace}>
          <div className={styles.readiness}>
            <header><p>01 / RELEASE GATES</p><h2>Demonstration readiness</h2></header>
            <div className={styles.checks}>
              {checks.map((check) => (
                <article key={check.label} data-ready={check.ready}>
                  <i>{check.ready ? <Check size={15} /> : <Ban size={15} />}</i>
                  <span><strong>{check.label}</strong><small>{check.detail}</small></span>
                </article>
              ))}
            </div>
            {integrationReady ? (
              <div className={styles.pendingLaunch}><FileCheck2 size={19} /><span><strong>Technical gates are configured.</strong><small>The interactive launch endpoint remains release-controlled until the certified SEP-24 flow is deployed.</small></span></div>
            ) : (
              <div className={styles.pendingLaunch}><Ban size={19} /><span><strong>Launch remains disabled.</strong><small>Padalix will not create a MoneyGram transaction until every release gate passes.</small></span></div>
            )}
          </div>

          <aside className={styles.flow}>
            <header><p>02 / TRANSACTION PATH</p><h2>Non-custodial flow</h2></header>
            <ol>
              <li><i>01</i><span><strong>Authenticate</strong><small>Wallet signs a SEP-10 challenge.</small></span><WalletCards size={18} /></li>
              <li><i>02</i><span><strong>Complete MoneyGram flow</strong><small>Identity and cash location are handled in the hosted SEP-24 UI.</small></span><CircleDollarSign size={18} /></li>
              <li><i>03</i><span><strong>Settle USDC</strong><small>User approves the Stellar transaction from their wallet.</small></span><ShieldCheck size={18} /></li>
              <li><i>04</i><span><strong>Receive reference</strong><small>Padalix records provider status and receipt evidence.</small></span><FileCheck2 size={18} /></li>
            </ol>
            {!wallet ? <Link href="/wallet">Link Stellar wallet <ArrowUpRight size={15} /></Link> : null}
            <a href="https://developer.moneygram.com/moneygram-developer/docs/integrate-moneygram-ramps" target="_blank" rel="noreferrer">MoneyGram integration guide <ArrowUpRight size={15} /></a>
          </aside>
        </section>
      </main>
    </AppShell>
  );
}
