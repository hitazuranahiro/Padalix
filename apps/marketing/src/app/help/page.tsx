import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CircleHelp, Mail, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { InteriorFooter } from "@/components/interior-footer";
import { SupportTicketForm } from "@/components/support-ticket-form";
import { loadSiteContent } from "@/lib/site-content";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.padalix.com";

export const metadata: Metadata = { title: "Padalix Help", description: "Guidance for Padalix accounts, transfers, receiving, security, and payment status." };

export default async function HelpPage() {
  const content = await loadSiteContent();
  const help = content.help;
  return <><SiteHeader appUrl={appUrl} /><main className="support-page">
    <section className="support-hero" aria-labelledby="help-title"><Image src="/images/padalix-social-logo.png" alt="" fill priority sizes="50vw" /><div className="support-hero-copy"><p className="eyebrow mono">{help.eyebrow}</p><h1 id="help-title">{help.title}</h1><p>{help.introduction}</p><Link className="cut-button cut-button-light" href="#help-topics">Browse help topics <ArrowRight size={16} /></Link></div><div className="support-hero-index mono">HELP / 01</div></section>
    <section className="help-paths" id="help-topics"><header><p className="section-number mono">02 / START HERE</p><h2>What do you need help with?</h2></header><div>{help.paths.map((path, index) => <article key={path.title}><span className="mono">{String(index + 1).padStart(2, "0")}</span><CircleHelp aria-hidden="true" size={24} /><h3>{path.title}</h3><p>{path.body}</p><Link href="/docs">Open documentation <ArrowUpRight size={14} /></Link></article>)}</div></section>
    <section className="faq-section"><header><p className="section-number mono">03 / COMMON QUESTIONS</p><h2>Answers before you move money.</h2></header><div>{help.faq.map((item, index) => <details key={item.question} open={index === 0}><summary><span className="mono">{String(index + 1).padStart(2, "0")}</span>{item.question}<i aria-hidden="true" /></summary><p>{item.answer}</p></details>)}</div></section>
    <section className="support-intake" id="support-ticket"><header><div><ShieldCheck aria-hidden="true" /><p className="section-number mono">04 / SUPPORT DESK</p><h2>Open a secure support case.</h2></div><p>Route an account, transaction, security, or technical issue to the Padalix operations desk. You will receive a private case link for status updates and replies.</p></header><SupportTicketForm /></section>
    <section className="support-contact"><div><Mail aria-hidden="true" /><p className="mono">05 / ALTERNATE CONTACT</p><h2>{help.supportTitle}</h2><p>{help.supportBody}</p></div><a href={`mailto:${help.supportEmail}`}><Mail size={18} /><span>{help.supportEmail}</span><ArrowUpRight size={18} /></a></section>
  </main><InteriorFooter appUrl={appUrl} /></>;
}
