import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, FileCheck2, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TermsAcceptance } from "@/components/terms-acceptance";
import { CURRENT_TERMS_EFFECTIVE_DATE } from "@/lib/legal";
import { platformRequest, type PlatformAccount } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";
import styles from "../terms.module.css";

export const metadata: Metadata = { title: "Accept Terms" };

type TermsStatus = { version: string; title: string; contentSha256: string; effectiveAt: string; accepted: boolean; acceptedAt?: string };

export default async function AcceptTermsPage() {
  const session = await requireCustomerSession({ requireTerms: false });
  const [account, terms] = await Promise.all([
    platformRequest<PlatformAccount>(session, "/v1/account"),
    platformRequest<TermsStatus>(session, "/v1/legal/terms/current"),
  ]);

  return (
    <AppShell active="/terms" member={{ name: account.name, level: account.verificationLevel }}>
      <main className={styles.acceptPage}>
        <section className={styles.acceptPanel}>
          <div className={styles.acceptIcon}><FileCheck2 size={30} /></div>
          <p>ACCOUNT REQUIREMENT / LEGAL</p>
          <h1>{terms.accepted ? "Terms accepted." : "Review the current Terms."}</h1>
          <span>{terms.accepted ? `Recorded ${new Date(terms.acceptedAt!).toLocaleString("en-PH")}.` : `Version ${terms.version}, effective ${CURRENT_TERMS_EFFECTIVE_DATE}. Acceptance is required before payment and verification features are available.`}</span>
          <dl><div><dt>Document</dt><dd>{terms.title}</dd></div><div><dt>Version</dt><dd>{terms.version}</dd></div><div><dt>Content record</dt><dd>{terms.contentSha256.slice(0, 12)}...</dd></div></dl>
          <Link className={styles.readTerms} href="/terms" target="_blank">Read the complete Terms <ArrowUpRight size={15} /></Link>
          {terms.accepted ? <Link className={styles.continueLink} href="/"><ShieldCheck size={16} />Continue to Padalix</Link> : <TermsAcceptance className={styles.acceptForm} version={terms.version} />}
        </section>
      </main>
    </AppShell>
  );
}
