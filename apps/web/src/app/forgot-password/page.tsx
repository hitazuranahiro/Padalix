import { redirect } from "next/navigation";
import { PasswordResetRequest } from "@/components/customer-password-recovery";
import { getCustomerSession } from "@/lib/session";

export default async function ForgotPasswordPage() {
  if (await getCustomerSession()) redirect("/");
  return <main className="customer-auth-page"><section><div className="auth-brand"><i><b /><b /><b /></i><strong>PADALIX</strong><span>ACCOUNT RECOVERY</span></div><div><p>CUSTOMER / SECURE RECOVERY</p><h1>Recover access.</h1><span>Request a single-use link. Padalix returns the same response whether or not an account exists.</span></div></section><aside><div><p>RECOVERY / 01</p><h2>Reset your password.</h2><PasswordResetRequest /></div></aside></main>;
}
