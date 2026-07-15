import { redirect } from "next/navigation";
import { AdminBrand } from "@/components/admin-brand";
import { SignupForm } from "@/components/signup-form";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  if (process.env.BETTER_AUTH_ALLOW_SIGNUP !== "true") redirect("/login");
  return <main className="signup-page"><header><AdminBrand /><span>BOOTSTRAP MODE / TEMPORARY</span></header><section><p className="eyebrow">INITIAL ADMINISTRATOR</p><h1>Create your control account.</h1><p>This account receives full CMS administrator access. Disable signup immediately after creation.</p><SignupForm /></section><aside><strong>SECURITY NOTICE</strong><p>Use a unique password with at least 12 characters. Do not reuse a personal password.</p><span>AUTH / PROVISIONING</span></aside></main>;
}
