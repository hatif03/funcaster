# Web3 implementation progress

## Latest — 6 November 2026

**Deployed and verified:** the owner deployed `11fe204` to worker/verifier/relay, then relay reader follow-up `cff34f0`. The public ledger now returns 200 with 241 journal rows/106 receipts, its original 130-row prefix intact, storage ready and zero dropped/pending entries. Creator registration, the 0.50 test-USDC pass and both 0.05 test-USDC predictions all appear with independent receipt confirmations. No old transaction or journal was replayed/reset; only the durable receipt display was rebuilt.

**Stopped attempt recovered:** the game did not start and the cheer never reached signing. Both Arc RPC hosts confirm market 1 is Void. The public explorer records successful 0.05 test-USDC refunds to each of the two retained spectators at 00:04:12 and00:04:38 UTC. Both refunds also have successful `.network` receipts with matching Claimed/Transfer logs; the first canonical block hash was rechecked. The fuller two-host audit remains partly rate-limited. Refunds are not being withheld from a new test. [Public hashes, exact evidence and limitations](market-read-recovery.md).

**Validation:** `npm run check`: 1,018 passed, one opt-in browser skip; 13 focused ledger/replay tests pass. The preceding 36-check browser/recovery suite and three real PostgreSQL tests passed. Both game CI jobs and the security check pass for `19b5451`. These are the repair/recovery results; the integrated successful game/cheer/payout/creator-claim flow is still incomplete.

**Next work:** prepare the next guarded attempt with the same identities and preserved old payments, and a concrete owner-run ENS allowance update. The last permitted SELECT-only audit at 6 November 00:57:19 UTC recorded 118/120 ENS admissions, leaving at most 2 before later cleanup; no allowance has been increased. A full new table cannot fit that remainder. Review original gas/bankroll capacity and preserve all spending totals before requesting execution. No more deployment or acceptance command is required for this repair. Do not rerun old replacement flags, activation, registration, faucets or expired authorizations.

Draft [PR #5](https://github.com/hatif03/web3-multiplayer-games/pull/5), branch `codex/render-live`, remains unmerged; PR #4 was merged with separate explicit approval. Live URL: https://funcaster.onrender.com.

The dated implementation log below is historical; this section is the current status and next action.

Updated **6 November 2026 (IST), Arc + ENS scope change and parallel G1/G2 implementation**. Work stays on **`web3/integrations`**. **G0 is complete; G1/G2 basic product integration is in progress.** The owner removed Arkiv/Swarm Web3 work and requested focused basic flows. [Current scope and parallel lane status](arc-ens-basic-scope.md) supersedes the older three-track gates and estimates below. Existing ENS/Arc implementation and A4 public acceptance are preserved; new product payments are explicitly MOCK until their own deployment/acceptance.

**Review delivery: open draft [PR #4 — [DO NOT MERGE] Arc + ENS basic console flows](https://github.com/hatif03/web3-multiplayer-games/pull/4)**, `web3/integrations` → `main`. A5/A6 implementation: `9f7bf87`. Historical CI at `2563bbc`: both `games` jobs passed, while GitGuardian reported findings `39737262` / `39737263`. New local evidence is below; new PR CI is separate. No check was bypassed. Never merge into main without separate explicit approval; live service modes remain MOCK/off.

Read [G0 completion](g0-completion.md), [verification log](verification-log.md), [owner checklist](human-setup.md), and [deviations](deviations.md). Completion verifier code: **bf42f5d**. The owner-approved **Rabdi 7794095 / exact SDK 1.0.1** migration supersedes Tiramisu/0.8.1. Resume the first unfinished task; do not repeat completed setup or signed probes.

## Current remaining work and estimate

| Gate | Remaining implementation and acceptance | Rough additional active work |
| --- | --- | --- |
| **G1** | Integrate local Hall/replay exports and receipt ledger; complete integrated public ENS/Arc gameplay later. Arkiv/Swarm production work is removed. | Parallel implementation underway; old estimate retired |
| **G2** | Basic Live hub, predictions/cheers, challenge board and creator commerce implemented in parallel; root integration/browser checks underway. Persistent ENS Champion/Legend minting and new live contracts remain open. | Local software first; owner signing is separate |

The latest owner scope reduction is approved: Arc + ENS only, local storage/exports, focused basic checks. Historical gate tables and dated evidence below retain their original meaning; they do not reinstate Arkiv/Swarm tasks. New live-money paths remain off until explicitly verified.

**Next:** finish integration and focused browser checks for the parallel basic product slice, then record a concrete live handoff. No new owner information blocks local coding. Public signing remains owner-operated; hosting and physical iPhone/Android testing stay deferred. Existing G0/ENS-parent/Arc-deployment/A4 work must not be repeated.

## Task status

**Basic product completion update:** the local G1/G2 product slice is integrated and browser-checked; **874 repository tests** pass. Records/ledger, predictions/cheers, creator passes/earnings, signed challenges and Live UI are usable with `npm run start:basic`. Contracts/adapters are prepared and locally checked. [Evidence and precise remaining implementation](arc-ens-basic-scope.md#verification-and-review-handoff). Live G2 HTTP/worker wiring and public deployment/acceptance remain; Champion issuance also needs parent renewal and a restricted `players` namespace. Nothing was activated or merged.

| Task | Status | Commit / evidence | Remaining |
| --- | --- | --- | --- |
| S0 | DONE | ae5dffb; baseline-check.txt, PRE_EXISTING.md | None |
| S1 | DONE | 53dc99e; tests/web3/config.test.mjs | Live preflight deliberately refuses unverified providers |
| S2 | DONE | c4475a9; tests/party/web3-parity.test.cjs | Live providers disabled; golden fixtures from main 404abb1 |
| S3 | DONE: foundation + ENS/Arc adapters | Outbox/worker-process tests; g1-arc-worker.md | Explicitly gated live ENS/Arc adapters implemented; local config stays MOCK; Arkiv adapter pending |
| S4 | DONE | f64655a; signer/identity tests; foundation-browser.txt | Physical phone testing deferred |
| S5 | DONE | 8a07baf; web3-names tests | Name-entry UI and on-chain handles are later tasks |
| S6 | DONE | 08a6293; router tests; g1-arc-worker.md | Console built at /pot/; bounded keyless live pot reads implemented; public deployment configuration pending |
| E0 / ENS parent | DONE: parent setup | ens-evidence.md; spikes/ens-registration-verified.json | Live party/seat/host enforcement is E3 onward |
| E1 | DONE: production read/discovery prerequisites | 2a6d85f; integrations/ens/; tests/web3/ens-hierarchy.test.mjs; spikes/g1-ens-preflight.json | Consumed by ENS integration and A5; public gameplay acceptance remains open |
| E2 bootstrap / VE-01 | DONE: existing deployment + completed handoff | 9a5cdf1, 2a6d85f; ens-deployment.md; spikes/ens-bootstrap-live.json, ens-bootstrap-verified.json, g1-ens-preflight.json | No more bootstrap execution needed. Warm pool belongs to E3, not E2 |
| E3 | IMPLEMENTED / PASS-LOCAL | g1-ens-integration.md; typed jobs, background refill, public creation references | Owner-run public acceptance pending |
| E4 | IMPLEMENTED / PASS-LOCAL | Bound-phone mint/release, replacement-seat and stale-receipt tests | Owner-run public acceptance pending |
| E5 / E6 | IMPLEMENTED / PASS-LOCAL | Scoped grants/revokes; fresh canonical authority and event invalidation; batched records, log history, join by name and pot-roster reader; browser evidence | A5 now consumes the roster; public receipt book remains open |
| A1 | DONE: login + app creation + source export | 9a5cdf1; arc-ai-use.md; integrations/arc/g0-console/ | G0 diagnostic preserved; same Studio app completed ConditionalPot and console |
| A2 | PUBLIC DEPLOYMENT AND SCRIPTED POT FLOWS VERIFIED | a4e13e8; g1-arc-contract-console.md; 177 Foundry tests; g1-arc-worker-public.md and two-host audit | Actual phone/gameplay and console wallet acceptance remain A5–A7; no new contract deployment needed |
| A3 | CANONICAL HELPERS + WORKER CONSUMPTION / PASS-LOCAL | a4e13e8; g1-arc-worker.md; real signatures/domain/token checks and 273 payout comparisons | Phone signer consumption implemented in A5/A6; public gameplay acceptance remains open |
| A4 | DONE / PUBLIC SCRIPTED ACCEPTANCE VERIFIED | c476fa6, 917ced6, 6956166, a495b78, 6b7e5ac; verifier c0ff87f; g1-arc-worker-public.md; 831 root tests, 22 fork checks, 12 public checkpoints, 54 two-host receipts and eight paid terminal pots | None for A4. A5/A6 gameplay and product Ledger/hosted acceptance remain separate |
| A5/A6 | IMPLEMENTED / PASS-LOCAL | `9f7bf87`; g1-arc-gameplay.md; 837 root tests; six focused integration tests; two Chromium phones, actual verified Star Catch, MOCK funding/settlement/claims | Integrated public testnet gameplay and physical-phone acceptance remain open; exhaustive failure matrix intentionally deferred per owner |
| A7 | IMPLEMENTED / PASS-LOCAL | 7a49422; Pot/Create/About, 219 console tests, 88 fixture-browser cases and 12 actual compiled-route cases | Public deployment configuration and real-wallet/testnet acceptance |
| A0 / VA-01, VA-12 | PASS for G0 primitives | arc-owner-verified.json; arc-eurc-owner-verified.json; refreshed arc-readonly.json; arc-native.json | Every future product flow repeats its own floor tests; Memo transaction receipt is VA-07/P1 |
| K0 / VK-01–10 | COMPLETE HISTORICAL EVIDENCE / PRODUCTION TRACK RETIRED | 121 final canonical receipts, six phase-one receipts; rabdi-final-verified.json; arkiv-costs.md | No production Arkiv work or further funding required |
| VK-15 / VK-16 | HISTORICAL FALLBACK / PRODUCTION TRACK RETIRED | swarm-keeper.json | Swarm keeper/upload implementation removed by owner; local exports replace this dependency |
| VX-08 | PASS | cross-verified.json; cross-verified-at-completion.json; g0-hall-browser.json | Final product builds must be measured again |
| G1: Arc + ENS / local records | BASIC SOFTWARE INTEGRATED; PUBLIC GAMEPLAY OPEN | arc-ens-basic-scope.md; local-records README; offline export/replay and two-host receipt tests | Integrated public ENS/Arc gameplay and console acceptance; Memo remains off; full historical ledger indexing deferred |
| G2 basic product | LOCAL FLOWS INTEGRATED / PASS-LOCAL; LIVE PORTS LOCALLY CHECKED | arc-ens-basic-scope.md; 874 repository tests, Solidity checks and browser/localhost EVM evidence | Live HTTP/worker wiring, new contract deployment/public acceptance, Champion namespace/renewal + issuance wiring; G3–G5 depth remains later |
| G3–G5 | NOT STARTED | Guide 22 gate order | Trust/rankings, depth and polish after earlier gates |
| SL17 / HTTPS staging | OWNER-DEFERRED | operations/platform-apps.md; operations/staging.md | Owner accounts/applicant details and hosting account/domain/budget; Vercel tentative |

## G1 first milestone — 6 November

- **E1:** read-only ENS module discovers the hierarchy at one fresh block, validates proxy implementations/canonical names/backlinks/ownership/expiry and rejects fake or missing subtrees. It checks the block hash again and never caches token IDs across walks. Denial and RPC unavailability remain distinct.
- **Live check:** Sepolia block 12074622, 11:22:46 IST. Six protocol addresses match the official deployment page; parent/play registry and resolver roles pass. Only public configuration was loaded. No signing or broadcast method is available through this reader.
- **E2:** consolidated existing owner-executed bootstrap receipts and deployment provenance in ens-deployment.md. The earlier table mistakenly assigned warm-pool behavior to E2; guide 06 assigns it to E3.
- **Validation:** 27 new E1 tests; **653 root tests** (313 unit + 114 party + 168 OS + 58 Web3), including both parity gates, pass. Formatting passes. Logs: g1-ens-check.txt and g1-ens-format.txt. No UI changes in this chunk, so no new browser/physical-phone acceptance claim.
- **Deviation:** ensjs 5.2.7 does not expose RootRegistry; use the pinned official artifact and verify it through UniversalHelper plus the current docs. The exact SDK has an isolated package/lockfile and explicit install command; root package-lock.json stays untouched. Full product preflight remains closed while this separate namespace-only preflight is available.
- **Open questions:** none for E3 implementation. Owner-side public signing will be needed for a later concrete live flow under the existing automatic approval-review restriction; no new command is ready or requested now.

## G1 E3/E4 engine milestone — 6 November

- **Implementation (`3dc111d`):** serialized/durable warm pool and party lifecycle; unique resolver per party; chain-time expiry; phone-owned soulbound seat mint/release with address/appearance records; nickname collisions and reserved labels. The separate transaction port verifies signed intent, budgets, nonces and canonical receipts and never resends an uncertain submission.
- **Actual contract rehearsal:** 11 checks pass on a disposable local fork of Sepolia block **12074808**, recorded at **12:00:37 IST**. Warm pool/open, restart, unique pair consumption, seat resolve, seat write/transfer denial, release/reuse, external-revocation cleanup, end and expiry. The 23 transactions and hashes are **local only**; denial checks are eth_call reverts, not public transaction receipts.
- **Regression:** **38 new tests**, **691 root tests** (313 unit + 114 party + 168 OS + 96 Web3), both partner-off parity gates, formatting and diff checks pass. The final startup-lock regression also confirms invalid protocol configuration cannot strand the lock. Evidence: g1-ens-lifecycle-check.txt and g1-ens-lifecycle-format.txt. Changed public files were compared against local credentials without printing values.
- **Measured corrections:** warm open takes three transactions (set parent, records, register); cold open takes five. Unregister alone leaves seat addr resolvable through the party resolver, so release clears records even after an external revoke. Canonical registry/expiry checks must precede admission. The original failed assertion and corrected reproducible check are described in g1-ens-lifecycle.md.
- **Not complete yet:** E3/E4 worker/relay integration and live acceptance, E5/E6 and the rest of G1. The current relay still emits foundation placeholder payloads; the worker CLI still refuses live providers. No new UI or real-phone acceptance is claimed. No new owner decision blocks implementation, and no public-signing command is requested yet.

## G1 ENS integration milestone — 6 November

- **E3/E4:** concrete party/seat worker jobs, private binding IDs, typed receipt validation, stale-seat protection, creation transaction references, release/end hooks and refill outside gameplay. Real and mock receipts cannot cross modes.
- **E5:** party-scoped control/kick grants and revokes, canonical phone ownership, five-second cache/watch/live checks, sticky chain denials, explicit RPC-only soft fallback, and phone admin-sheet closure. TV/staff controls retain their existing path. Crash/revoke/delayed-command tests pass.
- **E6:** meaningful changes coalesce for at most two seconds; every match remains a distinct history event. Join validates active names and HTTPS origins; history reads bounded TextUpdated pages via the canonical creation receipt, including after closure. Pot rosters resolve names at one block, check ownership and reject seat replacement. A5 still must consume this reader.
- **Runtime:** ENS-only live worker is implemented behind `--confirm-ens-sepolia`, fresh deployment/namespace preflight and explicit cumulative/per-room/per-hour/fee caps. Configuration was not enabled. It never resends an uncertain transaction.
- **Validation:** **721 root tests** (313 unit + 117 party + 168 OS + 123 Web3), both parity gates, formatting and diff checks. Fork: **21 checks, 30 local transactions**, Sepolia source block **12075026**. Chromium: Players/Invite/Records at 1280×720 and 800×600; phone join at 320×568, 390×844, 844×390; lookup failure/code fallback and revoked-admin closure. Two found UI issues (input contrast, landscape error placement) were fixed. Screenshots and explicit fixture scope are in spikes/g1-ens-browser.json.
- **Unverified:** public ENS execution/book, physical devices, hosted origin, real Arc pot-roster consumption and independent Ledger badges. No public transaction or deployment was performed. [Handoff and deviations](g1-ens-integration.md).

## G1 Arc contract and console milestone — 6 November

- Studio generation and audit completed; strict public source export and SHA-256 provenance recorded. Canonical terms binding, full uint256 stake bounds and overflow-safe allocation are fixed. **177 Foundry tests** pass; all **273** contract-generated payout vectors agree with the relay.
- **A3:** exact canonical terms/domain signatures match actual local bytecode. Fresh pot reads bind configured runtime code, assets, terms and one canonical block; stalled/reorganized RPC reads fail closed.
- **A7:** Pot, Create and About pages with wallet-free reads, full terms review, explicit testnet wallet actions, fresh domain/block/account checks, fee bounds and repeated-click exclusion. Lookup/details collapse to keep actions accessible. **219 console tests**, TypeScript, lint and build pass; **88** Chromium fixture cases and **12** actual compiled-console/router cases pass. Screenshots visually reviewed at phone/desktop sizes.
- **Actual Arc fork:** source block 70998665; **17 checks / 54 local transactions** against both actual token implementations, including gasless funding, floors, last-seat lock, exact settlement, isolated blocked claims and complete refunds. Public broadcasts: none.
- **Regression:** **752 root tests** (313 unit + 117 party + 168 OS + 154 Web3), both parity gates. Root lockfile, certificate script, games/core/sdk/public are unchanged in this chunk. The unbuilt-console test now uses a temporary root so it does not depend on an existing local dist.
- **Open:** public deployment/receipt book, A4 worker and A5/A6 gameplay/phone wiring. Pot-id squatting is an availability finding retained from Studio: A4 must reconcile identical existing terms and fail closed on conflicting ones, with fresh terms/acceptance for any replacement id. The generic permissionless contract interface is retained per plan. No new owner decision blocks coding. [Full handoff](g1-arc-contract-console.md).

## G1 A4 worker milestone — 6 November

- Full typed pot/drip worker, separate durable signer journals, explicit activation/budgets, fresh code/domain/token preflight, exact canonical readback and bounded log retries implemented. Conflicting pot IDs fail closed; unchanged IDs/terms survive retries.
- Deadlines, contests and proposals recover without a relay; pull claims isolate blocked recipients. Canonically mined reverts are charged without poisoning unrelated claims; uncertain sends still stop further sends from that signer. Drips cannot reset across rooms/restarts or through lowered configuration caps.
- **814 repository tests** pass (313 unit + 117 party + 168 OS + 216 Web3), including both partner-off parity gates. The local actual-contract worker scenario passes 19 checks / 54 worker transactions plus one deployment and covers USDC/EURC cooperative settlement, partial refunds, contests/finalization, post-effect restart, real blocklist isolation and a complete no-send rerun. [Full evidence and commands](g1-arc-worker.md).
- Live service activation remains off. The owner-signed public deployment and oracle funding are independently verified on both hosts. One public bankroll drip is also confirmed; the acceptance wrapper was repaired to allow worker backoff after its immediate proof check. The remaining public worker scenario is pending in the same volume. The contradictory Studio prompt is retired in favor of the tested local owner deployment runner. A5/A6 consumers and N3/L2 Memo remain open.

## G0 final evidence (historical completion)

- **Rabdi:** all 121 final receipts independently reverified. 2,002 rows classify as 2,000 trusted, one unknown creator and one invalid payload. Ten actual cost cases, permissions, atomicity, ordered operations and sampled expiry/extension behavior pass. Final gas 0.336958006 tGLM plus 0.02 top-up is below the 2-tGLM ceiling.
- **Performance fallback:** full walks took 7.08–10.87 seconds, exceeding the five-second target. Tested bucket + stale-cache fallback is required; 100-row query 0.91 seconds, 5,000-row CPU sort 2.04 ms. This is a latest-state walk, not a snapshot or rate guarantee.
- **ENS/SDK:** play.funcaster.eth resolves to the console address, and that same process created the matching Arkiv fixture. Canonical receipt/exact calldata reverified after its one-hour lease expired; original successful typed readback preserved. No new fixture was created to hide expiry.
- **Arc:** USDC and EURC receipts verified through both RPC hosts. EURC gas 0.00296636 USDC; sender retains 0.05 EURC and zero native gas; relayer holds 19.95 EURC. Daily domain/token/contract reads and ENS bootstrap check pass.
- **Software:** 626 root tests (313 unit, 114 party, 168 OS, 31 Web3), 38 isolated tests, formatting and 15 Chromium cases pass. Hall bundle 118,552 bytes gzip; compatibility worker 1,269,865 bytes; foundation worker 23,701 bytes. Studio diagnostic previously passed 56 tests/TypeScript/build and 16 Chromium cases; those are not ConditionalPot contract tests.
- **Limits:** head-only Rabdi balance state, conservative payload/request caps, public RPC availability and free Swarm retention are documented. One repeat read hit DNS failure; a later full verification passed. No agent public-chain signing or deployment occurred.

## Next actions and boundaries

Draft [PR #4](https://github.com/hatif03/web3-multiplayer-games/pull/4) remains open and unmerged. Checks are commit-specific: both `games` jobs passed at `2563bbc`; GitGuardian failed on historical Studio-checksum-manifest findings `39737262` / `39737263`. External triage remains open (see human-setup.md). This documentation update does not imply a new runtime validation or an all-green PR.

1. **Next coding: Arkiv Tier 1/Swarm, then Ledger L1–L4/Memo.** A5/A6 phone/gameplay integration is locally accepted in `9f7bf87`; see g1-arc-gameplay.md. A4 public acceptance is complete and no A4 owner command remains. Integrated public ENS/phone/console acceptance is still pending; no repeat of G0 or A4 is needed.
2. Do not call G1 complete until a real match, independent readback, off-mode parity and failure drills pass. The owner deferred hosting; guide 22's hosted acceptance has not been demonstrated and remains a separate pending gate.
3. Platform app ownership/audits, staging, physical iPhone/Android checks and key backup remain owner tasks. They do not reopen completed G0 network probes.

`PARTNERS` stays mock/off. Live ENS authority/stakes integration, production Arkiv writes, Ledger badges, product Hall and gateway are not enabled. The reviewed testnet contract is deployed; service modes remain MOCK. Keys/env files/private journals stay ignored and local. No games/core/sdk/motion/root-lockfile/certificate-script change in G0 or this G1 milestone.

The earlier interrupted runs and recovery commits (`e860ed8`, `b3ffb94`, `e1d5792`) are preserved in [G0 progress history](g0-progress-history.md). Their pending-command text is obsolete. Foundation commits and earlier regression evidence remain in the task table and dated logs.

> The A4 recovery milestones below are historical. Their pending commands are superseded by the completed public gate recorded at the end and in [g1-arc-worker-public.md](g1-arc-worker-public.md). Do not rerun them.

## A4 public deployment checkpoint — 6 November

The owner deployed the reviewed artifact using the replacement bounded local command. Its immediate verification stopped with `INVALID_PROOF`; the original failed predicate was not recorded. Two-host read-only reconciliation verified the same hash and every admitted field, with no resend, and saved the public deployment pin. Contract `0xe339B15Aa54596B4752923d981DAC30B7A569F82`, creation `0x69d3bbc0f5428c25827e314f83121a4dcef954a69413d754e8b3adf629737448`, block 71010272, gas **0.06359452 test USDC**. Oracle holds 20 test USDC. Keyless live worker preflight passes. Only the owner worker acceptance command remains before independent final readback; do not redeploy. See g1-arc-worker.md and spikes/g1-arc-deployment-public.json.

A4 first public worker attempt: one USDC drip confirmed on both hosts (block 71010928), then the wrapper exposed an absent-receipt-file/backoff bug. The same journal is reconciled; bounded acceptance polling is repaired and regression-tested. Resume the existing volume and keys; public acceptance remains incomplete. No verifier signing or resending occurred. See spikes/g1-arc-worker-recovery.json.

## A4 startup/rate-limit recovery — 6 November

Implementation: `6956166`. The resumed owner run stopped with `UNAVAILABLE` before a second job/send. Its original nested exception was not retained. Read-only reproduction diagnosed RPC -32005 at the balance preflight; retained fixture identity and the already-mined drip both validate. The repair adds read-only rate-limit/transport backoff, removes duplicate startup verification, preserves fail-closed proof checks and never retries send/sign methods. A startup-only mode now validates the actual provider/fixture without polling a worker or signing. Both public hosts pass that check (144 reads, zero sends), and **814 root tests** plus formatting pass. Evidence: g1-arc-worker.md, spikes/g1-arc-worker-startup.json, spikes/g1-arc-worker-recovery.json. **A4 public acceptance remains incomplete:** resume the same owner command/journals, then independently read back its final receipts. No new faucet, key, deployment or product decision is required.

## A4 background recovery checkpoint — 6 November

The owner resume passed both USDC drips and cooperative settlement, then stopped with `ERR_ASSERTION` after the partial refund mined but before background receipt/claim recovery finished. Both hosts confirm refund `0xcd4bc25176ec8aed6628b2caa756a0e63ba506af128e9441eb937530e3643dc8`, block 71015406, gas 0.00121682 test USDC. No additional signing or resend by the agent. Fix `46d1e1e` replaces single-poll assertions with bounded terminal-state/zero-claim waits for every flow; wrong outcomes/proofs still stop. **814 root tests**, formatting, and **20 local checks / 54 worker transactions** pass, including two injected noncanonical readbacks after a mined refund and no-duplicate replay. Independent keyless verifier `c0ff87f` passes its guards and a two-host first-receipt sample. Public A4 remains partial: resume the same owner command/journals, then run the keyless final verifier. No new funding or product decision is needed.

## A4 exact-hash finalization recovery — 6 November

The owner run now has **11/12 public checkpoints**. It stopped at `arc.pot.finalize` with `ACCEPTANCE_RECOVERY_PENDING`. Both hosts cannot find the last hash (`0xc65301ea3be89b42376a8550f58c541b7227a5ed31db1477bbaa8966ee919ae7`) and report latest/pending nonce **52**. Absence does not prove it was never submitted; the worker's no-resend rule remains unchanged. Both-host keyless checking confirms **51 earlier receipts**, seven paid terminal pots, exact deployment and original spending (0.1082002 relayer / 0.00859752 oracle test USDC).

Implementation **`a495b78`**: `scripts/web3-arc-recover-finalize.mjs` provides keyless `--check`, plus explicit owner-only exact-hash one-time recovery followed by the last two claims. No repricing/new nonce/drip/fixture; durable marker prevents automatic repeat dispatch, and original caps still apply. It rejects unrelated jobs and waits for paid claims **and** canonical journal completion. **829 root tests** (313 unit + 117 party + 168 OS + 231 Web3), formatting and **22 local-fork checks / 54 worker transactions** pass. The local fork reproduces this failure and recovers the identical hash once. Evidence: `spikes/g1-arc-finalize-recovery-check.json`, `spikes/g1-arc-finalize-recovery-input.json`, `spikes/g1-arc-worker-rehearsal.json`, `g1-arc-finalize-check.txt`.

**Current owner command supersedes older normal-resume instructions above:** use the recovery command in [g1-arc-worker.md](g1-arc-worker.md#public-acceptance--owner-step-not-completed). Public recovery remains pending; no agent signing/broadcast or service activation. Independent final audit follows owner completion. A5/A6 remain the next coding task; G1 is not complete.

## A4 finalization confirmed; claims pending — 6 November

The owner recovery dispatched the identical saved hash, and it **succeeded at block 71027830** for **0.00184076 test USDC**. Its immediate verification stopped with `INVALID_PROOF`; the failed predicate was not recorded. Both hosts now pass all original receipt checks and show the pot Settled with 1400 and 600 base units claimable. Keyless reconciliation updated only existing receipt/marker metadata under the worker lock, with signing and network writes forbidden. Evidence: `spikes/g1-arc-finalization-confirmed.json`. **52 worker transactions are confirmed; the final two EURC claims and whole-run independent audit remain.**

Implementation **`6b7e5ac`** adds allowlisted failed-check diagnostics and durable post-dispatch failure evidence, with a no-sign/no-send reconciliation regression. No receipt requirement, spending cap or automatic retry policy changed. **831 root tests** (233 Web3), formatting and 28 focused acceptance/recovery tests pass. Logs: `g1-arc-receipt-check.txt`, `g1-arc-receipt-format.txt`, `g1-arc-receipt-tests.txt`. The same owner command can now reconcile finalization and continue its two claims. It does not repeat finalization; keep the marker. Earlier exact-hash dispatch-pending notes are historical. G1 remains open, and A5/A6 remain the next coding task after A4 acceptance.

## A4 public acceptance COMPLETE — 6 November

The owner finished the final two EURC claims. All **12 checkpoints** pass, and the independent keyless verifier (`c0ff87f`) now confirms **54 canonical worker receipts on both RPC hosts** and **eight terminal pots with zero outstanding claims**. All original transaction/fee/nonce checks, deployment and fixture terms, and per-asset bankroll totals agree. Relayer gas **0.11218748** + oracle **0.00859752** = **0.120785 test USDC**, below 0.55; drips are exactly **0.12 USDC + 0.12 EURC**. Separate deployment gas is 0.06359452, so combined gas is **0.18437952** against the original 0.65 combined ceiling.

Evidence: [completion report](g1-arc-worker-public.md), `spikes/g1-arc-worker-public.json`, `spikes/g1-arc-worker-public-verified.json`, `g1-arc-public-audit.txt`, `g1-arc-public-audit-guards.txt`. All four verifier guard tests pass. Existing runtime regression remains **831 root tests**, formatting and both game CI jobs at `115387d`; no runtime code or UI changed in this completion chunk. No new signing or broadcast by the agent. Service env files remain MOCK.

**No A4 human blocker or execution step remains.** Original failures and their uncertainties are preserved in recovery history. The A5/A6 milestone below supersedes this checkpoint's earlier next-step guidance: A5/A6 is now locally accepted, and **Arkiv Tier 1/Swarm followed by Ledger/Memo** is next. Physical-device and hosted acceptance, integrated public ENS/phone/console acceptance and GitGuardian triage remain separate.

## A5/A6 expedited milestone — 6 November

Implemented the phone-to-game-to-worker flow and essential refund/dispute paths. `npm run check` passes 837 tests and both parity gates; actual browser gameplay reaches settlement and both claims in explicit MOCK mode. [Handoff](g1-arc-gameplay.md). No public signing or activation. The next task is Arkiv Tier 1/Swarm, then Ledger L1–L4; G1 and G2 are not closed.
