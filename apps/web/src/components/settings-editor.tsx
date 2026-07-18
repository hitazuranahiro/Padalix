"use client";

import { useState } from "react";
import { Check, LoaderCircle, Save } from "lucide-react";

export type MemberSettings = {
  locale: string;
  timezone: string;
  productEmail: boolean;
  transactionalEmail: boolean;
  complianceEmail: boolean;
  securityEmail: boolean;
};

export function SettingsEditor({ settings, className }: { settings: MemberSettings; className?: string }) {
  const [state, setState] = useState(settings);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  return (
    <form
      className={className}
      onSubmit={async (event) => {
        event.preventDefault();
        setStatus("saving");
        setMessage("");
        const response = await fetch("/api/platform/settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locale: state.locale, timezone: state.timezone, productEmail: state.productEmail }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          setStatus("error");
          setMessage(result.error ?? "Settings could not be saved.");
          return;
        }
        setState(result as MemberSettings);
        setStatus("saved");
        setMessage("Preferences saved.");
      }}
    >
      <section>
        <header><span>01</span><div><h2>Regional preferences</h2><p>Set how dates, language, and local time are presented.</p></div></header>
        <div data-settings-grid>
          <label>Language and region<select value={state.locale} onChange={(event) => setState({ ...state, locale: event.target.value })}><option value="en-PH">English (Philippines)</option><option value="fil-PH">Filipino (Philippines)</option><option value="en">English (International)</option></select></label>
          <label>Timezone<select value={state.timezone} onChange={(event) => setState({ ...state, timezone: event.target.value })}><option value="Asia/Manila">Asia / Manila</option><option value="UTC">UTC</option><option value="America/Los_Angeles">America / Los Angeles</option><option value="America/New_York">America / New York</option><option value="Asia/Singapore">Asia / Singapore</option><option value="Asia/Tokyo">Asia / Tokyo</option><option value="Europe/London">Europe / London</option></select></label>
        </div>
      </section>
      <section>
        <header><span>02</span><div><h2>Communication</h2><p>Operational notices remain enabled so you do not miss account or transfer events.</p></div></header>
        <div data-settings-preferences>
          <label><span><strong>Product updates</strong><small>Occasional feature and pilot announcements.</small></span><input type="checkbox" checked={state.productEmail} onChange={(event) => setState({ ...state, productEmail: event.target.checked })} /></label>
          <label aria-disabled="true"><span><strong>Transaction notices</strong><small>Receipts and transfer-state updates.</small></span><input type="checkbox" checked={state.transactionalEmail} disabled /></label>
          <label aria-disabled="true"><span><strong>Security notices</strong><small>Authentication and account-protection alerts.</small></span><input type="checkbox" checked={state.securityEmail} disabled /></label>
          <label aria-disabled="true"><span><strong>Compliance notices</strong><small>Verification and required information requests.</small></span><input type="checkbox" checked={state.complianceEmail} disabled /></label>
        </div>
      </section>
      <footer aria-live="polite">
        <button disabled={status === "saving"} type="submit">{status === "saving" ? <LoaderCircle className="spin" size={16} /> : status === "saved" ? <Check size={16} /> : <Save size={16} />}{status === "saving" ? "Saving" : "Save settings"}</button>
        {message ? <p data-error={status === "error"}>{message}</p> : null}
      </footer>
    </form>
  );
}
