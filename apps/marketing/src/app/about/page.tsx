import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { InteriorFooter } from "@/components/interior-footer";
import { loadSiteContent } from "@/lib/site-content";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.padalix.com";

export const metadata: Metadata = { title: "About Padalix", description: "The Filipino story and payment infrastructure behind Padalix." };

export default async function AboutPage() {
  const content = await loadSiteContent();
  const about = content.about;
  return <><SiteHeader appUrl={appUrl} /><main className="interior-page about-page">
    <section className="interior-hero" aria-labelledby="about-title"><Image className="interior-hero-image" src="/images/padalix-airport-hero.png" alt="Filipino traveler using a mobile payment service" fill priority sizes="100vw" /><div className="interior-hero-shade" /><div className="interior-meta mono"><span>ABOUT / PADALIX</span><span>PH → GLOBAL</span><span>01 / STORY</span></div><div className="interior-hero-copy"><p className="eyebrow mono">{about.eyebrow}</p><h1 id="about-title">{about.title}</h1><p>{about.introduction}</p><Link className="cut-button cut-button-light" href="#origin">Explore the origin <ArrowDown size={16} /></Link></div></section>
    <section className="origin-section" id="origin"><div className="origin-code mono"><span>PADALA</span><small>TO SEND / REMITTANCE</small><ArrowRight aria-hidden="true" /></div><div className="origin-code inverse mono"><span>IX</span><small>INFRASTRUCTURE EXCHANGE</small></div><div className="origin-copy"><p className="section-number mono">02 / THE NAME</p><h2>{about.nameTitle}</h2><p>{about.nameBody}</p></div></section>
    <section className="problem-section"><header><p className="section-number mono">03 / THE PROBLEM</p><h2>{about.problemTitle}</h2><p>{about.problemBody}</p></header><div className="problem-metrics">{about.principles.map((principle) => <article key={principle.label}><strong>{principle.value}</strong><span className="mono">{principle.label}</span></article>)}</div></section>
    <section className="about-vision"><p className="section-number mono">04 / THE DIRECTION</p><blockquote>{about.vision}</blockquote><div><span className="mono">STARTING CORRIDOR / PHILIPPINES</span><Link href="/presentation">View the product case <ArrowUpRight size={16} /></Link></div></section>
  </main><InteriorFooter appUrl={appUrl} /></>;
}
