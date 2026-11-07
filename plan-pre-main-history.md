# Funcaster — implementation and release plan

Updated **6 November 2026 — Funcaster Render/PostgreSQL live deployment in progress**.

## Current deployment work (supersedes dated status below)

- [x] Owner-approved PR #4 merged at `4c79bf44c19fa25fe920fc2e178d3e1a4bdbdb6c`, with both game CI jobs passing; security findings verified as public source-file SHA-256 hashes.
- [x] Live HTTP/worker paths for predictions, cheers and creator passes/claims; focused actual-local-EVM and browser flows pass.
- [x] PostgreSQL application documents, replay records, signer journals, jobs and ordered receipts; real database persistence checks pass.
- [x] Render PostgreSQL provisioned in Singapore.
- [x] `funcaster.eth` registered on Sepolia for two years; old `funcaster.eth` preserved.
- [x] Three new Arc contracts deployed/pinned and verifier funded; `play.funcaster.eth` and restricted `players.funcaster.eth` are ready.
- [x] Render web relay, payment worker and separate prediction verifier deployed with PostgreSQL and persistent disks; public URL: https://funcaster.onrender.com.
- [x] Owner activated the capped public testnet workers; payment worker and verifier startup logs confirm readiness.
- [x] Previously verified public game record survived the activation restart in PostgreSQL.
- [x] Hosted phones joined; both Arc test-USDC bankrolls, the party ENS name and both seat registrations confirmed. Seat resolver writes exposed a case-sensitive hex comparison before broadcast; the local fix and JSONB restart regressions pass.
- [x] Owner deployed the ENS calldata/restart patch and resumed the guarded replacement table with the same funded profiles. Old room cleanup and the new party registration have confirmed.
- [x] Owner deployed the bounded proof-read/heartbeat update `5dc8432`; worker heartbeat is healthy and both phone ENS names are ready with the original funded identities.
- [ ] Finish hosted acceptance. Phone joins/ENS, all four bankrolls, creator registration/pass and both 0.05 test-USDC predictions confirmed. The stopped attempt is void and both spectators were refunded; the cheer never reached signing and the game did not start. A guarded new successful-game attempt still needs preparation; do not rerun expired acceptance or replacement flags.
- [x] Fix local phone-first resume ordering and bounded wait for the existing backlog; focused real-browser/Socket.IO checks pass.
- [x] Owner deployed worker `1d79b54`, which skips only untouched grants already revoked in the queue; worker heartbeat and both current ENS names are ready.
- [x] Repair the local read-only observer to reconnect/re-authenticate, discard stale state and bound recovery. Twenty focused tests and a live display-only reconnect check pass; the required repository check passes 938 tests (one opt-in browser skip, passed separately).
- [x] Bound production worker batches to one job per provider per poll so newly queued Arc/commerce work can enter between ENS operations. Focused scheduling/backoff tests pass; owner deployed this in revision `09f79d8`.
- [x] Repair JSONB commerce validation, bounded GET retries, absent-operation404, and a 15-minute connected-screen hold on future errors. Implement a one-time immutable-manifest recovery that preserves the original failed registration, plus a guarded prepayment-table continuation with all four identities. 990 required tests pass; focused browser and recovery tests pass.
- [x] Owner deployed worker/relay revision `09f79d8` and inserted the immutable registration recovery request. The duplicate sequence reused that request. SELECT-only evidence confirms neither original nor recovery registration reached signing.
- [x] Repair recovery's missing-version contract check: `getVersion` reverts `UnknownVersion()` instead of returning false. Dedicated two-host absence proof and readable recovery status pass 996 required tests, 53 focused checks, real local EVM registration/reconciliation, and a keyless public read at block `71103111`. Code revision `d42fe6b` is in draft PR #5.
- [x] Owner deployed relay `d42fe6b`; registration confirmed, the guarded replacement table joined both phones/ENS, and its 0.50 test-USDC creator pass confirmed. Recovery is complete; do not repeat its commands.
- [x] Repair PostgreSQL stream pagination at decimal-width boundaries (`a9625a4`): order by the numeric table column, not the text output alias. All 130 hosted ledger rows pass unchanged hash-chain validation. 997 required tests, 18 focused browser tests and three actual local PostgreSQL tests pass. Saved funding checkpoints are reused only for the same verified phone identities.
- [x] Repair market GET error classification, stable context through transient reconnects, and future concurrent prediction/cheer submission with serialized saved checkpoints (`5c9ae9c`).
- [x] Repair receipt replay backpressure and preserve confirmed verification on restart (`11fe204`). Final checks: 1,015 required tests, 36 focused browser/recovery checks and three real PostgreSQL integration tests pass.
- [x] Owner deployed `11fe204` to worker/verifier/relay. Public ledger returns 200;193 journal rows/104 receipts validate with the original 130-row prefix intact, both bets confirmed, zero dropped records and ready storage.
- [x] Fix omitted live commerce receipts (`cff34f0`): accept actual worker sanitizer output, retain independent verification, and use the durable stream without a duplicate live callback. 1,018 repository tests and 13 focused ledger/replay tests pass.
- [x] Owner deployed relay `cff34f0`; public ledger 241 rows/106 receipts validates with original 130-row prefix intact, and creator registration/pass plus both predictions independently confirmed.
- [x] Verify stopped-attempt refund: both hosts confirm Void; explorer confirms 0.05 test-USDC returned to each retained spectator. Both `.network` refund receipts and transfer logs are checked, with the first canonical block rechecked; the fuller two-host payout audit remains rate-limited. [Evidence and exact limitations](docs/web3/market-read-recovery.md).
- [ ] Prepare the next guarded game/cheer/payout/creator-claim attempt with preserved prior payments and original identities; publish a concrete owner-run allowance handoff before any new execution.
- [ ] Resolve acceptance capacity before another table: last permitted audit found ENS 118/120 admissions at 6 November 00:57:19 UTC, at most 2 remaining before cleanup. No cap or budget has been raised; keep all old counters and identities.
- [ ] Verify hosted QR join, payments, predictions, creator passes/claims, refund and restart persistence.
- [x] New backend work is delivered in draft [PR #5](https://github.com/hatif03/web3-multiplayer-games/pull/5), `codex/render-live`; separate merge approval remains required.

See [deployment checklist](docs/web3/render-live.md). UI renaming is on the owner's separate branch. Arkiv/Swarm remain removed. Public financial acceptance is not complete.

The earlier Funcaster release was approved for PR delivery and merge into `main` on 6 November after software verification. That approval does not authorize merging the current Web3 branch. The scheduled software through SH11, VP5 and HO3 is implemented and browser-checked, while physical QA2/QA3 and HO1/HO2 hosting remain pending; see [build progress, evidence, deviations and next tasks](docs/OS-BUILD-PROGRESS.md). No deployment was performed. 6 November PR/evidence below describes the earlier console, not the status of the new desktop.

This is the current checklist. The previous scenario book and dated audits are preserved in [plan-history.md](plan-history.md); their unchecked boxes and approval-blocked notes are historical, not outstanding implementation tasks. Detailed behavior is recorded in [IMPLEMENTATION.md](docs/IMPLEMENTATION.md), with [engineering evidence](docs/RELEASE-2026-11-06.md) and the [UI review](docs/UI-REVIEW-2026-11-06.md).

## Historical Web3 handoff (6 November 2026; superseded above)

**Latest owner scope change:** target **Arc + ENS only**. Arkiv/Swarm production integration is removed; local durable records and exports preserve the product flows. Basic G1/G2 work is now underway in parallel, with focused happy/refund checks instead of the exhaustive matrix. [Current scope, implementation lanes and honest live/local boundaries](docs/web3/arc-ens-basic-scope.md) supersedes the older three-track checklist and estimates below. Draft PR #4 remains the delivery branch.

The owner started the [Web3 master handoff](docs/plans/web3/build-guide/26-codex-master-prompt-and-handoff.md). This supersedes older deferred-Web3/main-only statements below: **all Web3 implementation and commits stay on `web3/integrations`; never merge into `main`**. Games/motion stay unchanged; live partners remain disabled. Review delivery: draft [PR #4](https://github.com/hatif03/web3-multiplayer-games/pull/4).

### Current status and review

**Draft [PR #4 — [DO NOT MERGE] Arc + ENS basic console flows](https://github.com/hatif03/web3-multiplayer-games/pull/4)** is open from `web3/integrations` to `main`. A5/A6 implementation is `9f7bf87`; older CI evidence below refers to `2563bbc`. New local product evidence is linked below. Nothing has been merged or activated live.

- **Done:** G0 verification, ENS core implementation/local acceptance, Arc public deployment and A4 public worker acceptance, and A5/A6 local phone/gameplay integration.
- **New basic product slice implemented:** local Hall/replay exports/ledger, Funcaster Live, signed challenges, winner predictions/table cheers and creator publishing/passes/splits/earnings/referrals. **874 tests** and focused desktop/phone browser checks pass. Run `npm run start:basic`. New contracts/live adapters are locally checked; product live wiring and public activation are still pending. [Evidence and exact remaining work](docs/web3/arc-ens-basic-scope.md).
- **Verified locally:** 837 repository tests and both partner-off parity gates pass. Two Chromium phones completed a replay-verified Star Catch round through MOCK funding, settlement and both claims; portrait and landscape UI were checked.
- **PR checks at `2563bbc`:** both `games` jobs passed. GitGuardian still fails on historical findings `39737262` / `39737263`; external triage remains open. This is not an all-green PR.

### Remaining gates and rough estimates

| Gate | Current status / remaining work | Additional active-work estimate |
| --- | --- | --- |
| **G1 — Arc + ENS with local records** | **In progress.** Durable Hall/replay exports and independent receipt ledger implemented; integrated public ENS/Arc gameplay remains open. Arkiv/Swarm production work is removed. | Parallel basic integration underway; old estimate retired |
| **G2 — the product people touch** | **Basic flows in progress.** Live hub, signed challenges, winner predictions/cheers and creator passes/earnings implemented locally. Contract adapters, persistent earned ENS names and integrated checks are being completed. New public deployments remain separate. | Focused checks; owner signing wait is separate |

The owner approved this scope reduction and parallel implementation. The basic product slice replaces Arkiv/Swarm with local storage and exports. Historical tests and evidence remain available; new local simulations are not public acceptance.

**Next coding:** finish the parallel basic integration, essential checks and Arc/ENS live handoff. No new owner information blocks local work. Public signing/deployment remains owner-operated. Physical phone testing and hosting stay deferred; platform-app registrations do not block this slice. Do not repeat G0 setup, ENS parent registration, Arc deployment or completed A4 probes. [Detailed progress](docs/web3/progress.md) · [Owner checklist](docs/web3/human-setup.md) · [Current scope](docs/web3/arc-ens-basic-scope.md).

### Completed milestones and open acceptance

- [x] Main fetched (`404abb1`), integration branch created; foundation S0–S6 implemented and parity-tested. [Current tests and progress](docs/web3/progress.md).
- [x] Arc Studio login, app creation in Dia, public source export and diagnostic UI verification. The G0 diagnostic is preserved; the same app contains the reviewed ConditionalPot and pot console. Its owner-signed public deployment is verified; G1 product acceptance remains pending.
- [x] Existing 14 role keys validated and preserved; a separate fifteenth EURC test key added locally; ignored env files prepared. Owner password-manager backup remains unverified.
- [x] funcaster.eth registered on Sepolia; parent/play registries and play resolver bootstrapped by the owner. Seven bootstrap receipts and current roles independently verified. [ENS evidence](docs/web3/ens-evidence.md).
- [x] Arc USDC and EURC sponsored authorizations verified on two RPC hosts; retained floors hold, and the EURC signer has zero native gas. Memo receipts and product-specific tests remain in their later feature gates.
- [x] Owner approved **Rabdi 7794095 / Arkiv SDK 1.0.1**, superseding Tiramisu/0.8.1. Console funded with **10 tGLM**; six owner-run probe transactions and 24 typed query checks independently verified. [Migration](docs/web3/rabdi-migration.md).
- [x] Prepared the final capped Rabdi owner probe and independent verifier; unsigned limits/batch estimates and local guard/reader tests pass. Swarm keeper re-upload preserves the reference/hash; G0 Hall/worker builds and 15 browser cases pass. [Final handoff](docs/web3/g0-final-handoff.md).
- [x] **G0 network/compatibility verification complete with recorded limits:** 121 final Rabdi receipts and 2,002 rows verified; cost/atomicity/expiry/forgery checks, live EURC authorization and ENS-to-Arkiv cross-write pass. Full-scan performance and Swarm retention use the documented fallbacks. 626 root tests, 38 probe tests and 15 browser cases pass. [Completion and limits](docs/web3/g0-completion.md).
- [ ] **Hosted acceptance:** still owner-deferred. G0 engineering evidence is complete; no hosted release gate, deployment or physical-phone test is implied.
- [x] **G1 first milestone — E1/E2:** canonical ENS discovery, pinned ABI/configuration, keyless preflight and deployment handoff implemented. Live Sepolia namespace/roles and official address comparison pass; 27 new tests, 653 total repository tests and parity pass. [Deployment and next task](docs/web3/ens-deployment.md). Commit `2a6d85f`.
- [x] **G1 E3/E4 engine milestone:** durable party warm pool, creation/expiry/end, soulbound seat mint/release, collision handling and a capped transaction port implemented (`3dc111d`). 38 new tests, 691 repository tests and 11 local Sepolia-fork checks pass. No public transactions or live gameplay activation. [Evidence and spec corrections](docs/web3/g1-ens-lifecycle.md).
- [x] **G1 E3–E6 implementation:** typed worker/relay jobs and receipts, bound-phone seat cleanup, background refill, scoped host grants/revokes, five-second authority checks, two-second record batching, table-name joining, chain history and a canonical pot-roster reader. **721 root tests**, 21 deployed-contract fork checks (30 local transactions), and desktop/phone Chromium checks pass. [Integration handoff](docs/web3/g1-ens-integration.md).
- [ ] **ENS public acceptance / E8 receipt book:** owner-operated capped public execution and independent readback remain pending. The local configuration stays MOCK; the ENS-only live worker requires an explicit confirmation flag and budgets. The pot-roster reader is consumed by A5; public acceptance remains pending.
- [x] **Arc A2/A3/A7 local milestone:** Studio generation and audit completed; ConditionalPot exported with canonical terms binding and full uint256 payout bounds. **177 Foundry tests**, 273 contract/relay payout comparisons, 17 local Arc-fork checks (54 transactions), **219 console tests**, 88 fixture-browser cases and 12 actual built-route cases pass. Pot/Create/About UI is built at `/pot/`; no contract is configured. **752 root tests** and parity pass. [Evidence and remaining work](docs/web3/g1-arc-contract-console.md).
- [x] **Arc A4 implementation and local end-to-end acceptance:** typed jobs for the full pot lifecycle and drips, durable role journals and budgets, exact terms/ID conflict handling, fresh deployment/token preflight, canonical event/receipt readback, independent claims, deadline/restart recovery, and keyless live pot API. **831 root tests** and parity pass; 22 actual USDC/EURC worker-fork checks include exact-hash owner recovery and no-duplicate replay. [Evidence, activation rules and complete handoff](docs/web3/g1-arc-worker.md).
- [x] **Arc A2/A4 public worker acceptance:** All **12 scripted checkpoints**, **54 worker transactions** and **eight paid terminal pots** independently verified on both RPC hosts. Worker gas **0.120785 test USDC** is below the 0.55 cap; USDC/EURC drips remain 0.12 each. Deployment is separately verified. No further A4 owner command is required; service env files stay MOCK. [Completion and evidence](docs/web3/g1-arc-worker-public.md).
- [x] **Arc A5/A6 implementation / local gameplay acceptance (`9f7bf87`):** fresh ENS roster and both start gates, phone consent/funding, five-second cooperation/Dispute, first-join drips and worker settlement/refund/claims are wired. **837 root tests** pass; two Chromium phones completed an actual replay-verified Star Catch round through MOCK payouts. Six focused tests cover the essential happy/refund/abandon/cancel/ownership paths. [Scope, evidence and remaining public acceptance](docs/web3/g1-arc-gameplay.md).
- [ ] **Arc integrated public gameplay/console acceptance:** owner-operated testnet session still needed after the remaining G1 integrations. Do not repeat A4 or redeploy. N3/L2 Memo is separate; A4 retains `ARC_MEMO=off`. Physical motion/multitouch and hosting remain deferred.
- [ ] **Finish revised G1:** integrate the implemented local Hall/exports and basic receipt ledger, then run owner-operated ENS/Arc public gameplay acceptance. Arkiv/Swarm production requirements are retired. A4 remains complete; no redeployment. Memo tagging stays off; receipt links still work.
- [x] **Basic G2 local product:** Live hub, winner predictions/cheers, signed challenges, creator publishing/passes/splits/claims/referrals and local earned handles integrated and browser-checked. New Arc contracts/adapters and real ENS Champion adapter are locally checked.
- [ ] **G2 public activation:** finish live HTTP/worker wiring for market/cheer/commerce, prepare capped owner deployments and verify a public flow. Wire Champion issuance after owner parent renewal and restricted `players.funcaster.eth` namespace setup. MOCK success is not public acceptance; Legend/season depth remains deferred.
- [ ] **G3–G5:** trust/rankings, depth and polish follow only after the earlier gates; unchanged and not started.
- [ ] **Owner-deferred:** platform accounts, YouTube audit, HTTPS staging account/domain/budget. Vercel remains tentative. [Resume checklist](docs/web3/human-setup.md).

## North star and direction (6 November 2026)

**Read this section first, then the document map. It is written for any person or agent who joins the project.**

### What we are building

**Funcaster** is a **game console that runs in a web browser**. One screen (a TV, a laptop, a projector) shows the games; **every player's phone is their controller**, using the phone's motion sensors and touch. Players scan one QR code, tap once, and play. There is **no app to install**. The shipped product has **13 games**, rooms of **up to four phones** with a waiting queue, **Solo and Multiplayer** modes, a **Party mode** (friends, a VIP phone steers) and a **Kiosk mode** (a booth that runs itself), **remote screens** for friends elsewhere, verified results, and a **creator platform** so outsiders can add games. Phones talk to a Node and Socket.IO relay; the games run in the browser on the big screen or, for some online modes, on the server.

### Why, and for whom

The first audience is **people walking up to a screen at an event, and friends in one room**: ETHGlobal Mumbai and Devcon 8 India (Mumbai, 6 November 2026) are the immediate stage, and the owner's team is on the approved Continuity track. A good result means **a stranger scans, understands, and is playing within about 20 seconds, then brings a friend**. The longer story is a platform: more games from more creators, streamers playing with viewers ([business-plan.md](business-plan.md)), and, later, partner-track features.

### Goals, in priority order

1. **Instantly playable.** One scan, one tap, no account, no install, works on iPhone and Android, with a touch fallback for every phone.
2. **Legible and controllable from the sofa.** The big screen is readable at 3 metres and **everything can be done from a phone**.
3. **Real multiplayer.** Humans-only by default, at least two humans to start a Multiplayer game, fair rules, honest drop and forfeit handling, remote friends who truly play.
4. **A distinct, charming identity.** The interface is a **Windows-XP-style desktop over a pixel-art Mumbai wallpaper**, with a mascot and a backdrop for each game. Brand: **Funcaster** (unchanged; the mascot is **Chonk**, a chubby street cat). The full implementation spec is the [build specification](docs/plans/build/README.md).
5. **Honest and safe.** Verification labels are truthful, nothing leaves the room without consent, and **no third-party artwork ships that we do not have the right to use**.
6. **Open to creators.** A validated manifest, namespaced ids, a local SDK and review workflow.
7. **Ready for the hackathon tracks later**, without letting that distort the game ([plan-history.md](plan-history.md) sections 5f and 12).

### Direction change of 6 November 2026

The owner set a new direction for the experience. In order, and with the plans that carry them:

| # | Change | Plan |
| --- | --- | --- |
| D1 | **The whole console and menu become a Windows-XP-style desktop**: game icons, a small **Game Properties window** per game that holds every pre-game option, a Start menu, taskbar, tray, dialogs, balloons | [xp-console-ui.md](docs/plans/xp-console-ui.md) |
| D2 | **The dashboard is fullscreen, never scrolls, and games adapt to the screen** (a viewport contract and a test matrix) | [xp-console-ui.md](docs/plans/xp-console-ui.md) section 8 |
| D3 | **Everything is controllable from the phone** (pointer and D-pad focus navigation, text typed on the phone, every host action reachable) | [xp-console-ui.md](docs/plans/xp-console-ui.md) section 6 |
| D4 | **The phone goes fullscreen with one tap**; iPhone cannot (no web fullscreen on iPhone), so it gets the best immersive tab and an optional installed app | [phone-controller-v2.md](docs/plans/phone-controller-v2.md) section 3 |
| D5 | **A universal remote** that never changes between games (D-pad, A, B, 1, 2, minus, home, plus), looking like the original controller with our branding; games only change what the buttons mean | [phone-controller-v2.md](docs/plans/phone-controller-v2.md) section 4 |
| D6 | **Android and iPhone sensors are mapped by a capability probe** into four experience tiers | [phone-controller-v2.md](docs/plans/phone-controller-v2.md) section 7 |
| D7 | **Wallpaper**: `assets/source/wallpaper/mumbai-pixelated.png` replaces the stock wallpaper | [xp-assets-and-licensing.md](docs/plans/xp-assets-and-licensing.md) section 2.6 |
| D8 | **A mascot and a backdrop for each of the 13 games** | [xp-assets-and-licensing.md](docs/plans/xp-assets-and-licensing.md) sections 4 and 5 |
| D9 | **The name stays Funcaster and the mascot is a cat, Chonk** (a chubby kaali-peeli street cat whose collar tags light up as phones join). A rename (Dabba, then Tapri) was explored on 6 November and dropped, so no identifiers change | [build/01](docs/plans/build/01-brand-and-rename.md) |
| D10 | **The previous pointer** (`core/pointer.js`, the "moving probe") is retained for the shell cursor; the phone streams raw samples while the shell is up | [build/06](docs/plans/build/06-phone-remote-and-pointer.md) section 6 |
| D11 | **Skin: Windows XP Luna blue** (grey Classic as the high-contrast option); the old dashboard stays reachable at `/?shell=classic` as the safety net | [build/02](docs/plans/build/02-theme-and-assets.md) section 1, [build/03](docs/plans/build/03-shell-architecture.md) section 17 |
| D12 | **The remote is the previous controller face with a skin change** (D-pad, A, B, 1, 2, minus, home, plus), with the "chonks" wordmark; **the default skin is Luna blue, not white** (the white remote is an option) | [build/06](docs/plans/build/06-phone-remote-and-pointer.md) sections 2 to 4 |

**Supersedes:** the "Bombay Arcade" neon look and the per-skin ideas in [visual-direction.md](docs/plans/visual-direction.md) (for the shell, menus and TV screens; its asset list partly stands), and **section 7 of [controller-design.md](docs/plans/controller-design.md)**, which deliberately left out a D-pad, plus and minus, home and numbered buttons. The owner reversed that decision on 6 November (recorded in [phone-controller-v2.md](docs/plans/phone-controller-v2.md) section 12). Where the earlier XP-direction documents ([xp-console-ui.md](docs/plans/xp-console-ui.md), [phone-controller-v2.md](docs/plans/phone-controller-v2.md), [xp-assets-and-licensing.md](docs/plans/xp-assets-and-licensing.md)) disagree with the [build specification](docs/plans/build/README.md), **the build specification wins**.

**Asset pack: owner decision of 6 November 2026.** The supplied `assets/source/winxp` pack is largely **Microsoft's artwork, sounds and fonts** (the real XP icons, cursors, sounds, Tahoma, Clippit, Bliss; plus a recreation of the Luna UI by NullTale). The owner decided to **use it as supplied, without further questions**, and confirmed that the licences of the supplied packs (including the ten CraftPix packs) allow free use; the exposure of Microsoft-derived material on any public address is accepted and recorded here once. Practical rules: **everything supplied is committed** under `assets/source/` (138 MB, at the owner's request so the teammate has it; the `.gitignore` whitelists `!/assets/source/` and `!/assets/os/`), the server does **not** serve `/assets/source`, and the Docker image excludes it; the build generates the shippable subset into `assets/os/`; every asset is reached through a theme manifest so swapping any of it is one line; the Windows logos and boot screens are not used. Details: [build/02](docs/plans/build/02-theme-and-assets.md).

### Guardrails (these bind every agent)

- **Solo mode is unchanged**; Multiplayer is humans-only by default and needs two humans.
- **Four active seats.** More only through a flag-guarded plan ([seats-4-to-8.md](docs/plans/seats-4-to-8.md)).
- **No web3 code now.** The partner plan exists in [docs/plans/web3/](docs/plans/web3/README.md) (reassessed 6 November: Arc, World, Arkiv, with ENS the first reserve; three partners are picked at submission). **Friend stakes (real-life betting) are a product decision of 6 November**: dares and standing are built now, the pot runs on testnet play money only and real value stays off by default and never in India without legal advice ([08](docs/plans/web3/08-stakes-product-and-legal.md)). Integrations are 6 November, outside the game repo until then.
- **Third-party artwork:** the supplied Windows-derived pack is used by owner decision (above); no other third-party artwork, names or logos. The product says "Funcaster". The extracted Kart Rush pack stays blocked from serving.
- **Sensors need HTTPS.** Never send orientation data as volatile. Never reduce the mapping to raw Euler angles (see `CLAUDE.md`).
- **Honest labels:** verified, attested and reported-remotely are never blurred.
- **Time:** Devcon 6 November. Only the items marked "Event" in the plans are on the critical path; hosting is last by the owner's choice.
- **Working agreement:** commit directly to `main`; commit only when asked. The working tree uses CRLF line endings on Windows (`core.autocrlf`), so scripts that edit `plan.md` must preserve them.

### Document map

| Document | Read it for |
| --- | --- |
| **This file** | The current checklist, goals and direction |
| [docs/plans/build/README.md](docs/plans/build/README.md) | **The build specification (start here to implement):** brand, theme and assets, shell architecture, Game Properties, games and viewport, phone remote and pointer, schedule, tests and runbook |
| [docs/plans/xp-console-ui.md](docs/plans/xp-console-ui.md) | **The interface plan**: Funcaster, Game Properties, navigation, fullscreen, design system, build order |
| [docs/plans/phone-controller-v2.md](docs/plans/phone-controller-v2.md) | **The phone**: one-tap gate, universal remote, sensor tiers, per-game mapping |
| [docs/plans/xp-assets-and-licensing.md](docs/plans/xp-assets-and-licensing.md) | Asset briefs for later production: custom mascot art and the 13 game backdrops (its licence gate is superseded by the owner's decision above) |
| [docs/plans/remaining-games.md](docs/plans/remaining-games.md), [host-phone-controls.md](docs/plans/host-phone-controls.md), [remote-play-via-displays.md](docs/plans/remote-play-via-displays.md), [seats-4-to-8.md](docs/plans/seats-4-to-8.md), [hackathon-floor-plan.md](docs/plans/hackathon-floor-plan.md), [controller-stress-tests.md](docs/plans/controller-stress-tests.md) | The earlier plans (most are implemented; each file's status line says how far) |
| [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md), [docs/RELEASE-2026-11-06.md](docs/RELEASE-2026-11-06.md), [docs/UI-REVIEW-2026-11-06.md](docs/UI-REVIEW-2026-11-06.md) | What is built and how it was checked |
| [docs/NETWORKING.md](docs/NETWORKING.md), [docs/SDK.md](docs/SDK.md), [docs/CREATOR-PUBLISHING.md](docs/CREATOR-PUBLISHING.md), [docs/HACKATHON.md](docs/HACKATHON.md) | Networking, SDK, creator workflow, running the booth |
| [business-plan.md](business-plan.md) | The Streamer Arcade pitch (verbatim), monetisation research |
| [plan-history.md](plan-history.md) | The old scenario book, audits and partner-track design notes |
| [README.md](README.md), [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md) | Setup, gotchas, agent rules |

---

## New workstreams (6 November 2026)

Software implementation is complete through **AS1–AS4, BR1, SV1–SV3, SH0–SH11, PH1/PH2/PH3/PH4/PH6/PH8, VP1–VP5 and HO3**. QA1 tests were added throughout. Checked boxes below mean implemented software; they do not claim physical acceptance or deployment. The 234-sample viewport matrix, shell-flow evidence, targeted corrections, formatting and combined test totals are recorded in [the progress log](docs/OS-BUILD-PROGRESS.md). HO1/HO2 stay last; QA2/QA3 remain deferred. "Event" means needed 6 November.

- [x] **W1 Phone entry (Event):** page lock, universal Luna remote with all 13 caption/action maps and both postures, one-tap gate/capability probe, touch fallback, device diagnostics, skins and wordmark (PH1–PH4, PH8). Physical permission/sensor/multitouch acceptance is tracked under W8.
- [x] **W2 Pointer and server events (Event):** validated pointer/button/device relay, raw phone capture, retained `core/pointer.js` shell client, focus navigation, sensitivity/recentre, clipped-target protection and optional glove cursor (SV2, PH6, SH5).
- [x] **W3 Funcaster shell (Event):** desktop, window manager, taskbar/tray/Start, session/reclaim, Game Properties for all 13 games, loading/game/results, all utility windows, boot/who/attract/staff, Luna/Classic/Taxi skins and settings (SH0–SH8, SH10).
- [x] **W4 Assets (Event):** reproducible preparation, cleaned wallpaper, sprite/icon/cursor exports, fonts/cues, manifest/credits, measured CraftPix pets and four seat avatars (AS1–AS4). Source files remain unchanged and unserved.
- [x] **W5 Brand and current mascot:** Funcaster constants and the supplied helper as the documented stand-in (BR1, SH9). Commissioned Chonk cat sheets/collar artwork stay in the later tier.
- [x] **W6 Games fit any screen (Event):** VP1–VP5 are implemented: HUD/overflow/zero-size fixes, fit/letterbox utilities, Kart party menu, pixel budgets, aspect-aware split and scaled arena/Drawing text. The 234-case matrix, six DPR stress cases and targeted final corrections pass. Real-TV acceptance remains QA3.
- [x] **W7 Mascot, sound and atmosphere:** helper engine, audio bus/cues, street pets, seat avatars, gentle-effects and Settings switches (SH9, SH11). Chonk's custom art and 13 bespoke backdrops remain later-tier work.
- [ ] **W8 Hosting, devices, rehearsals (Event):** HO3 launcher is implemented and tested; the machine dry-run found no installed Chrome/Edge. HO1/HO2 hosting and trusted LAN fallback await the chosen account/domain. QA2 real phones and QA3 real-TV rehearsals/soak remain unverified, as requested. See [build07](docs/plans/build/07-schedule-tests-runbook.md).

---

## Implemented

- [x] **Walk-up flow:** one QR, room code, 1–4 phones, motion permission/onboarding, calibration, touch fallback, persistent seat identity, reconnect and rematch without rescanning.
- [x] **Catalog and setup:** all 13 games, neutral stable IDs, validated manifests, game-specific modes/options, two-human Multiplayer start gates, frozen match setup, playlists and crew rotation/brackets.
- [x] **Controller:** gentler calibrated steering, landscape wheel, Brake left / Boost centre / Accelerate right, three boosts per round with an eight-second cooldown, sensitivity preferences, hold-to-recenter/leave, pacing, skins, larger controls and mirrored pedals.
- [x] **Room lifecycle:** four active seats, waiting queue, promotion between rounds, 30-second reconnect grace, pause/forfeit/DNF/no-contest policies and explicit outcomes.
- [x] **Host-phone and kiosk controls:** approved revocable delegation, TV veto/transfer, scoped commands, PIN-protected staff controls, lock/remove, ready countdown, rotation, idle reset, event counters and persistent bounded records. These are implemented, not awaiting permission.
- [x] **Remote screens:** approved scoped per-screen QR pairing, play offers and start gates, one-view/one-round grants, replay acknowledgements, recovery/revocation/forfeit, spectator snapshots, interpolation, latency hints and wake locks.
- [x] **Online Kart/Tennis/Fencing:** server-owned shared simulation, phone input, paired views, start/recovery barriers and verified input journals. This replaces the proposed peer-lockstep dependency for shipping online play.
- [x] **Results and records:** canonical result/replay envelopes, honest verification tiers, replay checking where supported, local bests, history/export, persistent event records and standings.
- [x] **SDK and creator service:** lifecycle adapters, namespaced storage, validated complete bundles, generated template, local isolated preview, operator-owned namespace/submission/review/trial/publish/withdraw workflow and sandboxed community gallery.
- [x] **Artwork and presentation:** original kart crew/vehicles/items/course presentation, Bombay Arcade shell, original vector/procedural art, local fonts and licenses, sound cues, icons/share art and credits. Original art supersedes the earlier Mario branding request; compatible internal URLs remain. **Direction change, 6 November 2026:** the "Bombay Arcade" shell is to be replaced by the Windows-XP-style Funcaster desktop ([North star](#north-star-and-direction-6-november-2026)); game art and the original kart art stand.
- [x] **UI review and corrections:** responsive lobby/setup/admin forms, isolated modal actions, landscape and compact portrait controllers, shared-game scoreboards, compact game menus, separated instruction/status rails and split-view player labels, results, remote pairing and utility screens. Coverage and limitations are listed in the UI review.
- [x] **Engineering foundations:** room/network safeguards, build handshake, pure Node certificate generation, cross-platform launcher, health checks, container/deployment preparation, automated validation and CI.

## Game implementation

| Game           | Delivered modes and behavior                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kart Rush      | 1–4 humans, optional CPU field, driver/lap choices, local split view and server-simulated online views, small-grid balancing, three boosts, first-finisher window, autopilot and replay checks.         |
| Pocket Greens  | 1–4 players, 1/3/6 holes, seeded tees/pins/wind, address/hold/release, turn clocks, ready golf, CPU skill, stroke/match/skins/closest/scramble and four-player best-ball, scorecards and replay checks. |
| Slice Dojo     | Shared Co-op/Battle and independent same-seed Race, countdown, shared lives/fatal bomb, fair swept-hit arbitration, scaling, optional helper and verified replay.                                       |
| Table Tennis   | Solo AI, human duel, co-op paddles, 7/11 with win-by-two, serve rotation, crew rotation/brackets, online server simulation and replay checks.                                                           |
| Foam Fencers   | Solo AI, human duel, sudden death, crew rotation/brackets, online server simulation and replay checks.                                                                                                  |
| Time Trial     | 1–4 independent cameras, live non-colliding ghosts, previous verified winner ghost and calibrated racing controller.                                                                                    |
| Cloud Cruise   | Independent 3D flying plus shared ring claims/time bonus and optional helper.                                                                                                                           |
| Shooting Range | Independent same-seed challenge, shared targets and tag-and-steal with optional helper and replay checks.                                                                                               |
| Alien Attack   | Independent 3D run, shared co-op/versus patrol, unique kill credit, revival pickups, optional wingman and replay checks.                                                                                |
| Drawing        | Shared free draw and private-phone draw-and-guess, themed English/Hindi/Hinglish/custom decks, aliases/filtering, guess penalties and constrained voting.                                               |
| Star Catch     | 1–4 lanes or first-to-claim pickups, common results and verified server replay.                                                                                                                         |
| Neon Drift     | 1–4 lanes, optional slipstream, boost budget, common results and verified server replay.                                                                                                                |
| Bubble Burst   | 1–4 players, optional exclusive pickups, common results and verified server replay.                                                                                                                     |

## Remaining acceptance and release work

These acceptance items cover both the earlier console and the implemented Funcaster rebuild. **Software checks and browser evidence are recorded; physical acceptance is not complete.** Physical tests were explicitly left for later by the user; hosting remains last.

- [ ] **Real phones:** iPhone Safari and Android Chrome motion permission, grip calibration, landscape directions, recentering, simultaneous pedal touches, sleep/reconnect and accessibility. Desktop touch/browser checks do not establish sensor or multitouch behavior.
- [ ] **Network and venue:** mixed Wi-Fi/cellular joins, measured end-to-end latency, delayed remote Golf viewing, one-hour four-phone thermal/performance soak and a walk-up rehearsal.
- [ ] **Outside creator trial:** a person outside the project builds/submits a bundle, the operator records actual acceptance and reviews it before publication. Synthetic test submissions do not satisfy this gate.
- [ ] **Distribution check at deployment:** the server source-directory guard is tested and `.dockerignore` excludes `assets/source`; inspect the actual deployment image during HO1. The owner approved use of the supplied assets; no new licence approval is needed.
- [ ] **Stable HTTPS deployment — last:** user chooses hosting account/domain, then provision and publish, verify cellular QR joining and rehearse recovery. No stable endpoint is currently deployed.
- [ ] **Release:** complete the build and applicable acceptance tasks, finish the authorized PR merge, then follow the freeze/deployment/tag gate. Deployment and tagging are not included in the PR merge request.

No further user approval is blocking the already-approved server or scoped remote-screen implementation. The only destination information needed later is the hosting account/domain.

## What is off, gated, or a later extension

| Item                                                        | Current behavior / next step                                                                                                                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remote play                                                 | Implemented, deployment opt-in (`CHONKS_REMOTE_VIEWS=1`) plus a per-room TV-host setting; unavailable in Kiosk mode. Spectator invitations and room ownership remain scoped; the TV must stay open. |
| Community publication                                       | Implemented operator workflow, gated by a real outside-creator trial and review. The gallery runs standalone keyboard/pointer bundles; it gives games no room credentials.                          |
| Peer lockstep                                               | Optional loopback research lab. Production online games use server simulation; a future peer-simulation switch needs cross-engine acceptance.                                                       |
| Active-game phone hold-A taskbar context | Not implemented: build03 §14.3 conflicts with build06 lobby/results-only pointer/button relay. Phone Home opens the party/admin sheet; TV Game menu/Home/Escape opens Pause; native mouse/taskbar context works. The gesture needs a revised active-round input contract; alternatives do not count as implementation of it. |
| Automatic TV takeover                                       | Not implemented. Transferring room-owner authority to another browser requires a separate ownership/recovery design. This is distinct from the implemented host-phone delegation.                   |
| Eight active seats                                          | Not implemented; the product intentionally stays at four. The bounded waiting queue is available.                                                                                                   |
| Self-service public uploads / third-party party integration | Later extensions; operator registry/gallery and local SDK workflow are implemented.                                                                                                                 |
| Chonk art, bespoke backdrops and installable remote | Later tier per build07. The supplied helper and CraftPix animals/avatars are implemented; the standalone installable `/remote` app is not. |
| Additional commissioned assets                              | Full 3D Mumbai prop pack, recorded music and voice acting remain optional later production work; original code/vector/procedural artwork ships now.                                                 |
| Other exploratory roadmap ideas                             | Expanded gamepad gameplay (shell navigation is implemented), offline service worker, AI drawing guesses, monetization and partner/Web3 integrations are deferred. The historical plan keeps their design notes.                                   |

## Review handoff

Review the Funcaster rebuild against [OS build progress](docs/OS-BUILD-PROGRESS.md) and the build specification. The earlier PR evidence remains historical. [UI review](docs/UI-REVIEW-2026-11-06.md) records the browser sizes, game states, regressions fixed and remaining real-device checks. [Release evidence](docs/RELEASE-2026-11-06.md) records automated results and the limits of local measurements.
