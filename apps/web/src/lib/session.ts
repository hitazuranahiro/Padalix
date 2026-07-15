import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function getCustomerSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireCustomerSession() {
  const session = await getCustomerSession();
  if (!session) redirect("/login");
  return session;
}
