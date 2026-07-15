import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function getAdminSession() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || session.user.role !== "admin") {
    return null;
  }

  return session;
}

export async function getStaffSession(allowedRoles: string[]) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !allowedRoles.includes(session.user.role ?? "")) return null;
  return session;
}

export function getKycReviewerSession() {
  return getStaffSession(["admin", "compliance_reviewer"]);
}
