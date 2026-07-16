import type { Metadata } from "next";
import { ShieldCheck, TestTube2, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StellarWalletLinker } from "@/components/stellar-wallet-linker";
import { platformRequest, type PlatformAccount } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";
import { STELLAR_NETWORK, type StellarWalletList } from "@/lib/stellar";
import styles from "./wallet.module.css";

export const metadata: Metadata = {
  title: "Stellar Wallet",
  description: "Verify ownership of a non-custodial Stellar account with Padalix.",
};

export default async function WalletPage() {
  const session = await requireCustomerSession();
  const [account, data] = await Promise.all([
    platformRequest<PlatformAccount>(session, "/v1/account"),
    platformRequest<StellarWalletList>(session, "/v1/stellar-wallets"),
  ]);
  const mainnet = STELLAR_NETWORK === "mainnet";

  return (
    <AppShell active="/wallet" member={{ name: account.name, level: account.verificationLevel }}>
      <main className={styles.page}>
        <header className={styles.hero}>
          <div>
            <p>STELLAR WALLET / NON-CUSTODIAL</p>
            <h1>Prove ownership. Keep custody.</h1>
            <span>Your wallet signs locally. Padalix records a verified public address, never your private key.</span>
          </div>
          <aside className={mainnet ? styles.mainnetBadge : styles.testnetBadge}>
            {mainnet ? <TriangleAlert size={20} /> : <TestTube2 size={20} />}
            <span>
              <small>STELLAR NETWORK</small>
              <strong>{mainnet ? "MAINNET" : "TESTNET"}</strong>
            </span>
          </aside>
        </header>

        {mainnet ? (
          <div className={styles.networkNotice}>
            <TriangleAlert aria-hidden="true" size={18} />
            <span>Mainnet ownership verification is active. Linking alone cannot move funds or create a payout.</span>
          </div>
        ) : (
          <div className={styles.networkNotice}>
            <ShieldCheck aria-hidden="true" size={18} />
            <span>Testnet is active. Mainnet remains blocked unless both web and platform release gates are enabled.</span>
          </div>
        )}

        <StellarWalletLinker initialWallets={data.wallets} network={STELLAR_NETWORK} />
      </main>
    </AppShell>
  );
}
