import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePenLine, ShieldCheck, Users } from "lucide-react";
import { AdminBrand } from "@/components/admin-brand";
import { SignOutButton } from "@/components/sign-out-button";
import { SupportDesk } from "@/components/support-desk";
import { getAdminSession } from "@/lib/admin-session";
import { getAdminTicket, listTickets } from "@/lib/support";

export const dynamic = "force-dynamic";
export default async function SupportPage() {
  const session = await getAdminSession(); if (!session) redirect("/login");
  const tickets = await listTickets({});
  const initialDetail = tickets[0] ? await getAdminTicket(tickets[0].reference) : null;
  return <main className="admin-shell"><header className="admin-header"><Link href="/"><AdminBrand /></Link><div className="admin-tabs"><Link href="/" title="Content management"><FilePenLine size={15} /> CMS</Link><Link className="active" href="/support">SUPPORT</Link><Link href="/kyc"><ShieldCheck size={15}/> KYC</Link><Link href="/team"><Users size={15}/> TEAM</Link></div><div className="admin-identity"><span><strong>{session.user.name}</strong><small>{session.user.email}</small></span><SignOutButton /></div></header><SupportDesk initialTickets={tickets} initialDetail={initialDetail} operatorName={session.user.name} /></main>;
}
