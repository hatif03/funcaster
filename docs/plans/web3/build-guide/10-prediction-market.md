# Build guide 10: the spectator prediction market (mechanism, exact math, contract, auto-resolution, security)

Part of the [build guide](00-README.md). Status: plan, 6 November 2026. **No code is written.** The earlier plans covered only the **players' own pot** ([03](03-arc-guide.md): seated friends staking on their own match). **Spectator predictions are new in this document**: anyone with a phone can predict the outcome of a match they are not playing, discover live and upcoming matches, and be paid automatically. This document is the mechanism, the math, the contract, the resolution pipeline and the security design. The UI is in [11](11-prediction-market-ui.md). It is built from four research passes (market mechanisms with the real contracts read, resolution and security prior art, UI patterns, and the current code); the sources are at the end. **Play money only** (testnet, no-value tokens); the owner has stated that legal matters are handled.

Evidence marks: **[V]** verified in source or docs by a research agent; **[S]** secondary or from memory; **[code]** read in this repository; **[inf]** my inference.

## 1. What it is, in one screen

| | |
| --- | --- |
| **Who predicts** | Spectators: anyone who scans the QR on a TV or opens the spectator link. No seat, no app, no wallet screen. Seated players are barred from their own match |
| **What they predict** | Short matches (1 to 10 minutes) that the platform's replay verifier can check (every game except Drawing) |
| **Markets** | Created **automatically** by the relay for each match, never by users: **Winner** (2 to 4 outcomes = the seats) and **Beat the line** (2 outcomes: a seat's score beats a threshold, or not) |
| **Mechanism** | **Pari-mutuel pools** with stake-protected profit sharing: everyone's stakes go in one pool per market; winners get their stake back plus a share of the losers' stakes (plus an optional sponsor bonus). No house, no liquidity provider, **cannot be insolvent** |
| **Timing** | Betting **closes before the match starts**; the close time is on-chain and immutable; the match starts only after the chain confirms the close |
| **Resolution** | **Automatic**: the result is produced and replay-verified, then **two independent reports must agree** on a full commitment or the market **voids** and refunds everyone; anyone can void after a deadline |
| **Payout** | Automatic: the relayer claims for every winner right after resolution; claims are pull-based so one bad recipient cannot block anyone |
| **Cost to the user** | 3 taps per prediction, 0 prompts, 0 gas ([09](09-seamlessness-and-signing-budget.md)) |

**What breaks without Arc:** the pools, the close time, the payout math and the refunds are the contract's, not the relay's. **What breaks without Arkiv:** the TV's "Top predictors" and the market history would be a local file; with Arkiv they are shared, queryable and ownable. **What breaks without ENS:** outcomes would show only seat names; with ENS they show the seats' on-chain names and the market links to its party. **World:** per-human caps and the faucet.

## 2. Mechanism choice (verified comparison)

| | **Pari-mutuel (chosen)** | LMSR | FPMM/CPMM (Omen, Manifold) | Dynamic pari-mutuel | Order book (Polymarket) | Fixed-odds LP (Azuro) |
| --- | --- | --- | --- | --- | --- | --- |
| Solvency | **Exact**: payouts never exceed the pot | Bounded by a subsidy `b ln n` | Bounded by LP funds | Exact | Exact (full sets) | LP pool and a per-market cap |
| Who bears risk | Bettors only | The sponsor (bounded) | LPs (impermanent loss: a 0.9 push on a 100/100 pool leaves the LP down about 67 percent before fees [V]) | Bettors | Traders | The LP |
| Works with 2 to 30 bettors | **Yes** | Yes, needs a subsidy per market | Needs seed liquidity | Yes | **No** (no makers) | Needs an LP |
| Price when you bet | Projected, final at close | Exact | Exact | Projected | Order price | Locked |
| On-chain math | Multiply and divide | `exp` and `ln` with fixed-point libraries, offsets and rounding discipline | Products with `ceildiv` | A square-root-like cost | Matching operator | An iterative margin loop |
| Needs an admin or counterparty | **No** | A funder | An LP | No | An operator | An LP and an oracle |

**Decision: pari-mutuel.** Reasons: it is the only mechanism with **no subsidy, no counterparty and a one-line solvency invariant**; it works with a handful of bettors; it is all integer math; and PancakeSwap Prediction runs the same family in production (read in its verified source [V]). **Its weaknesses and our answers:** odds are not final until close (so the UI says so, and the bet carries a minimum-payout guard); information advantage (so markets close before the match); thin or one-sided pools (so they void rather than strand funds); players influencing the result (section 8). **LMSR is the documented upgrade** for a future Kiosk with instant odds and a sponsor-funded subsidy (formulas in section 5.8); it is not built now.

**Two defects found in the real pari-mutuel contracts we read, fixed here:** (1) in PancakeSwap Prediction and in Azuro's pool betting, if the winning side has **no stakes** the rest of the pot has **no exit path** (stranded) [V]; we void and refund. (2) PancakeSwap charges its fee on the **whole pot**, so a winner can receive **less than their stake** (a 99/1 pool at a 3 percent fee pays a 99 stake back 97.0) [V]; our fee comes **only from losing stakes**, so winners never get back less than they put in. Also not copied: "tie means the house wins" and "no opponent means the house keeps it" [V].

## 3. Markets and resolution rules (immutable at creation)

Each market stores a `rulesHash` of its plain-language rules text, so rules cannot be reinterpreted afterwards (the Polymarket Ukraine market of March 2025 resolved against its own clarification, with no refund path: a lesson in ambiguity [S]).

### 3.1 Eligibility

A market exists only if: the game's verification tier is **verified** (every game except Drawing, which is attested [code: `core/catalog.js` 226 to 230 and 326 to 338]); the room is **listed** (the host or the Kiosk opted in); the lineup is fixed and ready; and the Arc service is healthy. **Solo versus AI matches get no Winner market** (`result.scores` holds only the human slot; "human beats the AI" is not derivable [code]); they get **Beat the line** only.

### 3.2 Templates

| Template | Outcomes | Resolves to |
| --- | --- | --- |
| **WINNER** (2 to 4 seats, multiplayer only) | One outcome per seat (A, B, C, D by slot) | The seats with `rank == 1` **and** outcome `finished`. Several tied seats are a **dead heat** (section 5.5). If no seat finished, the market is **void** |
| **BEAT_THE_LINE** (seat k, line L.5) | Two: "Beats L" and "Falls short" | Beats if the seat's `score` is better than L in the game's direction (higher is better except Pocket Greens and Kart Rush, where lower is better); L always ends in .5 so there is no equality. A seat outcome of **dnf** (the game reported it or the time cap hit) means **Falls short**; **forfeit, removed or abandoned** makes the market **void** |

**The line** is chosen by the relay at creation from the median of that game and mode's recent results in the event store, falling back to the catalog `target` (Star Catch 180, Neon Drift 250, Bubble Burst 250) or a measured table, rounded to a .5 and clamped; it is stored in the market and in `rulesHash`. **Task: measure typical score distributions from event-store records before the event** (the typical ranges in the table in section 3.3 are partly estimates).

### 3.3 Game semantics (from the code read; "(est.)" means read from logic, not measured)

| Game id | Title | Humans (solo / multi) | Score direction | Typical score | Tie possible | Match length |
| --- | --- | --- | --- | --- | --- | --- |
| `star-catch` | Star Catch | 1 / 2-4 | higher | up to about 900 (est.); target 180 | rare | 60 s (+9 s) |
| `neon-drift` | Neon Drift | 1 / 2-4 | higher | up to about 1150 (est.); target 250 | rare | 60 s (+9 s) |
| `bubble-burst` | Bubble Burst | 1 / 2-4 | higher | up to about 1250 (est.); target 250 | rare | 60 s (+9 s) |
| `fruit-ninja` | Slice Dojo | 1 / 2-4 | higher | about 100 to 500 (est.); **co-op default gives every seat the same score** | yes, always in co-op (**no Winner market in co-op**) | 120 s |
| `golf` | Pocket Greens | 1 / 2-4 | **lower** | strokes, about 8 to 16 for 3 holes (est.) | yes | turn-based, 45 s a turn |
| `mario-kart` | Kart Rush | 1 / 2-4 (+CPUs) | **lower** (place) | place 1 to 8 | no, except DNF | 1 or 3 laps, cap 600 s |
| `kart` | Time Trial | 1 / 2-4 | higher | about 82k to 91k (est.) | rare | 3 laps, cap 300 s |
| `table-tennis` | Table Tennis | 1 (vs AI) / 2 | higher | 0 to 7 (or 11) | only on timeout | cap 120 s |
| `swordplay` | Foam Fencers | 1 (vs AI) / 2 | higher | 0 to 3 | only on timeout | cap 120 s |
| `island-flyover` | Cloud Cruise | 1 / 2-4 | higher | 0 to 2000 (rings x 100) | yes, likely | cap 300 s |
| `shooting-range` | Shooting Range | 1 / 2-4 | higher | about 150 to 700 (est.) | rare | 60 s round |
| `alien-attack` | Alien Attack | 1 / 2-4 | higher | about 500 to 8000 (est.) | rare | endless, cap 300 s |
| `drawing` | Drawing | 1 / 2-4 | higher | varies | yes | **not eligible (attested)** |

Rank is dense: tied seats share a rank; DNF, forfeit and removed seats rank after finishers [code: `server/records.cjs` 69 to 77]. **Pocket Greens (turn-based) and the endless games are poor fits for short markets**; ship the 60-second server-simulated games (Star Catch, Neon Drift, Bubble Burst) first, then Time Trial, Cloud Cruise, Shooting Range and Table Tennis, and Pocket Greens last.

### 3.4 Void triggers (written into `rulesHash` before the market opens)

Any of: the **lineup changes** after the market opens (a seat leaves, is replaced or forfeits before the start); the match is `no-contest` or `abandoned`; **verification fails**; a seat **forfeits, is removed, or goes idle** per the rules above; the **two reports disagree**; **no report by `resolveDeadline`**; **no stakes on any winning outcome**; fewer than **two outcomes have stakes at close** (auto-void so nobody holds a free option on the bonus); an integrity flag raised before resolution (void only, never flips an outcome).

## 4. Lifecycle

```text
Lobby ready -> LINEUP LOCKED -> market created (Open) -> betting window -> CLOSE (on-chain, immutable)
   -> guard (5 s + chain confirms close + relayer queue drained) -> MATCH STARTS -> match plays
   -> RESULT (canonical, replay-verified) -> reports A and B (and C) -> liveness window
   -> RESOLVED (claimable) or VOIDED (refund)  -> auto-claims -> receipts
```

- **Lineup lock.** When markets are on, "ready" is not enough to start: the relay **locks the lineup**, creates the market (n outcomes = the locked seats) and opens betting; **a seat leaving during the window voids the market and re-announces** a new one (the kiosk's `rotate` re-queues players, so seats are not stable otherwise [code]). In kiosk mode the existing 10-second pre-start countdown is replaced by the **betting window** (default 60 s, configurable 30 to 120 s; a minimum of 30 s even with no bets).
- **Start gate.** `party.start()` holds until `closeTime + guard` has passed **on-chain** (read the latest block timestamp) and the worker has drained pending bets: the gate belongs in `start()` itself (the raw host `start` event bypasses `startReason`), with a reason string for `startReason` (never the `"Ready to play"` literal) [code].
- **Market keying.** The market is keyed by the opaque `matchRef` and the room's next `roundId`; it binds to the real `matchId` when the match starts (`matchId` includes `startedAt`, known only then) [code].
- **Seed commitment (integrity hardening).** The relay generates the match seed at lineup lock, publishes `seedCommit = sha256(seed ‖ salt)` in the market, and uses that seed at `start()` (a small hook where the seed is chosen) instead of drawing a fresh one after the bets are in; the result's `seed` must match the commit and the verifier checks it. This stops the operator choosing a seed after seeing the pool, and the seed stays secret until the start so nobody can pre-simulate a server-simulated round.

## 5. The exact math

All amounts are USDC base units (6 decimals) in `uint128`. A market has `n` outcomes (2 to 4).

### 5.1 State

`P[i]` stake on outcome `i`; `T = Σ P[i]`; `B` sponsor bonus; `φ` fee in basis points (**default 0**, hard cap 1000); `stake[user][i]`; `claimedStake[i]`; `status ∈ {Open, Resolved, Voided}`; `winMask` (a bitmask: one bit is a single winner, several bits a dead heat).

### 5.2 Betting

Accept only if `block.timestamp < closeTime` (strict), `status == Open`, `minBet ≤ x`, `stake[user] + x ≤ maxPerAddress`, `T + x ≤ maxPool`, the user is not in `excluded[]` (the seated players' addresses), and (if the market requires it) a valid **permit** from the relay. Then `P[j] += x; stake[user][j] += x`. **A bettor may hold several outcomes** in one market (hedging), but the UI shows each bet separately.

### 5.3 Resolution inputs

`win_i = (winMask bit i) ∧ (P[i] > 0)`; `nw = Σ win_i`. If `nw = 0` (all pools empty or nobody backed a winner) the market is **VOID_NO_WINNER**: every stake is refunded and the bonus returns to the sponsor.

### 5.4 Payout (stake-protected profit sharing)

```text
W   = Σ_{i: win_i} P[i]                    winning stakes
L   = T − W                                losing stakes
fee = floor(L · φ / 10000)                 only from the losers (default 0)
Pr  = L − fee + B                          profit pool, always ≥ 0
slice_j = floor(Pr / nw)  per winning outcome j (the remainder goes to the lowest-index winner)
payout(bettor on winning j with stake s) = s + floor(slice_j · s / P[j])
payout(bettor on any other outcome)      = 0
```

For a single winner this equals the classic `s · (T + B − fee) / P[j]`. **A winner's payout is always at least their stake** (because `fee ≤ L`). If everyone is on the winning side, winners get their stake back plus the bonus share.

### 5.5 Dead heat

A tie among `k` outcomes splits the profit pool into `nw` equal slices, one per **tied outcome that has stakes**; a tied outcome nobody backed contributes no slice and its share goes to the others (nothing is stranded). **This differs from a racetrack's traditional dead-heat rule (split the whole pot by outcome), under which a tied winner can lose money; ours protects stakes.** The UI states it plainly.

### 5.6 Rounding and dust: zero dust by cumulative floor

For each winning outcome `j`, with `c = claimedStake[j]` before this claim: `payout = s + floor(slice_j·(c+s)/P[j]) − floor(slice_j·c/P[j])`, then `c += s`. The payouts telescope, so the sum over all claimers equals `slice_j` **exactly**; no dust remains, and no `sweepDust` function exists. (A simpler per-claim floor leaves under one unit per claimer; both were fuzzed over 200,000 random cases with 2 to 4 outcomes, bonuses, fees up to 10 percent, ties and voids, and held every invariant [V in the research scratch implementation].) **Void refunds** are the exact stakes (no division, no fee). The fee rounds **down against the house**; payouts round down against the claimant; the minimum bet keeps both non-trivial.

### 5.7 Odds display and the projected payout

- **Pool share (crowd view):** `share_j = P[j] / T`.
- **Current decimal multiplier if outcome j wins alone:** `mult_j = 1 + (T − P[j] − fee_j + B) / P[j]` with `fee_j = floor((T − P[j])·φ/10000)`. Show one format only: **"1.6x"** plus the share **"60%"** (no cents, fractions or American odds). With a bonus or fee the implied probabilities need not sum to 1.
- **Projected payout for a prospective bet `x` on `j`, including its own impact:** `proj(x, j) = x + floor((L_j − fee_j + B) · x / (P[j] + x))` with `L_j = T − P[j]`. It assumes `j` wins alone and nobody else bets; the UI labels it **"if no one else bets"**. If `T = 0` and `B = 0`, show **"no opponents yet"**, not 1.00x.
- **The bet carries `minPayout`:** the contract reverts if `proj` at inclusion is below it (protects against a stale screen or a delayed relayer). It cannot protect against later dilution, so the label says "estimate, final at close".

### 5.8 The documented upgrade (not built): LMSR

Cost `C(q) = b · ln Σ e^{q_i/b}`; price `p_i = e^{q_i/b} / Σ e^{q_j/b}`; the cost of buying `Δ` shares of `i` is `C(q + Δ·e_i) − C(q)`; the maximum subsidy loss is `b · ln n`; choose `b = budget / ln n`. Example (`n=2`, `b=10`): funding 6.93; spending 5 on A buys 8.318 shares at an average price 0.601 and moves A's price 0.50 to 0.697. Needs fixed-point `exp` and `ln` (Gnosis used a binary-log base with a log-sum-exp offset; PRBMath's `exp` reverts at inputs of 133.084 or more [V]), cost rounded up and shares rounded down, and a funder per market. Offers instant odds; costs a subsidy and a heavier audit. **Revisit only if pari-mutuel proves too thin at the booth.**

### 5.9 Test vectors (commit these to `tests/web3/vectors/market-payouts.json`; the contract, the relay's pure `payoutVector` and the UI's projection must all agree)

| # | Case | Result |
| --- | --- | --- |
| 1 | Pools 60/30/10/0, fee 2 percent, no bonus. Seat 0 wins | L = 40, fee 0.80, Pr = 39.20; a stake of 20 on seat 0 gets **33.066666**; seat 1 bettors get 0 |
| 1b | Same pools, seat 2 wins | L = 90, fee 1.80, Pr = 88.20; a stake of 10 on seat 2 gets **98.20** |
| 1c | Projected payout for a new 10 bet | seat 2: **54.10 (5.41x)**; seat 0: **15.60 (1.56x)**; empty seat 3: **108.00 (10.8x)** |
| 2 | One side only: 40 on A, B empty, bonus 10, fee 2 percent. A wins | L = 0, Pr = 10; the bettor gets **50**. (If B wins: no winner has stakes, **void**, refund 40, bonus returned. Under the close rule this market auto-voids at close) |
| 3 | Tie of seats 0 and 1, seat 1 has no stakes; pools 30/0/50/20, fee 2 percent | Only seat 0 is a winner: L = 70, fee 1.40, Pr = 68.60; a stake of 30 gets **98.60** (seat 1's share is not stranded) |
| 3b | Tie, both tied outcomes backed: A=60, B=20, C=20, A and B tie, fee 2 percent | L = 20, fee 0.40, Pr = 19.60, slice 9.80 each; A's 60 gets **69.80**, B's 20 gets **29.80**; nobody loses money (a traditional dead heat would pay A's 60 only **49.80**) |
| 4 | All pools empty | **Void**, bonus back; a first 5 bet shows "no opponents yet" (5.00 without a bonus, 15.00 with a bonus of 10) |
| 5 | Rounding: A = 33.333333, B = 66.666667, bonus 10, no fee, A wins; A stakes 10.000001, 10.000001, 13.333331 | Cumulative floor pays 33,000,003 + 33,000,004 + 43,999,993 = **110,000,000** exactly (T + B); a plain floor leaves 2 units of dust |
| 6 | Explicit void with a bonus: pools 60/30/10, bonus 7 | Each stake refunded in full; the sponsor gets 7 back |

## 6. Resolution: the dual-report, agree-or-void pipeline

### 6.1 Rules (distilled from Polymarket and UMA, Gnosis CTF, Reality.eth, PancakeSwap's refund rule, and the Chainlink consumer guidance)

1. **Void is permissionless and time-based**: anyone can call `voidIfExpired` after `resolveDeadline`; **there is no admin path to resolve after close** (PancakeSwap's `refundable` pattern [V]; the Gnosis CTF has no fallback if its oracle never reports, which is the gap we close [V]).
2. **Reports match on a full commitment**: `(chainId, contract, marketId, resultHash, winMask)`; never on the winner alone. This also gives replay protection for Chainlink reports.
3. **Distinct signer per layer; each layer counts once.**
4. **A and B are not independent** of each other (same operator, same code). At least one matching report must come from outside our infrastructure: **C**. The default quorum for a demo is A and B; **a configuration with C is the recommended one**, and the README says so honestly.
5. **A mismatch never resolves.** The market stays open until a third report arrives or the deadline passes, then voids. One compromised key cannot resolve or force a void alone.
6. **A liveness window** (60 to 120 s) after the matching pair, in which **only the verifier B can veto**, and a veto can only void (it can never flip an outcome).
7. **Fix the oracle set and the rules text at creation** (the Gnosis CTF pattern); **no post-hoc clarifications**.

### 6.2 The layers

| Layer | Process | What it does | Independence |
| --- | --- | --- | --- |
| **A. Relay reporter** | The worker (key `MARKET_REPORTER_A`) | Computes `winMask` from the canonical result with the pure function `resolveMarket(template, params, result)` and reports | The platform |
| **B. Independent verifier** | A **separate process** (`scripts/web3-verifier.mjs`, its own key, ideally its own machine) | Fetches `{result, replay}` from `GET /api/web3/replay/:hash` (authenticated by a verifier token), **re-runs the replay with the repository's own verifier** (`logic-replay`, `mini-replay`, `slice-replay`, `party-engine`, `shared-round`; pure Node, no browser; about 0.5 s typical, a 30,000-step kart replay with 7 CPUs about 1.7 s [code, measured by the research agent]), checks the hash chain (`replayHash`, `hash`), the **seed commit**, and recomputes `winMask`, then reports (or vetoes) | Separate process and key, **same code and same build**: it must run the exact `bundleHash` commit (any byte change in `core/`, `games/`, `sdk/` or the engine files makes old records unverifiable by another build); native `Math` means the same Node major and architecture as the relay |
| **C. Chainlink CRE** (recommended, stretch) | A CRE workflow | Fetches the result (under 8 KiB) from the public endpoint with node consensus, **recomputes the canonical hash and `winMask` from the published scores**, and writes the report through the Arc KeystoneForwarder; the consumer **pins the forwarder, the workflow id and the owner** and checks the chain and market id. Quotas: 250 KB HTTP response, 15 HTTP calls and 5 minutes per run, triggers at most once per 30 s [V] | **Outside our infrastructure.** Honest limit: replays can exceed 250 KB, so C proves that the result is **consistent with its published hash and scores**, not that the game was played honestly; B proves the replay. The README states this |

**Replay availability** is a hard requirement: today `{result, replay}` is host-only over a socket and kept in RAM for 20 matches [code]. Add a worker-side export at `finish()` and the endpoint `/api/web3/replay/:hash` (verifier token only), **and publish the replay to Swarm with its reference and hash in the Arkiv `result`** ([04](04-arkiv-guide.md) section 6; no chunking under 128 KiB is needed) so any third party can verify without trusting our relay. (6 November: the market's `market` and `predictor` entities are now a `live` entry with `kind=market` and a `score` board; bet positions stay on Arc.)

### 6.3 Resolve sequence

`finish()` → the relay builds the result and `winMask` → A reports → B re-verifies and reports → the contract sees two identical commitments from distinct layers → the **liveness window** runs → anyone calls `finalize` (the worker does) → status **Resolved** → the worker `claim`s for every winner and every refund → receipts. A mismatch or a veto or a missed deadline → **Voided** → refunds.

## 7. The contract: `MatchMarkets` (a second contract in the same Arc Studio app)

Generic and reusable like `ConditionalPot` ([03](03-arc-guide.md)); the **allowed assets are an immutable constructor list of up to four ERC-20 addresses** (by default Arc USDC `0x3600…0000` and EURC `0x89B5…D72a`, both Circle FiatToken v2.2 with 6 decimals, see [16](16-arc-native-features.md); an optional play token for volume, section 9); **each market names exactly one asset and never mixes assets**; there is no admin who can add a token. **No owner, no pause that can touch claims, no fee unless configured at creation, no upgrade.**

| Function | Caller | Notes |
| --- | --- | --- |
| `createMarket(marketId, n, closeTime, resolveDeadline, livenessWindow, rulesHash, seedCommit, bonus, feeBps, minBet, maxPerAddress, maxPool, excluded[], reporters[], quorum, permitSigner)` | the **operator** (the worker) | `closeTime` immutable; `bonus` pulled from the operator and returned on void; `reporters[]` fixes the oracle set; `permitSigner` zero means no permit needed; reverts if `marketId` exists |
| `bet(marketId, outcome, amount, minPayout, salt, permit, authorization…)` | **anyone** (the relayer, or the bettor) | Pulls `amount` with the token's EIP-3009 authorization; **the authorization nonce is `keccak256(marketId, outcome, amount, minPayout, bettor, salt, chainId, contract)`** and the contract recomputes it, so a relayer cannot change the outcome or amount; `validBefore ≤ closeTime`; uses the asset's **`receiveWithAuthorization`** (verified present on Arc USDC and EURC on 6 November 2026: only this contract can pull, so a relayer or observer cannot front-run the signature; no rescue path needed); accounts in **storage**, never `balanceOf` |
| `report(marketId, layer, resultHash, winMask, sig)` | the layer's signer (or the CRE forwarder through `onReport`) | One report per layer per market; full commitment; conflicting reports block resolution |
| `veto(marketId)` | the verifier only, inside the liveness window | Void only |
| `finalize(marketId)` | anyone | Needs the quorum of identical reports, no conflict, the window elapsed; sets `winMask`, status Resolved |
| `voidIfExpired(marketId)` | **anyone** | After `resolveDeadline` with no resolution; or at close if fewer than two outcomes have stakes |
| `cancelBeforeClose(marketId)` | the operator, **only before `closeTime`** | For lineup changes; voids and refunds |
| `claim(marketId, user)` | **anyone** | Pays `user` (the payout, or the exact refund on void); zero the balance first; a reverting recipient reverts only their own claim; **no loops over bettors** |
| `revealSeed(marketId, seed, salt)` | anyone after resolution | Checks `seedCommit` (an audit aid) |
| `withdrawBeforeClose(marketId, outcome, amount, sig)` | the bettor (submitted by anyone) | **Optional** (the UI's Undo, [11](11-prediction-market-ui.md) section 6.3): returns an own stake before `closeTime` against an EIP-712 `Withdraw` signature; if not built the UI says predictions are final |
| views | | `getMarket`, `poolOf`, `projectedPayout(marketId, outcome, amount)`, `claimableOf` |

**Invariants and tests** (Foundry invariant tests with a multi-actor handler and ghost variables for total staked and total paid; `bound()` not `vm.assume()`; `fail_on_revert = false` [V]; add Echidna or Halmos if time allows): (1) solvency: paid plus owed is at most staked plus bonus per market, always; (2) no double claim; (3) no claim before resolve and no refund before void; (4) a void refunds exactly the stakes with zero fee; (5) on resolve the claims sum to the profit pool exactly (zero dust with the cumulative floor); (6) ties conserve the pool; (7) state is monotonic, Resolved and Voided are terminal, `closeTime` never changes; (8) no bet at or after close, tested with equal-timestamp blocks; (9) one report per layer, a mismatched pair never resolves, a single report never resolves, a veto only voids, `voidIfExpired` works from any caller; (10) a random caller cannot call operator, report or veto functions; (11) a bet whose nonce does not match its intent reverts; (12) sending USDC straight to the contract never changes any payout; (13) a reverting or blocklisted claimant cannot block the others (a mock token that reverts for one address, and the real Arc blocklist test address `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`); (14) unit cases: 1-unit stakes, a 100 percent one-sided pool, the maximum stake, decimals; plus the test vectors of section 5.9. **At least 60 tests.**

## 8. Security design (the 12 rules, mapped to this system)

| # | Rule (source) | How it is built |
| --- | --- | --- |
| 1 | **Close early and make the close immutable** (Fomo3D last-second bets and block stuffing [S]; Arc's non-strict timestamps [V]; short-horizon settlement pushing seen on Polymarket 5- and 15-minute contracts, one preprint [S]) | Betting closes **before the match starts**; `closeTime` is immutable; the match starts only after the chain confirms the close and the relayer queue is drained, with a guard of at least 5 s; the seed is committed before bets and revealed after |
| 2 | **Void is permissionless and time-based** | `voidIfExpired`; no admin resolve after close |
| 3 | **Agree-or-void on a full commitment** | Section 6 |
| 4 | **One report from outside our infrastructure** | Layer C; the honest limit is documented |
| 5 | **Bar seated players, cap per human, cap the pool** (ESIC treats betting against your own team as strong evidence of match-fixing; Kalshi moved to pre-trade screening of athletes in March 2026 [S]) | `excluded[]` (the seated players' bound addresses, **plus their devices and the phone session id**, enforced by the relay's permit); **per-human caps by World ID nullifier** at the relay (the permit refuses a bet over the cap); `maxPerAddress` and `maxPool` on-chain; **residual risk stated**: a friend or a second wallet can still bet (play money, small caps) |
| 6 | **Void triggers written before the market opens** | `rulesHash`; section 3.4 |
| 7 | **Ties pay as a split, never as void or house win** (a void is a free hedge for a thrower, who can force a tie and recover the stake [S]); an empty winning pool voids | Section 5.5 and 5.3 |
| 8 | **Pull claims, no loops** (Akutars locked about $34M behind a griefing refund loop [S]; Arc blocklist reverts burn gas [V]) | `claim` per user |
| 9 | **Bind the bet to the signature** (a pending EIP-3009 authorization can be submitted to the token directly [V]) | The nonce is the intent hash; `validBefore ≤ closeTime`; `receiveWithAuthorization` (verified present); anyone may submit; **two relayers**; the bettor can `cancelAuthorization` an unused one |
| 10 | **Account in storage; round against the user; a minimum bet** (Balancer lost about $100M+ to rounding in November 2025 [S]) | Section 5.6 |
| 11 | **Separate keys, tiny balances** (Polymarket's 6 November 2026 loss of $573,200 came from a compromised operator top-up wallet, not a contract bug [S]) | Operator, relayer, reporter A, verifier B and the permit signer are **different keys**; the relayer holds gas funds only, never user funds; the operator cannot move resolved markets or block claims |
| 12 | **Test the invariants first** | Section 7 |

**Further controls:** only the relay **creates** markets, tied to a real seated match, with a cap per room and per hour (spam; Reality.eth charges a per-question fee for the same reason [V]); the single hard-coded token (no fee-on-transfer or hook tokens; ERC-777 callbacks cost about $25M in April 2020 [S]); `nonReentrant` on every state-changing function; a **monitor** (off-chain) that alerts on one funding cluster holding more than a set share of one side, brand-new wallets betting within seconds of each other, and a seat's device matching a bettor; **throwing signals** (idle seat, near-zero input entropy, a score far below the seat's history) can **void** a market before the matching pair lands but never flip an outcome; `receiveWithAuthorization` availability and the Arc drain quirk (a transfer that fully drains a brand-new sender account reverts [V]) are spikes (section 11). **Audit before any real value** (this build is play money).

**Spectator abuse:** bankroll farming of the faucet and the leaderboard: our own faucet (section 9) with one claim per World nullifier per day and a per-device limit; **play money is non-transferable** (the contract only pays the address that bet), so sybils cannot funnel bankrolls; the "top predictors" ranking is per human (nullifier), needs a minimum number of distinct markets, and weights by stake; two wallets betting opposite sides to climb the board are excluded by correlated-funding and timing checks; UI deception is handled by the minimum-payout guard and the plain "estimate" wording ([11](11-prediction-market-ui.md)).

## 9. Bankroll, faucet and the play-money economy

**Constraint (sources conflict; plan for the stricter figure):** the Arc docs say the Circle faucet gives 20 USDC per request per address every 2 hours behind a reCAPTCHA; Circle's developer docs say 10 USDC per request, once per 24 hours per token per testnet [S]. Assume **10 per address per 24 hours** and **no scripted drip**.

| Choice | Value |
| --- | --- |
| Stake chips | 0.05, 0.10, 0.25, 0.50, 1.00 USDC; **minimum bet 0.05**; **maximum per address per market 1.00**; **maximum pool per market 25** |
| Starting bankroll | 1.00 USDC per device on first spectator visit; **refill 1.00 only when the balance is under 0.10, at most once a day** per device and per World nullifier; non-transferable |
| Funding the relayer bankroll | Team members request from the faucet to their own addresses over several days and send to the relayer: 8 addresses give 80 USDC per day at the stricter figure, enough for about 80 spectators on day one; recycled winnings extend it |
| Volume option | A **play token** instance: our own ERC-20 (`CHONK`) with EIP-3009 and a relayer-only open mint, deployed alongside; the same contract, a different constructor argument; the USDC instance stays the headline for the Arc bounty. Build only if faucet limits bite |
| Bonus | The sponsor may add a small bonus per market (for example 0.50) to make thin markets attractive: it is a **bounded, explicit subsidy** (the pari-mutuel analogue of LMSR's `b ln n`), returned on void |

## 10. Discovery data (what the relay publishes, and what it must not)

`GET /api/web3/matches` (public, rate-limited, cached 1 s) and the read-only socket namespace `/market` (for live updates) publish, per **listed** room, only a whitelisted row built by a new `publicMatch(room)` function (never `view()`, which leaks the seed and custom words and carries the room code):

```text
{ matchRef (opaque id, an HMAC of the room code), game, title, phase (lobby | betting | locked | live | resolving | final | void),
  seats: [ { slot, label, color, ens? } ], closesAt, startsAt, endsAt, humans, mode,
  markets: [ { marketId, template, outcomes: [ { index, label, pool, share, mult } ], pool, closesAt, status } ],
  resultSummary? }
```

**Never exposed:** the room `code` (the join secret: a public list of codes would let anyone take seats or fill every kiosk's queue [code]), any token, `match.seed` before the reveal, `customWords`, device info, staff state, rooms with no host. **Listing is opt-in per room** (a host switch; on by default in Kiosk mode), because nothing groups a booth's TVs and ordinary party rooms must not be listed. The shell sees only its own room today; a cross-room list needs this directory (poll it every 2 to 3 s or subscribe to `/market`); **the shell's host socket gets no rights over other rooms**.

## 11. Spikes, tasks and effort

**Spikes (record in `docs/web3/market-evidence.md`):** ~~S-MKT-1~~ resolved on 6 November (`receiveWithAuthorization` exists on Arc USDC and EURC); S-MKT-2 a fresh faucet account that bets exactly its whole balance (the drain quirk); S-MKT-3 measure score distributions per game from event-store data; S-MKT-4 replay verification of a recorded match by a separate process on the same commit (confirm identical `winMask`); S-MKT-5 on-chain block timestamp granularity and a safe guard; S-MKT-6 CRE: can a workflow recompute the canonical hash from a result JSON.

| ID | Task | Depends | Hours | Acceptance |
| --- | --- | --- | --- | --- |
| M0 | Spikes S-MKT-1 to 6 | A0 | 4 | Answered |
| M1 | Pure functions with test vectors: `payoutVector`, `projectedPayout`, `resolveMarket`, line selection | S2 | 8 | Vectors of section 5.9 pass; 200,000-case fuzz equals the reference |
| M2 | `MatchMarkets` in Arc Studio (prompt in Appendix A), 60+ tests, deploy | A1 | 16 | Contract on Arc testnet; invariants green |
| M3 | Relay lifecycle: listed flag, lineup lock, create market, betting window, start gate, abandon and lineup-change voids, seed commit and the seed hook | S2, M1 | 14 | A scripted room runs the full lifecycle in mock and on testnet |
| M4 | Directory: `publicMatch`, `/api/web3/matches`, `/market` namespace, opaque ids | M3 | 6 | No code or seed leaks (test) |
| M5 | Worker: market jobs (`create`, `bet`, `report`, `finalize`, `claim`, `void`), the permit signer, two relayers | M2, S3 | 10 | A bet round trips; auto-claim works |
| M6 | Reporter A, **verifier B as a separate process**, replay export and endpoint | M3, M5 | 10 | Matching reports resolve; a forced mismatch voids |
| M7 | Spectator phone page and the Predictions window ([11](11-prediction-market-ui.md)) | M4, U1 | 84 | UI tasks P1 to P9 in [11](11-prediction-market-ui.md) section 11 |
| M8 | Bankroll, faucet policy, per-human caps with World nullifiers, `excluded` enforcement, monitor | M5 | 8 | Caps enforced; farming test fails to farm |
| M9 | Arkiv: `market` and `predictor` entities, top predictors, replay publication (these types were folded into the core types and the stats lane: see [04](04-arkiv-guide.md) section 5 and [14](14-stats-and-leaderboards.md); predictors **never** include bots or seated players) | K1 to K4 | 6 | Live leaderboard of predictors |
| M10 | Stretch: layer C (CRE), play token, odds history chart, "How it works" wizard | M6 | 14 | Per spec |
| M11 | Tests, fault injection, evidence, demo | all | 12 | [07](07-tests-evidence-demo.md) |

About **190 hours** in total (M7 alone is 84); **Tier 1** (M0 to M6 with the Winner template, a minimal phone page, the Predictions window and the Game Properties row) is about **125 hours**. **Scope warning: this is the largest lane in the whole guide, larger than ENS or the pot.** Build it only after the pot (A lane) and host enforcement (E5) work; if time runs short, ship **Tier 1**, or cut to a **TV odds board plus the contract with scripted bettors** for the demo. The schedule and cuts are in [06](06-tasks-and-codex-prompts.md). **Cut order:** layer C, the play token, the odds chart, Beat-the-line, the seed commit, the wizard; **never cut** the invariants, the close rule, the agree-or-void rule, the exclusion of seated players and pull claims.

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| Players or friends fix the match | Section 8 rules 1, 5, 7; caps; play money; stated residual risk |
| Result source trust (A and B share our trust) | Layer C and the replay on Arkiv; stated limits |
| The relayer censors bets or reports | Anyone may submit a signed bet; two relayers; `voidIfExpired` and `claim` are permissionless |
| Thin markets feel empty | Sponsor bonus; auto-void when one-sided; the Kiosk and attract board bring spectators; the first booth session tunes defaults |
| Faucet limits | Section 9 |
| Lineup instability in kiosk mode | Lineup lock and void on change |
| Kiosk throughput drops (a 60 s betting window per match) | Window is configurable; matches without bets can use the 30 s minimum; Kiosk can run markets only on every other match |
| Contract bug | 60+ tests, invariants, audit turn in Studio, testnet only |
| Replay verification differs across builds | The verifier runs the exact pinned commit; `bundleHash` check; same Node major and architecture |

## Appendix A: the Studio prompt for `MatchMarkets` (save as `integrations/arc/studio/PROMPT-markets.md`; under 10,000 characters; the long form is uploaded with `--file`)

> Add a second contract to this app: "MatchMarkets", a generic, reusable, no-admin pari-mutuel prediction market over an immutable constructor list of up to four ERC-20 assets (Arc USDC and EURC, Circle FiatToken v2.2, 6 decimals; each market names exactly one asset and never mixes; never use msg.value). Markets are created by an operator with a relayer-supplied bytes32 marketId (revert if it exists), n outcomes (2 to 4), an immutable closeTime, resolveDeadline, livenessWindow, rulesHash, seedCommit, sponsor bonus, feeBps (default 0, cap 1000, taken ONLY from losing stakes), minBet, maxPerAddress, maxPool, an excluded address list, a fixed reporters list with a quorum, and an optional permitSigner. bet(marketId, outcome, amount, minPayout, salt, permit, authorization...) pulls funds using the token's EIP-3009 authorization whose nonce must equal keccak256(marketId, outcome, amount, minPayout, bettor, salt, chainId, contract) (recomputed on-chain); validBefore must be at most closeTime; require block.timestamp < closeTime; use the asset's receiveWithAuthorization (verified present); account every stake in storage and never use balanceOf for payouts; revert if the projected payout is below minPayout. Resolution: report(marketId, layer, resultHash, winMask, sig) once per layer; reports must match on (chainId, contract, marketId, resultHash, winMask); a conflicting report blocks resolution; veto(marketId) by the verifier only, void only, inside the liveness window; finalize(marketId) by anyone after the quorum of identical reports and the window; also an onReport entry that accepts only a configured forwarder, workflow id and owner. voidIfExpired(marketId) by anyone after resolveDeadline, or at close if fewer than two outcomes have stakes; cancelBeforeClose by the operator only before closeTime. Payout math: W = winning stakes with stakes > 0, L = total − W, fee = floor(L*feeBps/10000), Pr = L − fee + bonus, slice = floor(Pr / numberOfWinningOutcomes) with the remainder to the lowest-index winner, payout = stake + cumulative-floor share so the total equals the slice exactly with zero dust; ties (several winMask bits) split Pr equally among tied outcomes that have stakes; if no winning outcome has stakes, void and refund all stakes and return the bonus; void refunds exact stakes. claim(marketId, user) callable by anyone pays only that user, zeroing the balance first; no loops over bettors. Use SafeERC20, ReentrancyGuard, EIP712, SignatureChecker; emit events for every transition. Write Foundry tests including invariant tests (solvency, no double claim, void refunds exactly, monotonic state, immutable closeTime, access control, nonce binding, direct-transfer resilience, a reverting recipient not blocking others) and the numeric test vectors in the uploaded SPEC.md; at least 60 tests. Deploy to Arc testnet and print the address.

## Appendix B: the numeric test vectors

Section 5.9 is the specification; the reference implementation used to produce them lives in the research scratch directory (`pm_spec.py`, with a 200,000-case fuzz) and **must be re-created as a committed test** (`tests/web3/market-payouts.test.mjs`) so that the contract tests, the relay's pure functions and the UI projection are all checked against the same vectors.

## Sources

Research notes (6 November 2026): the verified deployed PancakeSwap Prediction V2 source (Sourcify, BNB Chain), Gnosis Conditional Tokens and market-makers repositories, Polymarket CTF Exchange and UMA adapter repositories, Azuro PoolBetting and v2 core, Manifold's repository, PRBMath, Pennock's dynamic pari-mutuel paper, the Reality.eth source, EIP-3009, the Polymarket and UMA documentation, the Chainlink CRE documentation (consensus, EVM write, consumer contracts, service quotas), the Arc EVM-compatibility and relayer documentation, and secondary reporting on the March 2025 Polymarket Ukraine market, Fomo3D block stuffing, the Balancer November 2025 exploit, the Polymarket May 2026 key compromise, ESIC rulings and Kalshi's March 2026 screening rules. Items marked [S] were not verified in source.
