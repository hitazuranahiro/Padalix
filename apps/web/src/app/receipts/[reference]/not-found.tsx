import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";
import styles from "./receipt.module.css";

export default function ReceiptNotFound() {
  return (
    <main className={styles.statePage}>
      <section className={styles.statePanel}>
        <FileQuestion size={28} />
        <p>TRANSFER RECEIPT / NOT FOUND</p>
        <h1>Receipt unavailable.</h1>
        <span>The reference does not exist or is not associated with your Padalix account.</span>
        <Link href="/activity"><ArrowLeft size={15} /> Return to activity</Link>
      </section>
    </main>
  );
}
