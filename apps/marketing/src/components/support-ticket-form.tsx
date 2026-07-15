"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";

const apiUrl = process.env.NEXT_PUBLIC_SUPPORT_API_URL ?? "http://localhost:3001/api/support/tickets";

export function SupportTicketForm() {
  const [state, setState] = useState<{ loading: boolean; error: string; result?: { reference: string; token: string } }>({ loading: false, error: "" });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState({ loading: true, error: "" });
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ticket creation failed.");
      sessionStorage.setItem(`padalix-ticket-${data.reference}`, data.token);
      setState({ loading: false, error: "", result: { reference: data.reference, token: data.token } });
    } catch (error) { setState({ loading: false, error: error instanceof Error ? error.message : "Ticket creation failed." }); }
  }

  if (state.result) return <div className="ticket-created" role="status"><Check size={28} /><p className="mono">CASE CREATED</p><h3>{state.result.reference}</h3><p>Your private access link is the key to this case. Keep it available for replies and status updates.</p><Link className="cut-button cut-button-dark" href={`/help/ticket/${state.result.reference}?token=${state.result.token}`}>Open ticket <ArrowRight size={16} /></Link></div>;

  return <form className="ticket-form" onSubmit={submit}>
    <div className="ticket-form-grid"><label><span>Full name</span><input name="requesterName" required minLength={2} maxLength={100} autoComplete="name" /></label><label><span>Email address</span><input name="requesterEmail" type="email" required maxLength={254} autoComplete="email" /></label></div>
    <label><span>Subject</span><input name="subject" required minLength={5} maxLength={180} placeholder="Describe the issue in one line" /></label>
    <div className="ticket-form-grid"><label><span>Category</span><select name="category" defaultValue="technical"><option value="account">Account access</option><option value="transfer">Sending money</option><option value="receiving">Receiving funds</option><option value="security">Security concern</option><option value="technical">Technical issue</option><option value="other">Other</option></select></label><label><span>Business impact</span><select name="priority" defaultValue="normal"><option value="low">Low / General question</option><option value="normal">Normal / Workflow affected</option><option value="high">High / Transaction blocked</option><option value="urgent">Urgent / Security or funds at risk</option></select></label></div>
    <label><span>Details</span><textarea name="message" required minLength={20} maxLength={8000} rows={7} placeholder="Include what happened, when it happened, and any transaction reference. Never include a password or recovery phrase." /></label>
    <label className="ticket-honeypot" aria-hidden="true"><span>Website</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
    {state.error && <p className="ticket-error" role="alert">{state.error}</p>}
    <button className="cut-button cut-button-dark" disabled={state.loading} type="submit">{state.loading ? <LoaderCircle className="spin" size={16} /> : <span>Create support ticket</span>}<ArrowRight size={16} /></button>
  </form>;
}
