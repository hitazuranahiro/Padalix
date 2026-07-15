import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { InteriorFooter } from "@/components/interior-footer";
import { loadSiteContent } from "@/lib/site-content";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.padalix.com";

export const metadata: Metadata = { title: "Padalix Documentation", description: "How to set up, fund, send, distribute, receive, and track money with Padalix." };

export default async function DocsPage() {
  const content = await loadSiteContent();
  const docs = content.docs;
  return <><SiteHeader appUrl={appUrl} /><main className="docs-page">
    <section className="docs-hero" aria-labelledby="docs-title"><Image src="/images/padalix-social-logo.png" alt="" fill priority sizes="45vw" /><div><p className="eyebrow mono">{docs.eyebrow}</p><h1 id="docs-title">{docs.title}</h1><p>{docs.introduction}</p><Link href="#quickstart">Start with the quickstart <ArrowRight size={16} /></Link></div><span className="mono">DOCS / VERSION 0.1</span></section>
    <div className="docs-layout"><aside><p className="mono">ON THIS PAGE</p><nav>{docs.guides.map((guide, index) => <Link href={`#${guide.slug}`} key={guide.slug}><span className="mono">0{index + 1}</span>{guide.title}</Link>)}<Link href="#safety"><span className="mono">06</span>Safety</Link></nav><div><BookOpen size={18} /><span>PADALIX MVP<br />TESTNET GUIDE</span></div></aside><div className="docs-content">
      <section className="docs-quickstart" id="quickstart"><header><p className="section-number mono">01 / QUICKSTART</p><h2>From zero to a reviewed transfer.</h2></header><ol>{docs.quickstart.map((step) => <li key={step.index}><span className="mono">{step.index}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol></section>
      {docs.guides.map((guide, index) => <section className="docs-guide" id={guide.slug} key={guide.slug}><header><span className="mono">{String(index + 2).padStart(2, "0")} / GUIDE</span><h2>{guide.title}</h2><p>{guide.summary}</p></header><ul>{guide.points.map((point) => <li key={point}><Check size={15} /><span>{point}</span></li>)}</ul></section>)}
      <section className="docs-safety" id="safety"><ShieldCheck size={28} /><p className="mono">07 / SAFETY</p><h2>{docs.safetyTitle}</h2><p>{docs.safetyBody}</p></section>
    </div></div>
  </main><InteriorFooter appUrl={appUrl} /></>;
}
