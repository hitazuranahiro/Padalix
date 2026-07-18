import { AppShell } from "@/components/app-shell";
import { FamilyDistributionManager, type FamilyPlan, type FamilyRecipient } from "@/components/family-distribution-manager";
import { platformRequest, type PlatformAccount } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";

export default async function FamilyPage() {
  const session = await requireCustomerSession();
  const [account, recipientData, planData] = await Promise.all([
    platformRequest<PlatformAccount>(session, "/v1/account"),
    platformRequest<{ recipients: FamilyRecipient[] }>(session, "/v1/recipients"),
    platformRequest<{ familyDistributions: FamilyPlan[] }>(session, "/v1/family-distributions"),
  ]);
  return <AppShell active="/family" member={{ name: account.name, level: account.verificationLevel }}>
    <main className="flow-page workspace-flow-page">
      <header><p>FAMILY DISTRIBUTION</p><h1>One transfer. Clear shares.</h1><span>Create a reusable allocation across verified recipients. Saving a plan does not move funds.</span></header>
      <FamilyDistributionManager recipients={recipientData.recipients} initialPlans={planData.familyDistributions} allowed={["verified", "enhanced", "business"].includes(account.verificationLevel)} />
    </main>
  </AppShell>;
}
