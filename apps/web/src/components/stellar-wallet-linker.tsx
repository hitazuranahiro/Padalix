"use client";

import { useState } from "react";
import { Check, ExternalLink, Link2, LoaderCircle, ShieldCheck, Trash2, WalletCards } from "lucide-react";
import {
  isStellarPublicKey,
  STELLAR_NETWORK_PASSPHRASE,
  type StellarNetwork,
  type StellarWalletChallenge,
  type StellarWalletLink,
} from "@/lib/stellar";
import styles from "@/app/wallet/wallet.module.css";

type Phase = "idle" | "connecting" | "challenging" | "signing" | "verifying" | "complete" | "error";

const phaseLabel: Record<Phase, string> = {
  idle: "Connect and verify wallet",
  connecting: "Choose a wallet",
  challenging: "Preparing proof",
  signing: "Approve in your wallet",
  verifying: "Verifying ownership",
  complete: "Wallet verified",
  error: "Try wallet verification again",
};

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Wallet verification was not completed.";
}

async function responseBody<T>(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "The wallet request failed.");
  }
  return body as T;
}

function compactKey(value: string) {
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

export function StellarWalletLinker({
  initialWallets,
  network,
}: {
  initialWallets: StellarWalletLink[];
  network: StellarNetwork;
}) {
  const [wallets, setWallets] = useState(initialWallets);
  const [phase, setPhase] = useState<Phase>("idle");
  const [selectedAddress, setSelectedAddress] = useState("");
  const [message, setMessage] = useState("");
  const [unlinkingId, setUnlinkingId] = useState("");
  const busy = ["connecting", "challenging", "signing", "verifying"].includes(phase);

  async function linkWallet() {
    if (busy) return;
    setMessage("");
    setSelectedAddress("");
    setPhase("connecting");

    try {
      const [{ StellarWalletsKit }, { defaultModules }, { Networks }] = await Promise.all([
        import("@creit.tech/stellar-wallets-kit/sdk"),
        import("@creit.tech/stellar-wallets-kit/modules/utils"),
        import("@creit.tech/stellar-wallets-kit/types"),
      ]);
      const networkPassphrase = STELLAR_NETWORK_PASSPHRASE[network];
      StellarWalletsKit.init({
        modules: defaultModules(),
        network: network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET,
        authModal: { showInstallLabel: true, hideUnsupportedWallets: false },
      });

      const { address: walletAddress } = await StellarWalletsKit.authModal();
      const address = walletAddress.trim();
      if (!isStellarPublicKey(address)) throw new Error("The selected wallet did not return a valid Stellar account.");
      setSelectedAddress(address);
      setPhase("challenging");

      const challenge = await responseBody<StellarWalletChallenge>(
        await fetch("/api/platform/stellar-wallets/challenge", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ publicKey: address, network }),
        }),
      );
      if (challenge.network !== network || challenge.networkPassphrase !== networkPassphrase) {
        throw new Error("The platform returned a Stellar challenge for a different network.");
      }

      setPhase("signing");
      const { signedTxXdr, signerAddress } = await StellarWalletsKit.signTransaction(challenge.transaction, {
        networkPassphrase: challenge.networkPassphrase,
        address,
      });
      if (!signedTxXdr) throw new Error("The wallet did not return a signed SEP-10 challenge.");
      if (signerAddress && signerAddress !== address) {
        throw new Error("The wallet signed with a different Stellar account.");
      }

      setPhase("verifying");
      const verified = await responseBody<StellarWalletLink>(
        await fetch("/api/platform/stellar-wallets/verify", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ challengeId: challenge.challengeId, transaction: signedTxXdr }),
        }),
      );
      setWallets((current) => [verified, ...current.filter((wallet) => wallet.id !== verified.id)]);
      setMessage("Ownership verified. Padalix stored the public account link only.");
      setPhase("complete");
    } catch (error) {
      setMessage(errorMessage(error));
      setPhase("error");
    }
  }

  async function unlinkWallet(wallet: StellarWalletLink) {
    if (unlinkingId || !window.confirm(`Unlink ${compactKey(wallet.publicKey)} from Padalix?`)) return;
    setUnlinkingId(wallet.id);
    setMessage("");
    try {
      const response = await fetch(`/api/platform/stellar-wallets/${encodeURIComponent(wallet.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) await responseBody(response);
      setWallets((current) => current.filter((item) => item.id !== wallet.id));
      setMessage("The Stellar account link was removed.");
      setPhase("idle");
    } catch (error) {
      setMessage(errorMessage(error));
      setPhase("error");
    } finally {
      setUnlinkingId("");
    }
  }

  return (
    <section className={styles.workspace}>
      <div className={styles.linkPanel}>
        <div className={styles.panelNumber}>01 / OWNERSHIP PROOF</div>
        <WalletCards aria-hidden="true" size={32} />
        <h2>Link the account you control.</h2>
        <p>
          Choose a supported Stellar wallet and approve a short SEP-10 challenge. The challenge is not submitted to
          the network and cannot move funds.
        </p>

        <ol className={styles.steps} aria-label="Wallet verification steps">
          <li className={phase !== "idle" ? styles.stepActive : undefined}><span>01</span>Choose wallet</li>
          <li className={["signing", "verifying", "complete"].includes(phase) ? styles.stepActive : undefined}><span>02</span>Sign challenge</li>
          <li className={phase === "complete" ? styles.stepActive : undefined}><span>03</span>Verify ownership</li>
        </ol>

        {selectedAddress ? (
          <div className={styles.selectedAccount}>
            <span>SELECTED ACCOUNT</span>
            <strong title={selectedAddress}>{compactKey(selectedAddress)}</strong>
          </div>
        ) : null}

        <button className={styles.primaryAction} type="button" onClick={linkWallet} disabled={busy}>
          {busy ? <LoaderCircle className={styles.spin} size={18} /> : phase === "complete" ? <Check size={18} /> : <Link2 size={18} />}
          <span>{phaseLabel[phase]}</span>
          <ExternalLink size={17} />
        </button>
        <p className={phase === "error" ? styles.error : styles.feedback} role="status" aria-live="polite">
          {message}
        </p>
      </div>

      <aside className={styles.registry}>
        <div className={styles.registryHeader}>
          <div>
            <span>02 / VERIFIED ACCOUNTS</span>
            <h2>Public links</h2>
          </div>
          <b>{wallets.length.toString().padStart(2, "0")}</b>
        </div>

        {wallets.length ? (
          <div className={styles.walletList}>
            {wallets.map((wallet) => (
              <article key={wallet.id}>
                <ShieldCheck aria-hidden="true" size={20} />
                <div>
                  <strong title={wallet.publicKey}>{compactKey(wallet.publicKey)}</strong>
                  <span>{wallet.network.toUpperCase()} / VERIFIED {new Date(wallet.verifiedAt).toLocaleDateString()}</span>
                </div>
                <button
                  type="button"
                  aria-label={`Unlink Stellar account ${compactKey(wallet.publicKey)}`}
                  title="Unlink wallet"
                  onClick={() => unlinkWallet(wallet)}
                  disabled={Boolean(unlinkingId)}
                >
                  {unlinkingId === wallet.id ? <LoaderCircle className={styles.spin} size={16} /> : <Trash2 size={16} />}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyRegistry}>
            <WalletCards aria-hidden="true" size={26} />
            <strong>No verified Stellar account</strong>
            <span>Linking proves control. It does not deposit, withdraw, or authorize a payout.</span>
          </div>
        )}

        <footer>
          <ShieldCheck aria-hidden="true" size={17} />
          <span>Padalix never requests, receives, or stores a wallet seed phrase or private key.</span>
        </footer>
      </aside>
    </section>
  );
}
