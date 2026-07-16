import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Banknote,
  BookOpen,
  Home,
  LifeBuoy,
  RadioTower,
  Send,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { CustomerSignOut } from "@/components/customer-sign-out";
import { PwaPasskeyEnrollment } from "@/components/pwa-passkey-access";

const nav = [
  { href: "/", label: "Overview", icon: Home },
  { href: "/send", label: "Send", icon: Send },
  { href: "/payments", label: "Payments", icon: Users },
  { href: "/activity", label: "Activity", icon: Activity },
];

const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL ?? "http://localhost:3000";

export function AppShell({
  children,
  active,
  member,
}: {
  children: React.ReactNode;
  active: string;
  member: { name: string; level: string };
}) {
  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <Link className="app-brand" href="/" aria-label="Padalix overview">
          <i aria-hidden="true"><b /><b /><b /></i>
          <strong>PADALIX</strong>
          <span>APP</span>
        </Link>
        <nav aria-label="Application navigation">
          {nav.map((item) => {
            const Icon = item.icon;
            const current = active === item.href;
            return (
              <Link className={current ? "active" : ""} href={item.href} key={item.href} aria-current={current ? "page" : undefined}>
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-secondary">
          <Link href="/wallet"><WalletCards size={17} aria-hidden="true" />Stellar wallet</Link>
          <Link href="/testnet"><RadioTower size={17} aria-hidden="true" />Testnet transfer</Link>
          <Link href="/ramps/moneygram"><Banknote size={17} aria-hidden="true" />MoneyGram ramp</Link>
          <Link href="/verification"><ShieldCheck size={17} aria-hidden="true" />Verification</Link>
          <a href={`${marketingUrl}/docs`}><BookOpen size={17} aria-hidden="true" />Documentation</a>
          <a href={`${marketingUrl}/help`}><LifeBuoy size={17} aria-hidden="true" />Support</a>
        </div>
        <CustomerSignOut />
      </aside>
      <div className="app-stage">
        <header className="app-topbar">
          <div><i aria-hidden="true" />SANDBOX / PH CORRIDOR</div>
          <Link href="/verification" aria-label={`${member.name}, ${member.level} account`}>
            <span><b>{member.name}</b><small>{member.level.toUpperCase()} ACCOUNT</small></span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </header>
        {children}
      </div>
      <nav className="mobile-app-nav" aria-label="Mobile application navigation">
        {nav.map((item) => {
          const Icon = item.icon;
          const current = active === item.href;
          return (
            <Link className={current ? "active" : ""} href={item.href} key={item.href} aria-current={current ? "page" : undefined}>
              <Icon size={19} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <PwaPasskeyEnrollment />
    </div>
  );
}
