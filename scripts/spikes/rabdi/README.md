# Rabdi K0 (isolated, not a production adapter)

Owner-approved pins: Arkiv SDK 1.0.1, viem 2.57.14, ensjs 5.2.7; Rabdi 7794095. Install with `npm ci --prefix scripts/spikes/rabdi --ignore-scripts` from the repository root. Root dependencies are unchanged.

- `node --test scripts/spikes/rabdi/*.test.mjs`: offline guards, no valid signatures or sends.
- `node scripts/spikes/rabdi/check.mjs`: anonymous three-chain reads.
- `node scripts/spikes/rabdi/owner-probe.mjs --check`: public reads and unsigned preparation/estimate, no secrets.
- `node scripts/spikes/rabdi/verify.mjs`: independently check owner phase-one receipts and live fixtures (one-hour leases).
- `node tests/web3/rabdi-browser.e2e.mjs`: real local-origin browser reads and bundle measurement.

The owner already completed `owner-probe.mjs --apply --confirm-network rabdi-k0`. It caps aggregate gas at 0.5 tGLM, signs only exact prepared calldata, checks current nonce, locks the signer, durably journals hash before send, and refuses uncertain retries. A completed rerun reconciles receipts without new writes. Do not delete the journal or imply natural fixture expiry is a failed transaction. This phase does not complete G0; remaining tests are in docs/web3/progress.md.


## Final G0 matrix

See [the combined owner handoff](../../../docs/web3/g0-final-handoff.md). `final-runner.mjs` defaults to read-only estimates; its owner `--apply --confirm-network rabdi-g0-final` mode covers costs, limits, readonly transfer, atomic failure/ordered success, 2,000 scores, provenance/payload forgery, and expiry. It has a separate journal and a persistent 2-test-GLM ceiling including the optional 0.02 second-writer top-up. One named transaction is expected to revert; all other failures stop. `final-verify.mjs` independently checks public receipts and the one-day score dataset. The old one-hour fixtures are not recreated on expiry.

`cross-owner.mjs` is owner-only for real writes. It uses the same pinned package to resolve the ENS v2 address and write one Arkiv fixture; `cross-rehearse.mjs` instead uses a disposable localhost fork with no real key. The read failover rejects mutation methods. `hall.html`/`hall-browser.mjs`/`hall-reader.mjs` form the G0 compatibility UI, tested by `tests/web3/g0-hall.e2e.mjs`; this is not the product Hall. `rate-probe.mjs` stops after at most 32 small reads or the first error and never claims that an unobserved throttle does not exist.

Run `npm test --prefix scripts/spikes/rabdi` for all 23 offline tests. Public-network results and the exact remaining owner actions are in `docs/web3/progress.md`. Never run an owner `--apply` command as the agent: the earlier automatic approval review requires human signing/funding.

## Recovery after an interrupted owner run

`partial-reconcile.mjs` independently checks admitted receipts, the contiguous seeded score rows, current nonces/balance and the next unsigned estimate without a key. It is for a stop during seeding; use `final-verify.mjs` after completion. `security-verify.mjs` reads surviving cost/readonly/atomicity fixtures; run before their leases expire and preserve its report. Neither command recreates expired records.

Rabdi balance state is head-only. `balance-observation.mjs` binds current balance to the last admitted nonce and exact receipt cost/value. Historical deltas remain explicitly labelled owner observations. `read-retry.mjs` retries only transient allowlisted reads/simulations, with bounded backoff; broadcasts, contract reverts, validation, 413 and head-only errors never retry. Resume through the combined owner command documented in `docs/web3/g0-final-handoff.md` without deleting journals or locks.
