export type StellarNetwork = "testnet" | "mainnet";

export type StellarWalletLink = {
  id: string;
  publicKey: string;
  network: StellarNetwork;
  verifiedAt: string;
};

export type StellarWalletList = {
  wallets: StellarWalletLink[];
};

export type StellarWalletChallenge = {
  challengeId: string;
  transaction: string;
  network: StellarNetwork;
  networkPassphrase: string;
  serverPublicKey: string;
  homeDomain: string;
  webAuthDomain: string;
  expiresAt: string;
};

export type StellarPaymentConfig = {
  enabled: boolean;
  network: "testnet";
  assetCode: string;
  issuer?: string;
};

export type StellarBalance = {
  assetCode: string;
  issuer?: string;
  balance: string;
};

export type StellarBalanceList = {
  publicKey: string;
  network: "testnet";
  balances: StellarBalance[];
};

export type StellarPayment = {
  id: string;
  reference: string;
  status: "prepared" | "submitted" | "confirmed" | "failed" | "expired";
  network: "testnet";
  networkPassphrase: string;
  source: string;
  destination: string;
  assetCode: string;
  assetIssuer?: string;
  amount: string;
  transaction: string;
  transactionHash: string;
  submissionStatus?: string;
  ledger?: number;
  expiresAt: string;
  submittedAt?: string;
  confirmedAt?: string;
  receiptUrl?: string;
  explorerUrl: string;
};

export type StellarClaimableBalance = {
  id: string;
  reference: string;
  status: "prepared" | "submitted" | "confirmed" | "failed" | "expired";
  network: "testnet";
  networkPassphrase: string;
  source: string;
  claimant: string;
  assetCode: string;
  assetIssuer?: string;
  amount: string;
  transaction: string;
  transactionHash: string;
  claimableBalanceId: string;
  reclaimAfterSeconds: number;
  submissionStatus?: string;
  ledger?: number;
  expiresAt: string;
  submittedAt?: string;
  confirmedAt?: string;
  receiptUrl?: string;
  explorerUrl: string;
};

export const STELLAR_NETWORK: StellarNetwork =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet" ? "mainnet" : "testnet";

export const STELLAR_NETWORK_PASSPHRASE: Record<StellarNetwork, string> = {
  testnet: "Test SDF Network ; September 2015",
  mainnet: "Public Global Stellar Network ; September 2015",
};

export function isStellarPublicKey(value: string) {
  return /^G[A-Z2-7]{55}$/.test(value);
}
