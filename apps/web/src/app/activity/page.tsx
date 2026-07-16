import Link from "next/link";
import { Activity as ActivityIcon, ArrowUpRight, CheckCircle2, Download, FileJson } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { platformRequest, type PlatformAccount } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";
import styles from "./activity.module.css";

type ActivityResponse = {
  activity: Array<{
    eventType: string;
    resourceId: string;
    summary: string;
    createdAt: string;
    metadata: Record<string, string>;
  }>;
};

export default async function Activity() {
  const session = await requireCustomerSession();
  const [account, data] = await Promise.all([
    platformRequest<PlatformAccount>(session, "/v1/account"),
    platformRequest<ActivityResponse>(session, "/v1/activity"),
  ]);

  return (
    <AppShell active="/activity" member={{ name: account.name, level: account.verificationLevel }}>
      <main className="flow-page workspace-flow-page">
        <header className={styles.header}>
          <div><p>ACCOUNT LEDGER</p><h1>Activity</h1><span>Review transfers, account events, and downloadable records.</span></div>
          <div className={styles.exports}>
            <a href="/api/platform/exports/transfers?format=json"><FileJson size={16} /> JSON</a>
            <a href="/api/platform/exports/transfers?format=csv"><Download size={16} /> CSV</a>
          </div>
        </header>
        {data.activity.length ? (
          <section className="activity-ledger">
            {data.activity.map((item, index) => {
              const reference = item.eventType === "transfer.confirmed" ? item.metadata?.reference : undefined;
              return (
                <article key={`${item.createdAt}-${index}`}>
                  <CheckCircle2 size={18} />
                  <span>
                    <strong>{item.summary}</strong>
                    <small>{item.eventType.replaceAll(".", " ").toUpperCase()} / {new Date(item.createdAt).toLocaleString()}</small>
                  </span>
                  {reference ? (
                    <Link className={styles.receiptLink} href={`/receipts/${encodeURIComponent(reference)}`}>
                      RECEIPT <ArrowUpRight size={14} />
                    </Link>
                  ) : (
                    <b>{item.metadata?.destinationAmount ? `${item.metadata.destinationAmount} ${item.metadata.destinationCurrency}` : "ACCOUNT"}</b>
                  )}
                </article>
              );
            })}
          </section>
        ) : (
          <div className="activity-empty-page"><ActivityIcon size={28} /><h2>No activity recorded</h2><p>Quotes and transfers will be recorded here.</p></div>
        )}
      </main>
    </AppShell>
  );
}
