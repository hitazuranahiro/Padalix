"use client";

import { useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Clock3, FileText, LoaderCircle, MessageSquare, RefreshCw, Search, Send, Shield, UserRound } from "lucide-react";
import type { SupportMessage, SupportTicket, TicketPriority, TicketStatus } from "@/lib/support";

type EventItem = { id: string; eventType: string; actorType: string; metadata: unknown; createdAt: string };
type Detail = { ticket: SupportTicket; messages: SupportMessage[]; events: EventItem[] };
const statuses: TicketStatus[] = ["open", "in_progress", "waiting_customer", "resolved", "closed"];
const priorities: TicketPriority[] = ["low", "normal", "high", "urgent"];
const label = (value: string) => value.replaceAll("_", " ").toUpperCase();
const relativeSla = (date: string) => { const hours = Math.round((new Date(date).getTime() - Date.now()) / 3600000); return hours < 0 ? `${Math.abs(hours)}H OVERDUE` : `${hours}H REMAINING`; };

export function SupportDesk({ initialTickets, initialDetail, operatorName }: { initialTickets: SupportTicket[]; initialDetail: Detail | null; operatorName: string }) {
  const [tickets, setTickets] = useState(initialTickets);
  const [selected, setSelected] = useState(initialTickets[0]?.reference ?? "");
  const [detail, setDetail] = useState<Detail | null>(initialDetail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ query: "", status: "", priority: "" });
  const [internal, setInternal] = useState(false);

  async function loadDetail(reference: string) {
    setSelected(reference); setLoading(true); setError("");
    const response = await fetch(`/api/admin/support/tickets/${reference}`); const data = await response.json();
    if (response.ok) setDetail(data); else setError(data.error || "Unable to load ticket."); setLoading(false);
  }
  async function refresh(next = filters) {
    setLoading(true); const query = new URLSearchParams(Object.entries(next).filter(([, value]) => value));
    const response = await fetch(`/api/admin/support/tickets?${query}`); const data = await response.json();
    if (response.ok) { setTickets(data.tickets); if (selected && !data.tickets.some((ticket: SupportTicket) => ticket.reference === selected)) { setSelected(""); setDetail(null); } } else setError(data.error || "Queue refresh failed.");
    setLoading(false);
  }
  async function update(changes: { status?: TicketStatus; priority?: TicketPriority; assignedTo?: string | null }) {
    if (!selected) return; setLoading(true);
    const response = await fetch(`/api/admin/support/tickets/${selected}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
    const data = await response.json(); if (response.ok) { setDetail(data); await refresh(); } else setError(data.error || "Update failed."); setLoading(false);
  }
  async function reply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const message = String(new FormData(form).get("message") || ""); setLoading(true);
    const response = await fetch(`/api/admin/support/tickets/${selected}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, internal }) });
    const data = await response.json(); if (response.ok) { setDetail(data); form.reset(); await refresh(); } else setError(data.error || "Message failed."); setLoading(false);
  }

  return <div className="support-admin">
    <aside className="support-queue">
      <header><div><p>SUPPORT OPERATIONS</p><h1>Case queue</h1></div><button className="icon-command" type="button" title="Refresh queue" aria-label="Refresh queue" onClick={() => refresh()}><RefreshCw size={16} /></button></header>
      <form className="queue-filters" onSubmit={(event) => { event.preventDefault(); void refresh(); }}><label className="queue-search"><Search size={15} /><input aria-label="Search tickets" placeholder="REFERENCE, SUBJECT, EMAIL" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} /></label><div><select aria-label="Filter by status" value={filters.status} onChange={(event) => { const next = { ...filters, status: event.target.value }; setFilters(next); void refresh(next); }}><option value="">ALL STATUS</option>{statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select><select aria-label="Filter by priority" value={filters.priority} onChange={(event) => { const next = { ...filters, priority: event.target.value }; setFilters(next); void refresh(next); }}><option value="">ALL PRIORITY</option>{priorities.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}</select></div></form>
      <div className="queue-summary"><span>{tickets.length} CASES</span><span>{tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length} ACTIVE</span></div>
      <div className="ticket-list">{tickets.map((ticket) => { const overdue = !ticket.firstRespondedAt && new Date(ticket.firstResponseDueAt) < new Date(); return <button className={selected === ticket.reference ? "active" : ""} key={ticket.reference} type="button" onClick={() => loadDetail(ticket.reference)}><span className={`priority priority-${ticket.priority}`} /> <div><small>{ticket.reference} / {label(ticket.status)}</small><strong>{ticket.subject}</strong><span>{ticket.requesterEmail}</span></div><time className={overdue ? "overdue" : ""}>{overdue && <AlertTriangle size={12} />}{relativeSla(ticket.firstRespondedAt ? ticket.resolutionDueAt : ticket.firstResponseDueAt)}</time></button>; })}{!tickets.length && <p className="empty-queue">No cases match these filters.</p>}</div>
    </aside>
    <main className="case-panel">
      {!selected && <div className="case-empty"><MessageSquare size={28} /><p>Select a support case from the queue.</p></div>}
      {selected && loading && !detail && <div className="case-empty"><LoaderCircle className="spin" size={28} /><p>Loading case...</p></div>}
      {detail && <>
        <header className="case-header"><div><button className="mobile-back" type="button" aria-label="Return to queue" onClick={() => { setSelected(""); setDetail(null); }}><ArrowLeft size={17} /></button><p>{detail.ticket.reference} / {label(detail.ticket.category)}</p><h2>{detail.ticket.subject}</h2><span>Opened by {detail.ticket.requesterName} · {detail.ticket.requesterEmail}</span></div><span className={`case-status status-${detail.ticket.status}`}>{label(detail.ticket.status)}</span></header>
        <section className="case-controls" aria-label="Case controls"><label><span>Status</span><select value={detail.ticket.status} onChange={(event) => update({ status: event.target.value as TicketStatus })}>{statuses.map((status) => <option value={status} key={status}>{label(status)}</option>)}</select></label><label><span>Priority</span><select value={detail.ticket.priority} onChange={(event) => update({ priority: event.target.value as TicketPriority })}>{priorities.map((priority) => <option value={priority} key={priority}>{label(priority)}</option>)}</select></label><label><span>Owner</span><select value={detail.ticket.assignedTo ?? ""} onChange={(event) => update({ assignedTo: event.target.value || null })}><option value="">UNASSIGNED</option><option value={operatorName}>{operatorName.toUpperCase()}</option></select></label><div className="sla-control"><span>Response SLA</span><strong className={!detail.ticket.firstRespondedAt && new Date(detail.ticket.firstResponseDueAt) < new Date() ? "overdue" : ""}><Clock3 size={14} />{detail.ticket.firstRespondedAt ? "MET" : relativeSla(detail.ticket.firstResponseDueAt)}</strong></div></section>
        <div className="case-body"><section className="admin-thread"><div className="case-section-title"><MessageSquare size={16} /><span>CONVERSATION / {detail.messages.filter((item) => !item.isInternal).length}</span></div>{detail.messages.map((message) => <article className={`${message.authorType === "admin" ? "admin-message" : "customer-message"} ${message.isInternal ? "internal-message" : ""}`} key={message.id}><header><div>{message.isInternal ? <Shield size={14} /> : message.authorType === "admin" ? <Check size={14} /> : <UserRound size={14} />}<strong>{message.isInternal ? "Internal note" : message.authorDisplay}</strong></div><time>{new Date(message.createdAt).toLocaleString()}</time></header><p>{message.body}</p></article>)}
          {detail.ticket.status !== "closed" && <form className="admin-reply" onSubmit={reply}><div className="reply-mode"><button className={!internal ? "active" : ""} type="button" onClick={() => setInternal(false)}>CUSTOMER REPLY</button><button className={internal ? "active" : ""} type="button" onClick={() => setInternal(true)}>INTERNAL NOTE</button></div><textarea aria-label={internal ? "Internal note" : "Customer reply"} name="message" required minLength={2} rows={5} placeholder={internal ? "Visible only to administrators" : "Reply will be visible to the customer"} /><button className="send-command" disabled={loading} type="submit">{loading ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} {internal ? "ADD NOTE" : "SEND REPLY"}</button></form>}
        </section><aside className="case-activity"><div className="case-section-title"><FileText size={16} /><span>ACTIVITY / {detail.events.length}</span></div>{detail.events.map((item) => <div className="activity-item" key={item.id}><i /><span><strong>{label(item.eventType.replace(".", " "))}</strong><small>{item.actorType.toUpperCase()} · {new Date(item.createdAt).toLocaleString()}</small></span></div>)}</aside></div>
      </>}
      {error && <div className="admin-error" role="alert">{error}<button type="button" onClick={() => setError("")}>DISMISS</button></div>}
    </main>
  </div>;
}
