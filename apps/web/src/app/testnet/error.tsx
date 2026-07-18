"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import styles from "./loading.module.css";

export default function StellarTestnetError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={`${styles.screen} ${styles.failure}`}>
      <header className={styles.header}>
        <div className={styles.brand} aria-label="Padalix">
          <i aria-hidden="true"><b /><b /><b /></i>
          <strong>PADALIX</strong>
        </div>
        <span>STELLAR TESTNET</span>
      </header>
      <section className={styles.content}>
        <div className={styles.warning}><TriangleAlert size={25} aria-hidden="true" /></div>
        <p>NETWORK WORKSPACE UNAVAILABLE</p>
        <h1>Testnet could not load.</h1>
        <span>The account or Stellar platform service did not respond. No transaction was prepared or submitted.</span>
        <div className={styles.actions}>
          <button type="button" onClick={reset}><RotateCcw size={16} />Try again</button>
          <Link href="/">Return to overview</Link>
        </div>
      </section>
    </main>
  );
}
