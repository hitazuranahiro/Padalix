import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DesktopNavigation, MobileNavigation } from "@/components/app-shell-navigation";
import { PwaPasskeyEnrollment } from "@/components/pwa-passkey-access";

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
        <DesktopNavigation active={active} marketingUrl={marketingUrl} />
      </aside>
      <div className="app-stage">
        <header className="app-topbar">
          <div><i aria-hidden="true" />SANDBOX / PH CORRIDOR</div>
          <Link href="/profile" aria-label={`${member.name}, ${member.level} account profile`}>
            <span><b>{member.name}</b><small>{member.level.toUpperCase()} ACCOUNT</small></span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </header>
        {children}
      </div>
      <MobileNavigation active={active} marketingUrl={marketingUrl} member={member} />
      <PwaPasskeyEnrollment />
    </div>
  );
}
