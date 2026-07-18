"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  CircleDollarSign,
  ReceiptText,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import type { CustomerExperienceState } from "@/lib/customer-experience-store";
import styles from "./customer-experience-layer.module.css";

export type CustomerNotification = {
  key: string;
  title: string;
  message: string;
  label: string;
  href?: string;
  tone?: "signal" | "neutral";
};

type Props = {
  firstName: string;
  initialState: CustomerExperienceState;
  notifications: CustomerNotification[];
};

const onboardingSteps = [
  {
    eyebrow: "WELCOME / 01",
    title: "Move money with every number visible.",
    copy: "Preview the amount, exchange rate, fees, and recipient total before you confirm a transfer.",
    icon: CircleDollarSign,
  },
  {
    eyebrow: "SECURITY / 02",
    title: "Verify once. Unlock the right controls.",
    copy: "Identity verification protects your account and progressively enables transfers, payout methods, and higher limits.",
    icon: ShieldCheck,
  },
  {
    eyebrow: "CONTROL / 03",
    title: "Your wallet and receipts stay in your control.",
    copy: "Link a Stellar wallet without sharing its secret key, then follow each supported payment through its receipt and activity trail.",
    icon: WalletCards,
  },
];

async function saveExperience(body: Record<string, unknown>) {
  const response = await fetch("/api/customer-experience", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Your preference could not be saved. Try again.");
}

export function CustomerExperienceLayer({ firstName, initialState, notifications }: Props) {
  const [showOnboarding, setShowOnboarding] = useState(!initialState.onboardingComplete);
  const [step, setStep] = useState(0);
  const [centerOpen, setCenterOpen] = useState(false);
  const [states, setStates] = useState(initialState.notificationStates);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const closeCenterRef = useRef<HTMLButtonElement>(null);
  const visibleNotifications = useMemo(
    () => notifications.filter((item) => !states[item.key]?.dismissed),
    [notifications, states],
  );
  const unread = visibleNotifications.filter((item) => !states[item.key]?.read).length;

  useEffect(() => {
    if (!showOnboarding && !centerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [showOnboarding, centerOpen]);

  useEffect(() => {
    if (!centerOpen) return;
    closeCenterRef.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCenterOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [centerOpen]);

  async function finishOnboarding() {
    setBusy(true);
    setError("");
    try {
      await saveExperience({ action: "completeOnboarding" });
      setShowOnboarding(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save onboarding.");
    } finally {
      setBusy(false);
    }
  }

  async function openCenter() {
    setCenterOpen(true);
    const unreadKeys = visibleNotifications.filter((item) => !states[item.key]?.read).map((item) => item.key);
    if (!unreadKeys.length) return;
    try {
      await saveExperience({ action: "readNotifications", keys: unreadKeys });
      setStates((current) => Object.fromEntries(Object.entries(current).concat(
        unreadKeys.map((key) => [key, { ...current[key], read: true, dismissed: false }]),
      )));
    } catch {
      // The center remains usable if read-state persistence is temporarily unavailable.
    }
  }

  async function dismiss(key: string) {
    setBusy(true);
    setError("");
    try {
      await saveExperience({ action: "dismissNotifications", keys: [key] });
      setStates((current) => ({ ...current, [key]: { read: true, dismissed: true } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to dismiss notification.");
    } finally {
      setBusy(false);
    }
  }

  const activeStep = onboardingSteps[step];
  const StepIcon = activeStep.icon;

  return (
    <div className={styles.root}>
      <button className={styles.launcher} type="button" onClick={openCenter} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
        <Bell size={20} aria-hidden="true" />
        {unread ? <span aria-hidden="true">{unread > 9 ? "9+" : unread}</span> : null}
      </button>

      {centerOpen ? (
        <div className={styles.backdrop} style={{ zIndex: 170 }} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCenterOpen(false); }}>
          <section className={styles.notificationCenter} role="dialog" aria-modal="true" aria-labelledby="notification-title">
            <header>
              <div><p>ACCOUNT / SIGNALS</p><h2 id="notification-title">Notifications</h2></div>
              <button ref={closeCenterRef} type="button" onClick={() => setCenterOpen(false)} aria-label="Close notifications"><X size={20} /></button>
            </header>
            <div className={styles.notificationSummary}><span>{visibleNotifications.length} ACTIVE</span><b>{unread ? `${unread} NEW` : "UP TO DATE"}</b></div>
            <div className={styles.notificationList}>
              {visibleNotifications.length ? visibleNotifications.map((item) => (
                <article key={item.key} className={item.tone === "signal" ? styles.signal : undefined}>
                  <i aria-hidden="true">{item.tone === "signal" ? <ShieldCheck size={17} /> : <ReceiptText size={17} />}</i>
                  <div><span>{item.label}</span><h3>{item.title}</h3><p>{item.message}</p>{item.href ? <Link href={item.href} onClick={() => setCenterOpen(false)}>Review <ArrowRight size={14} /></Link> : null}</div>
                  <button disabled={busy} type="button" onClick={() => dismiss(item.key)} aria-label={`Dismiss ${item.title}`}><X size={15} /></button>
                </article>
              )) : (
                <div className={styles.empty}><Check size={25} /><strong>You are all caught up</strong><p>Account and transfer updates will appear here.</p></div>
              )}
            </div>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
          </section>
        </div>
      ) : null}

      {showOnboarding ? (
        <div className={`${styles.backdrop} ${styles.onboardingBackdrop}`} style={{ zIndex: 180 }}>
          <section className={styles.onboarding} role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
            <aside>
              <div className={styles.wordmark}><i><b /><b /><b /></i><strong>PADALIX</strong></div>
              <div><span>FIRST RUN</span><strong>{String(step + 1).padStart(2, "0")} / 03</strong></div>
              <ol>{onboardingSteps.map((item, index) => <li key={item.eyebrow} className={index === step ? styles.current : index < step ? styles.complete : undefined}><i>{index < step ? <Check size={12} /> : index + 1}</i><span>{item.eyebrow.split(" / ")[0]}</span></li>)}</ol>
              <small>SECURE CUSTOMER WORKSPACE</small>
            </aside>
            <main>
              <button className={styles.skip} type="button" disabled={busy} onClick={finishOnboarding}>Skip introduction</button>
              <div className={styles.stepIcon}><StepIcon size={28} aria-hidden="true" /></div>
              <p>{activeStep.eyebrow}</p>
              <h2 id="onboarding-title">{step === 0 ? `Welcome, ${firstName}. ` : ""}{activeStep.title}</h2>
              <span>{activeStep.copy}</span>
              <footer>
                <div>{onboardingSteps.map((item, index) => <i key={item.eyebrow} className={index === step ? styles.current : undefined} />)}</div>
                <nav>
                  {step > 0 ? <button type="button" onClick={() => setStep((value) => value - 1)}><ArrowLeft size={16} />Back</button> : null}
                  {step < onboardingSteps.length - 1 ? <button type="button" onClick={() => setStep((value) => value + 1)}>Continue<ArrowRight size={16} /></button> : <button type="button" disabled={busy} onClick={finishOnboarding}>{busy ? "Saving..." : "Enter Padalix"}<ArrowRight size={16} /></button>}
                </nav>
              </footer>
              {error ? <p className={styles.error} role="alert">{error}</p> : null}
            </main>
          </section>
        </div>
      ) : null}
    </div>
  );
}
