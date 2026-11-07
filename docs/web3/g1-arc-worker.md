> Historical implementation milestone. Current integrated behavior and remaining tasks are in [architecture](../../ARCHITECTURE.md) and [progress](progress.md); do not execute old activation instructions from this milestone.

# A4 Arc worker integration — 6 November 2026

**A4 implementation, local end-to-end acceptance and public scripted testnet acceptance are complete. The independent two-host audit passes all 54 worker transactions and eight paid terminal pots. G1 is not complete.** Work stays on `web3/integrations` and draft PR #4; no main merge, deployment, service activation or public transaction was performed by the coding agent. `.env.relay` and `.env.worker` remain MOCK.

Implementation: `c476fa6`. Rehearsal and owner acceptance tools: `917ced6`. Final checks: [repository tests](g1-arc-receipt-check.txt), [formatting](g1-arc-receipt-format.txt), [22-check worker rehearsal](spikes/g1-arc-worker-rehearsal.json).

Owner deployment and resumable acceptance repairs: `e607720`. Read-only RPC retry/startup diagnostics: `6956166`. Independent verifier: `c0ff87f`. Background recovery checkpoints: `46d1e1e`. Exact-hash owner recovery: `a495b78`. Receipt diagnostics/reconciliation: `6b7e5ac`. The reviewed deployment and all 12 public worker checkpoints are independently verified. No A4 owner command remains.

## Implemented boundary

- The separate worker handles `arc.pot.create`, `fund`, `settle`, `propose`, `contest`, `finalize`, `claim`, `refund`, and `arc.drip`. Every job has a bounded, explicit schema; signatures and private device/IP hashes stay out of receipts. Receipt observations carry a canonical block and `chainVerified: false`. The independent Ledger badge remains L3's responsibility.
- `reservePotIntent` persists an unpredictable pot ID and canonical terms before acceptance. Metadata binds the game/version/bundle and ordered player slots. Existing identical pots reconcile; conflicting terms stop the attempt. Replacing an ID requires a new attempt and new signatures. This bounds pot-ID squatting's consequences; it does **not** eliminate front-running denial of service in the generic permissionless contract.
- Fresh code-hash, asset allowlist, EIP-712 domain, canonical terms, funding bitmap and claimable checks surround chain work. Funding verifies both signatures, the exact token domain/nonce/window, retained 0.05 balance and unused authorization. Cooperative signatures must match every frozen seat. Oracle results must be canonical, completed and relay-verified, match the frozen context/placing, wait 60 seconds after result completion and satisfy the contract's minimum play time. This is the bounded relay-oracle trust model, not independent replay verification.
- Relayer and proposal-only oracle use separate durable nonce/fee journals. Fees are at least 20 gwei with zero priority fee, under explicit lifetime gas/count and room/hour caps. Prepared hashes are persisted before broadcast. Uncertain sends block further sends from that signer; nothing automatically resends them. A **canonically mined revert** is charged and never resent under the same admission, while other recipients can proceed.
- Per-asset drips persist reservations before sending and enforce lifetime/device/address/IP-hour/room caps across restarts. Lowering limits cannot reset previously admitted spending. USDC transfers reserve both the token debit's native equivalent and the gas/retained floor; those two balance representations are never added together as money.
- Background recovery watches registered pots after the relay disappears: funding/settlement expiry or a contest triggers refund; a surviving oracle proposal is finalized using its canonical `Proposed` event reveal. Settlement/refund immediately attempts independent pull claims. A blocked recipient remains claimable while others receive payment; later recovery retries pre-send failures. A previously mined reverted claim is retained for explicit inspection/new admission.
- Arc job backoff no longer starves another pot's recovery. Nonce admission remains serialized. Log reads use inclusive ranges of at most 9,999 blocks and bounded `-32014` retries with smaller ranges.
- `GET /api/web3/pot/:potId` now has a keyless live reader, bounded concurrency/rate, exact integer serialization and plain unavailable/not-found responses. No RPC or filesystem work was added to gameplay `view`, `finish`, ticks or broadcasts. No game, motion, SDK, public UI, root lockfile or certificate-script edits.

## Activation and preflight

`npm run web3:preflight` now calls the keyless Arc deployment preflight when Arc is explicitly on. `npm run web3:preflight -- --mock` remains offline. `npm run web3:preflight:arc` is the dedicated command. It checks every configured RPC endpoint, token domains/decimals/pause state, worker-role balances, constants, exact local/on-chain terms encoding and an **unsigned** create simulation/estimate. A deterministic wrong-chain/code/domain response cannot be hidden by another endpoint.

Live activation requires `PARTNERS=on`, `WEB3_ARC=on`, `--confirm-arc-testnet`, public deployment pins, separate public role addresses matching worker-only keys, and explicit limits. `ARC_MEMO=off` is required: N3/L2 Memo indexing is a separate unfinished task, so an `on` setting is rejected rather than silently ignored. No values were applied to the owner's service env files.

New names are documented without values in `.env.example`: `ARC_POT_CODE_HASH`, `ARC_POT_DEPLOY_BLOCK`, `ARC_EURC`, role addresses, per-role gas budgets, transaction/fee caps and per-asset bankroll/lifetime drip budgets. Production values remain operator choices. The preflight's 60-second minimum-play term is an unsigned diagnostic fixture, not a production default.

## Verification and reproduction

- **831 repository tests pass:** 313 unit, 117 party, 168 OS, 233 Web3, including both partner-off parity gates. New tests cover real signatures, typed receipts, outbox/post-effect restarts, intent conflicts, duplicate drips, balance floors, contract/domain checks, log chunking, stale reads, independent payouts, refunds, proposals/contests/finalization, timing, kill switches, HTTP failures, explicit activation and owner-command guards.
- The actual Arc-fork worker rehearsal uses the exported ConditionalPot, actual USDC/EURC implementations, real signatures, real file outbox, both production transaction journals and lifecycle recovery. The rehearsal passes **22 checks**, covering one bounded local deployment and **54 worker transactions** (50 relayer, 4 oracle): four paths per token, actual blocked-recipient isolation, a post-effect restart and a full scenario rerun without new sends from either role. See [machine-readable evidence](spikes/g1-arc-worker-rehearsal.json). All mutations are guarded to loopback Anvil chain 31337; public Arc is only a read source. EURC seats have zero native gas. Test keys are ephemeral, and all pot balances finish at zero.
- Its saved result fixtures are deliberately synthetic canonical relay results. They test the worker boundary, **not** A5/A6 gameplay, real phones, hosted play or an independently verified Ledger.
- Both GitHub `games` jobs passed at `115387d`. GitGuardian still reports findings **39737262 / 39737263** from older commit `a4e13e8`, both in `integrations/arc/studio/G1-EXPORT.json`. That file is unchanged by A4 and contains public app/thread IDs, date/scope and 79 SHA-256 export checksums only; no worker key matched any changed file. These checksum-manifest findings need external GitGuardian triage. No scanner ignore rule, security-check override or history rewrite was added. The PR's security status remains failed until that triage is resolved.
- The first fork run exposed the harness's virtual clock not following later mined blocks after a time jump. The local adapter was repaired; production future/stale tolerances were not weakened. Readback refused the stale/future proof and the existing transaction journal retained the mined send.

```sh
npm run check
npm run format:check
node scripts/spikes/arc-worker-rehearse.mjs
```

The fork command requires the existing `.tools/arc-foundry/anvil` and compiled artifact under `integrations/arc/onchain/contracts/out/`. Build the contract using its README if needed. It never loads `.env.worker` or a role key. On failure it preserves a private temporary journal and does not automatically resend. On success it removes the disposable volume and stops its own simulator.

- The full rerun exposed excessive historical reconciliation for already-paid pots. Recovery still reads fresh pot state, but skips redundant claim-journal walks only after all claims and their evidence are complete. Journal reconciliation now persists changed receipt metadata once per pass. Restart and unavailable-event-proof regressions pass.
- One later fresh-fork run stopped on `InternalRpcError` after the first blocked-recipient check. Its original cause was not available in that RPC response; no resend was attempted. Bounded simulator diagnostics were added, and the final complete rehearsal passed. This is not a claim that public RPC outages are solved.

<a id="public-acceptance--owner-step-not-completed"></a>

## Public acceptance — complete

**All 12 owner-run checkpoints and the independent keyless audit pass.** Both RPC hosts confirm all **54 worker transactions** (50 relayer, four oracle), all eight terminal pots and **zero outstanding claims**. The exact deployment, canonical blocks/receipts, original transaction intent and fees, expected fixture terms and asset-specific drips agree. [Completion report](g1-arc-worker-public.md), [owner report](spikes/g1-arc-worker-public.json), [independent audit](spikes/g1-arc-worker-public-verified.json).

Worker gas: **0.11218748 test USDC relayer + 0.00859752 oracle = 0.120785 total**, within the 0.55 cap. Drips total **0.12 test USDC and 0.12 test EURC**. The separately verified deployment cost **0.06359452 test USDC**. Every original ceiling held.

No further A4 owner action is needed. Preserve the existing journals/fixture keys; do not redeploy or replay recovery. The read-only audit can be reproduced without an env file:

```sh
node scripts/web3-arc-verify-acceptance.mjs
```

The gate covers scripted worker flows with synthetic relay-result fixtures. A5/A6 gameplay/phone integration, independent product Ledger badges and hosted/physical acceptance remain separate. Service env files stay MOCK. No public signing or broadcast was performed by the coding agent.

Earlier failure investigations and superseded execution commands are retained in [the recovery history](g1-arc-worker-recovery-history.md). Public RPC availability is not guaranteed; unknown original proof failures remain recorded as unknown, and automatic sends were never retried.

## Next handoff

**A5/A6 implementation is now locally accepted** (`9f7bf87`): fresh roster/start gates, phone consent, five-second agreement/dispute, join drips, refunds and claims. Two browser phones completed an actual verified game using MOCK chain effects; 837 root tests pass. See [gameplay handoff](g1-arc-gameplay.md). **Next coding: then Ledger L1–L4/Memo.** Integrated public ENS/phone/console acceptance, physical devices and hosting remain separate. No product decision blocks the next coding step.
