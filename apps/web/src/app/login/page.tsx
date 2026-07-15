import { redirect } from "next/navigation";
import { CustomerAuthForm } from "@/components/customer-auth-form";
import { getCustomerSession } from "@/lib/session";

export default async function LoginPage() {
  if (await getCustomerSession()) redirect("/");
  return <main className="customer-auth-page"><section><div className="auth-brand"><i><b /><b /><b /></i><strong>PADALIX</strong><span>ACCOUNT ACCESS</span></div><div><p>CUSTOMER / SECURE SESSION</p><h1>Welcome back.</h1><span>Access your sandbox wallet, identity status, recipients, and transfer activity.</span></div></section><aside><div><p>SIGN IN / 01</p><h2>Enter your account.</h2><CustomerAuthForm mode="login" /></div></aside></main>;
}
