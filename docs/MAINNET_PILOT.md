# Stellar Mainnet Pilot

## Decision

Padalix's first real-money corridor should be a non-custodial Stellar Mainnet
flow for `USDC -> PHP` with a licensed Philippine payout partner. The customer
wallet signs the Stellar payment. Padalix must not receive a seed phrase,
private key, or recoverable signing secret and must not represent a transfer as
settled until the payout partner confirms it.

The preferred provider to evaluate first is Coins.ph Business because its
published material documents Stellar USDC support, PHP conversion and
settlement, and disbursements through Philippine bank and mobile-wallet rails.
This is a candidate architecture, not a live integration. Commercial KYB,
production credentials, and written confirmation that the contracted API
covers the complete Stellar USDC to third-party PHP payout flow are required.

## Execution Environments

| Environment | Purpose | Real value | Allowed execution |
| --- | --- | --- | --- |
| Local sandbox | Product development and deterministic ledger tests | No | Padalix simulator only |
| Provider sandbox | Connector certification, webhook, failure, and reconciliation tests | No | Provider test APIs only |
| Stellar testnet | Wallet-signing and on-chain transaction tests | No | Testnet accounts and test assets only |
| Mainnet pilot | Allowlisted users and a single licensed corridor | Yes | Disabled until every launch gate passes |

Testnet remains part of CI and acceptance testing. Mainnet is a separate,
fail-closed environment; it must never share signing configuration, database
credentials, webhook secrets, or connector state with testnet.

## Target Flow

1. A verified, allowlisted customer connects a supported Stellar wallet.
2. Padalix proves control of the public account through a signed challenge; a
   public key alone is not sufficient proof.
3. The payout connector requests a short-lived quote and destination
   instructions from the licensed partner.
4. The customer reviews the asset issuer, network, amount, fees, exchange rate,
   PHP amount, recipient, and expiry.
5. The customer wallet signs and submits the transaction directly to the
   partner-provided Stellar address and memo/muxed account.
6. Padalix records the transaction hash and moves the transfer to `submitted`.
7. Signed partner webhooks and reconciliation move the transfer through
   `pending`, `paid`, `failed`, or `requires_review`.
8. The customer sees success only after the PHP payout is confirmed.

The Mainnet Circle USDC issuer must be allowlisted exactly and displayed to the
customer. Asset codes alone are not trusted identifiers.

## Launch Gates

Mainnet remains disabled until all of these are evidenced:

- Executed provider agreement and successful business KYB.
- Philippine legal review of Padalix's exact role under BSP remittance, OPS,
  VASP, AML, consumer-protection, and data-protection requirements.
- Written provider confirmation of Stellar Mainnet USDC intake, quote and FX,
  third-party recipient payout, supported institutions, limits, fees, refunds,
  webhook semantics, idempotency, and reconciliation.
- Production KYC/AML, sanctions, transaction-monitoring, case-management, and
  suspicious-activity escalation procedures.
- Vault-backed secrets, signed webhooks, replay protection, idempotent workers,
  double-entry accounting, daily reconciliation, and immutable audit events.
- Tiny-value company-funded certification transfers for success, timeout,
  duplicate, refund, return, and provider-outage paths.
- Allowlisted pilot cohort, conservative per-transfer and daily limits, manual
  compliance review, and an operator kill switch. Mass payouts remain disabled.
- Incident response, support escalation, privacy notices, terms, fee disclosure,
  and customer-funds handling language reviewed for the final flow.

A commercial pilot is not automatically a regulatory sandbox or licensing
exemption. Any BSP sandbox use requires a separate application and approval.

## Provider Onboarding Questions

Request written answers from the provider before implementing its production
adapter:

- Does the contracted API accept Stellar Mainnet USDC and return a unique
  deposit address plus memo or muxed account per transfer?
- Is KYC hosted by the provider or supplied by Padalix, and which party owns
  AML, sanctions, Travel Rule, and transaction-monitoring decisions?
- Can PHP be paid to a different verified recipient through GCash, Maya, and
  bank accounts, or only to the provider account owner?
- Which institutions are currently available, and is there an API-provided
  institution code, display name, status, and approved logo URL?
- Are quotes firm, how long do they last, and how are fees, FX spread, limits,
  prefunding, reserves, returns, and refunds represented?
- What are the webhook signature, event ordering, retry, idempotency, and
  reconciliation-file contracts?
- What sandbox credentials, certification cases, production review, and
  incident escalation process are required?

## Philippine Payout Catalog

Stellar does not itself expose GCash, Maya, or every Philippine bank as payout
methods. The licensed payout provider owns that institution catalog. Padalix
must fetch it from the active provider, cache it with a short expiry, and hide
degraded or unavailable methods. Do not hard-code an "all banks" promise.

Approved brand assets should come from the contracted provider's institution
catalog or an approved local asset pack. Until that permission and source data
exist, the UI should use neutral payment-method icons and institution names.

Maya Unified Transfer is a documented fallback domestic payout connector for
Maya, InstaPay, and PESONet institutions. MoneyGram and Cebuana Lhuillier are
additional corridor candidates, but public documentation does not establish
that their Stellar ramp and Philippine recipient payout products are available
as one Padalix contract.

## Primary Sources

- [Stellar wallet integrations](https://developers.stellar.org/docs/tools/developer-tools/wallets)
- [Stellar public networks](https://developers.stellar.org/docs/networks)
- [Stellar Anchor Platform](https://developers.stellar.org/docs/platforms/anchor-platform)
- [SEP-24 deposit and withdrawal flow](https://developers.stellar.org/docs/platforms/anchor-platform/sep-guide/sep24/getting-started)
- [Coins.ph supported token networks](https://support.coins.ph/hc/en-us/articles/6133146885529-What-are-the-supported-networks-per-token-in-Coins-ph)
- [Coins.ph Business](https://www.coins.ph/en-ph/business)
- [Coins.ph Circle Payments Network announcement](https://www.coins.ph/en-ph/blog/coins-ph-joins-circle-payments-network-to-enable-local-currency-payouts-in-the-philippines)
- [Maya Unified Transfer](https://developers.maya.ph/reference/about-unified-transfer)
- [Maya institution codes](https://developers.maya.ph/reference/financial-institution-codes-and-standard-field-values-in-unified-transfer)
- [MoneyGram Stellar ramps](https://developer.moneygram.com/moneygram-developer/docs/integrate-moneygram-ramps)
- [MoneyGram Philippines direct-send options](https://developer.moneygram.com/moneygram-developer/docs/direct-send-options-for-ph)
- [BSP Circular 1206](https://www.bsp.gov.ph/Regulations/Issuances/2024/1206.pdf)
- [BSP OPS registration FAQ](https://www.bsp.gov.ph/PaymentAndSettlement/FAQ_OPS_Registration.pdf)
- [BSP Regulatory Sandbox Framework](https://www.bsp.gov.ph/Regulations/Issuances/2022/1153.pdf)
- [BSP VASP licensing moratorium](https://www.bsp.gov.ph/Regulations/Issuances/2025/M-2025-031.pdf)
