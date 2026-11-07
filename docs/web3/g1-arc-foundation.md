> Historical implementation milestone. Current integrated behavior and remaining tasks are in [architecture](../../ARCHITECTURE.md) and [progress](progress.md); do not execute old activation instructions from this milestone.

# G1 Arc implementation checkpoint — 6 November 2026

**Historical first Arc checkpoint (`cd19b80`).** Studio audit, contract export and console acceptance are now complete locally; see the [current milestone and next task](g1-arc-contract-console.md). The unfinished Studio text below records the earlier state.

This checkpoint is local implementation, not a completed A2–A7 or G1 acceptance gate. The live adapters remain disabled. No public transaction, deployment or new funding was performed.

## Implemented and tested

- **A3 primitives:** testnet-only pot/token typed messages, deterministic funding nonces, exact places hashes, per-asset domain/decimal/pause/code checks at one canonical block, and retained-balance/authorization-window guards. The final Studio ABI and canonical terms hash still need alignment and a local deployed-contract test.
- **A5/A6 policy engine:** a fresh Locked observation is required to start; mock observations cannot unlock real attempts. Players, binding identities and rules must still match. One pot belongs to one round. Five-second cooperation verifies each EOA signature, preserves contract seat order, and never changes canonical game ranks or hashes. Missing agreement can trigger the delayed oracle path; disputes precede finalization. An abandoned, unverified or under-minimum-human game never produces settlement. Cancellation retains the refund obligation through the on-chain deadline.
- **Payouts:** all 91 valid two-to-four-seat dense placings, eight stake values and three rules (2,184 vectors). Exact conservation at integer and uint256 boundaries. Competition ranks are normalized only in the adapter, leaving saved game results unchanged.
- **A4 transaction admission:** the previously tested ENS journal is now a shared implementation. ENS keeps its journal path and policy. Arc has separate relayer/oracle journals, a configured fee floor of at least 20 gwei, zero-priority-fee support, retained native-gas balance and per-room/hour/lifetime caps. A signed hash is durable before submission. Unknown receipts stop further sending; a mined receipt after a timeout reconciles without another send.
- **A6 bankroll budgeting:** private durable per-asset reservations with device/address, salted-IP, room, hour and lifetime limits. Concurrent requests cannot overrun them. USDC and EURC budgets are separate. Restarting, reconnecting or a changed room cannot erase an allowance. These reservations do not yet send a drip.

Full `npm run check`: **745 tests pass** (313 unit, 117 party, 168 OS, 147 Web3), including both partner-off parity gates. The 24 new Arc tests include real offline EIP-712 signatures; no network or live key is used by them. ENS transaction regressions pass after extraction. There is no new UI in these modules and no new browser acceptance claim.

## Studio work in progress

The existing [app](https://studio.arc.io/app/3e018243-4be8-4b94-a488-1f69c9401fae) is generating ConditionalPot, Foundry tests and the console. Prompt and specification are in `integrations/arc/studio/`; [provenance](arc-ai-use.md) records the thread. Deployment is explicitly forbidden in this build. The CLI deployment list was empty when checked.

Initial review found an opaque caller-supplied terms hash not bound to actual terms, and a uint128 stake narrowing absent from the plan. The saved audit prompt requires both fixes, field-substitution tests, full arithmetic boundaries and at least 40 local Foundry tests. Do not use the interim contract as an accepted artifact. The final build must be pulled, audited and tested independently.

## Remaining before Arc acceptance

1. Finish Studio generation and its audit turn; pull final contract/interface/tests/console, pin dependencies, run Foundry and cross-check the JS vectors on a disposable local Arc fork. Align the terms helper with the contract's exact canonical encoding.
2. Connect the worker's typed jobs, preflight, asset registry, token budget, receipt metadata and idle deadline recovery. Preserve uncertain-send reconciliation; do not retry a different transaction after an ambiguous send.
3. Wire the policy to ENS roster resolution, the two server start gates, private reliable phone requests, five-second agreement/dispute and first-join drips. Keep network I/O outside view/finish/tick. Check new players, rule changes, disconnects, worker failure, cancellation and restart.
4. Build and serve the Studio console at `/pot/`; verify empty/error/pot/refund/claim states in Chromium at phone and desktop sizes. No deployment address, transaction hash or verified badge may be invented.
5. Prepare one bounded owner-operated public run only after local acceptance. Earlier automatic approval review requires the owner to sign/broadcast public transactions. Then independently verify create/fund/lock/settle/claim and contest/refund receipts.

Ledger L1–L4, the real match, failure drills and stop-the-relay proof remain after this Arc packet. Hosting and physical-phone acceptance remain owner-deferred. No new owner answer is required for current coding.
