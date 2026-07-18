import Image from "next/image";
import { ArrowDown, ArrowUpRight, Download, FileText } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { InteriorFooter } from "@/components/interior-footer";
import { loadSiteContent } from "@/lib/site-content";
import { pageMetadata } from "@/lib/metadata";
import {
  mediaUrl,
  PADALIX_PITCH_DECK_COVER_URL,
  PADALIX_PITCH_DECK_LABEL,
  PADALIX_PITCH_DECK_URL,
} from "@/lib/media";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.padalix.com";

export const metadata = pageMetadata("Padalix Presentation", "Padalix product flow, features, market, and Stellar integration case.", "/presentation");

export default async function PresentationPage() {
  const content = await loadSiteContent();
  const presentation = content.presentation;
  const documentUrl = PADALIX_PITCH_DECK_URL;
  const documentLabel = PADALIX_PITCH_DECK_LABEL;
  return <><SiteHeader appUrl={appUrl} /><main className="interior-page presentation-page">
    <section className="interior-hero presentation-hero" aria-labelledby="presentation-title"><Image className="interior-hero-image" src={mediaUrl("images/padalix-airport-hero.png")} alt="Padalix payment user traveling internationally" fill priority sizes="100vw" /><div className="interior-hero-shade" /><div className="interior-meta mono"><span>PRESENTATION / 2026</span><span>STELLAR TESTNET</span><span>01 / CASE</span></div><div className="interior-hero-copy"><p className="eyebrow mono">{presentation.eyebrow}</p><h1 id="presentation-title">{presentation.title}</h1><p>{presentation.introduction}</p><a className="cut-button cut-button-light" href="#features">Review the system <ArrowDown size={16} /></a></div></section>
    <section className="presentation-tracks" aria-label="Hackathon tracks"><span>PAYMENTS &amp; REMITTANCES</span><span>FINANCIAL INCLUSION</span><span>STABLECOINS &amp; PAYFI</span></section>
    <section className="presentation-flow"><header><p className="section-number mono">02 / CORE USER FLOW</p><h2>From stablecoin to real-world payout.</h2></header><div>{presentation.flow.map((step) => <article key={step.index}><span className="mono">{step.index}</span><h3>{step.title}</h3><p>{step.body}</p></article>)}</div></section>
    <section className="presentation-features" id="features"><header><p className="section-number mono">03 / MVP CAPABILITIES</p><h2>One payment system. Multiple ways to arrive.</h2></header><div>{presentation.features.map((feature, index) => <article key={feature.title}><span className="mono">{String(index + 1).padStart(2, "0")}</span><h3>{feature.title}</h3><p>{feature.body}</p></article>)}</div></section>
    <section className="market-section"><div><p className="section-number mono">04 / TARGET MARKET</p><h2>Built first for the people moving value into the Philippines.</h2></div><ol>{presentation.markets.map((market, index) => <li key={market}><span className="mono">0{index + 1}</span>{market}</li>)}</ol></section>
    <section className="presentation-vision"><p className="section-number mono">05 / LONG-TERM VISION</p><h2>{presentation.visionTitle}</h2><p>{presentation.visionBody}</p></section>
    <section className="document-section" id="pitch-deck"><header><div><p className="section-number mono">06 / PITCH DECK</p><h2>{documentLabel}</h2></div><div className="document-actions"><a className="document-link" href={documentUrl} target="_blank" rel="noreferrer"><FileText size={18} /><span>Open pitch deck</span><ArrowUpRight size={16} /></a><a className="document-link document-download" href={documentUrl} download><Download size={18} /><span>Download PDF</span><ArrowDown size={16} /></a></div></header><div className="document-viewer"><iframe src={`${documentUrl}#view=FitH&toolbar=1&navpanes=0`} title={documentLabel} loading="lazy" /><a className="document-poster" href={documentUrl} target="_blank" rel="noreferrer" aria-label="Open the Padalix pitch deck PDF"><span className="document-poster-visual"><Image src={PADALIX_PITCH_DECK_COVER_URL} alt="Padalix pitch deck cover: One gateway for crypto and cash" fill sizes="(max-width: 700px) calc(100vw - 36px), 900px" /></span><span className="document-poster-copy"><strong>10-page hackathon pitch deck</strong><span className="mono">OPEN PDF <ArrowUpRight size={14} /></span></span></a></div><p className="document-fallback mono">If the embedded viewer is unavailable, use Open pitch deck or Download PDF above.</p></section>
  </main><InteriorFooter appUrl={appUrl} /></>;
}
