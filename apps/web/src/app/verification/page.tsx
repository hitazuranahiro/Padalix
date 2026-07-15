import type { Metadata } from "next";
import { VerificationFlow } from "@/components/verification-flow";
import { requireCustomerSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Identity verification",
  description: "Secure Padalix identity verification.",
};

export default async function VerificationPage() {
  const session = await requireCustomerSession();
  return <VerificationFlow accountName={session.user.name} accountEmail={session.user.email} />;
}
