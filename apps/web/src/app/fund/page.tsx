import { AppShell } from "@/components/app-shell";
import { FundingCheckout } from "./funding-checkout";
import { platformRequest, type PlatformAccount } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";
import styles from "./fund.module.css";

export default async function FundPage() {
  const session = await requireCustomerSession();
  const account = await platformRequest<PlatformAccount>(session, "/v1/account");
  return <AppShell active="/fund" member={{ name: account.name, level: account.verificationLevel }}><main className={`flow-page workspace-flow-page ${styles.page}`}><header><p>FUNDING / PILOT</p><h1>Add PHP through Ganap.</h1><span>Ganap checkout confirms funding collection only. It does not prove Stellar settlement or recipient payout.</span></header><FundingCheckout /></main></AppShell>;
}
