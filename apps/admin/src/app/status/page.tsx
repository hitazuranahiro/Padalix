import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, FilePenLine, LifeBuoy, ShieldCheck, Users } from "lucide-react";
import { AdminBrand } from "@/components/admin-brand";
import { SignOutButton } from "@/components/sign-out-button";
import { StatusConsole } from "@/components/status-console";
import { getAdminSession } from "@/lib/admin-session";
import { getStatus } from "@/lib/status-store";

export const dynamic = "force-dynamic";

export default async function StatusAdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  const status = await getStatus(false);
  return <main className="admin-shell">
    <header className="admin-header"><Link href="/"><AdminBrand /></Link><div className="admin-tabs"><Link href="/"><FilePenLine size={14} />CMS</Link><Link href="/support"><LifeBuoy size={14} />SUPPORT</Link><Link href="/kyc"><ShieldCheck size={14} />KYC</Link><Link className="active" href="/status"><Activity size={14} />STATUS</Link><Link href="/team"><Users size={14} />TEAM</Link></div><div className="admin-identity"><span><strong>{session.user.name}</strong><small>ADMINISTRATOR</small></span><SignOutButton /></div></header>
    <StatusConsole initialStatus={status} />
  </main>;
}
