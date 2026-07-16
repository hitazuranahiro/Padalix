import { redirect } from "next/navigation";
import { getAdminSession, getStaffSession } from "@/lib/admin-session";
import { getContent } from "@/lib/content-store";
import { AdminBrand } from "@/components/admin-brand";
import { CmsEditor } from "@/components/cms-editor";
import { SignOutButton } from "@/components/sign-out-button";
import Link from "next/link";
import { Activity, LifeBuoy, ListChecks, ShieldCheck, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const staff = await getStaffSession(["admin", "compliance_reviewer"]);
  if (staff?.user.role === "compliance_reviewer") redirect("/kyc");
  const session = await getAdminSession();
  if (!session) redirect("/login");
  const content = await getContent();

  return <main className="admin-shell">
    <header className="admin-header"><AdminBrand /><div className="admin-tabs"><span className="active">CMS</span><Link href="/support"><LifeBuoy size={15} /> SUPPORT</Link><Link href="/kyc"><ShieldCheck size={15}/> KYC</Link><Link href="/operations"><ListChecks size={15}/> OPS</Link><Link href="/status"><Activity size={15}/> STATUS</Link><Link href="/team"><Users size={15}/> TEAM</Link></div><div className="admin-identity"><span><strong>{session.user.name}</strong><small>{session.user.email}</small></span><SignOutButton /></div></header>
    <CmsEditor initialContent={content.draft} publishedAt={content.publishedAt} />
  </main>;
}
