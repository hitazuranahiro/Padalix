# Padalix Project Description

## Project Identity

**Project name:** Padalix

**Tagline:** Crypto to Cash, Instantly Connected.

**Category:** Cross-border payments, remittances, financial inclusion, stablecoins, and PayFi

**Built on:** Stellar

The name **Padalix** combines *padala*, the Filipino word for sending or remittance, with *IX*, representing the infrastructure exchange behind every transfer. It reflects the product's purpose: helping people send value home through modern payment rails without making them learn how blockchain works.

## One-Line Description

Padalix is a Stellar-powered remittance platform that helps overseas Filipinos and freelancers send stablecoins and deliver usable funds to recipients through mobile wallets, bank accounts, or cash pickup flows.

## Short Description

Padalix connects stablecoin payments to the ways Filipino families actually receive and use money. A sender can fund a transfer with USDC, see the expected exchange rate and fees before confirming, and distribute funds to one or several recipients. Recipients can receive through a supported wallet or bank account, or claim a transfer without needing their own crypto wallet. Stellar provides the fast, low-cost settlement layer while Padalix makes the experience familiar, mobile-first, and accessible.

## Full Project Description

More than two million Filipinos work overseas, and remittances remain a critical source of household income across the Philippines. Yet sending money home can still involve high fees, unclear exchange-rate spreads, delayed settlement, repeated manual transfers, and limited options for recipients who do not have a bank account.

Padalix is a cross-border money movement platform built on Stellar for overseas Filipino workers, freelancers, their families, and eventually the businesses that pay them. It uses stablecoins as the settlement rail while presenting a simple remittance experience: choose a recipient, enter an amount, review the rate and fees, select a payout method, and send.

For the hackathon MVP, Padalix demonstrates a complete testnet transfer journey. Users can connect or create a Stellar wallet, view supported asset balances, quote a transfer, and send funds through Stellar. Smart Family Distribution lets a sender define percentage or fixed-amount rules and distribute one remittance among multiple recipients. Receive Without Bank uses a claimable transfer flow so a recipient can redeem funds through a claim code or QR-assisted experience. A simulated cash-pickup process demonstrates how a future regulated payout partner could serve recipients who do not use a bank or mobile wallet. A Soroban escrow contract supports milestone-based payments by locking funds until release conditions are confirmed.

Padalix is designed so the blockchain remains infrastructure, not a usability burden. Senders see the amount paid, the exchange rate, fees, delivery method, and expected recipient amount before they approve a transfer. Recipients interact with familiar identifiers and payout options instead of wallet addresses wherever the product flow allows it.

The initial focus is the Filipino remittance corridor. The longer-term opportunity is to expose the same settlement and distribution capabilities to employers, payroll platforms, fintech applications, and other remittance markets through business tools and developer APIs. Padalix aims to become programmable infrastructure for moving money across borders, beginning with a practical product for Filipino families.

## The Problem

Cross-border transfers still create avoidable friction for senders and recipients:

- Transfer charges and foreign-exchange spreads reduce the amount families receive.
- Settlement can take hours or days, especially across banking systems.
- Senders repeatedly make separate transfers when supporting several relatives.
- Recipients without bank accounts have fewer safe and convenient payout options.
- Most crypto products expose technical concepts that ordinary remittance users should not need to understand.
- Existing services often solve either digital settlement or local payout, but not the complete user journey.

## The Solution

Padalix combines Stellar settlement with a consumer experience designed around real remittance behavior:

1. The sender funds or connects a supported Stellar account.
2. Padalix displays the transfer amount, estimated conversion rate, fees, and recipient amount.
3. The sender chooses one recipient or applies a saved family distribution rule.
4. Stellar executes the asset transfer or path payment on testnet.
5. The recipient receives funds directly or claims them through the selected payout flow.
6. Padalix tracks the transaction and presents its status in plain language.

## Hackathon MVP Features

- **Multi-asset wallet:** Display and transfer supported Stellar assets, beginning with testnet USDC and a demo PHP-denominated asset.
- **Transparent transfer quote:** Show the indicative rate, fees, and expected amount before confirmation.
- **Stellar transfer flow:** Execute and track low-cost transfers on Stellar testnet.
- **Smart Family Distribution:** Split one funded transfer among multiple recipients using saved allocation rules.
- **Receive Without Bank:** Create a claimable transfer that can be redeemed through a code or QR-assisted flow.
- **Simulated cash pickup:** Demonstrate the recipient experience and partner handoff without representing it as a live payout network.
- **Milestone escrow:** Lock and release funds through a Soroban smart contract for freelance or service payments.
- **Transaction activity:** Show transfer history, destination, asset, amount, status, and Stellar transaction reference.

## Stellar Integration

Padalix uses Stellar for the payment capabilities that are demonstrated in the MVP:

- **Stellar Testnet** for wallet, asset, transfer, and judging-demo activity.
- **Stellar SDK** for account, transaction, asset, and network integration.
- **Path payments** to demonstrate conversion between supported assets when liquidity is available.
- **Claimable balances** for recipient-controlled claims and time-bound recovery rules.
- **Soroban** for programmable escrow and milestone release.
- **Freighter** as an optional wallet connection and transaction-signing method.

Mainnet deployment, production PHP liquidity, regulated fiat on/off-ramps, KYC/AML operations, and live cash-pickup integrations are post-MVP requirements. They depend on licensed partners, compliance controls, liquidity, security review, and corridor-specific operating agreements.

## Target Users

**Primary users**

- Overseas Filipino workers sending support to family members.
- Filipino freelancers receiving international payments.
- Family members who need simple local access to received funds.

**Future users**

- SMEs and BPOs managing cross-border payroll or contractor payments.
- Payroll, fintech, and commerce platforms that need programmable payout APIs.
- Remittance providers expanding into additional corridors.

## What Makes Padalix Different

- **Built around the complete remittance journey:** settlement, distribution, claiming, and payout orchestration belong in one experience.
- **Designed for non-crypto users:** blockchain details stay behind clear amounts, rates, fees, and recipient choices.
- **One transfer for the whole family:** reusable split rules reduce repeated work and make household support more intentional.
- **Recipient flexibility:** claimable transfers create an accessible path for recipients who do not begin with a wallet or bank account.
- **Consumer product with an infrastructure path:** the same primitives can later support payroll, business tools, and developer APIs.

## Impact

Padalix begins with a large, economically important community. The Philippine Statistics Authority estimated 2.19 million overseas Filipino workers in 2024. The Bangko Sentral ng Pilipinas recorded approximately US$34.49 billion in overseas Filipino cash remittances for the same year.

The project's intended impact is straightforward: reduce transfer friction, make costs easier to understand, shorten settlement time, and give families more control over how remittances are distributed and received.

## MVP Boundaries

The hackathon build proves the product flow and Stellar integration. It does **not** claim to operate a live remittance or cash-pickup business.

**Included in the MVP**

- Stellar testnet accounts and transfers
- Test or demo assets
- Transfer quoting and status tracking
- Family split rules
- Claimable transfer experience
- Simulated payout-partner handoff
- Soroban escrow demonstration

**Required for production**

- Licensed on/off-ramp and payout partners
- KYC, AML, sanctions screening, transaction monitoring, and case management
- Production asset issuers, liquidity, treasury controls, and reconciliation
- Smart-contract and application security audits
- Customer support, dispute handling, fraud controls, and recovery procedures
- Corridor-by-corridor legal and regulatory approval

## Roadmap

### Phase 1: Hackathon MVP

Deliver a complete testnet demo covering wallet connection, transparent transfer quoting, family distribution, claimable transfers, simulated cash pickup, and Soroban escrow.

### Phase 2: Controlled Pilot

Integrate a licensed Philippine on/off-ramp, implement identity and compliance workflows, add operational reconciliation, conduct security reviews, and test a limited corridor with controlled users.

### Phase 3: Business Platform

Introduce employer and payroll workflows, reusable payout rules, reporting, webhooks, and authenticated developer APIs.

### Phase 4: Multi-Corridor Infrastructure

Expand through regulated partners into additional remittance markets while adding liquidity-aware routing, more payout methods, and corridor-specific compliance controls.

## Presentation Version

**Padalix turns stablecoins into practical remittances for Filipino families.**

Today, overseas workers and freelancers still lose time and value to transfer fees, exchange-rate spreads, slow settlement, and fragmented payout options. Crypto can improve the underlying movement of money, but most wallets are too technical and stop before the recipient can use the funds locally.

Padalix closes that gap. Built on Stellar, it gives senders a clear quote, fast settlement, flexible recipient delivery, and Smart Family Distribution that can split one remittance among several loved ones. Claimable transfers help recipients receive funds without starting with a bank account or crypto wallet, while a Soroban escrow flow supports milestone-based freelance payments.

The hackathon MVP runs on Stellar testnet and demonstrates the full product journey using test assets and simulated local payout integrations. The next step is a controlled pilot with licensed compliance, liquidity, and payout partners. Starting with the Philippine corridor, Padalix is building toward programmable money-movement infrastructure for families, businesses, and fintech developers.

## Suggested Metadata

**Page title:** Padalix | Stellar-Powered Remittances for Filipino Families

**Meta description:** Padalix is a Stellar-powered remittance platform that connects stablecoin settlement to flexible recipient payouts, family distribution, claimable transfers, and programmable escrow.

**Social description:** Send stablecoins. Deliver usable funds. Support the whole family in one transfer.

## Sources for Market and Technical Claims

- Philippine Statistics Authority, [2024 Overseas Filipino Workers results](https://psa.gov.ph/system/files/iesd/SOF-2024-Special-Release.pdf)
- Bangko Sentral ng Pilipinas, [Overseas Filipino cash remittances by country and source](https://www.bsp.gov.ph/statistics/external/ofw2.aspx)
- Stellar Developer Documentation, [Claimable balances](https://developers.stellar.org/docs/build/guides/transactions/claimable-balances)
- Stellar Developer Documentation, [Signing Soroban contract invocations](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations)
