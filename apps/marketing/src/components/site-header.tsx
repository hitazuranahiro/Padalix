"use client";

import { ArrowUpRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { siteContent } from "@padalix/content";
import { Brand } from "@/components/brand";

type SiteHeaderProps = {
  appUrl: string;
};

export function SiteHeader({ appUrl }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const resolveHref = (href: string) => pathname === "/" || !href.startsWith("#") ? href : `/${href}`;

  useEffect(() => {
    document.body.classList.toggle("menu-open", open);

    return () => document.body.classList.remove("menu-open");
  }, [open]);

  return (
    <>
      <header className="site-header">
        <Link href="#top" aria-label="Padalix home">
          <Brand />
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {siteContent.navigation.links.map((link) => (
            <Link key={link.href} href={resolveHref(link.href)}>
              {link.label}
            </Link>
          ))}
        </nav>
        <a className="cut-button cut-button-light header-action" href={appUrl}>
          <span>{siteContent.navigation.action}</span>
          <ArrowUpRight aria-hidden="true" size={16} />
        </a>
        <button
          className="menu-button"
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </header>
      <nav className={`mobile-nav${open ? " open" : ""}`} aria-label="Mobile navigation">
        {siteContent.navigation.links.map((link) => (
          <Link key={link.href} href={resolveHref(link.href)} onClick={() => setOpen(false)}>
            {link.label}
          </Link>
        ))}
        <a href={appUrl} onClick={() => setOpen(false)}>
          {siteContent.navigation.action}
        </a>
      </nav>
    </>
  );
}
