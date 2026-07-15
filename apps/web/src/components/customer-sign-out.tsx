"use client";

import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function CustomerSignOut() {
  return <button className="sidebar-signout" onClick={async () => { await authClient.signOut(); window.location.href = "/login"; }}><LogOut size={17} />Sign out</button>;
}
