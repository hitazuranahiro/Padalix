import { redirect } from "next/navigation";
import { CustomerAuthForm } from "@/components/customer-auth-form";
import { getCustomerSession } from "@/lib/session";

export default async function SignupPage() {
  if (await getCustomerSession()) redirect("/");
  return <main className="customer-auth-page"><section><div className="auth-brand"><i><b /><b /><b /></i><strong>PADALIX</strong><span>NEW ACCOUNT</span></div><div><p>REGISTRATION / BASIC ACCESS</p><h1>Start with a basic account.</h1><span>Preview rates and manage your profile immediately. Identity approval unlocks transfers and payout actions.</span></div></section><aside><div><p>CREATE ACCOUNT / 01</p><h2>Your details.</h2><CustomerAuthForm mode="signup" /></div></aside></main>;
}
