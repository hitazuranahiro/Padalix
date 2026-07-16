import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, FilePenLine, LifeBuoy, ListChecks, ShieldCheck, Users } from "lucide-react";
import { AdminBrand } from "@/components/admin-brand";
import { OperationsConsole } from "@/components/operations-console";
import { SignOutButton } from "@/components/sign-out-button";
import { getAdminSession } from "@/lib/admin-session";
import { getOperationsSnapshot } from "@/lib/operations";
import "./operations.css";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  const snapshot = await getOperationsSnapshot();
  return <main className="admin-shell"><header className="admin-header"><Link href="/"><AdminBrand /></Link><div className="admin-tabs"><Link href="/"><FilePenLine size={14} />CMS</Link><Link href="/support"><LifeBuoy size={14} />SUPPORT</Link><Link href="/kyc"><ShieldCheck size={14} />KYC</Link><Link href="/status"><Activity size={14} />STATUS</Link><Link className="active" href="/operations"><ListChecks size={14} />OPS</Link><Link href="/team"><Users size={14} />TEAM</Link></div><div className="admin-identity"><span><strong>{session.user.name}</strong><small>ADMINISTRATOR</small></span><SignOutButton /></div></header><OperationsConsole snapshot={snapshot} /></main>;
}
