# Milestone Escrow Security Review

Date: 2026-07-18

Scope: `contracts/milestone-escrow`

## Invariants reviewed

1. The sum of positive milestone amounts is the exact amount funded.
2. Only the configured arbiter can authorize ordered releases.
3. Released value cannot exceed the funded total.
4. A refund is unavailable before the fixed deadline and returns only the
   unreleased value.
5. Complete or refunded escrows cannot release or refund again.
6. Participant roles are distinct and immutable.
7. Persistent entries extend their TTL when used.
8. No privileged upgrade, participant replacement, or arbitrary withdrawal
   entry point exists.

## Remaining external review requirements

- Independent review of compiled Wasm and authorization trees.
- Testnet adversarial testing with the exact deployed token contract.
- Reproducible build hash and deployed contract ID recording.
- Mainnet operational review for signer custody, arbiter policy, monitoring,
  emergency communications, and legal escrow classification.
- Property-based tests for long milestone vectors and boundary timestamps.

## Testnet deployment

- Contract: `CAUDUT6UNBGUPLM3AI2K25D6GY3NRAJO736AYO6RB5JBEVDOTR7XMDAW`
- Wasm SHA-256: `713b92d70ac6ee1583d98e312d4ef59a5a22615aac4379e7639503410a8a39e3`
- Network interface verified after deployment with Stellar CLI 27.0.0.

Status: internally reviewed and deployed to testnet only. This document is not
a third-party audit report and must not be marketed as one.
