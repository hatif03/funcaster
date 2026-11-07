# Build guide 14: stats, ratings and leaderboards (verifiable, hard to inflate)

Part of the [build guide](00-README.md). Status: plan, 6 November 2026. **No code is written.** The platform should show **who wins most, who makes the most from predictions, who is rated best**, and a set of stats that make a gaming platform fun, while making them **recomputable by anyone from public data** and **hard to inflate**. The integrity detectors are in [15](15-integrity-and-anti-cheat.md); the accounts and identity levels in [13](13-users-scenarios-and-accounts.md); the Ledger in [12](12-reality-and-ledger.md). The design rests on a research pass (rating systems, prediction scoring, manipulation case studies, verifiable-log designs); marks: **[V]** verified in a source, **[S]** secondary, **[R]** recalled or our own design (**all thresholds are starting values: measure first**).

## 1. Principles

1. **Stats are derived, never stored as truth.** Every number is a pure function of (the **match-record log**, the **chain events**, the **flag log**, a **ruleset**). Delete every cache, rerun the computation, get the same numbers.
2. **Every stat row links to its inputs** (the matches and transactions behind it) in the Ledger.
3. **Three scopes, so friends are never punished for being friends:** **Room** boards (a private party's own, unrestricted, friends-only, never feed anything global), the **Open** board (every key, eligible matches only) and the **Verified** board (L2 humans only). The biggest design risk is that **friends on one network look like collusion** to any pair-based detector ([research caveat]); room boards are the main defence.
4. **A match is rated only if the result is replay-verified, at least two distinct identities took part, and the room is a ranked room** (a Kiosk or an explicitly ranked listed room; a private party is a room-board match only).
5. **Friend pots never reach global boards** (a pot only moves the people's own money and is trivially wash-tradable); they appear on profiles and room boards.
6. **Mock-mode and demo results are never counted** ([12](12-reality-and-ledger.md) rule R5).
7. **Provisional until proven**: new or unverified players are shown, marked provisional, and are not ranked.

## 2. The data: what gets recorded so stats can be recomputed

Today a result carries **slots, not identities**, and the event store keeps only slot scores [code: `server/records.cjs`, `server/event-store.cjs`]. So the module records, at **`start()`** (when the lineup is fixed), a **match record**:

```text
matchRecord = { matchId, resultHash (filled at finish), game, mode, startedAt, endedAt, roomClass: private | ranked,
                participants: [ { slot, account (address), level: L1|L2, humanId?, name?, device? } ],
                asset?, potId?, marketIds? }
```

- `humanId = H(nullifier ‖ seasonSalt)`: the verified human's **per-season pseudonym** (not the raw nullifier); published so third parties can dedupe humans; the privacy cost (a stable per-season pseudonym) is stated plainly.
- `device` is **never published**; it stays in the relay for the integrity detectors only.
- The record is **canonical JSON, sha256-hashed, appended to the Merkle match log** (section 6) at finish. It is a sibling of the result, **outside the hashed result core** (parity rule, [01](01-architecture.md) section 13).
- **Chain events** (bets, claims, pots, drips) come straight from the Ledger indexer ([12](12-reality-and-ledger.md)).
- **Flags** are a second append-only log ([15](15-integrity-and-anti-cheat.md)).
- **Ruleset**: a versioned file (`stats-ruleset-vN.json`: constants, thresholds, formulas' parameters); its **hash is in every checkpoint**.

## 3. The boards

| Board | Ranks by | Scope | Needs |
| --- | --- | --- | --- |
| **Most wins** | Win count in rated matches (ties broken by win rate) | Open, Verified, Room | rated matches |
| **Win rate** | Wilson 95 percent **lower bound** of wins over matches (minimum 10) | Open, Verified, Room | rated matches |
| **Skill (per game and overall)** | Rating (section 4) | Verified (ranked), Room | section 4 eligibility |
| **Best scores / records** | Best verified score or time per game, per mode, per week | Open (any key), Room | verified replay; the standing rule that casual games do not rank |
| **Win streak** | Consecutive rated wins against at least 2 distinct opponents | Verified, Room | rated matches |
| **Upsets and giant slayers** | Wins when the pre-match win probability was under 25 percent; beat a top-10 player | Verified | rating |
| **Predictors: Profit** (who made the most) | Net profit over **eligible markets** (section 5) | Open, Verified | chain events |
| **Predictors: Edge** (the credibility board) | The luck-adjusted edge Z (section 5) | Verified | at least 30 bets |
| **Predictors: Calibration** (optional) | Log gain and Brier skill versus the pool | Verified | an explicit probability input |
| **Games** | Plays, average and median score, record holders, per game | public | none |
| **Event and season** | Today at the booth, this week, the whole event; medals (top 1, 2, 5 percent) | Open, Verified | none |
| **Hall of Fame** | Season winners with their trophy entities (Arkiv) | Verified | none |

**Pot stats** (biggest pot won, net pot profit) appear on **profiles and room boards only**. **Spectator activity** (predictions made, matches watched) is a cosmetic profile stat, never ranked.

## 4. The rating system: Weng-Lin Bradley-Terry (full-pair), self-implemented

**Why this one:** it handles 2 to 4 players, ties and small data natively with a closed-form update, carries a per-player uncertainty σ (so "confidence" is built in), and is MIT-style open (the OpenSkill family; the paper is open) [V]. TrueSkill's licence and patent position is unclear [V: the page states none; patents recalled R]; Glicko-2 is built for 1 versus 1 rating periods of 10 to 15 games [V]; plain Elo has no uncertainty [R]. OpenSkill's own paper reports slightly lower accuracy than TrueSkill but much higher speed (Overwatch data: 87.56 percent against 92.44 percent with two or more matches per player) [V]. **We implement the update ourselves (about 30 lines) so the ruleset is frozen, hash-pinned and recomputable bit for bit**; the `openskill` library (MIT) is optional.

**State:** per identity per game `(μ, σ)`, plus an overall `(μ, σ)` updated on every rated match; initial μ = 25, σ = 25/3 [V defaults]; β = σ0/2 and τ = σ0/100 [R: the OpenSkill defaults]; κ = 0.0001.

**Update (Algorithm 1 of Weng and Lin 2011, full-pair Bradley-Terry [V])**, for each player `i`, over every other player `q`:

```text
c_iq = sqrt(σ_i² + σ_q² + 2β²)
p_iq = 1 / (1 + exp((μ_q − μ_i) / c_iq))
s    = 1 if i placed above q, 0.5 if tied, 0 if below
Ω_i  = Σ_q (σ_i² / c_iq) · (s − p_iq)
Δ_i  = Σ_q γ · (σ_i / c_iq)² · p_iq · p_qi          with γ = σ_i / c_iq      [R choice; the paper allows any]
μ_i ← μ_i + Ω_i                       σ_i² ← σ_i² · max(1 − Δ_i, κ)
```

(σ² is first inflated by τ² for activity.) Ties use `s = 0.5`; races rank by time, score games by score. **Phase 1 uses placing only**; margins are a v2 option (`s = 0.5 + 0.5·clip(Δscore / (1.5·S_g), −1, 1)` with scores within a per-game epsilon treated as ties [R]).

**Determinism:** reference code and test vectors are committed; operations in a fixed order in float64; **round μ and σ to 1e-6 after every match**, so any third party obtains bit-identical output; the ruleset hash is in every checkpoint.

**Worked examples (computed with the research agent's script):**

| Case | Players before (μ, σ) | Placing | After |
| --- | --- | --- | --- |
| A: three new players | all (25, 8.333) | A, B, C | A μ 30.27, σ 7.79, Skill 1276; B μ 25, σ 7.79, Skill 1065; C μ 19.73, σ 7.79, Skill 855 |
| B: an upset | A (30, 4), B (25, 5), C (20, 6) | C first, A over B | A 29.38 (σ 3.93, Skill 1704); B 22.37 (σ 4.81, Skill 1318); C 25.18 (σ 5.68, Skill 1326): the top player barely moves and the winner gains 5.2 μ |
| C: a tie for first | same | A and B tie, C third | A 30.18, B 26.36, C 17.64: the lower-rated tied player gains more |

**Display:** `Skill = round(1000 + 40·(μ − 3σ))`, so a new player shows 1000; always show the **± (40·3σ)** or a confidence bar; tiers Bronze under 1100, Silver 1100 to 1300, Gold 1300 to 1500, Platinum 1500 to 1750, Diamond 1750 and up (tune after data).

**Eligibility and inflation controls (starting values):** **provisional** = under 8 rated matches in the game or under 3 distinct opponents (shown "?", not ranked); **ranked board** = at least 10 rated matches, at least 5 distinct opponents (at least 3 not cluster-linked), σ at most 5.5, played in the last 30 days; **pair weight** `w_pair = 0.5^max(0, n − 3)` where `n` counts rated matches between the same two identities in 24 hours, multiplying `Ω` and `Δ`; **daily gain cap** of +120 Skill per game per UTC day for non-provisional players (losses uncapped); **account age**: keys under 24 hours old are unranked; **Verified board needs L2**; **inactivity**: μ never decays, each inactive week `σ ← min(σ0, sqrt(σ² + 0.6²))`, shown "inactive" after 60 days and dropped from the board until the next match.

## 5. The predictor boards (play-money pari-mutuel, 2 to 4 outcomes)

**Eligible market** (for the profit and edge boards): at least `PRED_MIN_BETTORS` distinct bettors after merging linked keys (default **3** at events, 4 later), a pool of at least `P_min`, a replay-verified resolved result, and not excluded by the late-whale flag F11 ([15](15-integrity-and-anti-cheat.md)); a player needs at least 20 settled eligible markets for the profit board and 30 bets for the edge board.

1. **Profit board (the headline "who made the most"):** net profit (payouts minus stakes) summed over eligible markets. Per-asset boards (USDC, EURC) plus an asset-neutral **ROI** board across assets.
2. **Luck-adjusted edge board (the credibility board):** with the pool-implied probability `q_k = pool_k / total` and a fee `t` (default 0), a bet of stake `S` on outcome `k` returns `R` with `E[R] = −tS` and `Var[R] = S²(1 − t)²(1 − q)/q` [R: our derivation for pari-mutuel]. **Edge `Z = (ΣR + tΣS) / sqrt(ΣVar)`**: "standard deviations above chance". Compute `q` **excluding the bettor's own stake** (leave-one-out) so a whale does not set its own price; **cap the displayed Z at ±6**. It rewards beating the crowd, not placing large bets.
3. **Calibration board (optional)**: only if the slip collects an explicit probability: log gain versus the pool `G = Σ [ln f_win − ln q_win]` (nats; the analogue of Metaculus's peer score, whose average per question is 0 [V]) and Brier skill `BSS = 1 − BS_user / BS_pool` with `Brier = Σ(f_k − o_k)²` [V]; at least 50 predictions for a calibration plot.
4. **ROI** (profit divided by total staked) is a side stat with a minimum staked of 20 times the median stake.
5. **Caps for board purposes:** one bettor's counted stake is at most 40 percent of the pool; participants cannot bet on their own match (barred on-chain via the permit, [10](10-prediction-market.md)).

## 6. The verifiable leaderboard

1. Every `matchRecord` (with its result hash) is a leaf of an **append-only RFC 6962 Merkle log**; the **flag log** is a second log of `{subject commitment, flag code, evidence hash, effective epoch, status}`.
2. **Daily signed checkpoint** in the **C2SP `tlog-checkpoint`** format (origin, tree size, root hash; Ed25519 signature; a log never signs two checkpoints without a consistency proof [V]), plus the **ruleset hash** and the **leaderboard hash**.
3. **Publish the checkpoint on chain** once per day, in one transaction (an Arc transaction carrying the root, ruleset hash and leaderboard hash; see [16](16-arc-native-features.md) for the memo mechanism), mirrored in the `chonks.checkpoint` text record on the `play` ENS registry and as an Arkiv entity. The Ledger's own head hash goes the same way ([12](12-reality-and-ledger.md) section 4.3).
4. **The leaderboard is a pure function of (match log, flag log, chain events, ruleset).** `scripts/web3-stats-recompute.mjs` downloads both logs and the chain events and reproduces every board; **test vectors** are committed; the Ledger and the TV window show the **checkpoint age and the verification status** ("recomputed and matches the published hash").
5. **Flags are published without shaming innocents** (the three treatment tiers of [15](15-integrity-and-anti-cheat.md)): rule-based exclusions are silent and name matches or markets, not people; "under review" is neutral; only confirmed removals are public, with a reason code and an evidence hash.

## 7. The 40 stats (what profiles can show)

Needs: **Id** a persistent key (all stats); **V** fairness needs a verified human; **C** on-chain data; **R** a replay timeline. **Inflate**: L low, M medium, H high.

| # | Stat | Definition | Needs | Inflate |
| --- | --- | --- | --- | --- |
| 1 | Win count | Wins in rated matches | V | H |
| 2 | Win rate | Wilson 95% lower bound, minimum 10 | V | M |
| 3 | Podium rate | Top-two finishes in 3 to 4 player matches | V | M |
| 4 | Skill and tier per game | Section 4 | V | M |
| 5 | Peak Skill | Highest conservative rating | V | M |
| 6 | Win streak | Consecutive wins against 2 or more distinct opponents | V | H |
| 7 | Comeback win | Win after trailing at the 50 percent point | R | L |
| 8 | Perfect round | Game-specific flawless run | R | L |
| 9 | Personal best | Best verified score or time per game | none | L (cheat risk) |
| 10 | Weekly record | Top verified score per game per week | none | L to M |
| 11 | Upset win | Win with pre-match win probability under 25% | V | H |
| 12 | Giant slayer | Beat a top-10 rated player | V | M |
| 13 | Head-to-head | Record against each opponent | V | M |
| 14 | Nemesis / victim | The opponent you lose to or beat most | none | L |
| 15 | Rivalry | A pair with 10 or more matches and a 40 to 60 percent split | V | H (looks like collusion) |
| 16 | Distinct opponents beaten | Count | V | M (sybil) |
| 17 | All-rounder | 3 or more games with 5 or more matches each | V | M |
| 18 | Matches played | Count of rated matches | none | H |
| 19 | Daily streak | Consecutive days played | none | H (harmless) |
| 20 | Season rank | Daily, weekly and event-long position | V | M |
| 21 | Season medals | Top 1, 2 and 5 percent (Metaculus style [V]) | V | M |
| 22 | Consistency | Standard deviation of placements or scores | none | L |
| 23 | Clutch | Wins decided by under 2 percent margin | R | M |
| 24 | Biggest margin | Largest winning margin | none | M (sandbag partner) |
| 25 | Fastest finish | Race personal-best time | none | L |
| 26 | Achievements | Scripted trophies (bronze to platinum) | none | varies |
| 27 | Biggest pot won | Largest friends' pot won (play money; profile only) | C | H |
| 28 | Pot win rate | Pots won over pots entered (profile only) | C | H |
| 29 | Net pot profit | Winnings minus stakes (profile only) | C | H |
| 30 | Net prediction profit | Eligible markets only | C | H |
| 31 | Prediction ROI | Profit over staked, with a minimum | C | M |
| 32 | Prediction hit rate | Wilson lower bound | C | M |
| 33 | Brier skill vs pool | Section 5 | C | M |
| 34 | Log gain vs pool | Nats, section 5 | C | M |
| 35 | Calibration curve | Needs explicit probabilities and 50+ predictions | C | M |
| 36 | Contrarian wins | Won backing an outcome with pool share under 20 percent, with the count | C | M |
| 37 | Longest-odds hit | Highest payout multiple actually won | C | H (pool rigging) |
| 38 | Spectator activity | Predictions placed, matches watched | C | H (cosmetic only) |
| 39 | Reads-the-game | Best Z on one game or one player | C | M |
| 40 | Luck-adjusted edge | Z of section 5 | C | L to M |

**Achievements (examples, scripted and recomputable):** First Blood (first rated win), Hat Trick (3 wins in a row), Giant Slayer, Nemesis Beaten (beat the player who beat you most), Oracle (a hit at pool share under 10 percent), Steady Hand (a score within 2 percent of your median ten times), Night Owl and Early Bird (play time windows), Collector (a match of every game), Trusted (verified), Founder (played in the first event). Achievements are **cosmetic and non-ranked**, except where they gate nothing.

## 8. Where it is shown

- **TV: the Leaderboard window** (the new tool window of [05](05-ui-integration.md), now the main boards): tabs **Players** (Wins, Win rate, Skill), **Predictors** (Profit, Edge), **Records** (per game), **Today**, **Hall of Fame**; a scope switch (**Verified**, **Open**, **This room**); a game filter; a **checkpoint status line** ("Recomputed from 3,412 verified records: matches the published hash · checkpoint 2 h ago"); rows are `data-nav` buttons; selecting a row shows the player's headline stats and "How is this computed?" (the ruleset and the matches behind it). The **Kiosk attract screen** shows today's top three per board.

```text
+-[ Leaderboard ]---------------------------------------------[_][O][X]+
| [Players] [Predictors] [Records] [Today] [Hall of Fame]              |
| Scope: (Verified)(Open)(This room)     Game: [ All v ]               |
| # Player        Skill        Wins   Win rate   Streak                |
| 1 asha  ✓       1704 +-90    42     71%        5                     |
| 2 ravi  ✓       1318 +-160   31     58%        2                     |
| 3 mo            1050  ?      12     50%        1   (provisional)     |
| Recomputed from 3,412 verified records - matches published hash  ✓   |
+----------------------------------------------------------------------+
```

- **Phone: the Stats tab** of the account app ([13](13-users-scenarios-and-accounts.md)): a profile card (handle, level badge, trophies), **Skill per game** with the ± bar and tier, wins and win rate, streak, personal bests, head-to-head, **predictor stats** (net, ROI, edge Z, hit rate), achievements and rank, every figure with a **"Why?"** that opens the underlying matches and transactions.
- **Results window:** a **rating change line** ("Skill 1276 → 1301 (+25)") after a rated match; **Players window:** the rating tier chip.
- **Web: `/leaderboard`** (public): the same boards, the recompute instructions and the checkpoint history.
- **Arkiv entities** ([04](04-arkiv-guide.md)): **6 November.** The `rating`, `matchrecord`, `checkpoint` and `flag` entity types are **dropped**: ratings are computed from the public `score` entities (anyone can recompute them, which is the point), flags are never public, and a checkpoint is written to Arkiv **only if a screen reads it back** (Arkiv does not count "a log that nothing reads").

## 9. Tests and tasks (lane R)

**Tests:** the rating engine against the three worked examples and a property test (the sum of μ changes is conserved up to the rule, σ never grows within a match, ties symmetric) and **bit-identical results across Node versions and a clean recompute**; the predictor engine against hand-computed pools (the vectors of [10](10-prediction-market.md) section 5.9 give the returns); eligibility (provisional, ranked, pair weight, gain cap, account age); mock results never counted; private-room matches never reach global boards; recompute equals the live boards after deleting caches; checkpoint signature and consistency; the flag log changes a board only through the ruleset; a tampered match record changes the root.

| ID | Task | Depends | Hours |
| --- | --- | --- | --- |
| R1 | Match-record capture at `start()` and append at `finish()`; the `humanId`; room class | S2, S4 | 8 |
| R2 | Rating engine (pure, fixed-point rounding) with vectors and property tests | none | 10 |
| R3 | Predictor engine (profit, Z, calibration) with vectors | M1 | 8 |
| R4 | Aggregator and API (`/api/web3/stats/...`), boards and scopes, eligibility, seasons | R1 to R3, L2 | 14 |
| R5 | Merkle log, checkpoints, flag log, recompute script, daily on-chain publication | R4, L3 | 12 |
| R6 | Leaderboard window, phone Stats tab, Results rating line, Kiosk strip, `/leaderboard` | R4, U1 | 22 |
| R7 | Achievements | R4 | 6 |
| R8 | Tests, vectors, baselines | all | 10 |

About **90 hours.** Tier 1 (R1, R2, R4 without predictors, a simple TV board) is about 40 hours. **Cut order:** achievements, calibration, margins (already v2), then the Hall of Fame.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Friends on one LAN look like collusion | Room boards are unrestricted and separate; the global boards need ranked rooms and L2; pair weights, not bans |
| Small data makes ratings noisy | Provisional status, σ shown, eligibility thresholds |
| Verification (World) is unavailable | The Open board still works; the Verified board is empty until verification exists |
| A published `humanId` is a stable pseudonym | Per-season salt; stated openly; the raw nullifier is never published |
| Float differences across machines | Round after every match; fixed order; vectors; ruleset hash |
| Stats feel empty at the booth | Today board and records need no verification; the Kiosk shows "first to play" boards; seed with the team's own rehearsal matches (labelled) |
| Thresholds are guesses | They live in the ruleset file and are tuned from rehearsal data |
