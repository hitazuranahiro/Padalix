"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, Circle, LockKeyhole, UserPlus } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const passwordRules = [
  { label: "12+ characters", test: (value: string) => value.length >= 12 },
  { label: "Uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "Lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "Number", test: (value: string) => /\d/.test(value) },
  { label: "Symbol", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

export function CustomerAuthForm({ mode }: { mode: "login" | "signup" }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const strong = passwordRules.every((rule) => rule.test(password));
  const matches = password === confirmation && confirmation.length > 0;

  return <form className="customer-auth-form" onSubmit={async (event) => {
    event.preventDefault();
    setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    if (mode === "signup") {
      if (!strong || !matches) { setError("Complete every password requirement."); setLoading(false); return; }
      const result = await authClient.signUp.email({ name: String(form.get("name")), email: String(form.get("email")), password });
      if (result.error) { setError(result.error.message ?? "Account creation failed."); setLoading(false); return; }
    } else {
      const result = await authClient.signIn.email({ email: String(form.get("email")), password });
      if (result.error) { setError("Email or password is incorrect."); setLoading(false); return; }
    }
    window.location.href = "/";
  }}>
    {mode === "signup" && <label><span>FULL NAME</span><input name="name" required minLength={2} maxLength={100} autoComplete="name" placeholder="Your legal name" /></label>}
    <label><span>EMAIL ADDRESS</span><input name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></label>
    <label><span>PASSWORD</span><input name="password" type="password" required minLength={12} maxLength={128} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    {mode === "signup" && <><label><span>CONFIRM PASSWORD</span><input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><div className="customer-password-rules">{passwordRules.map((rule) => { const passed = rule.test(password); return <span className={passed ? "passed" : ""} key={rule.label}>{passed ? <Check size={12} /> : <Circle size={8} />}{rule.label}</span>; })}<span className={matches ? "passed" : ""}>{matches ? <Check size={12} /> : <Circle size={8} />}Passwords match</span></div></>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    <button disabled={loading || (mode === "signup" && (!strong || !matches))}>{mode === "signup" ? <UserPlus size={17} /> : <LockKeyhole size={17} />}<span>{loading ? "PLEASE WAIT" : mode === "signup" ? "CREATE ACCOUNT" : "SIGN IN"}</span><ArrowRight size={17} /></button>
    <p>{mode === "signup" ? "Already registered?" : "New to Padalix?"} <Link href={mode === "signup" ? "/login" : "/signup"}>{mode === "signup" ? "Sign in" : "Create an account"}</Link></p>
  </form>;
}
