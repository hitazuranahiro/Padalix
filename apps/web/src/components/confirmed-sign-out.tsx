"use client";

import { useId, useRef, useState } from "react";
import { LogOut, ShieldAlert, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import styles from "./confirmed-sign-out.module.css";

export function ConfirmedSignOut({ className, label = "Sign out" }: { className?: string; label?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);

  function close() {
    if (!busy) dialogRef.current?.close();
  }

  return (
    <>
      <button className={className} type="button" onClick={() => dialogRef.current?.showModal()}>
        <LogOut size={17} aria-hidden="true" />{label}
      </button>
      <dialog className={styles.dialog} ref={dialogRef} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
        <section className={styles.panel} aria-labelledby={titleId}>
          <header>
            <div><i><ShieldAlert size={19} aria-hidden="true" /></i><span><strong>End this session?</strong><small>ACCOUNT / SIGN OUT</small></span></div>
            <button className={styles.close} type="button" onClick={close} aria-label="Close sign-out confirmation"><X size={19} /></button>
          </header>
          <div className={styles.copy}>
            <h2 id={titleId}>Confirm sign out.</h2>
            <p>You will need to authenticate again to access your wallet, transfers, and account information.</p>
            <div className={styles.actions}>
              <button type="button" onClick={close}>Keep me signed in</button>
              <button type="button" disabled={busy} onClick={async () => { setBusy(true); await authClient.signOut(); window.location.assign("/login"); }}>
                <LogOut size={16} />{busy ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </div>
        </section>
      </dialog>
    </>
  );
}
