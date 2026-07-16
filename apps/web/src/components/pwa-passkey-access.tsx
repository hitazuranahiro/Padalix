"use client";

import { Fingerprint, KeyRound, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { clearRecentPasswordAuthentication, hasRecentPasswordAuthentication, supportsPlatformPasskeys } from "@/lib/pwa";

const PASSKEY_PROMPT_DISMISSED = "padalix-passkey-prompt-dismissed";
const PASSKEY_PROMPT_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function friendlyError(message?: string) {
  if (message?.toLowerCase().includes("cancel") || message?.includes("NotAllowedError")) {
    return "Device sign-in was canceled. You can try again.";
  }
  return "Device sign-in is unavailable. Use your email and password instead.";
}

export function PwaPasskeySignIn() {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void supportsPlatformPasskeys().then((supported) => {
      if (active) setAvailable(supported);
    });
    return () => { active = false; };
  }, []);

  if (!available) return null;

  const signIn = async () => {
    setLoading(true);
    setError("");
    const result = await authClient.signIn.passkey();
    if (result.error) {
      setError(friendlyError(result.error.message));
      setLoading(false);
      return;
    }
    window.location.assign("/");
  };

  return <section className="pwa-passkey-signin" aria-label="Device sign-in">
    <div><KeyRound size={17} /><span><strong>Installed app</strong><small>Use a passkey saved to this device.</small></span></div>
    <button type="button" onClick={signIn} disabled={loading}>
      {loading ? <LoaderCircle className="spin" size={18} /> : <Fingerprint size={18} />}
      <span>{loading ? "VERIFYING" : "UNLOCK WITH DEVICE"}</span>
    </button>
    {error && <p role="alert">{error}</p>}
  </section>;
}

export function PwaPasskeyEnrollment() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const dismissedAt = Number(window.localStorage.getItem(PASSKEY_PROMPT_DISMISSED) ?? 0);
      if (dismissedAt > 0 && Date.now() - dismissedAt < PASSKEY_PROMPT_DISMISS_MS) return;
      if (!hasRecentPasswordAuthentication()) return;
      if (!(await supportsPlatformPasskeys())) return;
      const result = await authClient.passkey.listUserPasskeys();
      if (active && !result.error && (result.data?.length ?? 0) === 0) setVisible(true);
    })();
    return () => { active = false; };
  }, []);

  if (!visible) return null;

  const enroll = async () => {
    if (!hasRecentPasswordAuthentication()) {
      setError("Sign in with your password again before enabling device sign-in.");
      return;
    }
    setLoading(true);
    setError("");
    const result = await authClient.passkey.addPasskey({
      name: "Padalix installed app",
      authenticatorAttachment: "platform",
    });
    if (result.error) {
      setError(friendlyError(result.error.message));
      setLoading(false);
      return;
    }
    clearRecentPasswordAuthentication();
    setComplete(true);
    setLoading(false);
    window.setTimeout(() => setVisible(false), 1800);
  };

  const dismiss = () => {
    window.localStorage.setItem(PASSKEY_PROMPT_DISMISSED, String(Date.now()));
    setVisible(false);
  };

  return <aside className="pwa-passkey-enrollment" aria-live="polite">
    <Fingerprint size={22} />
    <span>
      <strong>{complete ? "Device sign-in enabled" : "Faster secure sign-in"}</strong>
      <small>{complete ? "Your passkey is ready." : "Use this device to enter Padalix without typing your password."}</small>
      {error && <em role="alert">{error}</em>}
    </span>
    {!complete && <button className="pwa-passkey-enable" type="button" onClick={enroll} disabled={loading}>
      {loading ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}
      {loading ? "ENABLING" : "ENABLE"}
    </button>}
    <button className="pwa-passkey-dismiss" type="button" onClick={dismiss} aria-label="Dismiss device sign-in setup" title="Dismiss"><X size={16} /></button>
  </aside>;
}
