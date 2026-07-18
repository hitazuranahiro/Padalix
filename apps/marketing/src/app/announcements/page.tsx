import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowLeft, ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { Brand } from "@/components/brand";
import { MarketingMotion } from "@/components/marketing-motion";
import { SiteHeader } from "@/components/site-header";
import { mediaUrl } from "@/lib/media";
import { pageMetadata } from "@/lib/metadata";
import { loadSiteContent } from "@/lib/site-content";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.padalix.com";

export const metadata = pageMetadata(
  "Announcements",
  "Product updates, demonstrations, and public milestones from Padalix.",
  "/announcements"
);

export default async function AnnouncementsPage() {
  const { announcement } = await loadSiteContent();
  const featuredImage = mediaUrl(announcement.imageUrl);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader appUrl={appUrl} />
      <main id="main" className="announcements-page">
        <section className="announcement-hero" id="top">
          <div className="announcement-hero-copy" data-reveal>
            <Link className="announcement-back mono" href="/"><ArrowLeft size={15} /> PADALIX / HOME</Link>
            <p className="eyebrow mono">{announcement.eyebrow}</p>
            <h1>{announcement.title}</h1>
            <p>{announcement.summary}</p>
            <dl>
              <div><dt><CalendarDays size={17} />WHEN</dt><dd>{announcement.dateLabel}</dd></div>
              <div><dt><MapPin size={17} />WHERE</dt><dd>{announcement.locationLabel}</dd></div>
            </dl>
          </div>
          <figure className="announcement-poster" data-reveal style={{ "--reveal-delay": "100ms" } as CSSProperties}>
            <Image src={featuredImage} alt="APAC Stellar Demo Day Philippines event poster" fill priority sizes="(max-width: 900px) 100vw, 58vw" />
            <figcaption className="mono"><span>{announcement.statusLabel}</span><span>APAC / PHILIPPINES / 2026</span></figcaption>
          </figure>
        </section>

        <section className="announcement-story" aria-labelledby="event-update-title">
          <div className="section-number mono">01 / EVENT UPDATE</div>
          <div data-reveal>
            <p className="eyebrow mono">DEMO DAY / PADALIX MVP</p>
            <h2 id="event-update-title">A live demonstration of clearer cross-border money movement.</h2>
            <p>Padalix is showcasing wallet-signed Stellar testnet transfers, claimable receiving, reusable family distribution plans, and verifiable milestone escrow. The demonstration is scheduled for review by the event judging panel later today.</p>
            <p className="announcement-disclosure mono">EVENT PARTICIPATION IS CONFIRMED. RESULTS HAVE NOT BEEN ANNOUNCED.</p>
          </div>
        </section>

        <section className="announcement-gallery" aria-labelledby="judges-title">
          <header data-reveal>
            <p className="eyebrow mono">APAC STELLAR DEMO DAY / PHILIPPINES</p>
            <h2 id="judges-title">Meet the judging panel.</h2>
          </header>
          <div>
            {[announcement.galleryImageOne, announcement.galleryImageTwo].map((src, index) => (
              <figure key={src} data-reveal style={{ "--reveal-delay": `${index * 90}ms` } as CSSProperties}>
                <Image src={mediaUrl(src)} alt={`APAC Stellar Demo Day judging panel, group ${index + 1}`} fill sizes="(max-width: 800px) 100vw, 50vw" />
              </figure>
            ))}
          </div>
        </section>

        <section className="announcement-action" data-reveal>
          <div><p className="eyebrow mono">EXPLORE THE DEMO</p><h2>See what Padalix moves forward.</h2></div>
          <a className="cut-button cut-button-dark" href={appUrl}><span>Open the testnet app</span><ArrowUpRight size={16} /></a>
        </section>
      </main>
      <footer className="site-footer compact-footer">
        <Link href="/" aria-label="Padalix home"><Brand /></Link>
        <p>CRYPTO TO CASH, INSTANTLY CONNECTED.</p>
        <p className="mono">© 2026 PADALIX / ALL SYSTEMS IN DEVELOPMENT</p>
      </footer>
      <MarketingMotion />
    </>
  );
}
