"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, Circle, KeyRound, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const rules = [
  { label: "12+ characters", test: (value: string) => value.length >= 12 },
  { label: "Uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "Lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "Number", test: (value: string) => /\d/.test(value) },
  { label: "Symbol", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

export function PasswordResetRequest() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  return <form className="customer-auth-form" onSubmit={async (event) => {
    event.preventDefault();
    setLoading(true);
    const data = new FormData(event.currentTarget);
    await authClient.requestPasswordReset({ email: String(data.get("email")), redirectTo: "/reset-password" });
    setSent(true);
    setLoading(false);
  }}>
    <label><span>EMAIL ADDRESS</span><input name="email" type="email" required autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" /></label>
    {sent ? <p className="auth-success" role="status">If that address is registered, password recovery instructions have been queued.</p> : null}
    <button disabled={loading || sent}><Mail size={17} /><span>{loading ? "REQUESTING" : sent ? "REQUEST RECEIVED" : "SEND RESET LINK"}</span><ArrowRight size={17} /></button>
    <p><Link href="/login">Return to sign in</Link></p>
  </form>;
}

export function PasswordReset({ token, invalid }: { token?: string; invalid?: boolean }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState(invalid ? "This password reset link is invalid or expired." : "");
  const strong = rules.every((rule) => rule.test(password));
  const matches = password === confirmation && confirmation.length > 0;

  return <form className="customer-auth-form" onSubmit={async (event) => {
    event.preventDefault();
    if (!token || !strong || !matches) return;
    setLoading(true);
    setError("");
    const result = await authClient.resetPassword({ newPassword: password, token });
    if (result.error) {
      setError("This password reset link is invalid or expired.");
      setLoading(false);
      return;
    }
    setComplete(true);
    setLoading(false);
  }}>
    {!complete ? <>
      <label><span>NEW PASSWORD</span><input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label><span>CONFIRM PASSWORD</span><input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      <div className="customer-password-rules">{rules.map((rule) => { const passed = rule.test(password); return <span className={passed ? "passed" : ""} key={rule.label}>{passed ? <Check size={12} /> : <Circle size={8} />}{rule.label}</span>; })}<span className={matches ? "passed" : ""}>{matches ? <Check size={12} /> : <Circle size={8} />}Passwords match</span></div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <button disabled={loading || !token || !strong || !matches}><KeyRound size={17} /><span>{loading ? "UPDATING" : "RESET PASSWORD"}</span><ArrowRight size={17} /></button>
    </> : <><p className="auth-success" role="status">Your password has been changed and existing sessions have been revoked.</p><Link className="auth-complete-link" href="/login">SIGN IN WITH NEW PASSWORD <ArrowRight size={16} /></Link></>}
  </form>;
}
