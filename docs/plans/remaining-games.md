# Making every game truly multiplayer: the technical plan

Status: plan, 6 November 2026. Written from a read of the whole repository at commit 3607d9a (code, tests, docs) plus the older `plan.md`. Nothing here is built. File and line references are to that commit. No browser or real phone was used, so feel, frame rate and sensor behaviour are inferred from code.

## 1. Where the games stand today

Since the first plan was written, other developers built a **party engine** (`server/party.cjs`, a single-process Socket.IO `/party` namespace) and added multiplayer to all 13 games. The honest summary: every game is playable by 2-4 people on one screen, but *most* are "several people each play their own copy and compare scores", not people playing in a shared world, and "separate screens" today means remote **viewing** (read-only display invites), not remote **playing**.

Three levels help describe "truly multiplayer":

| Level | Meaning | Example |
| --- | --- | --- |
| **L1 Parallel** | Each seat plays its own copy of the game (same seed); scores are compared | Alien Attack, Shooting Range, Time Trial, Cloud Cruise today |
| **L2 Shared** | Seats act on one shared board or world and affect each other | Golf turns, Slice Dojo co-op/battle, Table Tennis, Foam Fencers, Kart Rush (cars on one track) |
| **L3 Remote** | A seat can play on *its own screen* somewhere else | Not built for any game; remote viewing only |
| **V Verified** | The platform can re-check the result from a replay | Star Catch, Neon Drift, Bubble Burst, Slice Dojo only |

| Game (folder) | Today | Level | Verification | Biggest gap |
| --- | --- | --- | --- | --- |
| Kart Rush (`mario-kart`) | 2-4 humans on one track, split-screen, CPU option, autopilot on a dropped phone | L2 local | attested | DNF/finish window, N-aware item odds, per-view HUD, remote play |
| Pocket Greens (`golf`) | Turn-based 1/3/6 holes, CPU golfers, out of bounds, stroke cap, 30 s grace | L2 | attested | Address step, timer, ready golf, seeded course, modes, round cap |
| Slice Dojo (`fruit-ninja`) | Co-op, battle (same rules in party), same-seed race boards | L2 + L1 | **verified** | Hit arbitration, real co-op rules, difficulty scaling, bests |
| Table Tennis | 1v1 (first to 7 in party), rotation, solo vs AI | L2 | attested | Rules (win by 2, serve), co-op vs AI, latency fairness |
| Foam Fencers (`swordplay`) | 1v1 simultaneous telegraphed strikes, rotation | L2 | attested | Rule choice, tie handling |
| Time Trial (`kart`) | Per-seat boards on one circuit, own-best ghost | L1 | attested | Any cross-player ghost or interaction |
| Cloud Cruise (`island-flyover`) | Per-seat boards, score = rings x 100 | L1 | attested | Race interaction, time in the score |
| Shooting Range | Per-seat boards, same seed, 60 s | L1 | attested | Shared-target free-for-all |
| Alien Attack | Per-seat boards, same seed | L1 | attested | Co-op or versus; run length vs the 120 s cap |
| Drawing (Sketch) | Draw-and-guess with private prompts, or free draw | L2 | attested | AI guesser, free-draw scoring |
| Star Catch, Neon Drift, Bubble Burst | Server-simulated 60 s rounds, identical object streams, score race | L1 (server-authoritative) | **verified** | No player-versus-player interaction |

**Two architectures coexist, and the plan must respect both:**
- **Host-tab authoritative ("classic") games**: ten games run in iframes inside the host page; the server relays phone input and takes scores from the host tab. Per-player-view games (Kart Rush, Time Trial, Cloud Cruise, Shooting Range, Alien Attack, Slice race) run **one single-player copy per seat** in separate iframes with the slot remapped (`party.cjs:132-137`), and results merge when every view finishes (`party.cjs:525-534`).
- **Server-authoritative games**: Star Catch, Neon Drift and Bubble Burst run in `server/party-engine.cjs` at 30 Hz and stream frames to the host and displays.

## 2. Decisions the owner needs to make first

These change the work for several games. Defaults are my recommendation.

| ID | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| **D-G1** | **Remote playing for independent-view games.** May a display tab host a seat's game iframe (not just watch)? This is the same authority boundary the previous developers asked to approve (see `docs/NETWORKING.md`) | (a) keep displays read-only; (b) allow a display to host *one view* under a per-view token issued by the host tab | (b), narrowly: a display may only run the single view it was assigned, can report only that view's result, and the host tab can revoke it. Needs explicit approval |
| **D-G2** | **Seat cap.** The room holds 4 phones (`party.cjs:383`), while the Kart Rush simulation supports 8 racers | 4 / 6 / 8 | Keep 4 for the first release; make the cap a per-game manifest field so Kart Rush can raise it later |
| **D-G3** | **Foam Fencers rules.** Built: simultaneous telegraphed strikes, both can score. Planned: alternating initiative | keep as built / switch | Keep as built for now, playtest, and add sudden death for ties |
| **D-G4** | **Slice Dojo co-op semantics.** In party play bombs are never fatal and misses are free, so Co-op and Battle score the same way (co-op just reports the team total) | restore shared lives and fatal bombs in Co-op / keep | Restore real co-op (shared lives, fatal bombs) as a distinct mode, so the three modes feel different |
| **D-G5** | **Game id format.** Built as `chonks.<slug>` with a dot and the *folder* slugs (including `chonks.fruit-ninja`); the earlier plan said `chonks:<neutral>` | keep dot / change to colon; neutral slugs | Keep the dot (it is built and tested), but **fix the slugs before anything is published**, with a legacy-id alias map |
| **D-G6** | **How far to push verification.** Today 4 of 13 games are `verifiable` | stay as is / make the pure fixed-step games verifiable | Make Kart Rush, Golf, Table Tennis, Foam Fencers, Time Trial, Cloud Cruise, Shooting Range and Alien Attack verifiable (section 3, X5) |

## 3. Cross-cutting technical work (do once, every game benefits)

### X1. One source of truth for the catalog

- **Today:** `core/catalog.js` is the real catalog; the 13 `games/*/game.json` are byte-identical copies; `server.js` reads the folder copies for `/api/games`; the "independent views" list is copied in `party.cjs:16-24`, `host.js:217-221` and `display.js:44-48`; nothing checks they agree.
- **Do:** generate `game.json` from the catalog (or the reverse), add a test that fails if they differ, and derive the independent-view list from a manifest field (`view: "independent"`). Remove the three copies.
- **Test:** a single "catalog consistency" test in `core/platform.test.mjs`; the validator cross-checks `game.json` against the catalog.

### X2. The seat model

- Seat cap per game from the manifest (D-G2); a **seat state** machine on the server: `empty -> joined -> ready -> active -> away -> autopilot -> dnf -> left`, each with a reason, replacing the scattered checks (`party.cjs:141-147`, `:730-741`, `:962`).
- A **spectator seat** for late joiners (today the fifth phone gets "Four players are in" and retries forever): watch screen, reactions, joins the next match.
- Host powers by delegation: see [host-phone-controls.md](host-phone-controls.md).
- Seat token in `localStorage` (not `sessionStorage`) so a closed or evicted tab keeps the seat.

### X3. Round lifecycle and timeouts

- **Today:** the server caps classic rounds at Kart Rush 600 s, Golf 480 s, Drawing 180 s, everything else 120 s (`party.cjs:330-343`), then finishes from the last progress report. A four-player six-hole golf round, an Alien Attack run until three lives are lost, or a three-lap time trial can be cut off mid-play and scored pessimistically. A Kart Rush human who is connected but not pressing gas is never autopiloted, so the race can stall until the cap.
- **Do:** replace fixed caps with a manifest `roundPolicy`:
  `{ kind: "timed" | "untilDone" | "turnBased", softCapMs, hardCapMs, idleRule, finishWindowMs }`.
  - `timed` (Shooting Range, server games): fixed clock.
  - `untilDone` (Kart Rush, Time Trial, Cloud Cruise, Alien Attack): ends when all active seats finish, **or** a finish window after the *first* finisher (default 30 s, host-adjustable) expires, **or** the hard cap. Late seats are DNF, ranked below finishers.
  - `turnBased` (Golf, Drawing): per-turn timers, with a generous overall cap and a host "extend" button.
  - `idleRule`: a seat with live input but no progress for N seconds is flagged `idle`, then autopiloted (racing) or skipped (turn-based), then DNF.
- **Test:** property tests: from any state a round must end (liveness); idle seat cannot stall a round; first-finisher window works; cap never scores a still-progressing seat as zero.

### X4. Results, scores and ids

- Per-game `scoring` declares direction, unit, **tie-breaks**, and an integer score. Kart Rush's score is place (lower better); Time Trial's is `100000 - totalMs/10`; Cloud Cruise's is `rings x 100` with no time. Define tie-breaks per game and show them on the results screen.
- `ResultV1` fixes (from the audit): `matchId` is `roomCode.roundId` (not unique over time; add a time-sortable id), scores are rounded to 3 decimals (make integers), `bundleHash` is the whole-platform build (add a per-game bundle hash), seed is a bare integer (record its source).
- Per-seat **stats** (fruit sliced, best combo, bombs hit, strokes per hole, lap times, rings) declared in a `statsSchema` and shown on a per-player results card.
- Fix the results screen bug: `results()` compares `top.score >= target` and `target` is undefined for classic games, so a solo score only ever says "Nicely played!" (`host.js:125-131`).

### X5. Verification: making more games `verifiable`

- **Goal:** Kart Rush, Golf, Table Tennis, Foam Fencers, Time Trial, Cloud Cruise, Shooting Range and Alien Attack move from `attested` to `verifiable`, as the pure fixed-step logic modules make this feasible. Slice Dojo's `slice-replay.cjs` is the precedent: the server re-simulates from a bounded input log and ignores the client's claimed score.
- **Do (per game):** (1) record inputs **at the logic boundary** (the calls into `logic.js`, with fixed-step times) into the existing `replay-chunk` channel; (2) add `server/verifiers/<game>.cjs` that replays the log through the same `logic.js` (dynamic `import()` from CommonJS, as the Slice verifier does) and returns scores; (3) extend `records.cjs` `verification` and `scripts/replay-check.cjs` to dispatch by `gameId`; (4) bound log sizes (frames and bytes) like Slice's 6000-frame cap.
- **Limit to state plainly:** a verifier proves the *score matches the logged inputs*, not that a human produced those inputs, and cross-engine floating-point differences mean the verifier runs in Node (V8) against logs produced by the host's browser (V8 in the supported browser). Keep `attested` for anything not replayable (Drawing).
- **Cheap first step:** Kart Rush `Race` and `GolfRound` are already pure, seeded and fixed-step with determinism tests (`core/platform.test.mjs:127`); do these two first.

### X6. Remote playing ("separate screens") for independent-view games (decision D-G1)

- **Kart Rush is not** an independent-view game: one shared `Race` sim renders split-screen in one iframe. Kart Rush remote play uses server-sequenced lockstep, in [plan.md §5h.6a](../../plan-history.md#5h6a-kart-rush-remote-server-sequenced-lockstep-decided-6-november-2026). The full integrated plan (engines, pairing by QR, recipes, build order) is [plan.md §5h](../../plan-history.md#5h-how-multiplayer-and-remote-play-get-built-6-november-2026).
- **Why it is feasible:** Time Trial, Cloud Cruise, Shooting Range, Alien Attack and Slice race already run **one independent single-player copy per seat**, each in its own iframe, each with its own per-view screen socket (`room.screens` is a Map of view to socket). Nothing about such a copy requires it to run in the *host's* browser.
- **Design:** the host tab issues a **view token** for view *i* to an invited display. The display loads `/games/<slug>/?party=&round=&view=i` with that token, registers as the `screen` for that view only, and the server routes seat *i*'s phone input to it. The result merge at `party.cjs:525-534` is unchanged. A display holds only that view; it cannot report any other view's score or touch the room.
- **Needs:** a "Play on this screen" button on `/screen`; a TV control to assign seats to displays; token issuance and revocation; session tests for spoofing (a display claiming another view); a fallback if the display dies (the host tab can take the view back).
- **Not for shared-board games.** Golf, Table Tennis, Foam Fencers, Slice co-op/battle and Drawing run one simulation in the host tab; remote players there are *viewers with phones anywhere* (already built). For turn-based Golf and for Drawing that is perfectly good; for Table Tennis and Foam Fencers a remote screen sees the board about 150 ms late, so they stay same-room (see section 5, scenario SC-5).
- **Server-authoritative games** (Star Catch, Neon Drift, Bubble Burst) are already remote-ready at the engine level: displays receive frames. They only need the display UI to show a player's own lane prominently.

### X7. Drop, away and idle policy per game

**Penalty rule (6 November):** a player who does not return after the grace period is a **forfeit**: last place in a ranked field, a loss in a two-seat match; a short drop and a host removal carry no penalty. Full rule and per-game table: [plan.md §5h.7a](../../plan-history.md#5h7a-leaving-a-match-the-standard-rule-decided-6-november-2026). The table below gives the grace-period behaviour; "DNF" in its right column means a **forfeit** under that rule when it follows a drop.

A unified table, implemented as seat states (X2), the phone sending an explicit `away` signal on `visibilitychange`, and per-game rules:

| Game | During a 20-30 s grace period | After it |
| --- | --- | --- |
| Kart Rush, Time Trial, Cloud Cruise, Alien Attack | Autopilot (Kart has it; others need a pilot, or the seat idles in place) | DNF, ranked below finishers; the vehicle keeps going or is removed |
| Golf | Pause for everyone (default) or auto-shot (host choice; built: 30 s then auto-shot) | Skip, then DNF in stroke play |
| Slice Dojo | Seat idles, blade removed (a 200 ms staleness guard exists) | Marked left; ranked below finishers |
| Table Tennis, Foam Fencers | Play pauses | Forfeit (below the 2-human minimum) |
| Shooting Range | Crosshair idles | Marked left |
| Drawing | The drawer's turn is skipped after the timer | Seat skipped in rotation |
| Server games | Input zeroed (stale-input rule exists) | Marked left |

### X8. Late joiners and spectators

Spectator seat (X2); per-game rule for joining mid-round: **no** mid-round joins for Kart Rush, Golf, Table Tennis, Foam Fencers, Time Trial, Cloud Cruise, Alien Attack, Shooting Range; allowed during practice for the server games (built); **not** into a running Slice Dojo Co-op or Battle round (today `party.cjs:777-785` admits them, contrary to the old plan). A watching phone shows whose turn it is, standings and quick reactions.

### X9. AI and bots

Built: CPU racers (Kart Rush, 0-7) and CPU golfers (Pocket Greens, 0-4, no skill levels). Opt-in additions, in priority order: Golf skill levels (Rookie, Club, Pro); Table Tennis co-op vs AI; Shooting Range bot crosshair; Slice Dojo bot blade; Alien Attack wingman; Drawing AI guesser. All seeded and deterministic so they never break verification.

### X10. Fixed step and determinism checklist

| Game | Fixed-step logic today | To do |
| --- | --- | --- |
| Kart Rush | yes (120 Hz, tested across render schedules) | none |
| Pocket Greens | yes (1/120 s) | none |
| Slice Dojo | seeded and fixed-aspect; fixed-step claimed by the developers | confirm with a determinism test across frame rates |
| Table Tennis, Foam Fencers | no (variable `dt`) | convert to `FixedStep`, then record inputs |
| Time Trial, Cloud Cruise | no | convert |
| Shooting Range, Alien Attack | seeded `rng`, variable step | convert |
| Drawing | not applicable | n/a |
| Server games | yes (30 Hz tick) | none |

### X11. Per-seat HUD, audio and view quality in split-screen

- Kart Rush's per-view HUD is only a three-line text label and the global HUD is hidden in split view; the GTAO/bloom composer and shadows are off under split view (`game.js:1576-1602`). Build a real per-view HUD (position, lap, item, speed) scaled by container units. The static HTML still says "8 RACERS" (`index.html:92`).
- Audio: one music bed; each local seat's engine at reduced gain, panned by viewport; per-phone feedback. Today the host-page beep ignores the volume slider (`host.js:29-43`).
- Measure and tune the `QualityGovernor` (`core/viewports.js`) on a weak laptop; it is a layout utility today and was not verified against every split game.

### X12. Controller per game

Each game declares its controller profile (pointer, wheel, swing, flight, keyboard) and button meanings; the phone renders them. See [controller-stress-tests.md](controller-stress-tests.md) and the visual plan. Golf's hold-and-release shot, Drawing's guess box and the wheel layout exist; the Address step for Golf and per-game button labels do not.

### X13. Testing, game by game

- A reusable **N-seat scenario test** per game using the fake-phone harness: 1, 2, 3, 4 seats; a seat dropping at each phase; a seat idle; two seats acting at the same instant.
- **Golden solo** runs recorded before each refactor and replayed after, so solo behaviour never changes accidentally.
- **Determinism across render schedules** (exists for Kart Rush) added to every fixed-step game.
- **Liveness fuzz** for turn-based games (Golf, Drawing): random strokes, timeouts, disconnects; a legal next turn must always exist or the round must be over.
- **Replay round-trip** for every `verifiable` game.
- The 19 `session.test.cjs` tests have not run in the audit environment (missing `socket.io-client`); getting them green is step zero.

### X14. Performance in multi-view

Per-game budgets for 1, 2 and 4 views on an integrated GPU; the existing `QualityGovernor` thresholds as a starting point; frame-time capture in the nightly run.

## 4. Per-game plans

Each block lists: **Today**, **Target**, **Tasks** (with file references), **Decisions**, **Game-specific situations**, **Tests**, **Acceptance**.

### 4.1 Kart Rush (`games/mario-kart`)

**Today.** `Race({ humans, cpuCount })` is pure, seeded and 120 Hz. Multi-view split-screen with per-seat chase camera, per-seat wheel input (gas, brake, boost with three uses), a compact grid for several humans, the end rule now ends when all humans finish (`logic.js:304-315`), CPU field 0-7 clamped to 8 minus humans, autopilot for a disconnected or stale-input human (`game.js:1871`). Under split view the composer and shadows are off.

**Target.** A fair, readable four-player race that always finishes, with per-view HUDs, small-field item balance, and (later) players on their own screens.

**Tasks.**
1. **N-aware item odds:** `rollItem` uses `(position - 1) / 7` (`logic.js:78`); change to `(position - 1) / (N - 1)` and guard N = 1.
2. **Rubber-banding:** CPU speed keys off `this.player` (`logic.js:441`); use the average progress of connected humans.
3. **Finish window and DNF** (X3): first human finishing starts a window (default 30 s); remaining humans DNF and are ranked below finishers; never a 600 s stall.
4. **Idle human:** flag a seat with live input but no progress and autopilot it (X3, X7); mark DNF if it never moves.
5. **Per-view HUD and audio** (X11); remove the static "8 RACERS" text.
6. **Result:** score is place; add lap times and best lap to per-seat stats; tie-break by finish time.
7. **Verification** (X5): record the per-seat input stream at 120 Hz steps (quantised) and verify via `Race`.
8. **Phone:** driver select works; add per-seat colour/shape and the landscape controls fixes from the controller plan (F1, F5).
9. **Remote play:** *not* view binding (Kart Rush is one shared sim). 6 November: **server-sequenced lockstep**, gated by a spike; see [plan.md §5h.6a](../../plan-history.md#5h6a-kart-rush-remote-server-sequenced-lockstep-decided-6-november-2026), including the three-friends example (two on one TV, one remote). Spectators get a director camera.
10. **Seat cap** per manifest (D-G2) and tests up to 8.

**Decisions.** D-G1, D-G2. Whether to restore the post-processing composer under split view on strong GPUs.

**Situations.** A human crosses the line while others are far behind; two humans finish within one frame (interpolated crossing already exists); a phone drops at the start line; a human reverses against traffic; a CPU and a human tie; all humans DNF; pause during the countdown; a four-view race on a weak laptop; a left-handed driver; mirrored pedals (exists).

**Tests.** N = 2, 3, 5, 8 end correctly; humans-only end; first-finisher window; DNF ranking; idle autopilot; golden Solo (1 human + 7 CPU) race; determinism across render schedules (exists); replay round-trip; four-view frame-time budget.

**Acceptance.** Four phones finish a race on one screen with every seat getting a correct place, no stall under any single-seat idle or drop, and a verified result.

### 4.2 Pocket Greens (`games/golf`)

**Today.** `GolfRound` (`round.js`): six fixed tee positions to one shared pin, rounds of 1, 3 or 6 holes, strikes only from the active seat, farthest ball plays next (ties by slot), hole-1 order by seat then lowest cumulative total, out of bounds by a box or a 25 s flight (penalty, replay from last lie), 8-stroke cap, fixed 1/120 s step, 30 s grace then an automatic shot for a dropped golfer. CPU golfers on slots 4+ with a seeded aim error and fixed power curve. Shot = hold the button, release; the hold time is the power; aim is the tilt at release.

**Target.** A complete golf round with real turn order, pacing tools, seeded courses and several game modes, in which one lost ball or idle player never stalls the table.

**Tasks.**
1. **Address step:** a swing/release counts only while the player is "lining up"; latch the aim at the moment the hold starts, not at release (scenario C5 in the old scenario book).
2. **Turn timer and ready golf:** per-turn timer (off when everyone is on one screen, 45 s with remote viewers by default); if the away player has not addressed in 20 s and another is ready, that seat may play; auto-shot flagged `auto`.
3. **Honours by the previous hole's score,** not cumulative total (`round.js:57-59`).
4. **Seeded `Course`:** par, tee and pin per hole (today all share `HOLE`; per-hole pars are unused); bounds from the course; seed from the room.
5. **Skill levels** for CPU golfers (Rookie, Club, Pro) with seeded error distributions.
6. **Modes:** stroke play (built), match play (2 players or 2v2), skins, closest-to-the-pin, scramble.
7. **Wind** per hole (seeded) shown on the active phone.
8. **Round cap:** replace the 480 s cap with the turn-based policy (X3); a 4-player 6-hole round must be able to finish.
9. **`seq` idempotency** for strokes; duplicate strikes dropped.
10. **Verification** (X5): log strokes `{seat, hole, power, aim}` and replay.
11. **Scorecard** between holes and per-seat stats (strokes per hole, to par).
12. **Spectators:** shot camera and leaderboard layout for display screens; reactions.

**Decisions.** Modes to ship first; whether wind is in v1.

**Situations.** A ball out of bounds into the sea; a ball that never settles; two balls the same distance; a hole-in-one; a player who holes out waits; the active player's phone sleeps (grace then auto-shot); the host removes the active player; a tie after the last hole; join in the middle of a round; a very long hole; a four-player round hitting the cap.

**Tests.** The old turn-manager tables; liveness fuzz; out-of-bounds and cap tests (none exist today: only 4 `round.test.mjs` plus 6 `logic.test.mjs`); seeded course reproducibility; CPU skill distributions; replay round-trip.

**Acceptance.** Four people (one remote viewer too) finish a six-hole round with no stall under any single drop, correct honours and scorecards, and a verified result.

### 4.3 Slice Dojo (`games/fruit-ninja`)

**Today.** Seeded rules (`rng`, `spawnRng` from `setup.seed`), fixed 16:9 field in party, `infiniteLives` forced on in party play (a bomb costs only the slicer 10 points and resets their combo; misses are free), Co-op/Battle/Race modes; Co-op reports the team total for every seat; Race gives one board per seat. The server re-simulates the logged cursor stream and ignores the client score (`party.cjs:542-566`), then `verifySlice` marks the result verified. 120 s rounds auto-start on first presence with no countdown.

**Target.** Three genuinely different modes, fair hit arbitration, and per-player stats.

**Tasks.**
1. **B1 arbitration:** two blades on one fruit still go to the first player in `Map` order (`logic.js:297-306`). Use the **earliest input time** (phone timestamp mapped to host time, or server receive order as a LAN proxy until timestamps exist); on an exact tie alternate by fruit id. Needs input timestamps in the phone `input` message.
2. **Real Co-op:** restore shared lives and fatal bombs as a mode setting (D-G4), distinct from Battle.
3. **Difficulty scaling** by seat count in Co-op (starting formula: spawn rate x (1 + 0.4 x (N - 1)), tune by playtest).
4. **Countdown** (3-2-1) and a start gate; no auto-start on first presence.
5. **Per-phone sensitivity**: only slot 0's is saved (`game.js:1111-1115`); persist per device (the phone owns it, see the controller plan).
6. **Per-mode bests** (single `best` key today, `game.js:1247`) and per-player stats (fruit, best combo, bombs).
7. **Late join:** not into a running Co-op or Battle round (`party.cjs:777-785` admits them today).
8. **Remote play for Race** via view binding (X6); Co-op and Battle stay one screen.
9. **Bot blade** (opt-in), seeded.
10. **Replay logs** already exist; extend the stats.

**Decisions.** D-G4.

**Situations.** Two blades same fruit same frame; a sleeping phone leaves a ghost blade (guard exists: 200 ms); a bomb in Co-op with fatal bombs; time runs out with a tie (co-winners, tie-break by best combo); a seat joins late; different screens in Race (fixed 16:9 field: done); low sensitivity versus high (shared sensitivity lock option).

**Tests.** The 19 `logic.test.mjs` plus arbitration with exact ties, Co-op lives and fatal bombs, scaling, per-mode bests, determinism across frame rates, replay round-trip (exists).

**Acceptance.** Co-op, Battle and Race are distinguishable in play; a simultaneous cut always goes to the earlier blade; results show per-player stats; verified.

### 4.4 Table Tennis (`games/table-tennis`)

**Today.** Solo vs the existing AI (first to 11, `logic.js:22`). In party, 2 humans: the second drives `aiPaddle` through `setOpponent` and `humanOpponent` turns the AI roll off (`logic.js:84-98,173-195`); a seat-1 A press adds an `opponentBoost` (`game.js:136-142`). Party matches are first to 7 (`game.js:135`). The point winner serves (`logic.js:113`). Rotation (pick two, winner stays, bracket) handles more than two people.

**Target.** Proper rules, co-op against the AI, and a fair feel.

**Tasks.** (1) Win by two at deuce, serve alternation every two points, selectable first-to-7/11; (2) **Co-op vs AI** (two humans on one side), the Wii-style mode the plan wanted; (3) judge a hit at the phone timestamp mapped to host time, not arrival; (4) convert to `FixedStep` and record inputs for verification (X5, X10); (5) broadcast camera so neither player faces a tiny far paddle; (6) spectator snapshots; (7) doubles (4 humans) as a stretch.

**Decisions.** First-to-7 versus 11 default; whether remote players are ever offered (see SC-5).

**Situations.** Both players serve at once; a dropped phone mid-rally (pause then forfeit); a left-handed player; a swing detected twice; the AI taking over a side (not offered by default); rotation after a forfeit.

**Tests.** Deuce and serve rotation; co-op scoring; hit-time mapping; golden Solo vs AI unchanged; replay round-trip.

**Acceptance.** Two phones play a full match with correct rules and no hit decided by network jitter; Solo vs AI unchanged; verified.

### 4.5 Foam Fencers (`games/swordplay`)

**Today.** Solo vs the AI fencer. Two humans: `humanStrike` has a 450 ms telegraph and 1100 ms cooldown (`logic.js:84-93`); simultaneous strikes both score; first to 3. This is not the alternating initiative the first plan specified.

**Target.** A duel with no unavoidable draws and no jitter-decided hits.

**Tasks.** (1) Decide D-G3 after a playtest; (2) sudden death when both score the deciding point; (3) block geometry testing for both sides; (4) fixed step and input logging; (5) rotation integration (exists); (6) spectator snapshots; (7) free-fight stamina meter as a later mode.

**Situations.** Both strike on the same frame; a swing started before the telegraph ends; a phone with a high sensor rate versus a low one; both blocked repeatedly (stalemate timer).

**Tests.** Simultaneous-strike scoring; stalemate and sudden death; golden Solo vs AI; replay round-trip.

**Acceptance.** A first-to-3 duel always ends; no seat has an advantage from sensor rate; verified.

### 4.6 Time Trial (`games/kart`)

**Today.** One 1-seat iframe per seat, each racing its own three laps on the same circuit; the "ghost" is only your own best lap; score `100000 - totalMs/10`; no CPU; 120 s cap (three laps may not fit).

**Target.** Players see and race each other.

**Tasks.** (1) **Ghost bus:** each seat's iframe reports its car pose at 10 Hz (the `snapshot` channel exists, `core/net.js:237-270`); the server rebroadcasts to the other views as non-colliding ghosts; (2) cross-player ghost replay (race last round's winner); (3) measure lap time and set the round policy (`untilDone`, X3); (4) results with lap times, best lap, tie-break by total time; (5) fixed step and verification (X5, X10); (6) remote play via view binding (X6); (7) pace-bot ghosts for solo.

**Situations.** A very slow lap; a seat finishing while others have not started the last lap; ghost clutter in four views; a phone dropping (ghost freezes then fades).

**Tests.** Ghost bus under loss; round policy; replay; split-screen frame budget.

**Acceptance.** Four phones see each other's ghosts and the race always finishes.

### 4.7 Cloud Cruise (`games/island-flyover`)

**Today.** Per-seat boards, deterministic course, score `collected x 100` (time not scored), no race interaction.

**Target.** A race through the same rings with visible rivals and time in the score.

**Tasks.** Ghost bus (as Time Trial); a "first to claim a ring" shared-ring variant (needs a shared world, so a server-side or host-side authority for ring ownership); a time bonus or tie-break; a time limit and round policy; fixed step and verification; remote play via view binding.

**Situations.** Two flyers reach a ring together (the earlier claims); a flyer leaves the world; running out of time with rings left.

**Tests.** Ring claim arbitration; scoring and ties; replay.

**Acceptance.** Players race the same rings with clear winners and verified results.

### 4.8 Shooting Range (`games/shooting-range`)

**Today.** Per-seat boards with the same seeded target sequence, 60 s. No shared targets or steals.

**Target.** A shared-target free-for-all as a second mode.

**Tasks.** A shared-board mode (one simulation, N crosshairs, host-tab authoritative) with **earliest-input arbitration** when two shots hit the same target; a "steal" variant (a target shot by one player is locked briefly); keep the parallel mode as "Race"; bot crosshair; fixed step and verification; remote play for the parallel mode via view binding.

**Situations.** Two shots at one target; a bomb target hit; a late join (no); crosshair colours per seat; a shot at the instant of the round ending.

**Tests.** Arbitration with ties; steal lock timing; seeded sequence; replay.

**Acceptance.** Free-for-all never double-credits a target and is verified.

### 4.9 Alien Attack (`games/alien-attack`)

**Today.** Per-seat boards with a seeded generator; score kills x 100 plus distance; runs until three lives are lost, which can exceed the 120 s cap.

**Target.** Co-op and versus on one patrol, plus the existing race.

**Tasks.** `Patrol` with `ships[]` sharing the forward distance and alien stream (co-op, revive pickup); versus (kill credit by whose bolt landed); keep the parallel race with ghosts via the ghost bus; round policy `untilDone` with a soft cap; wingman AI; fixed step and verification; restrict restart to the host (today any active seat's A restarts, `alien-attack/game.js:466-469`).

**Situations.** Two bolts kill one alien; a ship downed then revived; one player far ahead; a dropped ship; run length.

**Tests.** Multi-ship collisions and kill credit; revive; seeded stream; replay.

**Acceptance.** Four ships fly one patrol; a restart cannot come from one stray phone; verified.

### 4.10 Drawing / Sketch (`games/drawing`)

**Today.** Server-side `sketch-round.cjs`: each seat draws once for 30 s plus a 3 s reveal from a 20-word list; the word is sent only to the drawer; others guess once on their phones; a correct guess scores 100 plus up to 60 for speed; the drawer gets 60 per correct guess. Free draw mode has no standings.

**Target.** A safe, customisable party game that also works with remote viewers.

**Tasks.** Word lists by theme, language (English, Hindi, Hinglish) and per community; profanity and abuse filter on guesses and any custom words; several guesses with a penalty; tie-breaks; free-draw scoring by votes; stroke streaming to displays (verify it works for remote screens); an AI guesser (stretch); accessibility for colour; guess box fixes on iOS (the `user-select:none` risk, F10).

**Situations.** The drawer gives hints in the chat/voice room; two correct guesses at once; a spectator guessing; the word list exhausted; a drawer who leaves mid-turn; a phone keyboard covering the canvas.

**Tests.** Guess matching, scoring, rotation (some exist: `sketch.test.cjs` 1 test); privacy of the prompt (never sent to guessers); word-list filter.

**Acceptance.** Four to eight people play without a leaked prompt or an abusive word reaching the screen.

### 4.11 Star Catch, Neon Drift, Bubble Burst

**Today.** Server-simulated 60 s rounds (6 s practice, 3 s countdown), identical object streams for every player, verified by replaying recorded inputs. Players never affect each other; it is a score race. Folders are redirect stubs to the party page.

**Target.** Add interaction and use these as the reference for remote play.

**Tasks.** Light interaction ideas to test: Star Catch "steal" (a star caught by two goes to the earlier), Neon Drift slipstream or bump, Bubble Burst shared bubbles where the pop goes to the first. Balance review (comet frequency, boost economy). Display UI that highlights a player's own lane on a remote screen. Keep verification.

**Situations.** Two phones pop the same bubble; a phone idling (stale-input rule exists); late joiners during practice (allowed); ties.

**Tests.** The 7 engine tests plus interaction and tie tests; replay round-trip (exists).

**Acceptance.** A four-person round has at least one meaningful interaction and remains verified.

## 5. Scenario catalogue for several people playing together

Situations that arise whatever the game. "Decide" says what the team must settle.

| ID | Scenario | Decide / handle | Applies to |
| --- | --- | --- | --- |
| SC-1 | **Mixed skill** (a child with an adult, a first-timer with a veteran) | Optional assists per seat (aim help, power forgiveness), handicaps, "gentle mode" thresholds; never visible stigma | all |
| SC-2 | **Someone leaves early, and the match falls below two humans** | `abandoned` status, no ranked outcome; remaining player finishes for fun | all multiplayer |
| SC-3 | **A slow or old phone** (low sensor rate, laggy) | Per-seat link quality shown; pacing adapts; touch fallback; fairness note in results | all |
| SC-4 | **Different sensitivities** | Sensitivity lives on the phone; optional "locked sensitivity" for competitive modes | pointer and swing games |
| SC-5 | **Remote friends in a real-time shared game** (tennis, fencing) | Not offered: show "needs the same room" with the reason; offer a Race-type alternative | Table Tennis, Foam Fencers |
| SC-6 | **Same name or colour on two phones** | Unique seat colour and shape; names de-duplicated with a suffix | all |
| SC-7 | **Auto-start surprises** (everyone ready triggers a start) | Visible countdown with a cancel; host can disable auto | all |
| SC-8 | **The host leaves or the TV tab closes** | Room pauses; 120 s countdown shown on phones; reclaim; host phone takes admin (host plan) | all |
| SC-9 | **Same-room audio** (four split-screens, four engines, music) | One music bed, per-seat gain, panning, master volume reaching games | split-screen games |
| SC-10 | **TV differences** (4:3, 21:9, overscan, 4K) | Safe area, container-scaled HUD, layout by aspect ratio | all |
| SC-11 | **A tie** | Per-game tie-breaks shown; co-winners or sudden death | all |
| SC-12 | **Someone disputes the result** | Verified games can be re-checked; attested ones are labelled; export the record | all |
| SC-13 | **A modified host** fabricates scores | Verifiable tier; attested games never ranked by default | attested games |
| SC-14 | **A very long session** (an hour, many rounds) | Memory caps (history of 20), leak tests, periodic rest prompts | all |
| SC-15 | **Rematch loops** | Same seats, new seed; swap seats and drivers between rounds; no menu round trip | all |
| SC-16 | **Series and playlists** | Cumulative points across games; tie handling; skip a game | playlists |
| SC-17 | **More people than seats** | Spectator seats, rotation, bracket | all |
| SC-18 | **Safety** (a wide swing, a thrown phone) | Safety screen, gentle mode, no required wide swings | swing games |
| SC-19 | **Accessibility** | Colour plus shape plus number, reduced effects, large text, non-motion input | all |
| SC-20 | **Inappropriate content** (names, guesses, custom words) | Filters, host removal, no raw HTML | Drawing, lobby |

## 6. Order of work

| ID | Work | Depends on | Size |
| --- | --- | --- | --- |
| G0 | Install dev dependencies and run `session.test.cjs`, `network-smoke.cjs`; build the fake-phone harness | none | S-M |
| G1 | X1 catalog single source; X4 results fixes and ids (D-G5); results screen bug | G0 | S-M |
| G2 | X2 seat model, seat token in `localStorage`, spectator seat; X3 round policy and idle rule | G0 | M-L |
| G3 | Kart Rush remaining tasks 1-6 | G2 | M |
| G4 | Pocket Greens tasks 1-3, 8, 9 (address, timer, honours, cap, seq), then 4-7 | G2 | M-L |
| G5 | Slice Dojo tasks 1-7 | G2 | M |
| G6 | X5 verification for Kart Rush and Golf, then the rest; X10 fixed-step conversions | G3, G4 | L |
| G7 | Ghost bus and Time Trial / Cloud Cruise interaction | G2 | M |
| G8 | Shooting Range shared mode, Alien Attack co-op/versus | G2, G6 | M-L |
| G9 | Table Tennis and Foam Fencers rules; rotation polish | G6 | M |
| G10 | Drawing improvements; server games interaction | G2 | M |
| G11 | X6 remote playing for independent-view games (after D-G1) | G2, G7 | L |
| G12 | X11 per-view HUD and audio; X14 budgets and the governor tuning | G3 | M |
| G13 | Host phone controls ([host-phone-controls.md](host-phone-controls.md)) | G2 | M-L |
| G14 | Controller fixes and the stress plan ([controller-stress-tests.md](controller-stress-tests.md)) | G0 | M-L |

The order puts the shared platform pieces (G0-G2) first because every game's multiplayer depends on them, then the three Tier 1 games to finish, then verification, then the remaining games and remote play.

## 7. What this plan cannot settle from the desk

Frame rates, split-screen cost on real laptops, sensor behaviour on real phones, the true length of a Time Trial lap or a golf round (round caps are inferred), and how the rules *feel*. Each rules change here (Co-op semantics, fencing, tennis scoring) should be playtested before it is locked, using the human protocol in the controller plan.
