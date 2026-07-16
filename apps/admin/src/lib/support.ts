import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { database } from "@/lib/db";

export const ticketStatuses = ["open", "in_progress", "waiting_customer", "resolved", "closed"] as const;
export const ticketPriorities = ["low", "normal", "high", "urgent"] as const;
export const ticketCategories = ["account", "transfer", "receiving", "security", "technical", "other"] as const;
export type TicketStatus = (typeof ticketStatuses)[number];
export type TicketPriority = (typeof ticketPriorities)[number];
export type TicketCategory = (typeof ticketCategories)[number];

const ticketCreationLimit = 5;
const ticketCreationWindowSeconds = 60 * 60;
const customerMessageLimit = 12;
const customerMessageWindowSeconds = 10 * 60;

export class SupportRateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super("Support request rate limit exceeded");
    this.name = "SupportRateLimitError";
  }
}

export type SupportTicket = {
  id: string; reference: string; requesterName: string; requesterEmail: string; subject: string;
  category: TicketCategory; priority: TicketPriority; status: TicketStatus; assignedTo: string | null;
  firstResponseDueAt: string; resolutionDueAt: string; firstRespondedAt: string | null;
  resolvedAt: string | null; closedAt: string | null; createdAt: string; updatedAt: string;
};

export type SupportMessage = {
  id: string; authorType: "customer" | "admin" | "system"; authorId: string | null;
  authorDisplay: string; body: string; isInternal: boolean; createdAt: string;
};

const tokenPepper = process.env.SUPPORT_TOKEN_PEPPER ?? "padalix-local-support-pepper";
const slaHours: Record<TicketPriority, { response: number; resolution: number }> = {
  low: { response: 24, resolution: 120 }, normal: { response: 8, resolution: 72 },
  high: { response: 2, resolution: 24 }, urgent: { response: 1, resolution: 8 },
};

function hash(value: string) { return createHash("sha256").update(`${tokenPepper}:${value}`).digest("hex"); }
export function hashReporterIp(value: string) { return hash(`ip:${value}`); }
export function createAccessToken() { return randomBytes(32).toString("base64url"); }

function tokenMatches(raw: string, stored: string) {
  const calculated = Buffer.from(hash(`token:${raw}`), "hex");
  const expected = Buffer.from(stored, "hex");
  return calculated.length === expected.length && timingSafeEqual(calculated, expected);
}

function mapTicket(row: Record<string, unknown>): SupportTicket {
  return {
    id: String(row.id), reference: String(row.reference), requesterName: String(row.requester_name), requesterEmail: String(row.requester_email),
    subject: String(row.subject), category: row.category as TicketCategory, priority: row.priority as TicketPriority,
    status: row.status as TicketStatus, assignedTo: row.assigned_to ? String(row.assigned_to) : null,
    firstResponseDueAt: new Date(String(row.first_response_due_at)).toISOString(), resolutionDueAt: new Date(String(row.resolution_due_at)).toISOString(),
    firstRespondedAt: row.first_responded_at ? new Date(String(row.first_responded_at)).toISOString() : null,
    resolvedAt: row.resolved_at ? new Date(String(row.resolved_at)).toISOString() : null,
    closedAt: row.closed_at ? new Date(String(row.closed_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapMessage(row: Record<string, unknown>): SupportMessage {
  return { id: String(row.id), authorType: row.author_type as SupportMessage["authorType"], authorId: row.author_id ? String(row.author_id) : null,
    authorDisplay: String(row.author_display), body: String(row.body), isInternal: Boolean(row.is_internal), createdAt: new Date(String(row.created_at)).toISOString() };
}

export async function createTicket(input: { requesterName: string; requesterEmail: string; subject: string; category: TicketCategory; priority: TicketPriority; body: string; ipHash: string }) {
  const client = await database.connect();
  const token = createAccessToken();
  const id = randomUUID();
  const now = Date.now();
  const sla = slaHours[input.priority];
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`support-ticket:${input.ipHash}`]);
    const recent = await client.query(
      "select count(*)::int as count from support.ticket where reporter_ip_hash = $1 and created_at > now() - interval '1 hour'",
      [input.ipHash],
    );
    if (Number(recent.rows[0]?.count ?? 0) >= ticketCreationLimit) {
      throw new SupportRateLimitError(ticketCreationWindowSeconds);
    }
    const sequence = await client.query("select nextval('support.ticket_reference_seq') as value");
    const reference = `PDX-${new Date().getUTCFullYear()}-${String(sequence.rows[0].value).padStart(6, "0")}`;
    const result = await client.query(`insert into support.ticket
      (id, reference, access_token_hash, requester_name, requester_email, subject, category, priority, reporter_ip_hash, first_response_due_at, resolution_due_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [id, reference, hash(`token:${token}`), input.requesterName, input.requesterEmail, input.subject, input.category, input.priority, input.ipHash,
        new Date(now + sla.response * 3600000), new Date(now + sla.resolution * 3600000)]);
    await client.query(`insert into support.message (id,ticket_id,author_type,author_display,body) values ($1,$2,'customer',$3,$4)`, [randomUUID(), id, input.requesterName, input.body]);
    await addEvent(client, id, "customer", null, "ticket.created", { category: input.category, priority: input.priority });
    await queueNotification(client, id, "ticket.created", input.requesterEmail, { reference, subject: input.subject });
    await client.query("commit");
    return { ticket: mapTicket(result.rows[0]), token };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

async function addEvent(client: PoolClient, ticketId: string, actorType: string, actorId: string | null, eventType: string, metadata: object) {
  await client.query("insert into support.event (ticket_id,actor_type,actor_id,event_type,metadata) values ($1,$2,$3,$4,$5)", [ticketId, actorType, actorId, eventType, metadata]);
}
async function queueNotification(client: PoolClient, ticketId: string, eventType: string, recipient: string, payload: object) {
  await client.query("insert into support.notification_outbox (ticket_id,event_type,recipient,payload) values ($1,$2,$3,$4)", [ticketId, eventType, recipient, payload]);
}

export async function getPublicTicket(reference: string, token: string) {
  const result = await database.query("select * from support.ticket where reference = $1", [reference.toUpperCase()]);
  if (!result.rowCount || !tokenMatches(token, String(result.rows[0].access_token_hash))) return null;
  const messages = await database.query("select * from support.message where ticket_id = $1 and is_internal = false order by created_at", [result.rows[0].id]);
  return { ticket: mapTicket(result.rows[0]), messages: messages.rows.map(mapMessage) };
}

export async function addCustomerReply(reference: string, token: string, body: string) {
  const existing = await getPublicTicket(reference, token);
  if (!existing || existing.ticket.status === "closed") return null;
  const client = await database.connect();
  let committed = false;
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`support-message:${existing.ticket.id}`]);
    const current = await client.query("select status from support.ticket where id = $1 for update", [existing.ticket.id]);
    if (!current.rowCount || current.rows[0].status === "closed") {
      await client.query("rollback");
      return null;
    }
    const recent = await client.query(
      "select count(*)::int as count from support.message where ticket_id = $1 and author_type = 'customer' and created_at > now() - interval '10 minutes'",
      [existing.ticket.id],
    );
    if (Number(recent.rows[0]?.count ?? 0) >= customerMessageLimit) {
      throw new SupportRateLimitError(customerMessageWindowSeconds);
    }
    await client.query("insert into support.message (id,ticket_id,author_type,author_display,body) values ($1,$2,'customer',$3,$4)", [randomUUID(), existing.ticket.id, existing.ticket.requesterName, body]);
    await client.query("update support.ticket set status = case when status = 'waiting_customer' then 'in_progress' else status end, updated_at = now() where id = $1", [existing.ticket.id]);
    await addEvent(client, existing.ticket.id, "customer", null, "message.customer", {});
    await client.query("commit");
    committed = true;
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  return committed ? getPublicTicket(reference, token) : null;
}

export async function listTickets(filters: { status?: string; priority?: string; query?: string }) {
  const values: string[] = []; const clauses: string[] = [];
  if (ticketStatuses.includes(filters.status as TicketStatus)) { values.push(filters.status!); clauses.push(`status = $${values.length}`); }
  if (ticketPriorities.includes(filters.priority as TicketPriority)) { values.push(filters.priority!); clauses.push(`priority = $${values.length}`); }
  if (filters.query) { values.push(`%${filters.query}%`); clauses.push(`(reference ilike $${values.length} or subject ilike $${values.length} or requester_email ilike $${values.length})`); }
  const result = await database.query(`select * from support.ticket ${clauses.length ? `where ${clauses.join(" and ")}` : ""} order by case priority when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end, updated_at desc limit 200`, values);
  return result.rows.map(mapTicket);
}

export async function getAdminTicket(reference: string) {
  const ticket = await database.query("select * from support.ticket where reference = $1", [reference.toUpperCase()]);
  if (!ticket.rowCount) return null;
  const [messages, events] = await Promise.all([
    database.query("select * from support.message where ticket_id = $1 order by created_at", [ticket.rows[0].id]),
    database.query("select * from support.event where ticket_id = $1 order by created_at desc", [ticket.rows[0].id]),
  ]);
  return { ticket: mapTicket(ticket.rows[0]), messages: messages.rows.map(mapMessage), events: events.rows.map((row) => ({ id: String(row.id), eventType: String(row.event_type), actorType: String(row.actor_type), metadata: row.metadata, createdAt: new Date(String(row.created_at)).toISOString() })) };
}

export async function updateTicket(reference: string, input: { status?: TicketStatus; priority?: TicketPriority; assignedTo?: string | null }, actor: { id: string; name: string }) {
  const existing = await getAdminTicket(reference); if (!existing) return null;
  const status = input.status ?? existing.ticket.status; const priority = input.priority ?? existing.ticket.priority;
  const assignedTo = input.assignedTo === undefined ? existing.ticket.assignedTo : input.assignedTo;
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query(`update support.ticket set status=$1, priority=$2, assigned_to=$3, updated_at=now(),
      resolved_at=case when $1='resolved' then coalesce(resolved_at,now()) when $1 not in ('resolved','closed') then null else resolved_at end,
      closed_at=case when $1='closed' then coalesce(closed_at,now()) when $1<>'closed' then null else closed_at end where id=$4`, [status, priority, assignedTo, existing.ticket.id]);
    await addEvent(client, existing.ticket.id, "admin", actor.id, "ticket.updated", { from: { status: existing.ticket.status, priority: existing.ticket.priority, assignedTo: existing.ticket.assignedTo }, to: { status, priority, assignedTo } });
    await client.query("commit"); return getAdminTicket(reference);
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function addAdminReply(reference: string, input: { body: string; internal: boolean }, actor: { id: string; name: string }) {
  const existing = await getAdminTicket(reference); if (!existing || existing.ticket.status === "closed") return null;
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query("insert into support.message (id,ticket_id,author_type,author_id,author_display,body,is_internal) values ($1,$2,'admin',$3,$4,$5,$6)", [randomUUID(), existing.ticket.id, actor.id, actor.name, input.body, input.internal]);
    await client.query("update support.ticket set first_responded_at=case when $2=false then coalesce(first_responded_at,now()) else first_responded_at end, status=case when $2=false and status='open' then 'in_progress' else status end, updated_at=now() where id=$1", [existing.ticket.id, input.internal]);
    await addEvent(client, existing.ticket.id, "admin", actor.id, input.internal ? "note.internal" : "message.admin", {});
    if (!input.internal) await queueNotification(client, existing.ticket.id, "message.admin", existing.ticket.requesterEmail, { reference, subject: existing.ticket.subject });
    await client.query("commit"); return getAdminTicket(reference);
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}
