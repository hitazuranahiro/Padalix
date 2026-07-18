import type { Metadata } from "next";
import Link from "next/link";
import { ClaimRedemption } from "./redemption";
import styles from "./claim.module.css";

export const metadata: Metadata = { title: "Recipient Claim", description: "Confirm a Padalix recipient claim." };

export default function ClaimPage() {
  return <main className={styles.page}><header><Link href="/">PADALIX</Link><span>SECURE RECIPIENT CLAIM</span></header><ClaimRedemption /></main>;
}
