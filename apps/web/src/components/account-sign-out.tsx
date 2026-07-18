"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function AccountSignOut({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      className={className}
      disabled={busy}
      type="button"
      onClick={async () => {
        setBusy(true);
        await authClient.signOut();
        window.location.assign("/login");
      }}
    >
      <LogOut size={17} aria-hidden="true" />
      {busy ? "Signing out..." : "Sign out of Padalix"}
    </button>
  );
}
