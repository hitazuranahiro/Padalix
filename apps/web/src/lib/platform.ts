type SessionIdentity = { user: { id: string; email: string; name: string } };

export type PlatformAccount = {
  id: string;
  memberId: string;
  name: string;
  email: string;
  verificationLevel: "basic" | "verified" | "enhanced" | "business";
  accountStatus: string;
  balance: string;
  asset: string;
  network: string;
  kycReference?: string;
  kycStatus?: string;
};

export async function platformRequest<T>(session: SessionIdentity, path: string, init: RequestInit = {}) {
  const origin = process.env.PLATFORM_API_ORIGIN_URL;
  const token = process.env.PLATFORM_INTERNAL_TOKEN;
  if (!origin || !token) throw new Error("Platform service is not configured.");
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-padalix-subject": session.user.id,
      "x-padalix-email": session.user.email,
      "x-padalix-name": session.user.name,
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new PlatformError(result.error ?? "Platform request failed.", response.status);
  return result as T;
}

export class PlatformError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
