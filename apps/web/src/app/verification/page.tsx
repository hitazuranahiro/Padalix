import type { Metadata } from "next";
import { VerificationFlow } from "@/components/verification-flow";

export const metadata: Metadata = {
  title: "Identity verification",
  description: "Secure Padalix identity verification.",
};

export default function VerificationPage() {
  return <VerificationFlow />;
}
