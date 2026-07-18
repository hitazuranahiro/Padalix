"use client";

import { useState } from "react";
import { Check, LoaderCircle, Save } from "lucide-react";

export type MemberProfile = {
  accountId: string;
  memberId: string;
  legalName: string;
  preferredName: string;
  email: string;
  phoneE164: string;
  countryCode: string;
  verificationLevel: string;
  accountStatus: string;
  createdAt: string;
};

export function ProfileEditor({ profile, className }: { profile: MemberProfile; className?: string }) {
  const [state, setState] = useState(profile);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  return (
    <form
      className={className}
      onSubmit={async (event) => {
        event.preventDefault();
        setStatus("saving");
        setMessage("");
        const response = await fetch("/api/platform/profile", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            preferredName: state.preferredName,
            phoneE164: state.phoneE164,
            countryCode: state.countryCode,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          setStatus("error");
          setMessage(result.error ?? "Profile could not be saved.");
          return;
        }
        setState(result as MemberProfile);
        setStatus("saved");
        setMessage("Profile changes saved.");
      }}
    >
      <div>
        <label htmlFor="preferred-name">Display name</label>
        <input
          id="preferred-name"
          maxLength={80}
          placeholder={profile.legalName}
          value={state.preferredName}
          onChange={(event) => setState({ ...state, preferredName: event.target.value })}
        />
        <small>Used in your Padalix workspace. Your verified legal name is unchanged.</small>
      </div>
      <div>
        <label htmlFor="phone-e164">Mobile number</label>
        <input
          id="phone-e164"
          inputMode="tel"
          maxLength={16}
          placeholder="+639171234567"
          value={state.phoneE164}
          onChange={(event) => setState({ ...state, phoneE164: event.target.value })}
        />
        <small>Use international format beginning with + and the country code.</small>
      </div>
      <div>
        <label htmlFor="country-code">Country of residence</label>
        <select id="country-code" value={state.countryCode} onChange={(event) => setState({ ...state, countryCode: event.target.value })}>
          <option value="">Not set</option>
          <option value="PH">Philippines</option>
          <option value="US">United States</option>
          <option value="SG">Singapore</option>
          <option value="JP">Japan</option>
          <option value="GB">United Kingdom</option>
          <option value="CA">Canada</option>
          <option value="AU">Australia</option>
        </select>
      </div>
      <div aria-live="polite">
        <button disabled={status === "saving"} type="submit">
          {status === "saving" ? <LoaderCircle className="spin" size={16} /> : status === "saved" ? <Check size={16} /> : <Save size={16} />}
          {status === "saving" ? "Saving" : "Save profile"}
        </button>
        {message ? <p data-error={status === "error"}>{message}</p> : null}
      </div>
    </form>
  );
}
