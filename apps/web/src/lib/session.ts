import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { platformRequest } from "@/lib/platform";

export async function getCustomerSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireCustomerSession(options: { requireTerms?: boolean } = {}) {
  const session = await getCustomerSession();
  if (!session) redirect("/login");
  if (options.requireTerms !== false) {
    const terms = await platformRequest<{ accepted: boolean }>(session, "/v1/legal/terms/current");
    if (!terms.accepted) redirect("/terms/accept");
  }
  return session;
}
