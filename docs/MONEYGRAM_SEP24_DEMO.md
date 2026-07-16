# MoneyGram Ramps SEP-24 Demonstration

## Decision

Padalix does not need a Soroban smart contract for a MoneyGram Ramps demonstration. The integration uses a user-controlled Stellar account, USDC on Stellar, SEP-10 authentication, and MoneyGram's SEP-24 hosted transaction flow.

The connector must remain disabled until MoneyGram allowlists the Padalix client domain. A direct testnet SEP-10 request using `client_domain=padalix.com` currently returns `home_domain [padalix.com] is not supported`. Omitting `client_domain` is not an acceptable workaround.

## Release gates

1. MoneyGram approves and allowlists `padalix.com` for the staging environment.
2. Padalix publishes `/.well-known/stellar.toml` with the public key used for client-domain signing.
3. The corresponding signing seed is stored only in the server secret store.
4. The SEP-10 response is validated against MoneyGram's current `stellar.toml`; endpoints and signing keys are discovered, not hardcoded.
5. A user links and proves ownership of a Stellar testnet account.
6. Testnet USDC is available in that account.
7. The full flow passes: SEP-10, SEP-24 initiation, hosted UI, status polling, wallet-submitted USDC transaction, and reference retrieval.
8. Webhook/status evidence, reconciliation, customer receipts, and operator exception handling are verified.

Production Preview uses real funds and must not be treated as a testnet. Full production remains blocked until MoneyGram certification, KYB, legal/compliance review, transaction monitoring, sanctions controls, and operational approval are complete.

## Server configuration

```dotenv
MONEYGRAM_RAMP_ENV=disabled
MONEYGRAM_RAMP_ALLOWLISTED=false
MONEYGRAM_HOME_DOMAIN=extstellar.moneygram.com
MONEYGRAM_CLIENT_DOMAIN=padalix.com
MONEYGRAM_CLIENT_SIGNING_SEED=
```

Allowed release values for `MONEYGRAM_RAMP_ENV` are `disabled`, `testnet`, `preview`, and `production`. No client signing seed may use a `NEXT_PUBLIC_` variable.

## Transaction path

1. Padalix requests a MoneyGram SEP-10 challenge for the user's Stellar account and the approved Padalix client domain.
2. The Padalix server adds the client-domain signature; the user signs the challenge in their wallet.
3. Padalix exchanges the fully signed challenge for a short-lived MoneyGram token.
4. Padalix initiates a SEP-24 deposit or withdrawal and opens the returned hosted interactive URL.
5. Padalix polls the SEP-24 transaction record until MoneyGram requests the user's transfer.
6. For cash-out, the user's wallet signs and submits the USDC payment to the exact account and memo supplied by MoneyGram.
7. Padalix polls to terminal state and retrieves the MoneyGram reference number or receipt link.
8. Provider and Stellar evidence are appended to `platform.transfer_evidence_event` and exposed in the customer receipt.

The user signs all wallet transactions locally. Padalix must never receive or store a wallet seed phrase or private key.

## Receipt and export requirements

Every customer receipt supports authenticated JSON and CSV export and records:

- Padalix transfer and receipt references
- amounts, currencies, fee, and applied exchange rate
- provider name, environment, transaction ID, reference, status, and receipt URL
- Stellar network, transaction hash, ledger, source, destination, asset issuer, and memo
- creation, confirmation, and evidence timestamps
- a SHA-256 digest of the canonical receipt payload

The digest identifies the exported payload; it is not a blockchain signature. A receipt without a Stellar transaction hash must explicitly state that on-chain settlement evidence is absent.

Operator exports must additionally cover settlement attempts, reconciliation results, webhook evidence, reversals/refunds, and exceptions. KYC documents, screening results, and sensitive payout credentials are separate access-controlled compliance exports and must not be included in customer transfer exports.

## References

- [MoneyGram Ramps integration](https://developer.moneygram.com/moneygram-developer/docs/integrate-moneygram-ramps)
- [MoneyGram transaction initiation](https://developer.moneygram.com/moneygram-developer/docs/initiate-transaction)
- [MoneyGram transaction polling](https://developer.moneygram.com/moneygram-developer/docs/poll-transaction-status)
- [MoneyGram reference retrieval](https://developer.moneygram.com/moneygram-developer/docs/fetch-reference-number)
- [Stellar SEP-24 guide](https://developers.stellar.org/docs/platforms/anchor-platform/sep-guide/sep24/getting-started)
