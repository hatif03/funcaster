# Build guide 11: the prediction market UI (TV shell, spectator phone page, discovery)

Part of the [build guide](00-README.md). Status: plan, 6 November 2026. **No code is written.** This is the complete UI specification for the spectator market of [10](10-prediction-market.md): how people **discover ongoing and upcoming matches**, read the odds, place a prediction, see it resolve and get paid, on **two surfaces**: the Funcaster TV shell (a Windows-XP-style desktop) and a **new phone web page** opened by scanning a QR. It follows the general shell rules of [05](05-ui-integration.md) (data-nav, data-id, strings, demo scenarios, skins) and adds the market-specific ones. It rests on a UI study of Polymarket, Kalshi, Manifold, PancakeSwap Prediction, Twitch Channel Points Predictions, sportsbooks and tote boards, Jackbox, and Windows XP idioms; **several of those findings were recalled rather than re-verified (web access was patchy)**, so the first booth session is the real test ([section 12](#12-tuning-at-the-first-booth-session)).

## 1. Principles (the 15 rules, in priority order)

1. **One tap to choose, one tap to confirm.** An outcome button opens the slip with a default stake already chosen; Confirm is the second tap. No keyboard, no wallet screen.
2. **Always show the projected payout before Confirm**, including your own stake's effect on the pool.
3. **Say "odds can change until betting closes" on the slip itself**, in one plain line.
4. **One odds format**: a multiplier ("1.6x") plus the pool share ("60%"). No cents, fractions or American odds.
5. **The same eight states everywhere** (section 3): fixed colour, icon, badge and one line of copy, on the TV and the phone.
6. **One countdown per market, always visible**; urgent styling (colour, pulse) only in the last 30 seconds.
7. **Fixed outcome order, letters (A, B, C, D), shapes and seat colours; never swapped**; colour is never the only signal.
8. **Spatial time**: EXPIRED, LIVE, NEXT, LATER cards; the default focus is NEXT on both surfaces.
9. **Odds changes are explicit**: an "Odds moved" bar with old and new value and an Accept button; never submit silently at a different payout.
10. **Close means close**: at the close the buttons grey with a padlock and the reason; a late tap says "Too late. Your coins were not used."
11. **Void is a refund** with its own state and copy.
12. **Celebrate once and briefly** (a balloon and a result card, no loops); losers see a neutral result and the next market.
13. **The TV shows aggregates; the phone shows what is personal.** The TV never shows individual bets; the phone always shows "Your pick" and My Bets.
14. **Every TV control is big and reachable** (D-pad and cursor targets of 64 px or more at the 1280x720 base, a visible focus ring) and **a QR is on every market window and on the Kiosk board**.
15. **Plain, honest errors**: "Your prediction has NOT been placed." No jargon (gas, sign, tx, shares, limit, odds format names). Coins are **"play coins"**.

**Anti-patterns to avoid** (from the study): hidden odds changes; mixed odds formats; one-tap bets with no confirm on a phone (Manifold's quick-bet arrows caused accidental bets); moving buttons (Manifold swapped YES and NO and confused people); colour-only meaning; fake urgency ("X people just bet"); a midpoint probability on a thin pool (always show the pool size next to the share, so "100 versus 0" is not read as certainty); wallet and gas words; cash-out or sell (they do not fit 1 to 10 minute markets); streaks, bonuses and "double or nothing" loops, even with play money; silently removing a closed market (it stays visible with a reason).

## 2. Vocabulary (use these words only)

| Say | Never say |
| --- | --- |
| Prediction, predict | Bet, wager, gamble (the product name is Predictions; internal code may say bet) |
| Play coins | USDC, tokens, funds, wallet, balance in dollars |
| Pool, share | Liquidity, volume, shares (the finance sense) |
| Multiplier ("1.6x") | Odds in other formats, price in cents |
| Betting closes in 0:42 | Lock time, cutoff block |
| Match cancelled, you got your coins back | Void, refund transaction |
| Estimate, final when betting closes | Quote, slippage |

## 3. The eight states (one line of copy each; same on both surfaces)

| State | Badge | Colour and icon | Copy |
| --- | --- | --- | --- |
| Upcoming (lineup not locked yet) | **SOON** | grey, clock | "Starting soon. Predictions open when the players are set." |
| Open | **PREDICTIONS OPEN** | green, open ticket | "Pick a side. Closes in 1:20." |
| Closing soon (under 30 s) | **CLOSING** | amber, pulsing timer | "Last chance. Closes in 0:12." |
| Locked (closed, match not started) | **LOCKED** | grey, padlock | "Predictions closed. The match starts in 0:08." |
| Live | **LIVE** | red dot | "Match in progress. Your pick can't change now." |
| Resolving | **CHECKING** | blue, spinner (1 to 3 s, longer if two reports must match) | "Checking the result…" |
| Final | **FINAL** | gold, trophy | "A won. Winners share the pool." |
| Void | **VOID** | grey, info | "Match cancelled. Everyone got their coins back." |

Plain explainers (behind an (i) or the How it works wizard, one or two lines each): **Pool**: "Everyone's coins go in one pool. Winners split it." **Odds change**: "The multiplier can change until predictions close. More coins on a side means a smaller multiplier for that side. It is final when the timer hits zero." **Projected payout**: "If A wins you get about 160 coins, if no one else predicts." **Void**: "The match didn't finish fairly. Nobody wins or loses; you get your coins back." **Nobody on the other side**: "Nobody picked the other side, so your coins come back." **Tie**: "If two players tie, their backers share the winnings and nobody loses coins." **Play money**: "These are play coins. No real money."

## 4. Discovery: how people find ongoing and upcoming matches

**On the phone (the main discovery surface):** scan any QR (the Kiosk board, a market window, the Invite window's "Spectators" QR) to open `/predict` (optionally with `?m=<publicMarketId>` to land on one market). The home screen is a **carousel of match cards in time order** (EXPIRED, LIVE, NEXT, LATER; default focus NEXT) with **filter chips** (Open now, Live, Soon, Done, and a game filter) and **a default sort of closing soonest**. Each card shows: game icon and title, the players (seat names or ENS names with their colours), the state badge and countdown, the pool, and mini odds bars. Tapping a card opens the market sheet.

**On the TV:** the **Predictions** window (a list view with a details pane) lists every **listed** match on the relay, not only the TV's own room; the **Kiosk attract screen** becomes an **odds board** (a tote board) for passive discovery; the **tray lamp** shows the number of open markets; **balloons** announce new openings. Where discovery data comes from: `GET /api/web3/matches` and the `/market` socket namespace ([10](10-prediction-market.md) section 10); rooms are listed only if opted in (default on in Kiosk mode); **room codes are never shown or linked** (an opaque `matchRef` is).

**Watching the match:** the TV is the stage. For people without line of sight, a later option reuses the existing remote views if enabled; **not in scope**.

## 5. The TV shell

### 5.1 The Predictions window (new tool window `predictions`)

Registered in `public/os/windows/manifest.js` as a tuple `["predictions", title, "leaderboard", 760, 540]` (icon role `leaderboard` already exists; a dedicated icon needs the asset pipeline), lazily imported from `windows/predictions.js`, singleton, **coexisting** with Players and Invite (add to `coexists` or open with `keep: true`). Layout (an Explorer-style list view with a details pane, tabs, toolbar and status bar):

```text
+-[ Predictions ]----------------------------------------------[_][O][X]+
| Toolbar:  [ Back ] [ Refresh ] [ Sort: Closing soonest v ] [ Scan to predict ]
| Tabs:     [ Live (1) ] [ Open (2) ] [ Starting soon (3) ] [ Finished ] [ Top predictors ]
+----------------------------+-------------------------------------------+
| Match                Status| Star Catch - Booth TV 2        PREDICTIONS OPEN
| > Star Catch   OPEN   0:42 |                                            |
|   Neon Drift   LIVE        |  WINNER - who scores most?                 |
|   Time Trial   SOON        |  A  peeli     ##########----  38%   2.6x   |
|   Star Catch   FINAL       |  B  magenta   ############--  45%   2.1x   |
|                            |  C  cyan      ####----------  17%   5.8x   |
|                            |  Pool 6.40 play coins - 14 predicting      |
|                            |  Closes in 0:42   [ How betting works ]    |
|                            |        +-----------+                       |
|                            |        |  [ QR ]   |  Scan to predict      |
|                            |        +-----------+                       |
+----------------------------+-------------------------------------------+
| 2 open - 14 predicting - next close in 0:42 - Play coins, not real money |
+--------------------------------------------------------------------------+
```

- **Left list** (a `choiceList`-style listbox, one row per match, columns Match, Status, Starts in, Pool), sorted by closing soonest, grouped by the tabs. **Rows are `data-nav` buttons** (`pred-row-<matchRef>`); the details pane updates on focus.
- **Right pane:** the selected match: the market title, one **stacked pool bar** with large coloured segments and the letters A to D, a row per outcome (letter, seat name, share bar, share percent, multiplier), the pool and predictor count, the countdown, the QR and the explainer button. **The TV never shows individual bets and has no bet buttons** (spectators predict on their phones); the outcome rows are display-only and visibly marked "predict on your phone".
- **Tabs:** Live, Open, Starting soon, Finished, **Top predictors** (from Arkiv, [10](10-prediction-market.md) section 8: handle, wins, net play coins; per human, minimum markets; optional handles only, default "guest-xxxx").
- **Toolbar buttons are at least 64 px with text labels**: Back, Refresh, Sort, **Scan to predict** (opens a full-size QR dialog readable from 5 m).
- **Status bar:** counts and the next close time and the play-money line.
- **Finished rows** show the result ("A won, 9 of 14 predictors won, pool 6.40") and a **Verify** button that fetches `/api/web3/result/<hash>` and shows "result matches its hash" (the transparency moment for judges).
- **State handling:** a closed market stays in the list with its reason; resolving shows CHECKING; void shows the VOID copy; **a failed directory poll shows "Predictions are paused. Play continues." and keeps the last good data**.
- **Wizard:** the **How betting works** button opens a 3-page XP wizard (Next, Back, Finish): (1) pools in plain words; (2) odds change until close, ties, void; (3) play coins. Shown once automatically on first open per TV.

### 5.2 Entry points

**Desktop icon** "Predictions" (the `system` array in `shell/icon-grid.js`); **Start menu** entries "Predictions" and "Scan to predict" (`shell/startmenu.js`); **tray lamp** (a coin glyph with a count badge of open markets; click opens the window; amber when the directory is stale); **balloons** (deduped by key, suspended while a game runs): "Predictions are open for Star Catch (closes in 1:00)" (`pred-open-<ref>`), "Predictions close in 10 seconds", "A won. Winners share 6.40 play coins." (`pred-final-<ref>`), "Match cancelled. Everyone got their coins back." All strings in `WEB3_STRINGS`.

### 5.3 The Kiosk odds board (the attract window, extended)

The attract window (`shell/boot.js`, `windows/attract.js`; it currently shows the room QR, "next game" and the top 5 of `room.leaderboard`) gains a **tote board mode** when markets exist: huge, high-contrast numbers readable from 5 m, one thing changing at a time; a ticker row "NEXT MATCH IN 0:42 - STAR CATCH"; runner cells A to D in the seat colours with the multiplier large; the pool; a **rotating QR card** "Scan to predict on the next match"; and a "Top predictors today" strip (from Arkiv). Odds refresh every second with a brief flash on change; no pulsing except in the last 30 s. Any pointer or key dismisses it, as today.

### 5.4 Where it touches the player's lobby

- **Game Properties, Rules tab**: a **Predictions** row (a non-schema field, like Stakes in [05](05-ui-integration.md) section 3.4, **not** in `core/catalog.js`): *Off* or *On (listed)*, plus **Betting window** (30, 60, 90, 120 s) and a **Bonus** (a sponsor top-up, off by default). **Disabled with a reason** when: partners are off, the game or mode is not eligible ("Predictions aren't available for Drawing"), co-op Slice Dojo ("everyone ties in co-op"), or the Arc service is down. Default **On in Kiosk mode**, Off in party rooms. Handler `onAdmin("predictions")` writing `room.web3.markets` settings (never `room.setup`).
- **Start gate and the lineup lock:** when predictions are on, "ready" locks the lineup and opens the market; the Start button shows "Predictions open: match starts in 0:42" (a reason string through `startReason`, never the `"Ready to play"` literal) and enables itself when the close is confirmed; a seat leaving during the window cancels the market and shows "A player left. Predictions were cancelled; a new window will open." ([10](10-prediction-market.md) section 4).
- **Players window footer:** "14 people are predicting this match. Pool 6.40." (social proof for the players, aggregates only).
- **Invite window:** a second QR "Spectators: scan to predict".
- **Results window:** an aggregate line "Predictions: 14 took part, 9 won, pool 6.40 play coins" and the receipt line ([05](05-ui-integration.md) section 3.6).
- **During the match** the game window is full screen; the tray chip keeps showing the open count; balloons are suspended.

## 6. The spectator phone page (`/predict`, new `public/predict.html` and `public/predict/*.js`)

> **Update, 6 November (later): this page is the Predict tab of the account app** (`public/me/`, served at `/me` and mounted as the controller's "My Funcaster" sheet; see [13](13-users-scenarios-and-accounts.md) section 3). Read `/predict`, `public/predict.html` and `public/predict/*.js` below as the Predict tab's routes and modules inside `public/me/`; `/predict` can remain as a redirect to `/me`. The same codebase serves phones, tablets and laptops (the addendum at the end of this document).

A new page, **not** `controller.html` (that page is a fixed-position, scroll-locked remote whose `join` would take a seat or enter the kiosk queue, which a spectator must not do [code]). `public/predict.html` is served automatically at `/predict` by the static handler; it uses the party CSS tokens (`--ink`, `--paper`, `--purple`, `--radius`) and the phone skins, **scrolls normally**, loads the phone signer bundle lazily, and connects to the `/market` namespace. **No sensors are needed, so plain HTTP also works.** The page is a thin client: it holds the player key, shows data, and signs.

### 6.1 First visit

A one-time card: "Predict who wins. Play coins only, no real money. [ Start ]". On Start the page creates the key silently, binds to the market namespace, and the relayer sends the starting bankroll in the background (the balance chip shows "1.00" within about a second). A second card (optional) "Pick a name (optional)" with a skip; default "guest-4f2a". Then the home screen. **Private browsing or blocked storage:** the key stays in memory and a banner says "This session only".

### 6.2 Home

```text
+--------------------------------------+
| Predictions               ( 0.85 )   |   (play coins chip, taps to Wallet)
| [Open now] [Live] [Soon] [Done] [Mine]
|  < EXPIRED |   LIVE   | NEXT >  ->   |   (carousel, snaps to NEXT)
| +----------------------------------+ |
| | NEXT           PREDICTIONS OPEN  | |
| | Star Catch - Booth TV 2          | |
| | A peeli   ######-----  38%  2.6x | |
| | B magenta ########---  45%  2.1x | |
| | C cyan    ###---------  17%  5.8x | |
| | Pool 6.40 - closes in 0:42       | |
| +----------------------------------+ |
|  Predictions are play coins. (i)     |
+--------------------------------------+
```

Cards are full width with **48 px or larger targets**; the carousel snaps; chips filter; sorting is closing soonest; **empty state:** "No matches yet. When players get ready, a match will appear here." with a QR hint that predictions open when the lineup is locked.

### 6.3 Market sheet and bet slip (the heart)

Tapping an outcome (or the card) opens a **bottom sheet**:

```text
+--------------------------------------+
| Star Catch - Booth TV 2        0:42  |   state badge + one countdown (sticky)
| Who scores most?                     |
| ( A peeli   38%  2.6x )              |   outcome buttons: letter + shape + seat colour,
| ( B magenta 45%  2.1x )  <- selected |   fixed order, 56 px high
| ( C cyan    17%  5.8x )              |
| Your prediction: B magenta           |
| Amount   (0.05) (0.10) [0.25] (0.50) (1.00)   chips, additive; 0.25 preselected
| If B wins you get about 0.55 (2.2x)  |   projected, includes your own stake
|   estimate if no one else predicts   |
| Predictions can change until it closes; final at 0:00.
| [ Predict 0.25 ]                     |   armed after 0.3 s
+--------------------------------------+
```

- **Tap 1:** choose the outcome (the slip opens with the default chip). **Tap 2 (optional):** another chip. **Tap 3:** "Predict 0.25" (the confirm). The confirm button **is disabled for 300 ms after the sheet opens** (anti-accidental-tap) and shows the total and the multiplier.
- **Projected payout** uses the formula in [10](10-prediction-market.md) section 5.7 and is labelled **"estimate if no one else predicts"**; if the pool is empty it shows **"No opponents yet"**; if only one outcome has stakes it adds "If nobody takes the other side, your coins come back."
- **Odds moved bar:** if the multiplier changes between opening and confirming, a yellow bar appears: "Odds moved: 2.2x became 1.9x. [ Predict anyway ] [ Cancel ]"; **the bet carries a `minPayout`** equal to the shown estimate minus a small tolerance, so a stale screen cannot be filled worse silently.
- **Success:** the sheet closes into a toast "You're in: B magenta, 0.25" and the card shows "Your pick: B" with an ENTERED chip. **Failure copy** (exact): "Your prediction has NOT been placed." plus the reason: "Too late, predictions just closed. Your coins were not used."; "You have 0.10 coins. Lower your amount or wait for the next match."; "No connection."; "This match was cancelled."
- **Hedging:** a second prediction on another outcome is allowed (shown as two lines in My Predictions); the UI notes nothing special.
- **Undo (optional, needs the contract's `withdrawBeforeClose`, [10](10-prediction-market.md) section 7):** within the open window, My Predictions shows "Undo" and returns the coins; if the function is not built, the slip says "Predictions are final once placed" and the confirm is deliberate.
- **The seated players are barred:** a seated player's phone shows a notice instead of the slip ("You're playing in this match, so you can't predict on it. Try the next one!") (the relay's permit refuses the bet).

### 6.4 After the close: Locked, Live, Resolving, Final, Void

The card changes state in place (section 3): LOCKED shows "Predictions closed", LIVE "Match in progress. Your pick can't change now.", CHECKING a short spinner, then **the result card** (full screen, once, no loops): **"You won 0.55 play coins"** (gold, brief), **"B didn't win this time"** (neutral, the next match suggested) or **"Match cancelled. You got your coins back."** Winners are **paid automatically** (the relayer claims); the balance chip updates. A **vibration** (Android) and a toast accompany the result; no sound by default.

### 6.5 My Predictions, Wallet, Top predictors

- **My Predictions** (the "Mine" chip): a list with status chips **Open, Won +x, Lost, Refunded**, each with the match, the pick, the amount and the time; tapping opens the market card; a **Verify** link per resolved market ("result matches its hash", with explorer links under "Details").
- **Wallet:** the play-coin balance, the daily refill rule in plain words ("You get 1.00 more when you're under 0.10, once a day"), the notice "Your player key lives in this browser (play coins only)", and **Reset key**.
- **Top predictors:** the board from Arkiv, with the person's own rank; optional handle.

### 6.6 How it works (the explainers)

A 3-card sheet reachable from every screen via (i): pools; odds change until close and what void and ties mean; play coins. Same wording as the TV wizard.

## 7. Sizes, accessibility and device rules

TV at the 1280x720 base (scaled by `--px`): all targets at least 64 px, text at least the existing UI sizes, a visible double focus ring, readable from 5 m for the board; contrast per `tests/os/contrast.test.mjs`; skins `luna`, `classic`, `taxi` must not break. Phone: targets 48 px or more, 16 px minimum body text (no zoom on iOS inputs), safe-area insets, dark and light follow the system, **`prefers-reduced-motion` honoured** (no pulse or carousel animation required for meaning); every state has text and an icon, not colour alone; outcome buttons have accessible names ("A, peeli, 38 percent, 2.6 times"); timers announce at 30, 10 and 0 via a polite live region; errors are announced. Languages: English first; all copy in a string table ready for translation (an Indian-language pass is a later option).

## 8. Data, events and freshness

The phone and the TV consume the same public objects ([10](10-prediction-market.md) section 10) from the `/market` namespace (events: `directory`, `market.update`, `market.resolved`, `balance`) with a poll fallback (`GET /api/web3/matches`, 2 to 3 s). **Rules:** show the last good data with a "reconnecting" strip when a stream drops (never a blank screen); odds in the slip refresh once a second but **never move the confirm button**; the countdown is computed from **server time** (the shell already receives `serverTime`/`serverOffset`) so a wrong phone clock cannot change the close; the close is authoritative on-chain, so a tap after it fails with the exact copy above. Per-person data (the player's bets, balance) is read from the chain by address and cached in `localStorage` for display only; the **TV never receives it**.

## 9. Files and components (for the build)

**Shell:** `public/os/windows/predictions.js` (list, details, tabs, toolbar, status bar), `public/os/windows/predictions-wizard.js`, `public/os/web3-markets-data.js` (pure row models and formatters: multipliers, shares, projected payout, state machine for the eight states; **unit-tested without a DOM**), attract changes in `windows/attract.js` and `boot.css`, additions to `icon-grid.js`, `startmenu.js`, `tray.js`, `balloons` usage in `main.js`, strings in `strings.js` (`WEB3_STRINGS.predictions`), styles in `public/os/web3.css`, `session.js` (a `predictions` request and the directory feed) with `demo-session.js` stubs, and the Game Properties row in `option-ui.js`. **Phone:** `public/predict.html`, `public/predict/app.js` (router and screens), `public/predict/market.js` (the sheet and slip), `public/predict/store.js` (the key, balance, local cache), `public/predict/predict.css`, `public/predict/strings.js`, reusing `public/web3/phone-signer.js`. **Server:** the directory and namespace ([10](10-prediction-market.md) section 10) and `GET /api/web3/predict-qr` (an `inviteOrigin`-style QR to `/predict`, modelled on `/api/pairing`).

## 10. Demo scenarios and tests

**Demo scenarios** for `?demo=1&state=` (shell) and `/predict?demo=1` (phone), each unit-tested: `pred-empty`, `pred-soon`, `pred-open` (3 outcomes, pool, countdown), `pred-closing` (under 30 s), `pred-locked`, `pred-live`, `pred-checking`, `pred-final-won`, `pred-final-lost`, `pred-void`, `pred-one-sided` ("no opponents yet"), `pred-odds-moved`, `pred-offline`, `pred-seated-player` (barred notice), `pred-kiosk-board`. **Unit tests:** multipliers, shares and the projected payout equal the vectors of [10](10-prediction-market.md) section 5.9; the eight-state machine; sorting; strings present; the `signature` re-render for Results. **Phone e2e (Playwright, fake wallets):** first visit, bankroll arrives, open a market, place a prediction in three taps, the odds-moved bar, a late tap, a barred seat, result card, My Predictions, wallet refill rule, offline. **Shell e2e (manual, like `shell.e2e.mjs`):** the Predictions window by D-pad and by the pointer (every `data-id` reachable), tabs, the QR dialog, the wizard, the attract board, the Game Properties row and the start gate. **Visual pass:** skins, the viewport matrix, TV distance legibility (a 5 m check), the phone on a small and a large device.

## 11. UI tasks (the UI part of M7; hours are my judgement)

| ID | Task | Depends | Hours |
| --- | --- | --- | --- |
| P1 | Spectator page shell: key, binding, bankroll, first-visit cards, theme, strings | S4, M4 | 8 |
| P2 | Home: directory feed, carousel, chips, filters, cards, the eight states, empty states | P1 | 10 |
| P3 | Market sheet and slip: outcome buttons, chips, projected payout, odds-moved bar, confirm, errors, barred notice | P2, M5 | 12 |
| P4 | After-close: result card, My Predictions, Wallet, Top predictors, toasts, how-it-works | P3 | 10 |
| P5 | Pure model module and its unit tests (shared logic for TV and phone) | M1 | 6 |
| P6 | TV Predictions window: list, details, tabs, toolbar, status bar, QR dialog, Verify, wizard | P5, M4 | 14 |
| P7 | Attract odds board, tray lamp, Start menu, desktop icon, balloons | P6 | 7 |
| P8 | Game Properties Predictions row, start gate text, Players and Invite and Results hooks | P5, M3 | 7 |
| P9 | Demo scenarios, e2e, visual and legibility passes | P1 to P8 | 10 |

About **84 hours** (the earlier estimate for the whole market lane in [10](10-prediction-market.md) section 11 is revised accordingly). **Tier 1** is P1 to P3, P5, P6 and the Game Properties row (about 55 hours); P4's Top predictors, P7's board and the wizard are tier 2.

## 12. Tuning at the first booth session

Prototype the slip with real spectators first; the two things most likely to need tuning are **the default stake chip** and **the wording of the "odds can change" line**. Check also: whether people understand the multiplier without help; whether the 60-second betting window feels right or throttles the Kiosk; whether the TV board is readable from the queue; whether the optional Undo is wanted; whether spectators ask to watch the match on the phone (the remote-views idea). Record observations in `docs/web3/market-evidence.md`.

## 13. Addendum: laptop, tablet and shared-device layouts

A spectator may use a laptop (a desk, a sofa, a second screen next to a stream) or a tablet. The account app is **one responsive codebase** with three layouts; the states, wording and rules of sections 1 to 3 are identical everywhere.

| Width | Layout | Slip | Notes |
| --- | --- | --- | --- |
| Under 600 px (phone) | One column; a carousel of cards; tabs at the bottom | A **bottom sheet** (section 6.3) | Touch targets 48 px or more |
| 600 to 1023 px (tablet, landscape phone) | Two columns: the match list on the left, the selected market on the right | A **side panel** under the market | Targets 48 px; the carousel becomes a list |
| 1024 px and up (laptop, desktop) | **Three columns**: filters and the match list; the selected market with the outcome rows and the pool bar; **the bet slip as a right-hand panel** with My Predictions and Wallet below it; a maximum content width of about 1280 px | A **panel**, always visible when an outcome is selected | Targets at least 36 px (mouse), hover states and tooltips, visible focus ring |

```text
+--------------------------------------------------------------------------------------+
| Predictions        [Open now][Live][Soon][Done][Mine]                      ( 0.85 )  ? |
+---------------------------+----------------------------------+-----------------------+
| Star Catch   OPEN  0:42   | Star Catch - Booth TV 2   0:42   |  Your prediction      |
| Neon Drift   LIVE         | A peeli   ######-----  38%  2.6x |  B magenta            |
| Time Trial   SOON         | B magenta ########---  45%  2.1x |  Amount (0.25) 0.50 1 |
| Star Catch   FINAL        | C cyan    ###---------  17%  5.8x |  If B wins ~0.55 (2.2x)|
|                           | Pool 6.40 - 14 predicting        |  Odds can change until |
|                           | [How it works]  [Copy link]      |  it closes.            |
|                           |                                  |  [ Predict 0.25 ]      |
+---------------------------+----------------------------------+  My predictions        |
| Keys: J/K move  1-4 pick  +/- amount  Enter confirm  Esc close  ? help                 |
+--------------------------------------------------------------------------------------+
```

- **Keyboard control (all layouts with a keyboard):** J and K move through matches, **1 to 4 pick outcome A to D**, plus and minus step the chips, **Enter confirms after the 300 ms arming delay**, Escape closes the slip, `?` opens the key help; Tab order follows reading order; everything is reachable without a mouse.
- **Still two steps:** select an outcome, then confirm; with the mouse that is two clicks. A confirm never fires from a single keystroke without a selection and the arming delay.
- **The browser tab shows the countdown** ("0:42 - Star Catch - Predictions") and a **favicon badge** with the number of open markets; an **opt-in desktop notification** (the Notification permission is requested only when the user turns the switch on in Wallet settings) announces "closing in 30 s" and the result.
- **Multiple tabs on one key** stay in sync through a `BroadcastChannel`; the same bet cannot be double-submitted (each slip has its own salt and nonce).
- **Copy link** produces `/me?m=<publicMarketId>`, opened on any device; it lands on that market after the first-visit card; an expired or finished market shows its final state and Verify.
- **Laptop on the TV (HDMI):** the shell and the account app are separate tabs; the shell host can bind a **host account** which is then **barred from that room's markets** ([17](17-situations-and-edge-cases.md) section 3).
- **Station mode** for a staffed tablet or laptop (`/me?station=1`, enabled with the staff PIN): a fresh guest key per session, a visible reset timer, wipe after 2 minutes idle or on Done, **auto-claim** before the wipe, and a "Take this with you" QR that opens the person's Ledger rows on their own phone ([17](17-situations-and-edge-cases.md) section 6).
- **In-app browsers** (WhatsApp, Instagram and others) show an "Open in your browser to keep your history" banner; **a feature check at load** makes the page read-only if signing is not supported.
- **Tests:** Playwright flows on three viewports (phone, tablet, laptop) for the main journey, keyboard-only completion of a prediction, the tab-title countdown, multi-tab sync, the copy-link landing, and station mode reset.

## Sources

The UI study (6 November 2026): PancakeSwap Prediction guide and rules, Manifold FAQ and its quick-bet poll, Polymarket order and resolution docs, Kalshi quick-order help, Twitch's Channel Points Predictions announcement, a prediction-market interface critique (humaninvariant on Substack), tote-board descriptions (horseracingsense, horise), Jackbox audience documentation. Findings marked as recalled in the study are design inspiration, not citations.
