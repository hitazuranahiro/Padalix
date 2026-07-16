import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { StellarTestnetPayment } from "@/components/stellar-testnet-payment";
import { platformRequest, type PlatformAccount } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";
import type { StellarPaymentConfig, StellarWalletList } from "@/lib/stellar";

export const metadata: Metadata = {
  title: "Stellar Testnet Transfer",
  description: "Prepare, sign, submit, and reconcile a real Stellar testnet payment.",
};

export default async function StellarTestnetPage() {
  const session = await requireCustomerSession();
  const [account, wallets, config] = await Promise.all([
    platformRequest<PlatformAccount>(session, "/v1/account"),
    platformRequest<StellarWalletList>(session, "/v1/stellar-wallets"),
    platformRequest<StellarPaymentConfig>(session, "/v1/stellar-payments/config"),
  ]);
  const allowed = ["verified", "enhanced", "business"].includes(account.verificationLevel);

  return (
    <AppShell active="/testnet" member={{ name: account.name, level: account.verificationLevel }}>
      <StellarTestnetPayment wallets={wallets.wallets.filter((wallet) => wallet.network === "testnet")} config={config} allowed={allowed} />
    </AppShell>
  );
}
