import type { Metadata } from "next";
import Link from "next/link";
import { CircleHelp, Settings, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SettingsEditor, type MemberSettings } from "@/components/settings-editor";
import { platformRequest, type PlatformAccount } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";
import styles from "../profile/account.module.css";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireCustomerSession({ requireTerms: false });
  const [account, settings] = await Promise.all([
    platformRequest<PlatformAccount>(session, "/v1/account"),
    platformRequest<MemberSettings>(session, "/v1/settings"),
  ]);

  return (
    <AppShell active="/settings" member={{ name: account.name, level: account.verificationLevel }}>
      <main className={styles.accountPage}>
        <header className={styles.pageHeader}>
          <div><p>ACCOUNT / SETTINGS</p><h1>Preferences and notices</h1><span>Control regional presentation and optional communication without weakening account protections.</span></div>
          <nav aria-label="Account sections"><Link href="/profile"><UserRound size={16} />Profile</Link><Link aria-current="page" href="/settings"><Settings size={16} />Settings</Link><Link href="/help"><CircleHelp size={16} />Help</Link></nav>
        </header>
        <SettingsEditor className={styles.settingsForm} settings={settings} />
      </main>
    </AppShell>
  );
}
