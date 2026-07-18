import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Download, FileJson, Landmark, ReceiptText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ClaimLinkCreator } from "@/components/claim-link-creator";
import { PlatformError, platformRequest, type PlatformAccount, type TransferReceipt } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";
import styles from "./receipt.module.css";

export const metadata: Metadata = {
  title: "Transfer Receipt",
  description: "Review and export a Padalix transfer receipt.",
};

type PageProps = { params: Promise<{ reference: string }> };

function Detail({ label, value, mono = false }: { label: string; value?: string | number; mono?: boolean }) {
  return (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd className={mono ? styles.mono : undefined}>{value || "NOT RECORDED"}</dd>
    </div>
  );
}

export default async function ReceiptPage({ params }: PageProps) {
  const session = await requireCustomerSession();
  const { reference } = await params;
  const normalizedReference = reference.trim().toUpperCase();
  if (!/^PDX-\d{4}-\d{6}$/.test(normalizedReference)) notFound();

  const receiptRequest = platformRequest<{ receipt: TransferReceipt }>(
    session,
    `/v1/transfers/${encodeURIComponent(normalizedReference)}`,
  ).catch((error: unknown) => {
    if (error instanceof PlatformError && error.status === 404) notFound();
    throw error;
  });
  const [account, data] = await Promise.all([
    platformRequest<PlatformAccount>(session, "/v1/account"),
    receiptRequest,
  ]);
  const receipt = data.receipt;
  const hasChainEvidence = Boolean(receipt.stellarTransactionHash);
  const downloadBase = `/api/platform/receipts/${encodeURIComponent(receipt.reference)}`;

  return (
    <AppShell active="/activity" member={{ name: account.name, level: account.verificationLevel }}>
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <Link href="/activity"><ArrowLeft size={16} /> Activity</Link>
            <p>TRANSFER RECEIPT / {receipt.providerEnvironment.toUpperCase()}</p>
            <h1>{receipt.reference}</h1>
            <span>Generated from Padalix provider and settlement evidence.</span>
          </div>
          <div className={styles.actions}>
            <a href={`${downloadBase}?format=json`}><FileJson size={17} /> JSON</a>
            <a href={`${downloadBase}?format=csv`}><Download size={17} /> CSV</a>
          </div>
        </header>

        <section className={styles.summary}>
          <div><small>STATUS</small><strong><CheckCircle2 size={18} /> {receipt.status.toUpperCase()}</strong></div>
          <div><small>SENT</small><strong>{receipt.sourceAmount} {receipt.sourceAsset}</strong></div>
          <div><small>DELIVERED</small><strong>{receipt.destinationAmount} {receipt.destinationCurrency}</strong></div>
          <div><small>RECIPIENT</small><strong>{receipt.recipientName}</strong></div>
        </section>

        <div className={styles.evidenceNotice} data-chain={hasChainEvidence ? "present" : "absent"}>
          {hasChainEvidence ? <Landmark size={18} /> : <ReceiptText size={18} />}
          <span>
            <strong>{hasChainEvidence ? "On-chain settlement evidence recorded" : "No Stellar transaction recorded for this transfer"}</strong>
            <small>{hasChainEvidence ? "The transaction hash can be independently verified on Stellar." : `This ${receipt.providerEnvironment} receipt is provider evidence and is not an on-chain transaction receipt.`}</small>
          </span>
        </div>

        <section className={styles.section}>
          <header><span>01</span><h2>Transfer</h2></header>
          <dl className={styles.details}>
            <Detail label="Receipt number" value={receipt.receiptNumber} mono />
            <Detail label="Created" value={new Date(receipt.createdAt).toLocaleString()} />
            <Detail label="Confirmed" value={new Date(receipt.confirmedAt).toLocaleString()} />
            <Detail label="Fee" value={`${receipt.feeAmount} ${receipt.sourceAsset}`} />
            <Detail label="Exchange rate" value={`1 ${receipt.sourceAsset} = ${receipt.rate} ${receipt.destinationCurrency}`} />
            <Detail label="Transfer ID" value={receipt.transferId} mono />
          </dl>
        </section>

        <section className={styles.section}>
          <header><span>02</span><h2>Provider evidence</h2></header>
          <dl className={styles.details}>
            <Detail label="Provider" value={receipt.providerName} />
            <Detail label="Environment" value={receipt.providerEnvironment.toUpperCase()} />
            <Detail label="Provider status" value={receipt.providerStatus.toUpperCase()} />
            <Detail label="Provider transaction ID" value={receipt.providerTransactionId} mono />
            <Detail label="Provider reference" value={receipt.providerReference} mono />
            <Detail label="Evidence recorded" value={receipt.evidenceRecordedAt ? new Date(receipt.evidenceRecordedAt).toLocaleString() : undefined} />
          </dl>
          {receipt.providerMoreInfoUrl ? <a className={styles.external} href={receipt.providerMoreInfoUrl} target="_blank" rel="noreferrer">Open provider record <ArrowUpRight size={15} /></a> : null}
        </section>

        <section className={styles.section}>
          <header><span>03</span><h2>Stellar evidence</h2></header>
          <dl className={styles.details}>
            <Detail label="Network" value={receipt.stellarNetwork?.toUpperCase()} />
            <Detail label="Transaction hash" value={receipt.stellarTransactionHash} mono />
            <Detail label="Ledger" value={receipt.stellarLedger} mono />
            <Detail label="Source account" value={receipt.stellarSourceAccount} mono />
            <Detail label="Destination account" value={receipt.stellarDestinationAccount} mono />
            <Detail label="Asset" value={receipt.stellarAssetCode ? `${receipt.stellarAssetCode}${receipt.stellarAssetIssuer ? ` / ${receipt.stellarAssetIssuer}` : ""}` : undefined} mono />
            <Detail label="Memo" value={receipt.stellarMemo ? `${receipt.stellarMemoType || "memo"}: ${receipt.stellarMemo}` : undefined} mono />
          </dl>
          <div className={styles.links}>
            {receipt.stellarExplorerUrl ? <a href={receipt.stellarExplorerUrl} target="_blank" rel="noreferrer">Stellar Expert <ArrowUpRight size={15} /></a> : null}
            {receipt.stellarHorizonUrl ? <a href={receipt.stellarHorizonUrl} target="_blank" rel="noreferrer">Horizon record <ArrowUpRight size={15} /></a> : null}
          </div>
        </section>

        {receipt.status === "confirmed" ? <ClaimLinkCreator reference={receipt.reference} /> : null}

        <footer className={styles.digest}>
          <span>RECEIPT SHA-256</span>
          <code>{receipt.digest}</code>
          <p>The digest identifies this receipt payload. It is not a blockchain signature or proof of settlement.</p>
        </footer>
      </main>
    </AppShell>
  );
}
