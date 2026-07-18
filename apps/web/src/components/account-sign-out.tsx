import { ConfirmedSignOut } from "@/components/confirmed-sign-out";

export function AccountSignOut({ className }: { className?: string }) {
  return <ConfirmedSignOut className={className} label="Sign out of Padalix" />;
}
