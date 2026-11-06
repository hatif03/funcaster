# Build Results

Local source and tests only. Nothing was deployed, funded, signed or sent to any public chain, and no private keys were used (tests use `vm.addr`/`vm.sign` throwaway keys). This file makes no claim of public-chain acceptance, verification or audit sign-off.

## Provenance

- Built with Arc Studio, session preview host: `iz8hbt0zibqjleob8k5oi.preview.studio.arc.io`
- appId: not exposed inside the workspace, so none is recorded here
- Workspace is not a git repository, so no commit hash exists. Source hashes (SHA-256) at time of the test run:
  - `contracts/ChonksMatchMarkets.sol`: `bb09bd13890c6ef62e2639c45ec84fe115d6853da282a842c38f03b20cabdc8b`
  - `contracts/SplitPayout.sol`: `0c7e0a31d99b6d3783abbeb1769cd612a8472cf440c1e114c870cd75a3459c90`
- Toolchain: Foundry 1.7.1 (forge), solc 0.8.28, EVM cancun, optimizer 200 runs, OpenZeppelin Contracts from `node_modules`
- Generated: 2026-11-06

## Command run

`forge build && forge test` (full suite, run from the project root)

## Result: 71 passed, 0 failed, 0 skipped (4 suites)

| Suite | Tests |
|---|---|
| `contracts/test/ChonksMatchMarkets.t.sol` | 18 |
| `contracts/test/ChonksMatchMarkets.Extras.t.sol` | 16 |
| `contracts/test/ChonksMatchMarkets.Reporters.t.sol` | 4 |
| `contracts/test/SplitPayout.t.sol` | 33 |

Shared helpers: `contracts/test/ChonksMatchMarkets.Base.t.sol`, `contracts/test/mocks/MockEIP3009Token.sol` (local mock of an EIP-3009 token, not a real USDC/EURC).

## Contracts

- `contracts/ChonksMatchMarkets.sol`: no-admin pari-mutuel markets. ABI: `abi/ChonksMatchMarkets.json`
- `contracts/SplitPayout.sol`: no-admin spectator cheers escrow, equal split to 2-4 recipients after two matching completed-verified reports. ABI: `abi/SplitPayout.json`

## Review of ChonksMatchMarkets (this round)

- Concrete bug fixed: the two reporters were not barred from betting on the market they report. `createMarket` now excludes `reporterA` and `verifierB` automatically. Covered by 3 new tests.
- Windows and timeout: close, deadline and liveness are immutable after creation; `resolveDeadline > closeTime + liveness`, reports and finalize are rejected at or after the deadline, and `voidExpired` is permissionless. No change needed.
- Claim solvency: payouts plus fee equal pool plus bonus exactly. A new test with a bonus, a fee and two tied winners confirms the contract balance reaches 0. No change needed.
- Known property, not changed: a matched report that lands so late that liveness ends after the deadline can no longer be finalized and ends in a refund void.

## Automated review

A critical-only review of both contracts found no material issues. This is not a substitute for an independent professional audit.

## Not done

No UI, no deployment, no fuzz or invariant tests, no Slither run, no fork or live-chain tests.
