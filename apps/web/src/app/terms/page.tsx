import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FileCheck2 } from "lucide-react";
import { getCustomerSession } from "@/lib/session";
import { CURRENT_TERMS_EFFECTIVE_DATE, CURRENT_TERMS_VERSION, termsSections } from "@/lib/legal";
import styles from "./terms.module.css";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Published Padalix Terms of Use.",
  robots: { index: true, follow: true },
};

export default async function TermsPage() {
  const session = await getCustomerSession();
  return (
    <main className={styles.termsPage}>
      <header className={styles.publicHeader}>
        <Link href={session ? "/profile" : "/login"}><i aria-hidden="true"><b /><b /><b /></i><strong>PADALIX</strong></Link>
        <span>LEGAL / PUBLISHED</span>
        <Link href={session ? "/terms/accept" : "/login"}>{session ? "Review acceptance" : "Sign in"}<ArrowRight size={15} /></Link>
      </header>
      <section className={styles.termsHero}>
        <div><p>TERMS OF USE / {CURRENT_TERMS_VERSION}</p><h1>Clear terms for using Padalix.</h1><span>Effective {CURRENT_TERMS_EFFECTIVE_DATE}. These terms distinguish working payment services from sandbox, testnet, and preview capabilities.</span></div>
        <aside><FileCheck2 size={24} /><span><strong>PUBLISHED VERSION</strong><small>{CURRENT_TERMS_VERSION}</small></span></aside>
      </section>
      <article className={styles.termsDocument}>
        <nav aria-label="Document information"><span>DOCUMENT</span><strong>Padalix Terms of Use</strong><span>CONTACT</span><a href="mailto:legal@padalix.com">legal@padalix.com</a></nav>
        <div>
          <p className={styles.introduction}>By creating or using a Padalix account, you agree to these Terms. Read them before accepting. References to Padalix, we, or us mean the Padalix service operator identified in applicable product or provider disclosures.</p>
          {termsSections.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}
        </div>
      </article>
      <footer className={styles.termsFooter}><Link href={session ? "/profile" : "/login"}><ArrowLeft size={14} />Back to {session ? "account" : "sign in"}</Link><span>PADALIX / TERMS / {CURRENT_TERMS_VERSION}</span></footer>
    </main>
  );
}
