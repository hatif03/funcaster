> Historical implementation milestone. Current integrated behavior and remaining tasks are in [architecture](../../ARCHITECTURE.md) and [progress](progress.md); do not execute old activation instructions from this milestone.

# G1 ENS integration — E3–E6

6 November 2026. Implemented and locally verified on `web3/integrations`; public acceptance remains pending. Review-only PR #4, never merge into main. The original engine milestone is recorded in [g1-ens-lifecycle.md](g1-ens-lifecycle.md).

## Behavior

- The relay queues concrete party, seat, grant, revoke and record jobs. Only the worker signs. A verified phone address gets a private binding ID; replacing a player cannot reuse a stale name receipt or last-match result. Releasing a seat flushes its pending records before cleanup.
- The worker returns a whitelisted metadata schema and actual transaction references. Mock receipts are labelled, have no transaction hashes, and are rejected by on-mode rooms. The warm pool refills outside the game loop, including when the outbox is empty.
- The host gets root UNREGISTER on its party registry and SET_TEXT scoped to `chonks.control` on its party resolver. Revocation clears the host record, revokes both roles and cannot be undone by an old queued grant. Resumed grants recheck the current seat generation and expiry.
- Delegated `host.cmd` checks canonical seat ownership and roles. Cache TTL is at most five seconds, role events invalidate it, and an active delegation is freshly checked every five seconds. Chain denial revokes local authority and closes the phone admin sheet. Only an actual RPC-unavailable outcome permits the configured soft fallback; its message is visible in Players and on the phone. TV and staff-PIN controls keep their existing authority.
- Game/result changes coalesce for at most two seconds. Consecutive results are never collapsed into one history event. The table receipt and current participants' last-match records share one resolver multicall. Canonical game results/hashes are untouched.
- A phone can enter a table name when the ENS reader is enabled. Resolution validates active canonical ownership, schema, code and HTTPS origin. An unavailable name leaves the ordinary QR/code path available. Invite displays the table name.
- Records reads `TextUpdated` logs, ten blocks per request and one hundred blocks per page. A canonical registrar creation transaction locates the resolver after a party closes. History is explicitly **not independently verified**; Ledger will provide that separate badge. The public API has concurrency/rate/input bounds and never reflects RPC credentials/errors.
- `resolveRoster` resolves one to four seat names at a shared block, checks owner/address equality and refuses replacement during the read. **A5 must still use it when building pot terms.**

## Runtime and limits

`scripts/web3-worker.mjs` supports MOCK or ENS alone. Other provider live modes still refuse startup. ENS requires `--confirm-ens-sepolia`, matching registrar address/key, deployment-doc and canonical-namespace preflight, plus explicit settings in `.env.worker`:

- `ENS_MAX_TOTAL_GAS_ETH`: lifetime cost ceiling of this durable journal, in SepETH.
- `ENS_MAX_TRANSACTIONS`: lifetime transaction count ceiling.
- `ENS_MAX_FEE_GWEI` and `ENS_PRIORITY_FEE_GWEI`: fee admission ceilings.
- `WEB3_MAX_TX_PER_ROOM` and `WEB3_MAX_TX_PER_HOUR`: durable room cap and rolling chain-time hour cap. Warm-pool writes count toward the hour cap.

No budgets were guessed or applied to the owner's env. No live worker was started. Never delete a journal to reset a cap or retry an uncertain send. The persisted hash is reconciled against canonical receipts and exact calldata before later writes. A reverted/uncertain transaction stops sends. An older journal without admission timestamps refuses newly enabled rate limits until explicitly reconciled. `WEB3_KILL` and the shared kill file apply before signing/broadcast.

The current live runtime uses the first configured ENS RPC. It fails visibly rather than silently choosing a different provider during a write. Multi-host independent verification belongs to the later acceptance/Ledger flow. The relay's startup-only reader has no signing methods or credentials.

## Validation

- [Full check](g1-ens-integration-check.txt): **721 tests**, including both gameplay parity gates (313 unit, 117 party, 168 OS, 123 Web3).
- [Formatting](g1-ens-integration-format.txt) and `git diff --check` pass.
- [Fork report](spikes/g1-ens-lifecycle-rehearsal.json): **21 checks, 30 local transactions**, source Sepolia block **12075026**. Uses only a read-only upstream bridge and guarded localhost Anvil impersonation. No private key or public broadcast.
- Actual deployed-contract checks cover host control/kick, inability to mint/grant/change unrelated records/control another party/transfer seats, revoke, record writes, canonical join/roster/history, cleanup, expiry and history after closure. `localHash` values and eth_call reverts are **not public transaction evidence**.
- [Chromium report](spikes/g1-ens-browser.json): actual production windows and phone components with explicitly simulated RPC/authority responses. Desktop sizes 1280×720 and 800×600; phone sizes 320×568, 390×844 and 844×390. Long names, history rows, name failure/code fallback and admin closure checked. Input contrast and landscape error placement were fixed after inspection. [Join](spikes/g1-ens-phone.png), [host](spikes/g1-ens-host.png), [history](spikes/g1-ens-history.png).

Reproduce with `npm run check`, `npm run format:check`, `node tests/os/web3-ens.e2e.mjs`, and `node scripts/spikes/ens-lifecycle-rehearse.mjs` (requires the existing optional ENS/Anvil tools).

## Deviations and remaining work

The pinned resolver has `grantSetterRoles` but no `revokeSetterRoles`; the implementation derives the same resource via `decodeSetter` and calls `revokeRoles`. Cross-contract grant/revoke is journalled in stages, not claimed atomic. Warm open is three transactions and active release two, as established by the previous rehearsal. Minimal gated edits to `arcade.cjs`, `party.cjs` and phone modules are necessary for real enforcement/UI; no game/core/sdk/motion/root-lockfile/certificate changes were made.

Public ENS acceptance/E8 CAN/CANNOT receipts, A5 pot-roster consumption, hosted/physical-phone acceptance and independent Ledger verification remain open. Earlier automatic approval review requires owner execution of public-chain signing. No new owner command is requested until its bounded acceptance flow is prepared and tested. E9 wrapper registrar is the later hardening/cut-line task. Next G1 implementation: Arc A2–A7, Ledger L1–L4, then the real-match and failure/stop-the-relay gates.
