import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SendFlow } from "@/components/send-flow";
import { can } from "@/lib/capabilities";
import { platformRequest, type PlatformAccount } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";

export default async function SendPage() {
  const session = await requireCustomerSession();
  const account = await platformRequest<PlatformAccount>(session, "/v1/account");

  return (
    <AppShell
      active="/send"
      member={{ name: account.name, level: account.verificationLevel }}
    >
      <main className="flow-page send-page">
        <header className="send-page-header">
          <Link href="/">
            <ArrowLeft size={15} aria-hidden="true" />
            Overview
          </Link>
          <div className="send-page-heading">
            <div>
              <p>NEW TRANSFER</p>
              <h1>Send money</h1>
              <span>
                Create a live USDC to PHP quote, add the recipient, and review
                every cost before confirming.
              </span>
            </div>
            <aside>
              <ShieldCheck size={17} aria-hidden="true" />
              <span>
                <strong>Sandbox protected</strong>
                <small>No real funds will move</small>
              </span>
            </aside>
          </div>
        </header>
        <SendFlow allowed={can(account.verificationLevel, "transfer.send")} />
      </main>
    </AppShell>
  );
}
