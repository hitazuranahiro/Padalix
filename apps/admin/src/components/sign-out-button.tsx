"use client";

import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  return <button className="icon-command" type="button" title="Sign out" aria-label="Sign out" onClick={async () => {
    await authClient.signOut();
    window.location.href = "/login";
  }}><LogOut size={18} /></button>;
}
