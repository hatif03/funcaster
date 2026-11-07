# Historical final G0 execution instructions

The owner completed this run. See [completion](g0-completion.md); old pending commands below are retained as history, not current instructions.

# Final G0 execution

6 November 2026 (IST). Work stays on `web3/integrations` / draft PR #4. No deployment or merge. The agent can prepare and verify these probes, but the earlier automatic approval review requires the owner to execute public-chain signing/funding.

## Interrupted run: safe resume prepared

The owner's first final run stopped with `InternalRpcError` after `scores 1180`. Independent reconciliation verifies **74 canonical receipts**, **1,200 trusted rows**, no missing/pending nonce, and the current balance. The next batch is `scores 1200`; its unsigned estimate passes. [Recovery evidence](spikes/rabdi-partial-verified.json).

The repaired runner retries only transient reads/estimates (at most four attempts); it never retries a broadcast. Rabdi rejects historical balance reads, so post-send balance checks now use current state bound to the exact admitted nonce/cost. Cost evidence distinguishes owner observations from independent receipt verification. Preserve all journals. Do not restart the dataset or rerun phase one.

The subsequent owner retry stopped before signing on a Node `ConnectTimeoutError`. That exact nested error is now covered by bounded read retries and a regression test. Public nonces remain 80/80 with the same 74 receipts; the full combined unsigned preflight passes. No transaction from that attempt needs resending.

## One command for the remaining owner steps

**EURC funding is done.** The owner completed the Circle faucet and the public check confirms **20 test EURC** at project relayer `0x81DdeD7eE7753791cEaF24Ab6Cb1694d1F39A008`. Do not fund again.

Then run:

```sh
cd /Users/raihankhan/Documents/Projects/web3-multiplayer-games
node scripts/spikes/g0-final-owner.mjs --apply --confirm-testnets
```

The command checks prerequisites, runs the final Rabdi probe, sets `play.funcaster.eth`'s address record to the project console, resolves that name and writes an Arkiv fixture in the same process, then performs the 0.001-EURC sponsored authorization and independent public receipt checks. It stops on a missing prerequisite or uncertain transaction. It does not enable a feature or deploy a product.

Ceilings across restarts: **2 test GLM**, **0.005 SepETH**, **0.2 test USDC gas**, and **0.051 test EURC**. The ENS name remains registered to the existing owner; only the address record is set. EURC goes to the new isolated probe key `0x7a66B9dD5eED3F3fB4B5f82619f8f0A8112CF08E`, which stays at zero native gas. It retains 0.05 EURC after the test. Never fund this probe with native USDC because that would invalidate the zero-gas test.

If you already ran the earlier final-Rabdi command, this combined entry point reconciles its receipts and sends no duplicate fixtures. The completed phase-one probe has its own journal and is not rerun.

The Rabdi part is a **new** probe, separate from the completed phase-one journal. It uses the existing console and second-console keys locally; never paste them. It creates 2,000 synthetic score rows (one-day leases), ten cost fixtures (90 seconds / 30 days / 180 days), flag/atomicity/expiry fixtures and two deliberately untrusted records. It transfers **0.02 test GLM at most** to the existing second test writer if necessary. One deliberately reverting transaction proves batch atomicity. Total gas plus that transfer is capped at **2 test GLM**, across restarts, out of approximately 10 funded test GLM. No real player data is published.

Allow roughly 10–20 minutes depending on RPC response times, including a short expiry observation. Progress is printed per transaction. The journal records each signed hash before sending and reconciles existing receipts before preparing a new nonce. A completed run sends nothing on a rerun. An uncertain transaction stops; it is never automatically resent. If it stops, send the final error line and leave the journal/lock intact for inspection. Do not delete locks or journals to force a retry.

Preflight evidence: `spikes/rabdi-final-plan.json`. Nine cost shapes and the 20-row batch pass unsigned estimation. The SDK-valid 131,072-byte case returns HTTP 413 at the public RPC; its replacement cost sample is 32,000 bytes. The later worst-column check lowers the application cap to 120,000 bytes plus a 256,000-byte serialized-request budget; larger data goes to Swarm. These caps are for the future adapter; the diagnostic deliberately tests larger boundary cases. The 129,000-byte case is deliberately tested to correct the old plan's claimed boundary.

Local checks currently pass 35 isolated tests: admission/budget/nonce bindings, no-key unsigned encoding, creator/payload validation, bounded page continuation, cache recovery and keeper failure handling. These are **not** substitutes for the live receipts.

## Other remaining evidence

- EURC faucet funding: **DONE**, 20 test EURC verified. Live sponsored EURC authorization remains in the combined command; USDC funding and authorization already passed.
- ENS address update: unsigned plan passes; local fork resolves the resulting address correctly and confirms public state stayed unchanged. Both artifacts have the same calldata hash. G0 Hall/worker builds pass, with a 118,552-byte gzip browser bundle and 15 browser cases. Live same-process resolution/write still awaits the owner command; null resolution is not a pass.
- Swarm's original retention cohort reaches seven days on 6 November. The plan allows the explicitly labelled gateway/keeper fallback; no paid postage is authorized and no permanent-storage claim is made.
- HTTPS staging remains owner-deferred. Engineering spike evidence must not be presented as hosted acceptance or a live G1 product.

## Agent follow-up (no owner action)

After successful owner execution, inspect/re-run `scripts/spikes/rabdi/final-verify.mjs` and `scripts/spikes/arc-verify-owner.mjs EURC`, and verify the ENS receipt/name independently. Publish `arkiv-costs.md` from the ten receipt costs, reconcile all G0 rows in `verification-log.md`, and update `plan.md`/`progress.md`. Never mark G0 passed merely because this runner exists. Score fixtures have one-day leases; verify promptly and preserve observations instead of silently recreating expired data.

Prepared individual commands for diagnosis (normally use the combined entry point above):

```sh
node scripts/spikes/rabdi/final-runner.mjs --apply --confirm-network rabdi-g0-final
node scripts/spikes/rabdi/cross-owner.mjs --apply --confirm-name play.funcaster.eth
node scripts/spikes/arc-eurc-owner.mjs --apply --confirm-network arc-testnet-EURC
```
