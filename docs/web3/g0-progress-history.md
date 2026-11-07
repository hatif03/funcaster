# Historical G0 progress before completion

Superseded by [current progress](progress.md) and [G0 completion](g0-completion.md). Pending owner commands below are historical and must not be repeated for this completed run.

# Web3 implementation progress

Updated **6 November 2026 (IST)**. Base: `main` at `404abb1`; fetched this session with no newer main commits. Branch: **web3/integrations**, draft review-only [PR #4](https://github.com/hatif03/web3-multiplayer-games/pull/4). **Never merge into main. G0 is partial; G1 has not started.**

Read this file first when resuming. Follow the [master prompt](../plans/web3/build-guide/26-codex-master-prompt-and-handoff.md), [verification log](verification-log.md), [owner checklist](human-setup.md) and [deviations](deviations.md). The owner approved **Rabdi 7794095 / exact Arkiv SDK 1.0.1**; the old Tiramisu/0.8.1 instructions are superseded by [the migration](rabdi-migration.md).

| Task | Status | Commit / evidence | Remaining |
| --- | --- | --- | --- |
| S0 | DONE | ae5dffb; baseline-check.txt, PRE_EXISTING.md | None |
| S1 | DONE | 53dc99e; tests/web3/config.test.mjs | Live preflight deliberately refuses unverified providers |
| S2 | DONE | c4475a9; tests/party/web3-parity.test.cjs | Live providers disabled; golden fixtures from main 404abb1 |
| S3 | DONE | 379bc65; outbox/worker-process tests | Real adapter transaction reconciliation is later work |
| S4 | DONE | f64655a; signer/identity tests; foundation-browser.txt | Physical phone testing deferred |
| S5 | DONE | 8a07baf; web3-names tests | Name-entry UI and on-chain handles are later tasks |
| S6 | DONE | 08a6293; router tests | Real pot APIs remain unavailable until A2/A7 |
| E0 / ENS parent | DONE: parent setup | ens-evidence.md; spikes/ens-registration-verified.json | Live party/seat/host enforcement is E3 onward |
| E2 bootstrap subset / VE-01 | DONE: owner executed, independently verified 6 November | 9a5cdf1; spikes/ens-bootstrap-live.json, ens-bootstrap-verified.json; 3 guard tests | Parent + play registries/resolver/root roles exist. This does not complete all E2 warm-pool/party behavior |
| A0 / VA-01, VA-12 | PARTIAL | arc-evidence.md; arc-owner-live.json, arc-owner-verified.json, refreshed arc-native.json | Live USDC authorization/floor verified on two RPC hosts. Live EURC remains; Memo (VA-07) and per-product-flow checks are later gates, not prerequisites for unbuilt G1 flows |
| A1 | DONE: login + app creation + source export | 9a5cdf1; arc-ai-use.md; integrations/arc/g0-console/ | G0 read-only diagnostic only; ConditionalPot is not built/deployed |
| K0 | PARTIAL — 74 FINAL RECEIPTS RECONCILED | spikes/rabdi-partial-verified.json; arkiv-costs.md | Ten cost cases and readonly/atomicity checks executed; 1,200 rows independently read. Remaining 800 scores, full-board/forgery/expiry checks require owner resume. 9.788699744 tGLM remains before resume |
| VK-15 / VK-16 Swarm | G0 FALLBACK RECORDED AND TESTED | spikes/swarm-keeper.json; scripts/spikes/swarm-keeper.mjs | New synthetic blob re-upload returns identical reference/hash; original cohort untouched. Seven-day observation pending 6 November; no paid stamp or permanence claim. Production keeper wiring is K1 work |
| VX-08 | BUILDS PASS; LIVE CROSS-WRITE PENDING | spikes/g0-hall-browser.json; cross-owner-plan.json | One viem 2.57.14; G0 Hall 118,552 bytes gzip and both worker builds pass. Real ENS address record + same-process Arkiv write awaits owner; final product builds must be remeasured |
| G1: E3–E6, A2–A5, K1–K3/K6/K7, L1–L4 | NOT STARTED | Gate order in guide 22 | First close G0 checks or record the specified fallbacks; then one real match on all three tracks |
| SL17 | BLOCKED-HUMAN, owner deferred | operations/platform-apps.md | Accounts, applicant identity, HTTPS callback origin, owner submissions |
| HTTPS staging | BLOCKED-HUMAN, owner deferred | operations/staging.md | Hosting account/domain/budget; Vercel tentative |

## Current evidence and software checks

- ENS: seven live bootstrap receipts match canonical blocks through PublicNode and thirdweb. Pinned factory implementations, registrar root roles and canonical parent links pass. A fresh check plans zero writes. `play.funcaster.eth` has a resolver but no game address records yet.
- Arc: owner sent 0.051 test USDC to the developer probe, then sponsored 0.001 back through `receiveWithAuthorization`. Both receipts and exact token-emitter transfers independently match across two RPC hosts. Sender retained 0.05; relayer afterward **19.946771 test USDC**; total gas **0.00322892 USDC**. EURC faucet is now complete: 20 test EURC verified; authorization remains pending.
- Arc Studio: app `3e018243-4be8-4b94-a488-1f69c9401fae` created through Dia; no deployments. Cleanup removed telemetry/template extras. Exported diagnostic passes **56 tests, TypeScript and production build**. Real Chromium: **16 cases**, four viewports (320×568, 390×844, 844×390, 1280×720) across live reads, wrong chain, RPC failure and large balances; no overflow/page errors/mutating RPC. Desktop and phone screenshots visually inspected. These are diagnostic tests, not the required 40 ConditionalPot contract tests.
- Rabdi: console `0xE581E56c592Ab9D6d3D234168EE9a89032273c00` received **10 tGLM**; read at block 263664. Isolated exact-version SDK package; **12 phase-one offline schema/unsigned-capture/spend/journal tests passed**. Single create unsigned estimate: 248,754 gas at the observation, with a 1,000,000-gas cap and 0.001 tGLM maximum fee. Actual fees are measured from receipts, not this estimate.
- Earlier full repository regression: **625 tests passed** (313 unit, 114 party, 168 OS, 30 Web3); formatting passes. Logs: g0-nov6-check.txt and g0-nov6-format.txt. The isolated Rabdi package adds 12 passing tests; the Studio package adds 56. No games/core/sdk/phone behavior or root lockfile changes.
- Rabdi phase 1: six canonical receipts, eight complete surviving rows, expected owner deletion, immutable creator, new owner and 24 indexed type/operator queries independently verified. Total gas **0.00238213 tGLM**; remaining **9.99761787**. Anonymous browser reads pass at 320×568 and 1280×720; minimal reader **116,659 bytes gzip**. These are one-provider public checks, not the future two-provider Ledger badge or final Hall build.

## Final G0 pass — 6 November follow-up

The earlier turn stopped after phase one; that was incomplete execution of the requested test matrix, not missing platform accounts. The remaining software is now concrete in [g0-final-handoff.md](g0-final-handoff.md).

- Rabdi final runner defaults to unsigned reads, uses a separate durable journal, refuses uncertain retries, caps aggregate gas plus the second-writer transfer at 2 test GLM, and prepares 2,000 synthetic scores plus the cost/security/expiry matrix. **No final public writes have been executed by the agent.**
- Unsigned live estimates pass for 1/64/128/129 KB and 31 user-column cases. At 131,072 bytes the SDK accepts the value but the public RPC returns **HTTP 413 / BAD_REQUEST**. A second worst-column check rejects 128,000 bytes with 31 columns (269,251-byte RPC body), while 120,000 bytes passes (253,251-byte body). Use a 120,000-byte payload ceiling and a 256,000-byte serialized request ceiling; oversized records/batches go to Swarm or are split before signing. The replacement 32 KB cost case estimates at 1,329,368 gas. Exact SDK boundary errors are reproducible.
- A bounded anonymous probe completed 32 queries, reaching about 25.4 successful queries/second in the eight-concurrent-request sample without 429. This is a lower bound within the safety ceiling, **not** the service's guaranteed limit. The funded 2,000-row walk still awaits owner execution. Cache/bucket fallback code and tests exist.
- Swarm keeper prototype passes real upload/read/re-upload with the same reference/hash, with a single injected missing-read response. It refuses hash substitution and does not upload on 429/5xx. The original retention cohort was not refreshed. The production worker must run the keeper before making its corresponding availability claim.
- G0 Hall prototype: **118,552 bytes gzip**, 15 state/layout cases across 320×568, 390×844 and 1280×720; phone screenshot visually inspected. The dependency worker and existing foundation worker both build. This is a diagnostic, not the finished product Hall.
- Full regression now passes **626 tests** (313 unit, 114 party, 168 OS, 31 Web3). The isolated probe suite now has **23 passing tests**; formatting is recorded with this follow-up's evidence. No game/motion/runtime integration or root lockfile change.
- Sepolia public endpoints intermittently time out; thirdweb also returned an explicit 429 during a local fork. Read-only failover refuses all mutation methods. Public transaction submission has no automatic retry. This is distinct from the owner-signing restriction.

## Interrupted final run — reconciled 6 November

- Recovery tooling commit: **e860ed8** on `web3/integrations`. Surviving cost schemas (4/15/30/31 columns), readonly ownership/creator/flag, unchanged atomicity baseline, absent failed create and ordered create/extend independently read back in `spikes/rabdi-security-verified.json`. VK-02/03/04/06/07 now have completed evidence or recorded SDK/provider differences.
- Owner stopped during score seeding with `InternalRpcError`. The old message did not identify its exact RPC method, so the original cause is **not proven**. All **74** admitted hashes have canonical receipts (73 successful; one deliberately reverting atomicity test). No admitted transaction is missing. The next unsigned 20-row batch now estimates at **3,236,980 gas**.
- **1,200** trusted rows with exactly ordinals 0–1199 are read from Rabdi. Confirmed/pending nonces are both **80**; the next operation is `scores 1200`. The private journal is unchanged by reconciliation. Final-run gas is **0.208918126 tGLM**; current balance **9.788699744** matches the initial observation minus verified costs. Ten actual cost rows are published in [arkiv-costs.md](arkiv-costs.md).
- Reconciliation exposed a separate deterministic provider limitation: historical balance queries fail because Rabdi serves head-only state. The runner now checks current balance against its last admitted nonce and receipt cost; the verifier labels per-case balance deltas as owner observations and independently verifies canonical receipt costs. No historical-read success is claimed.
- Public reads and unsigned estimates get at most four attempts with bounded backoff. Validation/revert/413/head-only errors stop immediately; all broadcasts remain single-attempt. Safe diagnostics identify the method, error code and retry count without logging signed payloads or keys.
- **20 test EURC** now received. The combined unsigned prerequisites pass. Root regression **626 passed**, isolated recovery suite **33 passed**, and formatting passes. Recovery logs: `g0-recovery-check.txt`, `g0-recovery-isolated.txt`, `g0-recovery-format.txt`, `g0-recovery-preflight.txt`.
- **Owner action:** run the combined command in [g0-final-handoff.md](g0-final-handoff.md). It reconciles prior admissions, resumes the last 800 scores, then performs the security/expiry, ENS address/cross-write and EURC probes. No additional faucet action is required. G0 remains OPEN until completed receipts and checks are verified.

### Second stop: Node connection timeout fixed

The owner retry stopped in the **unsigned preflight** with `eth_getBlockByNumber → HttpRequestError → TypeError → ConnectTimeoutError`. No signing stage was entered; the journal remains 74 receipts and confirmed/pending nonces remain 80. The read retry classifier now includes Node/Undici connection, header, body and socket timeout names/codes, with the same four-attempt ceiling. The exact nested error chain is regression-tested, including no broadcast retry. **35 isolated tests, all 626 root tests, formatting, and the complete combined unsigned preflight pass.** Evidence: `spikes/rabdi-timeout-recovery.json`; refreshed recovery logs. Owner can rerun the same combined command. This does not change G0's remaining live checks.

## Next actions and boundaries

1. EURC faucet is complete (20 test EURC verified). The interrupted Rabdi journal is reconciled; owner runs the combined final command in [g0-final-handoff.md](g0-final-handoff.md); agent runs the independent verifier immediately afterward, before one-day score leases expire. Phase-one evidence is already complete; do not recreate those expired fixtures.
2. The combined command also performs the capped ENS address/cross-write and EURC probes in order, then runs public verifiers. It skips already completed transactions. Never paste keys or env files.
3. Agent publishes the measured costs and final gate verdict from those receipts. G0 remains OPEN until these results exist; a ready script or unsigned estimate is not a passed transaction test.
4. G1 then builds ENS host enforcement, ConditionalPot, real record/keeper adapters and the receipt ledger for one match; G2 follows its tests. HTTPS hosted acceptance and platform applications remain owner-deferred.

`PARTNERS` stays mock/off. No live adapter, real stakes, Ledger badge, product Hall, platform gateway or deployment is enabled. Fourteen original role keys are preserved; one separate zero-native EURC probe key was added in an ignored 0600 file. Backup is unverified. Public signing remains owner-executed because automatic approval review rejected agent broadcasts; reads/local rehearsals and independent software work continue.

Historical foundation verification: 617 tests plus formatting and the phone browser gate in foundation-check.txt, foundation-format.txt and foundation-browser.txt. Off mode loaded no signer/key; mock mode bound identity at 320×568, 390×844 and 844×390; signer bundle 26,169 bytes gzip. Later ENS preparation passed 619 and original G0 tooling 620 tests (dated logs retained). The 6 November Arkiv date gate has elapsed; K1 now waits on K0, not the calendar.
