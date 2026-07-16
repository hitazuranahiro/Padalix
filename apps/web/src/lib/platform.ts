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

export type PaymentMethod = {
  id: string;
  code: string;
  displayName: string;
  payoutType: "stellar_wallet" | "wallet" | "bank" | "cash_pickup";
  countryCode: string;
  destinationCurrency: string;
  destinationNetwork?: string;
  destinationAsset?: string;
  minimumAmount?: string;
  maximumAmount?: string;
  minimumVerificationLevel: "basic" | "verified" | "enhanced" | "business";
  capabilities: string[];
  environment: "sandbox" | "testnet" | "production";
  provider: string;
};

export type TransferReceipt = {
  version: number;
  receiptNumber: string;
  transferId: string;
  reference: string;
  status: string;
  recipientName: string;
  sourceAsset: string;
  sourceAmount: string;
  destinationCurrency: string;
  destinationAmount: string;
  feeAmount: string;
  rate: string;
  createdAt: string;
  confirmedAt: string;
  providerKey: string;
  providerName: string;
  providerEnvironment: "sandbox" | "testnet" | "preview" | "production";
  providerTransactionId?: string;
  providerReference?: string;
  providerStatus: string;
  providerMoreInfoUrl?: string;
  stellarNetwork?: "testnet" | "mainnet";
  stellarTransactionHash?: string;
  stellarLedger?: number;
  stellarSourceAccount?: string;
  stellarDestinationAccount?: string;
  stellarAssetCode?: string;
  stellarAssetIssuer?: string;
  stellarMemoType?: string;
  stellarMemo?: string;
  stellarExplorerUrl?: string;
  stellarHorizonUrl?: string;
  evidenceRecordedAt?: string;
  digest: string;
};

export async function platformRawRequest(session: SessionIdentity, path: string, init: RequestInit = {}) {
  const origin = process.env.PLATFORM_API_ORIGIN_URL;
  const token = process.env.PLATFORM_INTERNAL_TOKEN;
  if (!origin || !token) throw new Error("Platform service is not configured.");
  return fetch(`${origin}${path}`, {
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
}

export async function platformRequest<T>(session: SessionIdentity, path: string, init: RequestInit = {}) {
  const response = await platformRawRequest(session, path, init);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new PlatformError(result.error ?? "Platform request failed.", response.status);
  return result as T;
}

export class PlatformError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
