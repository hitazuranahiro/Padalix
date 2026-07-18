# Padalix Milestone Escrow

Soroban contract for sequential milestone releases of a SEP-41 token such as a
Stellar Asset Contract USDC token.

## Trust model

- The funder authorizes the initial token transfer into the contract.
- The named arbiter authorizes each sequential milestone release.
- The funder can refund only the unreleased balance at or after `refund_after`.
- The contract has no administrator, upgrade entry point, arbitrary withdrawal,
  or method for changing participants after funding.
- `evidence_hash` commits to evidence kept outside the public ledger. Never put
  KYC documents or personal information on-chain.

This is an application-level control, not a substitute for legal escrow,
licensing, sanctions screening, or an independent smart-contract audit.

## Build and test

```bash
cargo test --manifest-path contracts/milestone-escrow/Cargo.toml
cargo clippy --manifest-path contracts/milestone-escrow/Cargo.toml --all-targets -- -D warnings
stellar contract build --manifest-path contracts/milestone-escrow/Cargo.toml
```

## Testnet deployment

Create and fund a dedicated testnet deployer identity, then deploy the optimized
Wasm. Do not reuse a production treasury key.

```bash
stellar keys generate padalix-escrow-deployer --network testnet --fund
stellar contract deploy \
  --wasm contracts/milestone-escrow/dist/padalix_milestone_escrow.wasm \
  --optimize=false \
  --source padalix-escrow-deployer \
  --network testnet
```

Record the returned contract ID as `SOROBAN_ESCROW_CONTRACT_ID_TESTNET`. A
mainnet deployment requires a separate build provenance record, independent
review, mainnet asset contract allowlisting, and controlled signer policy.

The current verified testnet deployment is recorded in
`deployments/testnet.json`.

