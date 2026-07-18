import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  Plus,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { AnnouncementNotice } from "@/components/announcement-notice";
import { MarketingMotion } from "@/components/marketing-motion";
import { SiteHeader } from "@/components/site-header";
import { pageMetadata } from "@/lib/metadata";
import { loadSiteContent } from "@/lib/site-content";
import { mediaUrl } from "@/lib/media";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.padalix.com";

export const metadata = pageMetadata(
  "Padalix | Money Moves Forward",
  "Padalix connects modern payment infrastructure to clearer, faster cross-border remittances for families and businesses.",
  "/"
);

function RouteSymbol() {
  return (
    <span className="route-symbol" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export default async function MarketingPage() {
  const siteContent = await loadSiteContent();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader appUrl={appUrl} />

      <main id="main">
        <section className="hero" id="top" aria-labelledby="hero-title">
          <Image
            className="hero-image"
            src={mediaUrl("images/padalix-airport-hero.png")}
            alt="Filipino professional using Padalix while traveling internationally"
            fill
            priority
            sizes="100vw"
          />
          <div className="hero-shade" aria-hidden="true" />
          <div className="hero-topline mono">
            <span>{siteContent.hero.systemLabel}</span>
            <span>{siteContent.hero.locationLabel}</span>
            <span>{siteContent.hero.releaseLabel}</span>
          </div>
          <div className="hero-content">
            <p className="eyebrow mono">{siteContent.hero.eyebrow}</p>
            <h1 id="hero-title">
              <span>{siteContent.hero.title[0]}</span>
              <span className="outline">{siteContent.hero.title[1]}</span>
              <span>{siteContent.hero.title[2]}</span>
            </h1>
            <div className="hero-summary">
              <p>{siteContent.hero.body}</p>
              <div className="hero-actions">
                <Link className="cut-button cut-button-light" href="#system">
                  <span>{siteContent.hero.primaryAction}</span>
                  <ArrowDown aria-hidden="true" size={16} />
                </Link>
                <a className="text-action" href={appUrl}>
                  <span>{siteContent.hero.secondaryAction}</span>
                  <ArrowUpRight aria-hidden="true" size={16} />
                </a>
              </div>
            </div>
          </div>
          <div className="hero-index mono" aria-hidden="true">
            <span>01</span>
            <span>PADALIX / PAYMENT INFRASTRUCTURE</span>
          </div>
        </section>

        <section className="signal-bar" aria-label="Padalix platform facts">
          {siteContent.signals.map((signal) => (
            <div className="signal" key={signal.label}>
              <strong>{signal.value}</strong>
              <span>{signal.label}</span>
            </div>
          ))}
        </section>

        {siteContent.announcement.enabled === "true" && (
          <section className="announcement-spotlight" aria-labelledby="announcement-title">
            <div className="announcement-spotlight-image" data-reveal>
              <Image
                src={mediaUrl(siteContent.announcement.imageUrl)}
                alt="APAC Stellar Demo Day Philippines event poster"
                fill
                sizes="(max-width: 900px) 100vw, 52vw"
              />
            </div>
            <div className="announcement-spotlight-copy" data-reveal style={{ "--reveal-delay": "90ms" } as CSSProperties}>
              <div className="section-number mono">00 / ANNOUNCEMENT</div>
              <p className="eyebrow mono">{siteContent.announcement.eyebrow}</p>
              <h2 id="announcement-title">{siteContent.announcement.title}</h2>
              <p>{siteContent.announcement.summary}</p>
              <div className="announcement-spotlight-meta mono">
                <span>{siteContent.announcement.dateLabel}</span>
                <span>{siteContent.announcement.locationLabel}</span>
              </div>
              <Link className="text-action" href={siteContent.announcement.actionHref}>
                <span>{siteContent.announcement.actionLabel}</span>
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </div>
          </section>
        )}

        <section className="system-section" id="system" aria-labelledby="system-title">
          <div className="section-rail mono"><span>02</span><span>THE SYSTEM</span></div>
          <div className="section-main">
            <header className="section-header">
              <p className="eyebrow mono">{siteContent.system.eyebrow}</p>
              <h2 id="system-title">{siteContent.system.title}</h2>
              <p>{siteContent.system.body}</p>
            </header>
            <div className="system-steps">
              {siteContent.system.steps.map((step, index) => (
                <article className={`step${index === 1 ? " inverse" : ""}`} key={step.index}>
                  <div className="step-index mono">{step.index}</div>
                  <div className="step-symbol" aria-hidden="true">
                    {step.symbol === "+" && <Plus />}
                    {step.symbol === "route" && <RouteSymbol />}
                    {step.symbol === "check" && <Check />}
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <span className="step-state mono">{step.state}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="product-section" id="product" aria-labelledby="product-title">
          <div className="product-copy">
            <div className="section-number mono">03 / CONTROL SURFACE</div>
            <p className="eyebrow mono">{siteContent.product.eyebrow}</p>
            <h2 id="product-title">{siteContent.product.title}</h2>
            <p>{siteContent.product.body}</p>
            <ul className="feature-list">
              {siteContent.product.features.map((feature, index) => (
                <li key={feature}><span>{String(index + 1).padStart(2, "0")}</span><strong>{feature}</strong></li>
              ))}
            </ul>
          </div>
          <figure className="product-visual">
            <div className="visual-label mono">
              <span>PADALIX UI / TRANSFER 01</span>
              <span>LIVE QUOTE / TESTNET</span>
            </div>

            <div className="transfer-console" aria-label="Padalix transfer interface concept">
              <header className="console-header">
                <Brand />
                <div className="console-status mono">
                  <span className="status-pulse" aria-hidden="true" />
                  NETWORK ONLINE
                </div>
                <div className="console-profile mono">HJ / 01</div>
              </header>

              <div className="console-layout">
                <aside className="console-rail" aria-label="Transfer workflow">
                  <div className="rail-marker active"><WalletCards aria-hidden="true" size={18} /><span>TRANSFER</span></div>
                  <div className="rail-marker"><Clock3 aria-hidden="true" size={18} /><span>ACTIVITY</span></div>
                  <div className="rail-code mono">PDX<br />01</div>
                </aside>

                <div className="transfer-form">
                  <div className="console-kicker mono"><span>NEW TRANSFER</span><span>STEP 01 / 03</span></div>
                  <h3>Move money home.</h3>

                  <div className="amount-block">
                    <div className="field-label mono"><span>YOU SEND</span><span>AVAILABLE / 2,840.00 USDC</span></div>
                    <div className="amount-value"><span>500.00</span><strong>USDC</strong></div>
                    <div className="amount-rule"><span /><i /></div>
                    <div className="amount-conversion mono">≈ PHP 28,725.00</div>
                  </div>

                  <div className="distribution-head">
                    <div><span className="mono">DISTRIBUTION</span><strong>2 RECIPIENTS</strong></div>
                    <button type="button" aria-label="Add recipient"><Plus aria-hidden="true" size={18} /></button>
                  </div>
                  <div className="recipient-row">
                    <span className="recipient-index mono">01</span>
                    <div><strong>Maria Santos</strong><small>GCASH / • 4821</small></div>
                    <span className="recipient-share">60%</span>
                    <span className="recipient-total">₱17,235.00</span>
                  </div>
                  <div className="recipient-row">
                    <span className="recipient-index mono">02</span>
                    <div><strong>Paolo Santos</strong><small>BANK / • 0914</small></div>
                    <span className="recipient-share">40%</span>
                    <span className="recipient-total">₱11,490.00</span>
                  </div>
                </div>

                <aside className="quote-panel">
                  <div className="quote-title mono"><span>QUOTE / PDX-2607</span><span>00:58</span></div>
                  <div className="quote-total"><span>THEY RECEIVE</span><strong>₱28,725.00</strong><small>PHILIPPINE PESO</small></div>
                  <dl className="quote-details">
                    <div><dt>Rate</dt><dd>1 USDC = ₱57.45</dd></div>
                    <div><dt>Network fee</dt><dd>0.80 USDC</dd></div>
                    <div><dt>Padalix fee</dt><dd>2.50 USDC</dd></div>
                    <div><dt>Arrival</dt><dd>Within minutes</dd></div>
                  </dl>
                  <div className="quote-security"><ShieldCheck aria-hidden="true" size={18} /><span><strong>PROTECTED TRANSFER</strong><small>Quote locked until timer ends</small></span></div>
                  <button className="review-transfer" type="button"><span>REVIEW TRANSFER</span><ArrowRight aria-hidden="true" size={18} /></button>
                </aside>
              </div>
            </div>

            <figcaption>One decisive surface for quotes, recipient rules, fees, and settlement timing.</figcaption>
          </figure>
        </section>

        <section className="proof-section" aria-labelledby="proof-title">
          <header data-reveal>
            <div className="section-number mono">03B / PRODUCT REALITY</div>
            <div>
              <p className="eyebrow mono">{siteContent.proof.eyebrow}</p>
              <h2 id="proof-title">{siteContent.proof.title}</h2>
              <p>{siteContent.proof.body}</p>
            </div>
          </header>
          <div className="proof-grid">
            {siteContent.proof.items.map((item, index) => (
              <article key={item.index} data-reveal style={{ "--reveal-delay": `${index * 70}ms` } as CSSProperties}>
                <span className="mono">{item.index}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="infrastructure-section" id="infrastructure" aria-labelledby="infrastructure-title">
          <div className="infra-intro">
            <div className="section-number mono">04 / INFRASTRUCTURE</div>
            <h2 id="infrastructure-title">{siteContent.infrastructure.title}</h2>
            <p>{siteContent.infrastructure.body}</p>
          </div>
          <div className="infra-map" aria-label="Padalix infrastructure layers">
            {siteContent.infrastructure.layers.map((layer, index) => (
              <div className="infra-fragment" key={layer.label}>
                {index > 0 && <div className="infra-line" aria-hidden="true" />}
                <div className={`infra-node${index === 1 ? " node-platform" : ""}`}>
                  <span className="mono">{layer.label}</span><strong>{layer.title}</strong><small>{layer.body}</small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mission-section" id="mission" aria-labelledby="mission-title">
          <div className="mission-marker mono">05 / WHY PADALIX</div>
          <p className="mission-lead" id="mission-title">{siteContent.mission.statement}</p>
          <div className="mission-detail">
            <p>{siteContent.mission.body}</p>
            <div className="mission-data"><strong>{siteContent.mission.metric}</strong><span>{siteContent.mission.metricLabel}</span></div>
          </div>
        </section>

        <section className="access-section" id="access" aria-labelledby="access-title">
          <div className="access-copy">
            <p className="eyebrow mono">{siteContent.access.eyebrow}</p>
            <h2 id="access-title">{siteContent.access.title}</h2>
            <p>{siteContent.access.body}</p>
            <a className="cut-button cut-button-dark" href={appUrl}>
              <span>{siteContent.access.action}</span><ArrowUpRight aria-hidden="true" size={16} />
            </a>
          </div>
          <div className="access-code mono" aria-hidden="true">
            <span>PDX / 2026</span><span>STELLAR TESTNET</span><span>STATUS / IN DEVELOPMENT</span>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <Link href="#top" aria-label="Padalix home"><Brand /></Link>
        <p>{siteContent.footer.tagline}</p>
        <div className="footer-links">
          <Link href="#system">System</Link><Link href="#product">Product</Link><Link href="/about">About</Link><Link href="/presentation">Presentation</Link><Link href="/announcements">Announcements</Link><Link href="/docs">Docs</Link><Link href="/help">Help</Link><a href={appUrl}>Launch app</a>
        </div>
        <p className="mono">© 2026 PADALIX / ALL SYSTEMS IN DEVELOPMENT</p>
      </footer>
      {siteContent.announcement.enabled === "true" && (
        <AnnouncementNotice announcement={{ ...siteContent.announcement, imageUrl: mediaUrl(siteContent.announcement.imageUrl) }} />
      )}
      <MarketingMotion />
    </>
  );
}
