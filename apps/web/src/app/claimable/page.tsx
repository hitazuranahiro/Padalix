import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { StellarClaimableBalanceFlow } from "@/components/stellar-claimable-balance";
import { platformRequest, type PlatformAccount } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";
import type { StellarPaymentConfig, StellarWalletList } from "@/lib/stellar";

export const metadata: Metadata = { title: "Stellar Claimable Balance", description: "Create a wallet-signed Stellar testnet claimable balance." };

export default async function ClaimableBalancePage() {
  const session = await requireCustomerSession();
  const [account, wallets, config] = await Promise.all([
    platformRequest<PlatformAccount>(session, "/v1/account"),
    platformRequest<StellarWalletList>(session, "/v1/stellar-wallets"),
    platformRequest<StellarPaymentConfig>(session, "/v1/stellar-payments/config"),
  ]);
  return <AppShell active="/claimable" member={{ name: account.name, level: account.verificationLevel }}><StellarClaimableBalanceFlow wallets={wallets.wallets.filter((wallet) => wallet.network === "testnet")} config={config} allowed={["verified", "enhanced", "business"].includes(account.verificationLevel)} /></AppShell>;
}
