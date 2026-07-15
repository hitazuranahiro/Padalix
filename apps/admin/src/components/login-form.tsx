"use client";

import { useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function LoginForm({ signupEnabled }: { signupEnabled: boolean }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  return <form className="login-form" onSubmit={async (event) => {
    event.preventDefault();
    setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({ email: String(form.get("email")), password: String(form.get("password")), callbackURL: "/" });
    if (result.error) { setError("Access denied. Check your administrator credentials."); setLoading(false); return; }
    const session = await authClient.getSession();
    window.location.href = session.data?.user.role === "compliance_reviewer" ? "/kyc" : "/";
  }}>
    <label><span>ADMIN EMAIL</span><input name="email" type="email" autoComplete="email" required placeholder="admin@padalix.com" /></label>
    <label><span>PASSWORD</span><input name="password" type="password" autoComplete="current-password" required minLength={12} placeholder="Enter secure password" /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button type="submit" disabled={loading}><LockKeyhole size={17} /><span>{loading ? "AUTHENTICATING" : "ENTER CONTROL ROOM"}</span><ArrowRight size={17} /></button>
    {signupEnabled && <Link className="bootstrap-link" href="/signup">CREATE INITIAL ADMINISTRATOR <ArrowRight size={15} /></Link>}
  </form>;
}
