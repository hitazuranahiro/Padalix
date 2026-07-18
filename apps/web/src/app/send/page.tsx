import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { StellarTestnetPayment } from "@/components/stellar-testnet-payment";
import { platformRequest, type PlatformAccount } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";
import type { StellarPaymentConfig, StellarWalletList } from "@/lib/stellar";

export const metadata: Metadata = {
  title: "Send on Stellar Testnet",
  description: "Prepare, sign, submit, and reconcile a Stellar testnet transfer.",
};

export default async function SendPage() {
  const session = await requireCustomerSession();
  const [account, wallets, config] = await Promise.all([
    platformRequest<PlatformAccount>(session, "/v1/account"),
    platformRequest<StellarWalletList>(session, "/v1/stellar-wallets"),
    platformRequest<StellarPaymentConfig>(session, "/v1/stellar-payments/config"),
  ]);
  const allowed = ["verified", "enhanced", "business"].includes(account.verificationLevel);

  return (
    <AppShell
      active="/send"
      member={{ name: account.name, level: account.verificationLevel }}
    >
      <StellarTestnetPayment
        wallets={wallets.wallets.filter((wallet) => wallet.network === "testnet")}
        config={config}
        allowed={allowed}
        primary
      />
    </AppShell>
  );
}
