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

export const STELLAR_NETWORK: StellarNetwork =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet" ? "mainnet" : "testnet";

export const STELLAR_NETWORK_PASSPHRASE: Record<StellarNetwork, string> = {
  testnet: "Test SDF Network ; September 2015",
  mainnet: "Public Global Stellar Network ; September 2015",
};

export function isStellarPublicKey(value: string) {
  return /^G[A-Z2-7]{55}$/.test(value);
}
