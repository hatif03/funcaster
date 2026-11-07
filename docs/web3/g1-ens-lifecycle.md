> Historical implementation milestone. Current integrated behavior and remaining tasks are in [architecture](../../ARCHITECTURE.md) and [progress](progress.md); do not execute old activation instructions from this milestone.

# G1 ENS party and seat lifecycle — E3/E4 engine

Historical engine milestone, 6 November 2026 (IST). **Superseded for current status by [ENS integration](g1-ens-integration.md).** Worker-side implementation and local contract verification only. No public ENS transaction was sent, no gameplay provider was enabled, and G1 is not complete. The existing live-worker startup gate remains closed. [Progress](progress.md) is the current task list.

## Implemented

`integrations/ens/lifecycle.mjs` exposes `refill`, `open`, `mint`, `release`, `end` and `close`. It loads no private keys. All writes use an injected transaction port. The default namespace discovery is the E1 canonical reader; the test fixture injects its own discovery explicitly.

- E3: serialized warm pool, unique registry/resolver pairs, durable reservations before side effects, deterministic party labels with collision suffixes, canonical parent links, chain-time expiry capped by the parent, initial party records and readback. An ended party cannot reopen. Used pairs never return to the warm pool.
- E4: one seat per slot/address, nickname sanitization and reserved names, collision suffixes, registration owned by the phone address with `roleBitmap = 0`, no child registry, explicit party resolver and expiry no longer than the party. Mint writes address and appearance together. Release clears address/seat/last-match records before unregistering. It also clears these records if a host already unregistered the seat. A new registration generation cannot be released by an old binding's retry.
- Restart safety: durable operation IDs and payload fingerprints, process locks, 0600 state, and resume checks after proxy deployment, records, registration, release and end. A half-minted seat must reconcile before release; a revoked seat is not automatically recreated.
- `transactions.mjs`: serialized signer port with explicit count, fee and total-cost caps; chain/signer/nonce checks; simulation and gas admission; decoded-signature verification; kill checks; durable hash before broadcast; canonical receipt/calldata reconciliation before any later write. Uncertain or reverted submissions halt further sends. A retry reads the admitted hash and never broadcasts it again. Signed bytes and keys are not persisted.

This transaction port is a library, not an enabled wallet or production worker. It does not load `.env.worker`, decide a spend budget, or grant permission to sign. Its synthetic-signature tests use a public test fixture key offline. The fork rehearsal uses local Anvil impersonation; it does not exercise the production signing port against a public network.

## Evidence and reproduction

- [Contract rehearsal report](spikes/g1-ens-lifecycle-rehearsal.json): disposable chain 31337 forked from Sepolia; `localHash` values exist only on that fork. The source block and actual per-operation gas are recorded. The CAN/CANNOT checks here use `eth_call` and genuine contract reverts; they are **not** public reverting transaction receipts.
- `tests/web3/ens-lifecycle.test.mjs`: lifecycle, collision, expiry, private file mode, restart and release-generation checks, including 200 hostile nickname inputs.
- `tests/web3/ens-transactions.test.mjs`: durable admission, timeout reconciliation, conflicting intents, fee/count/budget limits, tampered receipts/signatures, nonce movement and kill switch.
- [Full check](g1-ens-lifecycle-check.txt), [formatting](g1-ens-lifecycle-format.txt).

Run the offline regression tests:

```sh
node --test tests/web3/ens-lifecycle.test.mjs tests/web3/ens-transactions.test.mjs
npm run check
npm run format:check
```

For the local contract rehearsal, first install the optional ENS SDK with `npm run web3:install-ens`. The script uses the existing G0 Anvil installation under `.tools/g0/node_modules/@foundry-rs/anvil-<platform>-<arch>/bin/anvil` (x64 maps to amd64). Then run:

```sh
node scripts/spikes/ens-lifecycle-rehearse.mjs
```

No env or role-key file is needed. All upstream RPC methods pass through the read-only G0 transport; signing/broadcast/debug methods cannot reach Sepolia. Local mutations require loopback, chain 31337 and an Anvil client. The temporary fork, state and RPC bridge are cleaned up. Missing tools or unavailable public reads fail the rehearsal rather than becoming a pass.

## Spec corrections supported by the rehearsal

1. **Warm open takes three transactions; cold open takes five.** A future room code determines its party name. An unused pair therefore cannot initialize that party's DNS-keyed records or canonical parent in advance. Warm open sets the parent, batches the initial records, then registers. Proxy preparation removes two deployments, not every other write. The plan's one-register/one-block warm-open estimate is not claimed.
2. **Unregister does not erase a resolver's records.** The initial rehearsal found a seat's old address still resolvable after unregister, through the party's inherited resolver. The final script explicitly reproduces this and verifies cleanup. Admission must first check the canonical registry/expiry; a raw address lookup is not a membership proof. On expiry or party end, do not assume every raw Universal Resolver read becomes null: ancestor resolution may apply. The report records the actual expired raw result from this run.
3. **Release needs two transactions when still registered.** The resolver record bundle and registry entry are separate contracts. If already unregistered, cleanup needs only the resolver transaction. Transaction IDs make both restartable; never claim an atomic cross-contract release.

## Still open / next implementation

E3/E4 are not complete end-to-end tasks yet. Connect the engine to the outbox/worker and relay receipt metadata, including the missing `ens.seat.release` job type, bound-phone lifecycle and background refill. Preserve `PARTNERS=off` parity and label mocks. The current relay still emits foundation placeholder payloads; do not point these at a live signer.

Then implement E5 host grant/revoke, five-second canonical authority checks, event invalidation, and the strict/soft distinction without overriding a chain denial. E6 adds record batching/history, join by name and pot-roster reads. Only then prepare a concrete capped owner-run public acceptance flow with independent readback and the CAN/CANNOT receipt book. Public signing remains owner-operated under the earlier automatic approval-review restriction; no owner command is requested by this milestone.

Also pending in G1: Arc A2–A7 ConditionalPot/funding/settlement/console, Ledger L1–L4, one real match, partner failure drills and stop-the-relay proof. Hosting and physical phones remain separately deferred. No UI changed in this engine milestone, so it makes no new browser-layout or real-phone acceptance claim. No new owner decision blocks the next coding step.
