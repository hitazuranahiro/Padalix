"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import styles from "./receipt.module.css";

export default function ReceiptError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Receipt page failed", error);
  }, [error]);

  return (
    <main className={styles.statePage}>
      <section className={styles.statePanel}>
        <TriangleAlert size={28} />
        <p>TRANSFER RECEIPT / SERVICE ERROR</p>
        <h1>Receipt temporarily unavailable.</h1>
        <span>Padalix could not load this receipt. Your transfer data has not been changed.</span>
        <div className={styles.stateActions}>
          <button type="button" onClick={reset}><RefreshCw size={15} /> Try again</button>
          <Link href="/activity"><ArrowLeft size={15} /> Activity</Link>
        </div>
      </section>
    </main>
  );
}
