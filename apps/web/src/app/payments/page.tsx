import { AppShell } from "@/components/app-shell";
import { RecipientManager } from "@/components/recipient-manager";
import { platformRequest, type PlatformAccount } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";

type Recipient={id:string;name:string;countryCode:string;payoutMethod:string;payoutReferenceMasked:string};
export default async function Payments(){const session=await requireCustomerSession();const[account,data]=await Promise.all([platformRequest<PlatformAccount>(session,"/v1/account"),platformRequest<{recipients:Recipient[]}>(session,"/v1/recipients")]);return <AppShell active="/payments" member={{name:account.name,level:account.verificationLevel}}><main className="flow-page"><header><p>PAYMENTS / RECIPIENTS</p><h1>People you pay.</h1></header><RecipientManager initialRecipients={data.recipients}/></main></AppShell>}
