import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleHelp, FileText, KeyRound, LifeBuoy, Send, Settings, ShieldCheck, UserRound, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { platformRequest, type PlatformAccount } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";
import styles from "../profile/account.module.css";

export const metadata: Metadata = { title: "Help" };

const topics = [
  { icon: ShieldCheck, title: "Verify your identity", text: "Complete document and selfie checks, then monitor reviewer requests.", href: "/verification", action: "Open verification" },
  { icon: WalletCards, title: "Connect a Stellar wallet", text: "Prove wallet ownership with SEP-10. Padalix never requests your secret key.", href: "/wallet", action: "Manage wallets" },
  { icon: Send, title: "Send and track funds", text: "Review the quote, recipient, fee, and settlement evidence before relying on a receipt.", href: "/activity", action: "Review activity" },
  { icon: KeyRound, title: "Secure account access", text: "Use a strong password and enroll a passkey from an installed Padalix PWA.", href: "/settings", action: "Open settings" },
];

export default async function HelpPage() {
  const session = await requireCustomerSession({ requireTerms: false });
  const account = await platformRequest<PlatformAccount>(session, "/v1/account");
  const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL ?? "http://localhost:3000";

  return (
    <AppShell active="/help" member={{ name: account.name, level: account.verificationLevel }}>
      <main className={styles.accountPage}>
        <header className={styles.pageHeader}>
          <div><p>PADALIX / HELP</p><h1>Resolve the next step</h1><span>Find account, verification, wallet, and transfer guidance or contact the support desk.</span></div>
          <nav aria-label="Account sections"><Link href="/profile"><UserRound size={16} />Profile</Link><Link href="/settings"><Settings size={16} />Settings</Link><Link aria-current="page" href="/help"><CircleHelp size={16} />Help</Link></nav>
        </header>
        <section className={styles.helpTopics} aria-label="Help topics">
          {topics.map((topic) => { const Icon = topic.icon; return <article key={topic.title}><Icon size={22} /><div><h2>{topic.title}</h2><p>{topic.text}</p></div><Link href={topic.href}>{topic.action}<ArrowRight size={15} /></Link></article>; })}
        </section>
        <section className={styles.supportBand}>
          <div><LifeBuoy size={25} /><span><strong>Still need help?</strong><small>Open a support request with the relevant Padalix reference. Do not include passwords, passkeys, wallet secret keys, or identity documents.</small></span></div>
          <a href={`${marketingUrl}/help#support-ticket`}>Contact support <ArrowRight size={15} /></a>
        </section>
        <footer className={styles.legalLinks}><a href={`${marketingUrl}/docs`}>Documentation</a><Link href="/terms"><FileText size={14} />Terms of Use</Link><a href="mailto:security@padalix.com">Report a security concern</a></footer>
      </main>
    </AppShell>
  );
}
