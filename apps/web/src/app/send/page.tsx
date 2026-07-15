import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SendFlow } from "@/components/send-flow";
import { can } from "@/lib/capabilities";
import { platformRequest, type PlatformAccount } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";

export default async function SendPage(){const session=await requireCustomerSession();const account=await platformRequest<PlatformAccount>(session,"/v1/account");return <AppShell active="/send" member={{name:account.name,level:account.verificationLevel}}><main className="flow-page"><header><Link href="/"><ArrowLeft size={15}/>OVERVIEW</Link><p>TRANSFER / NEW</p><h1>Send with every number visible.</h1></header><SendFlow allowed={can(account.verificationLevel,"transfer.send")}/></main></AppShell>}
