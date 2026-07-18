"use client";

import Link from "next/link";
import {
  Activity,
  Banknote,
  BookOpen,
  CircleDollarSign,
  Gift,
  HeartHandshake,
  Home,
  FileText,
  LifeBuoy,
  Menu,
  RadioTower,
  Send,
  ShieldCheck,
  Settings,
  Users,
  UserRound,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { CustomerSignOut } from "@/components/customer-sign-out";

type NavigationItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  external?: boolean;
};

const primaryNavigation: NavigationItem[] = [
  { href: "/", label: "Overview", shortLabel: "Home", icon: Home },
  { href: "/send", label: "Send money", shortLabel: "Send", icon: Send },
  { href: "/payments", label: "Recipients", icon: Users },
  { href: "/activity", label: "Activity", icon: Activity },
];

const moneyNavigation: NavigationItem[] = [
  { href: "/family", label: "Family distribution", icon: HeartHandshake },
  { href: "/claimable", label: "Claimable balance", icon: Gift },
  { href: "/fund", label: "Fund account", icon: CircleDollarSign },
];

const accessNavigation: NavigationItem[] = [
  { href: "/wallet", label: "Stellar wallet", icon: WalletCards },
  { href: "/testnet", label: "Testnet transfer", icon: RadioTower },
  { href: "/ramps/moneygram", label: "MoneyGram ramp", icon: Banknote },
  { href: "/verification", label: "Verification", icon: ShieldCheck },
];

const accountNavigation: NavigationItem[] = [
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help center", icon: LifeBuoy },
  { href: "/terms", label: "Terms of Use", icon: FileText },
];

function NavigationLink({ item, active, onNavigate }: { item: NavigationItem; active: string; onNavigate?: () => void }) {
  const Icon = item.icon;
  const current = !item.external && active === item.href;
  const content = (
    <>
      <span className="nav-icon"><Icon size={18} aria-hidden="true" /></span>
      <span>{item.label}</span>
    </>
  );

  if (item.external) {
    return <a href={item.href} onClick={onNavigate}>{content}</a>;
  }
  return (
    <Link href={item.href} onClick={onNavigate} aria-current={current ? "page" : undefined}>
      {content}
    </Link>
  );
}

function NavigationGroup({ label, items, active }: { label: string; items: NavigationItem[]; active: string }) {
  return (
    <section className="app-nav-group" aria-labelledby={`desktop-nav-${label.toLowerCase().replaceAll(" ", "-")}`}>
      <p id={`desktop-nav-${label.toLowerCase().replaceAll(" ", "-")}`}>{label}</p>
      {items.map((item) => <NavigationLink active={active} item={item} key={item.href} />)}
    </section>
  );
}

export function DesktopNavigation({ active, marketingUrl }: { active: string; marketingUrl: string }) {
  const helpNavigation: NavigationItem[] = [
    { href: `${marketingUrl}/docs`, label: "Documentation", icon: BookOpen, external: true },
  ];

  return (
    <>
      <nav className="app-sidebar-nav" aria-label="Application navigation">
        <NavigationGroup label="Everyday" items={primaryNavigation} active={active} />
        <NavigationGroup label="Move money" items={moneyNavigation} active={active} />
        <NavigationGroup label="Wallet & access" items={accessNavigation} active={active} />
        <NavigationGroup label="Account" items={accountNavigation} active={active} />
        <NavigationGroup label="Help" items={helpNavigation} active={active} />
      </nav>
      <CustomerSignOut />
    </>
  );
}

export function MobileNavigation({
  active,
  marketingUrl,
  member,
}: {
  active: string;
  marketingUrl: string;
  member: { name: string; level: string };
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const secondaryActive = [...moneyNavigation, ...accessNavigation, ...accountNavigation].some((item) => item.href === active);
  const helpNavigation: NavigationItem[] = [
    { href: `${marketingUrl}/docs`, label: "Documentation", icon: BookOpen, external: true },
  ];

  function openMenu() {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    setMenuOpen(true);
  }

  function closeMenu() {
    dialogRef.current?.close();
  }

  return (
    <>
      <nav className="mobile-app-nav" aria-label="Mobile application navigation">
        {primaryNavigation.map((item) => {
          const Icon = item.icon;
          const current = active === item.href;
          return (
            <Link href={item.href} key={item.href} aria-current={current ? "page" : undefined}>
              <span className="nav-icon"><Icon size={20} aria-hidden="true" /></span>
              <span>{item.shortLabel ?? item.label}</span>
            </Link>
          );
        })}
        <button
          ref={moreButtonRef}
          type="button"
          onClick={openMenu}
          className={secondaryActive ? "active" : ""}
          aria-haspopup="dialog"
          aria-controls="mobile-more-sheet"
          aria-expanded={menuOpen}
        >
          <span className="nav-icon"><Menu size={20} aria-hidden="true" /></span>
          <span>More</span>
        </button>
      </nav>

      <dialog
        ref={dialogRef}
        id="mobile-more-sheet"
        className="mobile-more-sheet"
        aria-labelledby="mobile-more-title"
        onClose={() => {
          setMenuOpen(false);
          moreButtonRef.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeMenu();
        }}
      >
        <header>
          <div>
            <span className="mobile-member-mark" aria-hidden="true">{member.name.trim().charAt(0).toUpperCase()}</span>
            <span><strong>{member.name}</strong><small>{member.level} account</small></span>
          </div>
          <button type="button" onClick={closeMenu} aria-label="Close more menu" title="Close menu"><X size={20} aria-hidden="true" /></button>
        </header>
        <div className="mobile-sheet-scroll">
          <section aria-labelledby="mobile-money-title">
            <p id="mobile-money-title">Move money</p>
            {moneyNavigation.map((item) => <NavigationLink active={active} item={item} key={item.href} onNavigate={closeMenu} />)}
          </section>
          <section aria-labelledby="mobile-access-title">
            <p id="mobile-access-title">Wallet & access</p>
            {accessNavigation.map((item) => <NavigationLink active={active} item={item} key={item.href} onNavigate={closeMenu} />)}
          </section>
          <section aria-labelledby="mobile-help-title">
            <p id="mobile-help-title">Profile & support</p>
            {accountNavigation.map((item) => <NavigationLink active={active} item={item} key={item.href} onNavigate={closeMenu} />)}
            {helpNavigation.map((item) => <NavigationLink active={active} item={item} key={item.href} onNavigate={closeMenu} />)}
          </section>
        </div>
        <CustomerSignOut />
      </dialog>
    </>
  );
}
