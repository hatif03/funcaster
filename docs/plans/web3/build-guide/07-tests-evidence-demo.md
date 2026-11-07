# Build guide 07: tests, evidence, the demo and the submission

Part of the [build guide](00-README.md). Status: plan, 6 November 2026. **No code is written.** The research on 14 past winners ([10](../10-winner-patterns.md)) and the ENS and Arc winners shows the same thing: winners **prove** their claims (test counts in the tens to hundreds, committed transaction-hash books, both outcomes on an explorer, honest limitations). This document says what to test, what evidence to commit, how the demo runs and what the submission must contain.

## 1. Test inventory and where it runs

| Layer | Location and runner | What it covers |
| --- | --- | --- |
| Web3 unit tests (Node, fakes) | `tests/web3/*.test.mjs` via `node --test` (script `npm run web3:test`, also called from `npm run check` on the branch) | Config validation, sanitiser, label generation, payout vector, stakes state machine, outbox and worker idempotency, EIP-712 and EIP-3009 helpers, ENS hierarchy walker, authorize cache, Arkiv schema and ranking |
| Party harness tests | `tests/party/web3-*.test.cjs` using `tests/party/harness.cjs` (`fixture`, `FakePhone`, injectable clock) | Module wiring, bind handshake, name event, stakes gate and abandon rule, host enforcement outcomes, state parity |
| Shell and phone unit tests | `public/os/**/*.test.mjs`, `tests/os/*.test.mjs`, `public/party/*.test.mjs` | Row models, strings, `startStatus`, `optionFields`, Results signature, demo scenarios |
| Contract tests | Foundry: `integrations/arc/onchain/test/` (Studio-generated and ours) and `integrations/ens/contracts/test/` (the wrapper); run with `forge test`; **fork tests** against Sepolia (`anvil --fork-url`) for ENS | The Arc contract (Appendix B of [03](03-arc-guide.md)); the ENS CAN and CANNOT book |
| Browser e2e (manual, Playwright) | `tests/os/web3-*.e2e.mjs` next to `shell.e2e.mjs` (they spawn their own server with `HTTP=1 CHONKS_SHELL=os PARTNERS=mock` and fake phones) | Chain window by pointer and D-pad, the Stakes row, the start gate, the terms card, the settle card, join by name |
| Live testnet checks (manual, scripted) | `scripts/web3-preflight.mjs`, `scripts/web3-evidence.mjs` | Real transactions that produce the evidence book |

Format new files with prettier; add the new test globs and `public/os/web3*` files to the `format:check` list in `package.json` (new `server/`, `tests/party/` and `public/party/` files are not prettier-checked unless added).

## 2. The two gates that protect `main`'s behaviour (build these first, S2)

1. **State parity.** A scripted room (create, join four phones, ready, start a game, finish, results) with `PARTNERS=off`: assert `view()` is deep-equal to a stored golden snapshot taken on `main` **and** that no `web3` key exists anywhere in it; assert no new socket event is emitted (record the event names).
2. **Result parity.** The same scripted match (fixed seed, injected clock) with `PARTNERS=off`, `mock` and `on` (with the fake worker) produces **byte-identical** `result`, `hash` and `replayHash`; partners never alter the hashed core (`makeResult` is unchanged; additions are siblings). Do not compare hashes across machines with different line endings (Windows CRLF changes `bundleHash`).

## 3. What to test per lane (acceptance detail)

**Shared:** the challenge and bind handshake (wrong signature, expired nonce, replay on another seat, rebind after a token rotation); `name` (valid, invalid characters, reserved words, collision, 3 s rate limit, reset on leave); the outbox (atomic writes, ordering per signer, backoff, kill switch, restart idempotency); the receipts reader; `/api/web3/result/:hash` returns the canonical result and no names or tokens; **state leakage test**: no token, key or full address in `view()`, results or the event store (the pattern in `tests/party/event-store.test.cjs`); the phone signer bundle equals its source.

**ENS ([02](02-ens-guide.md)):** the CAN and CANNOT book, on a Sepolia fork with `eth_call` assertions and, for the evidence file, real transactions: the host key can `unregister` a seat; the host key cannot mint, transfer, write another record or grant roles; a seat cannot `setText`, re-point or transfer; the registrar cannot grant a role it lacks the admin variant for; expiry by time travel (the seat stops resolving); revoke then the next `host.cmd` is refused within 5 s; `soft` falls back and says so when the RPC is down, `strict` refuses, and a chain **no** is never overridden by `soft`; label sanitising and collision; the warm pool refills; the hierarchy walker rejects a fake subtree; join by name resolves and rejects unknown names; a job replayed after a worker restart is a no-op.

**Arc ([03](03-arc-guide.md)):** the 40-plus contract tests (Appendix B there); platform tests: the payout vector equals the contract for ties, remainders and all rules; the start gate holds until Locked and cannot be bypassed by the delegated host or the kiosk auto-start; an abandoned staked match refunds and never settles; an unverified result cannot settle; a guest or agent seat cannot stake; the EIP-3009 signature verifies against the deployed USDC domain; a transaction below 20 gwei is not sent; log reads chunk at 9,999 blocks; fault injection (the relayer down never stalls a room, the pot stays refundable).

**Arkiv and Swarm ([04](04-arkiv-guide.md) section 11):** schema validators, ranking across more than 200 results, the **forgery tests** (a stranger's entity is ignored; a trusted console's entity with a wrong hash fails verification), **ownership tests** (readonly results cannot be patched by the console or the new owner; after the profile transfer only the player can edit or delete), **lease tests** (a live entry vanishes when renewals stop), a **Swarm round trip** and keeper re-upload giving the same reference, the **no-relay test** (Hall and `arkiv:query` work with the relay stopped), a grep proving **no encrypted Swarm reference** is ever sent in an entity, outbox batching and idempotency, a dead RPC or gateway never delays `finish()`.

**UI ([05](05-ui-integration.md)):** every demo scenario renders; row models; strings; the Results re-render on the `signature` change; the Stakes row disabled with reasons; the phone cards; the motion-permission regression test; pointer and D-pad reachability of every new `data-id`; skins `luna`, `classic`, `taxi`; the viewport matrix.

**Prediction market ([10](10-prediction-market.md), [11](11-prediction-market-ui.md)):** the numeric vectors (section 5.9 of 10) against the contract, the relay's pure functions and the UI projection; the 200,000-case fuzz; the 14 contract invariants and 60-plus tests; a lineup change voids the market; the start gate holds until the chain confirms the close; a bet whose nonce does not match its intent reverts; a late bet reverts (equal-timestamp blocks); seated players and their devices cannot bet; per-human caps; the bankroll refill rule and a farming attempt that must fail; reports A and B match and resolve, a forced mismatch voids, a single report never resolves, a veto only voids, anyone can void after the deadline; a reverting recipient cannot block other claims; the directory leaks no room code, token or seed (test); the verifier B re-runs a recorded replay on the same commit and produces the same `winMask`; the phone and shell scenarios and e2e of [11](11-prediction-market-ui.md) section 10.

**Fault injection (Q3), run as a suite:** ENS RPC down; Arc RPC down; worker killed mid-job; worker restarted; Arkiv down; Studio unreachable (irrelevant at runtime, but the pot console must still read the chain); a slow chain (10 s receipts); an RPC returning -32014; **in every case the room plays on and the labels say what is happening**.

## 4. The evidence book (committed to `docs/web3/`)

| File | Contents |
| --- | --- |
| `baseline-check.txt` | The pre-change `npm run check` output (to tell old failures from new) |
| `ens-evidence.md` | Spike answers; the deployment (parent, registries, resolver, the contracts commit pinned); **the CAN and CANNOT hash book**; party-open, seat-mint, grant, revoke and unregister hashes; a screenshot of the ENS explorer showing registry, expiry and roles |
| `arc-evidence.md` | Spike answers; the Studio `appId` and `webUrl`; deployments verified on the explorer; **hashes for create, each fund, lock, settle, each claim, refund and contest** (both outcomes); a pot console screenshot |
| `arc-ai-use.md` | Every Studio prompt, what came back, what was kept or changed (the Manila pattern); the Studio project URL; screenshots or a recording of Studio generating the contract and frontend |
| **`/arkiv/` at the repo root (not `docs/web3/`)**: `schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md` | **Mandated by Arkiv's brief**, one file per judging criterion, each with links, numbers or a runnable query ([18](18-arkiv-submission-pack.md)); `docs/web3/` keeps the evidence hashes and the reality run |
| `FEEDBACK-ens.md`, `FEEDBACK-arc.md`, `FEEDBACK-arkiv.md` | What worked, where we got stuck, what the docs lacked |
| `AI-USE.md` | Where and how AI assisted, with the spec files (this guide and the prompts) referenced; the event rules require documenting AI use |
| `architecture.png` and `architecture.mmd` | The diagram of [01](01-architecture.md) section 3 with **Studio, the pot console, the relay as backend, the worker, ENS, Arc and Arkiv** (a Mermaid source plus a rendered image, as Manila did) |
| `limitations.md` | An honest list of what is not done and what is play money |

`scripts/web3-evidence.mjs` appends to these files from real runs so the hashes are never typed by hand.

## 5. README requirements (per partner: the judges' view)

For each of ENS and Arc **and Arkiv with Swarm** a README section; **Arkiv's has its own mandated contents (writer wallet addresses, one runnable query, how Swarm is used, one openable Swarm reference, pre-existing versus new, the AI statement, the licence) in [18](18-arkiv-submission-pack.md) section 3**. For ENS and Arc, each section has: **one sentence of what breaks without the partner**; **the features used** (list the ENSv2 features: registry hierarchy, expiring subnames, EAC roles, permissioned resolver, records read by the product; list the Arc and Circle products: Studio, USDC, EIP-3009, the pot contract, Gas Station if used, CRE if used); **a proof table** (feature, where in the code with file and line, status, transaction hash); **both outcomes** for Arc (paid and refunded) and **both outcomes** for ENS (host command allowed and refused after revoke); the **trust model in plain words**; the **test counts and what they cover**; **known limitations**; the **bounty or track line**; and, for Arc, the **Studio project URL**.

## 6. The demo (3 minutes 30 seconds; a person speaking, no AI voice, a recorded screen, no speed-up)

1. **0:00 The physical hook.** The TV desktop; three people scan the QR and join with their own phones; no app, no wallet. One sentence: "phones are the controllers, and now the party is a name and the bet is a contract."
2. **0:25 ENS, live.** The Invite window shows `kart-otter-7k.play.<parent>.eth`; open the ENS explorer: the party registry, the expiry, the seats minted to the phones' keys. A fourth friend **joins by typing the name**. The Players window shows "host (on-chain)".
3. **0:55 The chain is the authority.** The host phone kicks a player (a registry `unregister` shows); **revoke the host role live** in the explorer: the phone's next command is refused ("the chain says no").
4. **1:25 The pot.** Host picks 1.00 play-USDC, winner takes all; each phone shows the terms card; **one tap each**; Chonk's collar tags light; "Locked" appears; Start enables. No gas, no wallet screen. Flash the Arc explorer: the pot contract and the funded events.
5. **1:55 The match** (the most reliable game: Star Catch, Bubble Burst or Golf). Ten seconds of real play.
6. **2:20 Settlement.** The result appears; phones agree; **the pot pays in under a second**; the Results window shows the receipt and the trophy name. Open the pot console: state, transactions, **Claim** done.
7. **2:45 The safety net.** A second pot; **kill the relay** (stop the process) and pull the **Refund** from the pot console; then show a contested pot refunding. One sentence: "the platform never holds the money."
8. **3:00 Predictions (if built; the booth showpiece).** Two phones in the audience scan the QR on the Kiosk board; the **odds board** shows the next match with seats A to C and live multipliers; each spectator picks a seat and predicts in three taps; the betting window closes (the padlock); the match plays; the **result card** appears on the phones and the winners are paid automatically; open the Predictions window's **Verify** on the finished row ("result matches its hash") and the contract on the Arc explorer.
9. **3:20 What is new.** Show Arc Studio's project URL and the generated contracts with their 100-plus tests; one sentence on ENS ("names, expiry, roles and receipts are read live, not mirrored"); then the **Arkiv and Swarm slice (about 45 seconds, [18](18-arkiv-submission-pack.md) section 4)**: the recap card, the Hall updating live, **the relay stopped and the board still loading**, `arkiv:verify` printing "Verified", a lease clearing a dead console's live match. (Trim steps 2 or 3 to fit; keep the stopped-relay moment.)
10. **3:35 Close.** The repository, the evidence book, "play money today, lawful regions later." (If predictions are cut, drop step 8 and the demo returns to 3:30.)

**Fallbacks:** a **scripted replay** of a complete staked match (recorded from a real run, played by the demo-session fixtures) if a chain or a phone fails on stage; `PARTNERS=mock` on the LAN if the venue Wi-Fi fails (labelled "demo mode: local providers"); screenshots of every explorer view in `docs/web3/`.

## 7. Rehearsals

Two full rehearsals on the hosted instance with real phones and a real TV (Q5): the first on 6 November, the second on 6 November. Checklist: relayer and registrar balances above the floor; faucets topped up (Circle 20 USDC per address per 2 hours behind a reCAPTCHA; Sepolia ETH; Arkiv test GLM behind a CAPTCHA); `npm run web3:preflight` green; the warm pool full; the worker running; the kill-switch file absent; the scripted replay verified; both demo phones' keys reset; the mock fallback verified; the explorer tabs open.

## 8. Submission checklist

Public repository (the owner has handled the repository question); small commits from the start of work; per-partner README sections; the evidence book; the architecture diagram; the demo video (2 to 4 minutes; ETHGlobal rejects anything outside that at upload); the Arc submission names its bounty and includes the Studio project URL; the ENS submission links the live demo and the open-source code; the AI-use record and spec files referenced; partner prize selection (up to three partners; several tracks of one partner count as one); submitted before **Saturday 6 November 00:00 IST** (no late submissions); stop building at 07:30.

## 9. Added tests and evidence (6 November, later)

**Reality ([12](12-reality-and-ledger.md)):** the module graph has no mock import in `on` mode; the loader refuses bypass flags; a verified badge cannot be set by the relay; a fake receipt is never verified; reindex equals live; the hash chain detects a tampered row; the completeness check surfaces an external transaction; **`npm run web3:reality` is run before every rehearsal and before the submission and its report is linked from the README**. **Accounts ([13](13-users-scenarios-and-accounts.md)):** the 19 scenarios as Playwright flows on phone, tablet and laptop viewports (with fake phones); device linking; recovery; the view-only sheet during `playing`. **Stats ([14](14-stats-and-leaderboards.md)):** rating vectors and property tests, bit-identical recompute, private rooms never reach global boards, mock results never counted. **Integrity ([15](15-integrity-and-anti-cheat.md)):** the adversary suite (14 scenarios) must all be detected as specified. **Situations ([17](17-situations-and-edge-cases.md)):** each catalogue row is a scenario or detector test; a 100-spectator burst within 30 s is accepted or cleanly refused with no stuck funds. **Arc-native ([16](16-arc-native-features.md)):** `arc-anvil` tests with separate USDC and EURC blacklist cases, the Memo path and its fallback, per-asset domain checks. **Evidence additions:** `docs/web3/reality-run-<date>.md`, `docs/web3/ledger-coverage.md`, the first stats checkpoint, the adversary-suite report, the EURC proof (a pot and a market in EURC with hashes).

**Demo additions:** open the **Ledger** window or `/ledger` right after a match and show every transaction of the match decoded in plain words, then **Verify now** on one; show the **Leaderboard** with the checkpoint status line; show a **laptop spectator** predicting by keyboard; show the **EURC room** with the same flow.
