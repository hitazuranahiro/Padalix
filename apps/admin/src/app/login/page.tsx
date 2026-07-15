import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/admin-session";
import { AdminBrand } from "@/components/admin-brand";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const staff = await getStaffSession(["admin", "compliance_reviewer"]);
  if (staff) redirect(staff.user.role === "compliance_reviewer" ? "/kyc" : "/");
  return <main className="login-page"><section className="login-panel"><AdminBrand /><div className="login-index">SECURE OPERATIONS / 01</div><div><p className="eyebrow">ADMINISTRATOR ACCESS</p><h1>Control requires clarity.</h1><p className="login-copy">Sign in to manage Padalix content, publishing, and platform configuration.</p><LoginForm signupEnabled={process.env.BETTER_AUTH_ALLOW_SIGNUP === "true"} /></div><footer><span>ENCRYPTED SESSION</span><span>PADALIX / 2026</span></footer></section><aside className="login-signal" aria-hidden="true"><span>AUTH / ONLINE</span><strong>01</strong><div /></aside></main>;
}
