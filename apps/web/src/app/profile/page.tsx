import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CircleHelp, Mail, Settings, ShieldCheck, UserRound } from "lucide-react";
import { AccountSignOut } from "@/components/account-sign-out";
import { AppShell } from "@/components/app-shell";
import { ProfileEditor, type MemberProfile } from "@/components/profile-editor";
import { platformRequest, type PlatformAccount } from "@/lib/platform";
import { requireCustomerSession } from "@/lib/session";
import styles from "./account.module.css";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await requireCustomerSession({ requireTerms: false });
  const [account, profile] = await Promise.all([
    platformRequest<PlatformAccount>(session, "/v1/account"),
    platformRequest<MemberProfile>(session, "/v1/profile"),
  ]);

  return (
    <AppShell active="/profile" member={{ name: account.name, level: account.verificationLevel }}>
      <main className={styles.accountPage}>
        <header className={styles.pageHeader}>
          <div><p>ACCOUNT / PROFILE</p><h1>Your account information</h1><span>Keep contact and regional details current without changing your verified identity.</span></div>
          <nav aria-label="Account sections"><Link aria-current="page" href="/profile"><UserRound size={16} />Profile</Link><Link href="/settings"><Settings size={16} />Settings</Link><Link href="/help"><CircleHelp size={16} />Help</Link></nav>
        </header>

        <section className={styles.accountGrid}>
          <div className={styles.profileMain}>
            <header><span>PROFILE DETAILS</span><h2>How Padalix identifies you</h2></header>
            <dl className={styles.identityFacts}>
              <div><dt>Verified legal name</dt><dd>{profile.legalName}</dd></div>
              <div><dt>Email address</dt><dd><Mail size={15} />{profile.email}</dd></div>
              <div><dt>Member since</dt><dd>{new Date(profile.createdAt).toLocaleDateString("en-PH", { dateStyle: "long" })}</dd></div>
            </dl>
            <ProfileEditor className={styles.profileForm} profile={profile} />
          </div>
          <aside className={styles.accountRail}>
            <section><ShieldCheck size={21} /><span>ACCOUNT LEVEL</span><strong>{profile.verificationLevel.toUpperCase()}</strong><p>Your legal identity is managed through the verification workflow.</p><Link href="/verification">Review verification <ArrowRight size={15} /></Link></section>
            <section><BadgeCheck size={21} /><span>ACCOUNT STATUS</span><strong>{profile.accountStatus.toUpperCase()}</strong><p>Account restrictions and compliance notices are shown in your workspace.</p></section>
            <section className={styles.signOutPanel}><span>SECURE SESSION</span><p>Sign out when using a shared or public device.</p><AccountSignOut className={styles.signOut} /></section>
          </aside>
        </section>
      </main>
    </AppShell>
  );
}
