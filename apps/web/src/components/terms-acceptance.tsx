"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";

export function TermsAcceptance({ version, className }: { version: string; className?: string }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <form
      className={className}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!confirmed) return;
        setBusy(true);
        setError("");
        const response = await fetch("/api/platform/legal/terms/acceptance", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ version, accepted: true }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          setBusy(false);
          setError(result.error ?? "Acceptance could not be recorded.");
          return;
        }
        router.replace("/");
        router.refresh();
      }}
    >
      <label>
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <i aria-hidden="true">{confirmed ? <Check size={15} /> : null}</i>
        <span>I have read and agree to the <Link href="/terms" target="_blank">Padalix Terms of Use</Link>, version {version}.</span>
      </label>
      <button disabled={!confirmed || busy} type="submit">{busy ? <LoaderCircle className="spin" size={16} /> : null}{busy ? "Recording acceptance" : "Accept and continue"}<ArrowRight size={16} /></button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
