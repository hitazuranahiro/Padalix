import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Clock3,
  Eye,
  LockKeyhole,
  RadioTower,
  Send,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { can } from "@/lib/capabilities";
import { platformRequest, type PlatformAccount } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";

type DashboardResponse = {
  account: PlatformAccount;
  activity: Array<{
    eventType: string;
    summary: string;
    createdAt: string;
    metadata: Record<string, string>;
  }>;
};

export default async function Dashboard() {
  const session = await requireCustomerSession();
  const { account, activity } = await platformRequest<DashboardResponse>(session, "/v1/dashboard");
  const sendAllowed = can(account.verificationLevel, "transfer.send");
  const firstName = account.name.split(" ")[0];

  return (
    <AppShell active="/" member={{ name: account.name, level: account.verificationLevel }}>
      <main className="dashboard dashboard-workspace">
        <section className="dashboard-head">
          <div>
            <p>ACCOUNT OVERVIEW</p>
            <h1>Good morning, {firstName}.</h1>
            <span>Your balance, recent transfers, and account access in one place.</span>
          </div>
          {sendAllowed ? (
            <Link href="/send">
              <Send size={18} aria-hidden="true" />
              <span><b>Send money</b><small>VERIFIED ACCESS</small></span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          ) : (
            <Link href="/verification">
              <ShieldCheck size={18} aria-hidden="true" />
              <span>
                <b>Unlock transfers</b>
                <small>{account.kycStatus ? `KYC ${account.kycStatus.toUpperCase()}` : "IDENTITY CHECK REQUIRED"}</small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          )}
        </section>

        <section className="balance-band" aria-label="Account balance">
          <div className="balance-main">
            <header>
              <span>AVAILABLE SANDBOX BALANCE</span>
              <button aria-label="Balance visible" title="Sandbox balance"><Eye size={16} aria-hidden="true" /></button>
            </header>
            <strong>${Number(account.balance).toFixed(2)}</strong>
            <p>{account.asset} ON {account.network.toUpperCase()}</p>
            <div>
              <Link className={sendAllowed ? "" : "locked"} href={sendAllowed ? "/send" : "/verification"}>
                {sendAllowed ? <Send size={17} aria-hidden="true" /> : <LockKeyhole size={17} aria-hidden="true" />}
                Send
              </Link>
              <Link href="/wallet"><WalletCards size={17} aria-hidden="true" />Wallet</Link>
              <Link href="/testnet"><RadioTower size={17} aria-hidden="true" />Testnet</Link>
            </div>
          </div>
          <div className="balance-side">
            <span>ACCOUNT LEVEL</span>
            <strong>{account.verificationLevel.toUpperCase()}</strong>
            <p>{sendAllowed ? "Identity approved. Verified transfer controls are active." : "Verify your identity to send money and use payout methods."}</p>
            <Link href="/verification">{account.kycReference ?? "View account limits"}<ArrowUpRight size={14} aria-hidden="true" /></Link>
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="activity-panel">
            <header>
              <div><p>RECENT ACTIVITY</p><h2>Money movement</h2></div>
              <Link href="/activity">View all <ArrowUpRight size={14} aria-hidden="true" /></Link>
            </header>
            {activity.length ? (
              <div className="recent-activity">
                {activity.map((item, index) => (
                  <article key={`${item.createdAt}-${index}`}>
                    <i aria-hidden="true" />
                    <span><strong>{item.summary}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></span>
                    <b>{item.eventType.replaceAll(".", " ").toUpperCase()}</b>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-activity">
                <Clock3 size={25} aria-hidden="true" />
                <strong>No transfers yet</strong>
                <p>Your completed and pending transfers will appear here.</p>
                <Link href="/send?mode=quote">Preview your first quote <ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
            )}
          </div>
          <aside className="capability-panel">
            <header><p>ACCOUNT ACCESS</p><h2>Capabilities</h2></header>
            {[
              { icon: WalletCards, label: "Wallet visibility", open: true },
              { icon: BadgeCheck, label: "Quote preview", open: true },
              { icon: Send, label: "Single transfer", open: sendAllowed },
              { icon: Users, label: "Mass payments", open: can(account.verificationLevel, "mass_payment.send") },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label}>
                  <Icon size={18} aria-hidden="true" />
                  <span><strong>{item.label}</strong><small>{item.open ? "AVAILABLE" : "VERIFICATION REQUIRED"}</small></span>
                  {item.open ? <i aria-hidden="true" /> : <LockKeyhole size={14} aria-hidden="true" />}
                </div>
              );
            })}
            <Link href="/verification">Review verification <ArrowRight size={15} aria-hidden="true" /></Link>
          </aside>
        </section>
      </main>
    </AppShell>
  );
}
