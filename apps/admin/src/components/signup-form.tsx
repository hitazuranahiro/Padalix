"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Circle, UserPlus } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const passwordRules = [
  { label: "12+ characters", test: (value: string) => value.length >= 12 },
  { label: "Uppercase", test: (value: string) => /[A-Z]/.test(value) },
  { label: "Lowercase", test: (value: string) => /[a-z]/.test(value) },
  { label: "Number", test: (value: string) => /\d/.test(value) },
  { label: "Symbol", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

export function SignupForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const passedRules = passwordRules.filter((rule) => rule.test(password)).length;
  const passwordStrong = passedRules === passwordRules.length;
  const passwordsMatch = confirmation.length > 0 && password === confirmation;
  const strength = passedRules <= 2 ? "WEAK" : passedRules <= 4 ? "GOOD" : "STRONG";

  if (complete) return <div className="signup-complete"><UserPlus size={22} /><strong>ADMINISTRATOR CREATED</strong><p>Your account is ready. Return to sign in, then disable bootstrap signup.</p><Link href="/login">CONTINUE TO SIGN IN <ArrowRight size={15} /></Link></div>;

  return <form className="signup-form" onSubmit={async (event) => {
    event.preventDefault(); setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    if (!passwordStrong) { setError("Password does not meet every security requirement."); setLoading(false); return; }
    if (!passwordsMatch) { setError("Passwords do not match."); setLoading(false); return; }
    const result = await authClient.signUp.email({ name: String(form.get("name")), email: String(form.get("email")), password });
    if (result.error) { setError(result.error.message ?? "Account creation failed."); setLoading(false); return; }
    setComplete(true);
  }}>
    <label><span>DISPLAY NAME</span><input name="name" required autoComplete="name" placeholder="Administrator name" /></label>
    <label><span>ADMIN EMAIL</span><input name="email" type="email" required autoComplete="email" placeholder="admin@padalix.com" /></label>
    <div className="signup-passwords"><label><span>PASSWORD</span><input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label><span>CONFIRM PASSWORD</span><input name="confirmPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label></div>
    <div className={`password-checker strength-${strength.toLowerCase()}`} aria-live="polite">
      <div className="strength-heading"><span>PASSWORD STRENGTH / <strong>{password ? strength : "WAITING"}</strong></span><span>{password.length} / 12 MIN</span></div>
      <div className="strength-meter" aria-hidden="true">{passwordRules.map((rule, index) => <i className={index < passedRules ? "passed" : ""} key={rule.label} />)}</div>
      <div className="password-rules">{passwordRules.map((rule) => { const passed = rule.test(password); return <span className={passed ? "passed" : ""} key={rule.label}>{passed ? <Check size={12} /> : <Circle size={9} />}{rule.label}</span>; })}<span className={passwordsMatch ? "passed" : ""}>{passwordsMatch ? <Check size={12} /> : <Circle size={9} />}{confirmation ? (passwordsMatch ? "Passwords match" : "Passwords differ") : "Confirm password"}</span></div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button type="submit" disabled={loading || !passwordStrong || !passwordsMatch}><UserPlus size={17} /><span>{loading ? "CREATING ACCOUNT" : "CREATE ADMINISTRATOR"}</span><ArrowRight size={17} /></button>
    <Link className="back-link" href="/login"><ArrowLeft size={14} /> RETURN TO SIGN IN</Link>
  </form>;
}
