# Production MVP and Wallet Connector Plan

## Product boundary

The first real-money scope is one corridor: `USDC -> PHP` for a verified Philippine recipient. Supporting "all wallets" means a provider-neutral connector catalog, not claiming that every wallet is live. A method is visible only when its connector, corridor route, limits, and operational status permit it.

Padalix must launch through a licensed or registered payment, remittance, electronic-money, or virtual-asset partner appropriate to the operating model. Code completion does not replace contracts, safeguarding, compliance approval, or regulatory authorization.

## Connector classes

| Class | Initial protocol | Examples of resulting methods |
| --- | --- | --- |
| Stellar wallet | Stellar Wallets Kit or WalletConnect | Freighter, Lobstr, hardware and compatible ecosystem wallets |
| Stellar anchor | SEP-10, SEP-12, SEP-24/6, SEP-31, SEP-38 | Hosted or programmatic on/off-ramp |
| Philippine e-wallet | Licensed provider or aggregator API | A contracted wallet payout method |
| Bank payout | Licensed provider, InstaPay/PESONet participant, or aggregator | PHP bank-account payout |
| Cash pickup | Licensed remittance partner | Partner-location claim |

Brand names must not be configured as active until the owner has approved the integration and Padalix has a commercial agreement with the provider.

## Activation gate

A production connector stays `disabled` until all items pass:

1. Provider KYB, contract, allowed use case, corridor, currencies, limits, fees, and settlement account are approved.
2. Credentials and webhook secrets exist in a managed vault and the database stores only their references.
3. Webhook signatures are verified over raw bytes; provider event IDs are deduplicated before processing.
4. Quote and payout requests use stable idempotency keys and bounded timeouts.
5. Settlement is asynchronous. API acceptance creates an outbox job; only provider confirmation and reconciliation produce a terminal success.
6. Daily reconciliation matches provider records, internal transfers, ledger postings, and settlement accounts. Exceptions route to operations.
7. KYC tier, sanctions/PEP results, velocity limits, account restrictions, transaction monitoring, and manual review gates are enforced by the API.
8. Staging replay tests cover duplicate, delayed, out-of-order, invalid-signature, timeout, and provider-degraded events.
9. Operations has a connector kill switch, retry controls, incident runbook, and provider escalation path.
10. Legal and compliance approve the production corridor and custody model.

## Delivery phases

### Phase A: Testnet settlement

- Move quote and transfer orchestration behind the Go connector interfaces.
- Add the Stellar testnet adapter, transaction outbox worker, submission, and reconciliation.
- Keep managed signing testnet-only and outside the browser.
- Exit when retries cannot duplicate a transfer and every Stellar reference reconciles to balanced ledger postings.

### Phase B: One licensed PHP payout

- Select one partner and one method, preferably a provider capable of e-wallet and bank payouts through one contract.
- Store recipient payout details in a tokenization or vault service; retain only a reference, fingerprint, and mask in PostgreSQL.
- Implement signed webhook intake and settlement reconciliation.
- Run a closed pilot with strict per-member, per-day, and corridor limits.

### Phase C: Wallet breadth

- Add Stellar Wallets Kit for non-custodial signing and supported ecosystem wallets.
- Add Anchor Platform compatibility where the chosen anchor supports the required SEPs.
- Add provider adapters independently; never branch core transfer logic on brand names.
- Expose only methods returned by `GET /v1/payment-methods`.

### Phase D: Production hardening

- Dedicated staging and production databases, vaults, buckets, keys, provider accounts, and email suppression rules.
- Worker autoscaling, queue-age alerts, connector success-rate metrics, and reconciliation exception dashboards.
- Backup/restore rehearsal, dependency scanning, penetration test, incident response exercise, and disaster-recovery targets.
- Customer disclosures, complaints and dispute process, privacy retention/deletion policy, and regulatory reporting runbooks.

## Required owner decisions

Before Phase B implementation begins, record these decisions:

- Legal operating entity and licensed-partner model.
- Custodial managed wallet, non-custodial connected wallet, or both.
- First funding country and first recipient payout method.
- Stablecoin and issuer accepted for production settlement.
- Payout and FX provider selected after commercial and technical due diligence.
- KYC, sanctions/PEP, transaction-monitoring, object-storage, vault/KMS, email, and observability providers.

Until those decisions are signed off, production connectors remain disabled and the customer interface must continue to label transfers as sandbox or testnet.
