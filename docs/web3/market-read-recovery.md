# Hosted market read repair — 6 November 2026

## Current paid attempt

Both phones/ENS names and all four original bankrolls passed. Creator registration and the 0.50 test-USDC table pass confirmed. Two spectators each placed0.05 test-USDC on opposite outcomes in MatchMarkets market 1 (`0x2591b3d9eb861c1aff8a27f6aa9739eaad86fdf97858c769378bc95391473aa8`).

The cheer authorization was valid but its job exhausted retries without signer admission or a transaction; no cheer was charged. A market-account GET returned 400 and paused the harness. The room later had no market association, and no game started. The old journal records genuine paid positions and must not be reset or reused as a fresh run. The creator pass remains a confirmed payment; the prediction refund audit does not imply a pass refund.

Public transaction references:
- Creator registration: `0x5de7d5fa450b9606d233b3cd94ea5c70b09bd268dd22d57c4782b70d34828e0b`
- Creator pass: `0xdf3096da05c5e12a17e817a4c8c81390526a6cc553390a745131a1022554e5b1`
- Prediction 1: `0xfea537d8ca9e0c7e073bafe89fb19819dae017cbdaa16015a38ae3788a2790c2`
- Prediction 2: `0xe904e76162adeb53ae49f0ac7d48d1dd7cb9051692c88266bfee7cf927012ecc`

## Repair and evidence

Deployed read/context revision: `11fe20427a733810eb21caeafb7bf68e20d26c63`, draft [PR #5](https://github.com/hatif03/web3-multiplayer-games/pull/5).

- PostgreSQL streams now sort by the numeric table column instead of the text output alias. SELECT-only diagnostic `job-dbn67ojbc2fs738leda0` validates all 130 original ledger rows with unchanged hash head `122b86ce2367ef0791d439eba159afc2c7a244ec66d1d5958bd860b914471f4b`. No repair SQL or ledger sorting workaround is used.
- Receipt replay waits for durable local persistence before moving the cursor. Restarting with 130 receipts no longer overflows the 64-item queue. Failed sinks retain their cursor; existing confirmed proofs do not trigger repeat RPC verification. Persistence does not wait for independent verification RPC.
- Failed market GET reads return sanitized 503, which the existing bounded GET retry can handle. Auth stays 401; invalid payment POSTs stay 400. The historical 400 did not retain its original RPC cause; this is a verified classification defect, not proof of a particular provider outage.
- Frozen market context binds actual assigned identities, game and setup. Temporary readiness/socket changes and cosmetic edits no longer detach it. Real slot/token/address/game/setup changes still invalidate it.
- Future acceptance positions submit independently within a 120-second window; journal writes remain serialized, and all started branches settle before a pause is reported. Existing expired authorizations are not retried or changed.

The owner deployed this revision to all three services: worker live 00:00:13UTC, verifier 00:02:12 UTC, relay 00:04:18UTC on 6 November. The public ledger export validates 193 rows/104 receipts with the original 130-row prefix intact, storage ready, dropped 0 and pending 0. Both prediction receipts are independently confirmed. This audit performs GETs only.

The audit found a separate commerce omission: `commerceReceiptData` does not emit mode, but the ledger required mode on for public commerce receipts. The operation callback ran only on the first confirmation and could not reconstruct rows after the earlier ledger failure. Follow-up `cff34f0b9c1f6004b95a37f39167385453eed4ad` reads the actual worker shape and makes the durable stream the only live-commerce ledger source. Mock callbacks remain. No historical row or transaction is rewritten; independent verification is still required.

Validation: `npm run check` passes 1,018 tests with one opt-in browser skip; 13 focused ledger/replay tests pass. The preceding 36-check browser/recovery run and three actual local PostgreSQL tests pass. CI at `6f42a1b` passed both game jobs and security; the new reader commit has separate CI.

## Completed owner follow-up

The owner deployed relay `cff34f0b9c1f6004b95a37f39167385453eed4ad`, live at 6 November 00:10:54 UTC. No more deployment is required for this repair. Public export at 00:11 UTC validates 241 journal rows/106 receipts with head `0a6208d6c6a2f646b42887525c2f0e2942c6aa010a7a4fa37ed93ef10d25fb50`, the original 130-row prefix unchanged, and storage ready/dropped 0/pending 0. Registration, creator pass and both predictions all have independent confirmed receipt badges.

Keep all journals, four profiles and recovery markers. Do not rerun the expired acceptance, three-service deployment, activation, registration, faucets or replacement flags. No payment, counter, identity or spending baseline was reset. Worker/verifier stay at `11fe204`; relay is `cff34f0`. Both game CI jobs and the security check passed for `19b5451`.

## Refund evidence

Both Arc RPC hosts report market 1 Void at common block 71110279, hash `0x090bb51813029959eda3bf5063989be581ce84cb50bcfa9052a85ffa7a4ebbed`, chain time 6 November 00:07:03 UTC. The public explorer independently indexes:

- [Expiry/void transaction](https://explorer.testnet.arc.io/tx/0x8d29d3f002ea61a475eb1a9528c18b42af5e557fc0e7d426cef2ba07dbe0bda8), 00:03:27 UTC.
- [Spectator 1 refund](https://explorer.testnet.arc.io/tx/0x4c2fc2c1b125385dc27f0780f090af5a6ab7c3211cde4a4cfc9948abf23ef82a), 00:04:12 UTC, block 71109941: 50000 units of the pinned USDC token from MatchMarkets to the retained first spectator.
- [Spectator 2 refund](https://explorer.testnet.arc.io/tx/0xb80b67fe8a1130f85d8a2d6cd273e484de0648347bc03da464225cebdc75e3cd), 00:04:38 UTC, block 71109994: the same 50000-unit refund to the retained second spectator.

Both recipients were compared with the saved public spectator addresses without printing private profiles. The token has six decimals, so each refund is 0.05 test USDC. Explorer transaction status is success and token transfers match. `rpc.testnet.arc.network` additionally proved the first canonical receipt with Claimed and USDC Transfer events at block hash `0xc968ab3041850f9251e4f6e2d2a50855b6e6f14babfae1fb926ce3a1c97252c3`. The second `.network` receipt was verified at 00:14:28.528 UTC with matching Claimed/Transfer logs; its separate canonical block recheck was not performed. The full two-host refund receipt audit and fresh balance reads are partly blocked by HTTP 429/-32005 rate limits; this is not an all-green two-host audit claim.

Automatic idle recovery stores its transaction results in the worker lifecycle journal, not the outbox receipt stream. Consequently these automatic refunds are not promised as rows in the observed-worker-receipt ledger; the public explorer links provide their evidence. Full chain indexing remains out of scope.

An additional SELECT-only Render diagnostic was rejected by automatic approval review because it would create a job using database credentials and export journal-derived data. It was not run or retried through another private-data route. The refund evidence above came from public explorer GETs and permitted public RPC reads only.

## Required audit before another test

- [x] Verify automatic expiry/void and both refund transfers using the evidence above.
- [ ] Complete the remaining canonical two-host refund audit when provider quota permits; do not replay any refund.
- [x] Verify three-service revision `11fe204`, ledger 200 and strict integrity with original history and both prediction receipts preserved.
- [x] Verify relay follow-up `cff34f0` and inclusion of creator/pass receipts. Automatic refund evidence is linked separately because idle recovery does not emit outbox receipts.
- [x] Read ENS admission count: 118/120, at most 2 remained before subsequent cleanup. Keyless SELECT-only job `job-dbn6ifm7bikc73agqpn0` at 6 November 00:57 UTC. Another full table cannot fit; any future allowance change needs a concrete owner handoff. Gas/bankroll capacities still need final review.
- [ ] Prepare a guarded next attempt that preserves every prior payment and recovery marker; the previous one-use table recoveries are consumed. Do not silently reset the current journal or create new funded identities.
- [ ] Complete live cheer/game/payout/creator-claim checks and the independent final audit. Physical motion/multitouch remains owner testing.

Current outcome: all reader/context repairs deployed, ledger coverage/integrity verified, stopped predictions refunded. The fuller canonical refund audit is partly rate-limited; successful hosted game/cheer/payout acceptance remains incomplete. PR #5 remains unmerged.
