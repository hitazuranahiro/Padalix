import { PasswordReset } from "@/components/customer-password-recovery";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const query = await searchParams;
  return <main className="customer-auth-page"><section><div className="auth-brand"><i><b /><b /><b /></i><strong>PADALIX</strong><span>ACCOUNT RECOVERY</span></div><div><p>CUSTOMER / PASSWORD SECURITY</p><h1>Create a new password.</h1><span>The reset token is single-use. Completing this process revokes existing password sessions.</span></div></section><aside><div><p>RECOVERY / 02</p><h2>Secure your account.</h2><PasswordReset token={query.token} invalid={Boolean(query.error)} /></div></aside></main>;
}
