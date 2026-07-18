import Image from "next/image";
import { ArrowDown, ArrowUpRight, FileText } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { InteriorFooter } from "@/components/interior-footer";
import { loadSiteContent } from "@/lib/site-content";
import { pageMetadata } from "@/lib/metadata";
import { mediaUrl, presentationDocumentUrl } from "@/lib/media";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.padalix.com";

export const metadata = pageMetadata("Padalix Presentation", "Padalix product flow, features, market, and Stellar integration case.", "/presentation");

export default async function PresentationPage() {
  const content = await loadSiteContent();
  const presentation = content.presentation;
  const documentUrl = presentationDocumentUrl(presentation.documentUrl);
  return <><SiteHeader appUrl={appUrl} /><main className="interior-page presentation-page">
    <section className="interior-hero presentation-hero" aria-labelledby="presentation-title"><Image className="interior-hero-image" src={mediaUrl("images/padalix-airport-hero.png")} alt="Padalix payment user traveling internationally" fill priority sizes="100vw" /><div className="interior-hero-shade" /><div className="interior-meta mono"><span>PRESENTATION / 2026</span><span>STELLAR TESTNET</span><span>01 / CASE</span></div><div className="interior-hero-copy"><p className="eyebrow mono">{presentation.eyebrow}</p><h1 id="presentation-title">{presentation.title}</h1><p>{presentation.introduction}</p><a className="cut-button cut-button-light" href="#features">Review the system <ArrowDown size={16} /></a></div></section>
    <section className="presentation-tracks" aria-label="Hackathon tracks"><span>PAYMENTS &amp; REMITTANCES</span><span>FINANCIAL INCLUSION</span><span>STABLECOINS &amp; PAYFI</span></section>
    <section className="presentation-flow"><header><p className="section-number mono">02 / CORE USER FLOW</p><h2>From stablecoin to real-world payout.</h2></header><div>{presentation.flow.map((step) => <article key={step.index}><span className="mono">{step.index}</span><h3>{step.title}</h3><p>{step.body}</p></article>)}</div></section>
    <section className="presentation-features" id="features"><header><p className="section-number mono">03 / MVP CAPABILITIES</p><h2>One payment system. Multiple ways to arrive.</h2></header><div>{presentation.features.map((feature, index) => <article key={feature.title}><span className="mono">{String(index + 1).padStart(2, "0")}</span><h3>{feature.title}</h3><p>{feature.body}</p></article>)}</div></section>
    <section className="market-section"><div><p className="section-number mono">04 / TARGET MARKET</p><h2>Built first for the people moving value into the Philippines.</h2></div><ol>{presentation.markets.map((market, index) => <li key={market}><span className="mono">0{index + 1}</span>{market}</li>)}</ol></section>
    <section className="presentation-vision"><p className="section-number mono">05 / LONG-TERM VISION</p><h2>{presentation.visionTitle}</h2><p>{presentation.visionBody}</p></section>
    <section className="document-section"><header><div><p className="section-number mono">06 / SOURCE DOCUMENT</p><h2>{presentation.documentLabel}</h2></div><a className="document-link" href={documentUrl} target="_blank" rel="noreferrer"><FileText size={18} /><span>Open submission PDF</span><ArrowUpRight size={16} /></a></header><iframe src={documentUrl} title={presentation.documentLabel} /></section>
  </main><InteriorFooter appUrl={appUrl} /></>;
}
