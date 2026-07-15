"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, LockKeyhole, Send } from "lucide-react";

const apiUrl = process.env.NEXT_PUBLIC_SUPPORT_API_URL ?? "http://localhost:3001/api/support/tickets";
type TicketData = { ticket: { reference: string; subject: string; status: string; priority: string; category: string; requesterName: string; createdAt: string; updatedAt: string; firstResponseDueAt: string; resolutionDueAt: string }; messages: Array<{ id: string; authorType: string; authorDisplay: string; body: string; createdAt: string }> };

const label = (value: string) => value.replaceAll("_", " ").toUpperCase();

export function TicketTracker({ reference, initialToken }: { reference: string; initialToken: string }) {
  const [token, setToken] = useState(initialToken);
  const [data, setData] = useState<TicketData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(initialToken));
  const [sending, setSending] = useState(false);
  async function load(accessToken: string) {
    setLoading(true); setError("");
    const response = await fetch(`${apiUrl}/${encodeURIComponent(reference)}?token=${encodeURIComponent(accessToken)}`);
    const result = await response.json();
    if (!response.ok) { setError(result.error || "Unable to open this ticket."); setData(null); } else { setData(result); sessionStorage.setItem(`padalix-ticket-${reference}`, accessToken); }
    setLoading(false);
  }
  useEffect(() => {
    const accessToken = initialToken || sessionStorage.getItem(`padalix-ticket-${reference}`) || "";
    const timer = window.setTimeout(() => { if (accessToken) { setToken(accessToken); void load(accessToken); } }, 0);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken, reference]);
  async function unlock(event: React.FormEvent) { event.preventDefault(); if (token) await load(token); }
  async function reply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSending(true); setError("");
    const form = event.currentTarget; const message = String(new FormData(form).get("message") || "");
    const response = await fetch(`${apiUrl}/${encodeURIComponent(reference)}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, message }) });
    const result = await response.json(); setSending(false);
    if (!response.ok) setError(result.error || "Reply failed."); else { setData(result); form.reset(); }
  }
  if (loading) return <div className="ticket-access-state"><LoaderCircle className="spin" /><p>Loading secure case...</p></div>;
  if (!data) return <div className="ticket-access"><LockKeyhole size={28} /><p className="mono">PRIVATE SUPPORT CASE</p><h1>{reference}</h1><p>Paste the access key from the private link issued when this ticket was created.</p><form onSubmit={unlock}><label><span>Access key</span><input value={token} onChange={(event) => setToken(event.target.value)} required /></label>{error && <p className="ticket-error">{error}</p>}<button className="cut-button cut-button-light" type="submit">Open case</button></form><Link href="/help"><ArrowLeft size={15} /> Return to Help Center</Link></div>;
  const isClosed = data.ticket.status === "closed";
  return <div className="ticket-workspace">
    <header><div><p className="mono">{data.ticket.reference} / SECURE CASE</p><h1>{data.ticket.subject}</h1></div><span className={`ticket-status status-${data.ticket.status}`}>{label(data.ticket.status)}</span></header>
    <aside><dl><div><dt>Status</dt><dd>{label(data.ticket.status)}</dd></div><div><dt>Priority</dt><dd>{label(data.ticket.priority)}</dd></div><div><dt>Category</dt><dd>{label(data.ticket.category)}</dd></div><div><dt>Opened</dt><dd>{new Date(data.ticket.createdAt).toLocaleString()}</dd></div><div><dt>Last update</dt><dd>{new Date(data.ticket.updatedAt).toLocaleString()}</dd></div></dl><p><LockKeyhole size={14} /> This case is only available through its private access key.</p></aside>
    <section className="ticket-thread" aria-label="Ticket conversation">{data.messages.map((message) => <article className={message.authorType === "admin" ? "from-support" : "from-customer"} key={message.id}><header><strong>{message.authorType === "admin" ? "Padalix Support" : message.authorDisplay}</strong><time>{new Date(message.createdAt).toLocaleString()}</time></header><p>{message.body}</p></article>)}</section>
    {!isClosed && <form className="ticket-reply" onSubmit={reply}><label><span>Reply to support</span><textarea name="message" required minLength={2} maxLength={8000} rows={5} /></label>{error && <p className="ticket-error">{error}</p>}<button className="cut-button cut-button-light" disabled={sending} type="submit">{sending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} Send reply</button></form>}
    {isClosed && <p className="ticket-closed">This case is closed. Create a new ticket if you need further support.</p>}
  </div>;
}
