# Build guide 21: the UX laws applied to Funcaster and the phone (same Windows XP look, better behaviour)

Part of the [build guide](00-README.md). Status: plan, **6 November 2026**. **Nothing is built.** The owner supplied twenty UI and UX laws and asked which apply, what to change and how, while keeping the console looking like the Windows-XP-style OS it is now.

**How this was grounded.** The shell facts below come from reading the code on `main`: `public/os/shell/icon-grid.js` (desktop), `startmenu.js`, `public/os/windows/manifest.js` (eleven tool windows), `welcome.js`, `results.js`, plus the phone spec ([build 06](../../build/06-phone-remote-and-pointer.md)), the North star in `plan.md` and the web3 UI documents [05](05-ui-integration.md), [11](11-prediction-market-ui.md), [12](12-reality-and-ledger.md), [13](13-users-scenarios-and-accounts.md). The phone join page and the Predictions UI were **not** run on a device; every acceptance number is a proposal to be tested (section 10), not a measurement.

## 1. The constraints that shape every answer

1. **The look stays.** Windows XP Luna blue (Classic grey as the high-contrast option), Tahoma, the supplied icon set, the pixel-art Mumbai wallpaper, the Chonk mascot. Improvements are **behaviour, content, order, timing and grouping**, not a restyle. No glass, no flat redesign, no new typefaces, no emoji in the shell. New icons come from the existing pack (`docs/plans/build/data/icons-48.json`; roles already include `leaderboard`, `records.history`, `players.crew`, `invite.network`, `msg.*`, `qr.camera`).
2. **Goal 1 of the North star is the benchmark:** a stranger scans, understands and is **playing within about 20 seconds**; a spectator is **predicting within 40**.
3. **Two input worlds.** The TV shell is driven by a phone-as-pointer and a D-pad (no keyboard, no precise mouse); the phone is touch. Fitts, Hick and Miller therefore bite harder on the TV.
4. **Honesty rules stay** (labels, `PLAY MONEY`, plain words). A law never justifies a dark pattern: no streak bonuses, no fake urgency, no hidden costs ([11](11-prediction-market-ui.md) bans streaks and double-or-nothing; section 8 keeps that).
5. **Reachable from the phone.** Every new control is a `data-nav` button with a unique `data-id` ([05](05-ui-integration.md) section 1).

## 2. The twenty laws at a glance

Rating: **Core** (shapes a design decision), **Applied** (a rule on specific surfaces), **Guard** (a check, rarely a change).

| # | Law | Rating | The one-line application for Funcaster | Section |
| --- | --- | --- | --- | --- |
| 1 | Aesthetic-usability effect | Core | Polish what already looks like XP: consistent icons, sounds, mascot empty states, no raw errors | 3, 9 |
| 2 | Progressive disclosure | Core | Winner first; receipts one click deeper; chain facts only in the Proof tab | 5, 7 |
| 3 | Recognition over recall | Core | Recent, favourites, rejoin-last-party, names not hashes, status line says where you are | 4, 6 |
| 4 | Von Restorff (isolation) | Applied | One accent per view: the default button; a LIVE badge only when something is live | 4, 7 |
| 5 | Peak-end rule | Core | Design the result reveal (peak) and the closing card and shutdown summary (end); make a refund feel good | 7 |
| 6 | Goal-gradient | Applied | Progress rings for join, funding, market close, Cup rank, games tried; not for betting | 8 |
| 7 | Serial position | Applied | Best item first, proof last; your own row pinned last on boards | 4, 5 |
| 8 | Tesler's law | Core | The system absorbs the complexity: keys, names, gas, defaults, leases | 3 |
| 9 | Postel's law | Core | Accept sloppy input (codes, names, amounts); always output one strict format | 6 |
| 10 | Occam's razor | Core | One new icon, one hub window, fewer buttons; every new control justified | 5, 7 |
| 11 | Hick's law | Core | Three stake chips, three or four sides, five tabs, three result buttons | 5, 7, 8 |
| 12 | Fitts's law | Core | 64 px TV targets, thumb-zone phone CTAs, magnetic pointer, edge actions | 3, 7 |
| 13 | Jakob's law | Core | Obey XP idioms on the TV; obey phone idioms (sheets, share) on the phone; odds as "Backed X%" and "pays about Y×" (never "chance": the pool's share is not a probability, see section 8) | 3 |
| 14 | Miller's law | Applied | Chunks of at most about seven; lists of five with "See all"; short hashes | 5 |
| 15 | Doherty threshold | Core | 100 ms acknowledgement, nothing silent past 400 ms, cached first paint | 9 |
| 16 | Law of proximity | Applied | A spacing scale; labels touch their controls; destructive actions far from primary | 3 |
| 17 | Law of similarity | Applied | One component per meaning: status chip, name pill, money, provenance badge, seat shape | 3 |
| 18 | Law of common region | Applied | XP group boxes and cards bound each task | 3, 5 |
| 19 | Visual hierarchy | Core | One title, one primary action, two text sizes, details greyed | 3, 7 |
| 20 | Feedback loops | Core | Every action answers; every pending operation shows a four-state chip; sound, haptic, mascot, balloon | 9 |

## 3. Cross-cutting rules (a design system for the new surfaces, in XP)

These go in `public/os/web3.css` and one small helper module (`public/os/ui/kit.js`) so every surface follows them by construction.

| Rule | Detail | Laws |
| --- | --- | --- |
| **Spacing scale** | `calc(N * var(--px))` with N in 4, 8, 12, 16, 24; related things 4 to 8, groups 12 to 16, regions 24; **destructive buttons at least 24 away** from the primary | Proximity |
| **Group boxes** | Task areas are XP group boxes or inset panels with a title; a card on the phone is one bordered region holding one decision | Common region, hierarchy |
| **One status chip** | Four states only: **Saving…**, **Saved ✓**, **Saved locally**, **Needs attention**; the same shape, wording and colour on TV and phone; provenance (verified, attested, reported) is a second, separate badge ([12](12-reality-and-ledger.md)) | Similarity, feedback |
| **One name pill** | A name with its mark: nickname, optional "on ENS" check, seat shape and colour from `--seat-*`; long names ellipsised in the middle; full name in the status line on focus | Similarity, recognition |
| **One money format** | Right-aligned, two decimals, tabular numerals, suffix **play**; never a hex amount; the amber **PLAY MONEY** ribbon is the persistent honesty region on any staked surface | Similarity, honesty |
| **Short hashes** | `0xab12…cd34` (4 + 4), a copy button and the full value in the status line; never more than one hash in a row | Miller |
| **Text scale** | At 1920 by 1080 and 1366 by 768: body at least 20 px, secondary at least 16 px, title bar at least 20 px; two text sizes per window plus the title | Hierarchy |
| **Target sizes** | TV: every `data-nav` target at least **64 px** high and wide at 1080p, at least 8 px apart; the visual size may stay XP-small but the **hit area is padded** (the close and minimise buttons especially). Phone: at least 48 px, the primary CTA 56 px and full width, at least 12 px apart | Fitts |
| **Magnetic pointer** | Within about 24 px of a `data-nav` target the pointer's highlight snaps to it; moving off needs a deliberate move. The gyro pointer is imprecise by nature | Fitts |
| **Edges and corners** | Primary actions at the bottom right of windows (XP convention) and at the bottom of the phone screen; the Start corner is already a free target | Fitts, Jakob |
| **Defaults** | Every new choice has a default that is right most of the time; "Advanced" is collapsed | Tesler, Hick |
| **XP idioms** | Tabs, group boxes, default button, OK or Cancel, wizards with Back, Next, Finish, balloons for background news, message boxes with the `msg.*` icons | Jakob |
| **Phone idioms** | Bottom sheets, the OS share sheet, large pill buttons, no hamburger menus; the Home button on the remote opens the party menu where **My Funcaster** lives (no new remote buttons) | Jakob, Occam |
| **Sound and motion** | The XP sounds already supplied ([sounds.json](../../build/data/sounds.json)): a ding when a pot locks, tada for a prize, the XP error chord only for real errors, one soft click for taps; all optional (Settings), none under `prefers-reduced-motion` for motion | Aesthetic, feedback |
| **Mascot** | Chonk reacts to the key moments (collar tags light as seats join or fund; a cheer on win; a nap in empty states); one reaction per moment, never a tutorial | Aesthetic, peak-end |
| **Empty and error states** | Empty: a short line, the mascot, one action ("No match yet. Start one."). Error: **what happened, what it means for you, one action**; never raw error text, never a code the player must read | Aesthetic, Postel |

## 4. The desktop, the Start menu and the first minute (what the code does today, and the changes)

| Observed in the code | Law | Change | Acceptance |
| --- | --- | --- | --- |
| Desktop: up to 15 game icons in a grid (1 to 3 columns, 1 to 5 rows by screen), pagination when small, four system icons (My Games, Invite, Recycle Bin, Help) | Miller, Hick, Occam | Keep. Add **exactly one** system icon, **Funcaster Live**, hidden when partners are off; **do not** add icons for Chain, Leaderboard, Predictions, Ledger separately (section 5). The system column stays at five | System icons at most five; total top-level choices on the desktop at most 15 games plus five |
| Start menu left column: "Favourites" are `games.slice(0, 4)`, i.e. a fixed order; "Recent" shows the last two from storage | Recognition, serial position | Make the first section **"Most played"** (from the same storage the recent list uses; until there is history, the curated four); keep Recent; the first row is always the game most likely to be wanted | After three plays, the Start menu's first row equals the most played game |
| Start menu right column: seven windows then Lock, Restart, Shut down | Hick, serial position, Miller | Add **Funcaster Live** after Players; keep the order Play (left) first and Shut down last; check the wording of "Restart" (in XP it means reboot; here it restarts the match) and use **"Restart game"** if the string is ambiguous | Seven or eight items right, three footer actions |
| Welcome window: heading, subtitle, three buttons (Desktop default, Fullscreen, Connection) and a note; **no join QR or room name in it** | Recognition, visual hierarchy, Goal 1 | For a **non-kiosk first view**, show the **QR and the room code (and party name when present) large** as the primary element, with "Scan with your phone camera" and the connected-phones count; Desktop stays the default button after it. On a TV the first thing a stranger needs is the way in | A stranger with no briefing joins from the Welcome window within 20 s (VX-07) |
| `data-help` on desktop icons carries a detail string | Recognition, progressive disclosure | **Show `data-help` in the status line when a target is focused** (D-pad or pointer) on every window, including the new ones: the explanation appears in context | Every `data-nav` target in new windows has `data-help` |
| One highlighted element: the XP default button | Von Restorff | Keep **one** accent per view; the **LIVE** badge on the Funcaster Live icon (a small red dot with the word) appears only when a market or a challenge is open, and is off at all other times, so it stays distinctive | At most one pulsing element per view; reduced-motion shows a static badge |

## 5. The window inventory: one Funcaster Live hub instead of four new icons

[05](05-ui-integration.md) adds a Chain window, a Leaderboard window; [11](11-prediction-market-ui.md) adds a Predictions window; [12](12-reality-and-ledger.md) adds a Ledger window. Four more top-level windows would push the shell past Hick and Miller (eleven tool windows already exist). **They become tabs of one window.** The shell grows by **one** window and **one** icon.

```text
+------------------- Funcaster Live ----------------------------------------+
| [Live]  [Boards]  [Crew]  [Shelf]  [Proof]                  PLAY MONEY |
|------------------------------------------------------------------------|
| +- Playing now ---------------------------------------------------+    |
| |  Golf - asha vs ravi       closes in 0:42 (ring)   [Predict]    |    |
| +-----------------------------------------------------------------+    |
| +- Next up -------------------------------------------------------+    |
| |  Kart Rush - 4 seats       backed 56% / 44%        [Predict]    |    |
| |  Table Tennis - ...                                [Predict]    |    |
| |                                               See all (3) >     |    |
| +-----------------------------------------------------------------+    |
| +- Open challenges -----------------------------------------------+    |
| |  Ravi challenges anyone to Golf, 0.25 play     8 min  [Take it] |    |
| +-----------------------------------------------------------------+    |
|  status line: "Predictions need only your phone. Scan the QR."         |
+------------------------------------------------------------------------+
```

| Tab (serial position: the most used first, the evidence last) | Contains | Replaces |
| --- | --- | --- |
| **Live** | Playing now, Next up (market rows), Open challenges (F-K1) | The Predictions window ([11](11-prediction-market-ui.md)), the Challenge Board |
| **Boards** | Leaderboard by game with a selector, **Today at this booth / all venues / global**, the Cup and Seasons, **Your row pinned last** | The Leaderboard window ([05](05-ui-integration.md) 3.7), Seasons |
| **Crew** | Players and follows, **Agents** (online dots), **Name Gallery** (party, seat, champion, legend) | New (F-E2, F-E6, F-K3) |
| **Shelf** | Creator games, with the Keep-alive count | New (F-K4) |
| **Proof** | **The Chain window content** (party, host, pot, receipts, health), the **Ledger**, Swarm and Arkiv references, the explorer links, "verify" buttons | The Chain window ([05](05-ui-integration.md) 3.1), the Ledger window ([12](12-reality-and-ledger.md)) |

Rules: five tabs (Miller, Hick); at most **three** group boxes per tab and **five rows** per group with "See all" (Miller, progressive disclosure); each row has **one** primary button (Hick, Fitts); a tab with no content shows an empty state with the mascot (not a hidden tab, so the structure is stable and learnable); technical words appear **only in Proof**. The tray lamp ([05](05-ui-integration.md) 3.1) opens Proof; the Start menu and the desktop icon open Live. The window is a singleton that coexists with Players and Invite. All tabs are `data-nav-group`s so the D-pad moves within a tab and the shoulder (minus, plus) buttons switch tabs.

Windows that **stay** as they are: My Games, Players, Invite, Playlists, Records, Settings, Help, Diagnostics, Recycle Bin, Game Properties, Shut Down. Records gains the "Chain history" section only if it is not already in Proof.

### 5.1 Review fixes ([22](22-integration-review.md))

1. **The TV cannot place a bet or a challenge.** The TV is driven by a phone pointer and a D-pad, and a stake needs the player's session key, which lives on the **phone**. Every `[Predict]`, `[Take it]`, `[Challenge]` and `[Cheer the table]` button on the TV hub is therefore an **"open on your phone" action**: it highlights the phone's Predictions or Live screen (a push over the socket) and shows "Continue on your phone" with the amount and the side already chosen if the pointer phone is the bettor. The slip, the confirmation and the balance live on the phone only (consistent with [11](11-prediction-market-ui.md)). The TV shows the pool, the sides, and who is in.
2. **"Invisible when off" versus "stable tabs".** The rule of [05](05-ui-integration.md) is that with `PARTNERS=off` **nothing web3 is visible**. The hub window and its icon do not exist then (no Funcaster Live icon, no Start entry). When **any** partner is on (`mock` or `on`), the hub exists with **all five tabs always present**; a tab whose lane is off shows an empty state that says what it is and why it is empty (for example, "Boards: results appear here when games are published"), never a missing tab. This keeps both rules and makes the structure learnable.
3. **The word "chance" is wrong.** The numbers on a pool are **the share of the money on each side**, not the probability of an outcome (a pari-mutuel pool has no probability). The labels are **Backed 56% / 44%** and **Pays about 1.7×** ("about" because the price moves until the pool locks), with the lock time next to them; [11](11-prediction-market-ui.md)'s wording and any "odds" string follow this.
4. **Name Gallery without ENS jargon.** The Gallery of [20](20-feature-expansion.md) F-E2 calls its kinds **Seat, Party, Handle, Champion, Legend, Agent, Game**; the words *registry*, *resolver*, *subname* and *soulbound* appear only in Proof. The player-facing noun is always **name** for the handle and **table name** for the party.
5. **Cross-venue honesty.** The Shelf, the boards and the challenge offers come from Arkiv (so other consoles see them); a challenge taken from **another venue** is a "remote screen" match and is labelled so on both sides before the offer is accepted.

## 6. Joining and the phone

The first twenty seconds, step by step, with the law that justifies each choice.

| Step | Design | Law | Budget |
| --- | --- | --- | --- |
| Scan | The QR is on the Welcome window, the Invite window and the kiosk attract screen, with the **party name in words** underneath | Recognition, Jakob (Jackbox pattern) | 3 s |
| Page opens | A single card: nickname (**prefilled from last time**), one huge **Tap to start**; no tour, no wizard; nothing else visible | Occam, Tesler, Hick (one action) | Interactive within 1.5 s on 4G (section 9) |
| Typing | The nickname field accepts anything: emoji, accents, spaces, long; a **live preview** shows exactly what the TV will show ("You will appear as ◆ asha") | Postel (accept liberal, show strict), recognition | Preview updates under 100 ms |
| Join by name or code | One field accepts a room code, a party name (with or without `.play.<parent>.eth`), a pasted link or the stable booth name; case, spaces, hyphens and look-alike characters (O and 0, I and 1) are normalised; a "**Your last party**" chip offers rejoin | Postel, recognition | One tap to rejoin |
| Tap to start | The single tap asks for motion and fullscreen as the platform requires; the key is made silently | Tesler | 1 s plus the permission |
| In the party | A "2 of 4 phones in" ring with Chonk's collar tags lighting, then the remote | Goal-gradient, aesthetic | Within 1 s of joining |

The remote itself ([build 06](../../build/06-phone-remote-and-pointer.md)) does not change; the web3 features add **no remote buttons** (Occam, Jakob). The Home menu gains **My Funcaster**, **Predict** and **Challenge** items in that order (serial position: the action first, the account last). The reconnect state ("Reconnecting… you are still in the party") is a banner, not a dialog (Doherty, feedback).

## 7. Game Properties, the start gate and the results (peak-end)

### 7.1 Game Properties and stakes

The tabs stay. The **Stakes row** keeps the owner's rule (always visible, disabled with a plain reason: recognition, progressive disclosure). Inside the Stakes dialog: three amount chips (**Off**, **0.50**, **1.00**; **2.00** is behind "More"), one payout default ("Winner takes all"), and a collapsed **Advanced** (payout rule, cuts, private replay). **Hick:** at most four visible choices; **Tesler:** the default needs no change for most parties; **Common region:** the chips and their explanation sit in one group box with the PLAY MONEY ribbon.

### 7.2 The start gate

While the start gate waits (funding), the status line shows **one** reason with a progress ring (goal-gradient: "2 of 3 in"), the Start button is disabled with that reason as its tooltip, and **Play without stakes** is a visible secondary action, never hidden.

### 7.3 Results: design the peak and the end

Today the Results window shows the winner, the rankings, standings, a verification line, a countdown and **four** buttons (Again, Change options, Desktop, Save). **Changes:**

| Today | New | Law |
| --- | --- | --- |
| Everything appears at once | **A short reveal** (about 2.5 s): the winner row slides in with the Chonk cheer sound and the winner's seat colour, then the other rows; the buttons are enabled at the end of the reveal but **Skip** (any button press) jumps to the end. Never longer than 2.5 s | Peak-end, aesthetic |
| A verification sentence | A **provenance badge** (Replay checked) plus, one by one as they complete, **status chips** for Pot, Receipt, Saved (Arkiv), Card (Swarm): Saving… to Saved ✓ | Feedback loops, similarity |
| Four equal-weight buttons | **Three**: **Again** (default, primary), **Change options**, **Desktop**; **Save** moves into a "More" disclosure with *Save recap card*, *Save data*, *Open receipt* | Hick, Occam, visual hierarchy, Fitts |
| A countdown "returns in N" | Keep; add the existing hold behaviour message in plain words, and a progress ring | Goal-gradient, feedback |
| Nothing after | A **closing card** (the recap) slides in with "Shareable" and the verification tick printed on it; the **Share** action uses the phone's OS share sheet (the phone shows the same card) | Peak-end, jakob |

```text
+------------------------- Results -----------------------------+
|  asha wins Golf!                                  Replay checked|
|  1  asha   3 strokes        +0.95 play                        |
|  2  ravi   5 strokes         0.00                             |
|  ---------------------------------------------------------   |
|  Pot [Saved v]  Receipt [Saving...]  Hall [Saved v]  Card [..] |
|                                    (Details v)                |
|  Back to desktop in 28 s (ring)                               |
|         [  Again  ]   [ Change options ]   [ Desktop ]        |
+---------------------------------------------------------------+
```

**Bad endings are endings too.** A void, a refund or a contested match shows a calm card, the mascot asleep and one line: **"Refunded in full. Nothing was lost."** with the receipt one disclosure down. This is the **end** of the experience a failure leaves behind, and it is designed on purpose.

### 7.4 The ending of a session

The **Shut Down** window (440 by 330) is the last thing a booth player sees. Add a **Tonight** summary: matches played, wins, a new badge, the Cup standing and one line of what is next ("The Chai Cup ends Friday"). This is the **end** in the peak-end rule and the Cup's reminder (the one place a "come back" message is honest and useful).

## 8. The prediction market and progress (goal-gradient with limits)

The market is built to be fast ([20](20-feature-expansion.md) section 7). The slip on the phone:

```text
+--------------------------------+
| Golf - asha vs ravi   PLAY MONEY|
| closes in 0:42   (ring)         |
|--------------------------------|
|  [ asha  56% | pays 1.8x ]  <-- default: the pool leader or last pick
|  [ ravi  44% | pays 2.2x ]      |
|--------------------------------|
|  0.10   [0.25]   0.50   more    |   <-- 3 chips + More, last stake preselected
|                                |
| [      Predict 0.25 on asha    ]|   <-- 56 px, full width, thumb zone
|  Paid automatically when two checks agree
+--------------------------------+
```

Why it works: **Hick** (two sides, three chips, one button), **Fitts** (the CTA at the bottom, 56 px), **Recognition** (the last amount and the favourite are already chosen), **Jakob** (the "backed" and "pays about" wording, in plain words and honest about what the number is (the share of the pool on each side, not a forecast)), **Feedback** (the slip turns into "You're in: 0.25 on asha", then **Locked**, then **Paid +0.40** or **Not this time**, then **Next match 0:42**), **Peak-end** (the result is the peak; the next match is the end, and a void is "Refunded in full").

**Goal-gradient, and what we will not do.** Progress cues are used where they help **play and onboarding**: join ring, funding ring, market-close ring, **Games tried: 4 of 13** (derived from `score` rows, no extra entity; it nudges people to try the other twelve games), Cup progress ("120 points from the top ten"), badge progress ("2 of 3 wins to Hat-trick"). They are **not** used on stakes: no prediction streaks, no "double or nothing", no loss-chasing prompts, no countdown pressure beyond the market's real closing time ([11](11-prediction-market-ui.md) rules 1 to 15 stand). A progress cue that would raise stakes is rejected in review.

## 9. Speed and feedback: the Doherty budget

**The rule:** the system responds within **400 ms** or shows that it is working; every tap is acknowledged within **100 ms**; nothing is a bare spinner.

| Situation | Budget | Mechanism |
| --- | --- | --- |
| Tap on the phone | Visual press state at most 100 ms; haptic where available | Local state first; the network later (optimistic UI) |
| Predict, Cheer, Challenge, Take it | The slip changes to "Placed" within 100 ms; the chip shows **Saving…** then **Saved ✓** (target under 3 s on Arc; the player is never asked to wait) | Optimistic with idempotency keys; a failure rolls back with the error pattern in section 3 |
| TV window open | Frame within 150 ms; content within 400 ms | Prefetch each window's module on idle and on focus (`manifest.js` imports on open today); skeleton rows in XP style (a marquee progress bar and grey rows) |
| Boards and the Hall | **First paint from cache** within 200 ms, then revalidate; show "updated 12 s ago" | stale-while-revalidate with the walked pages cached (VK-08); poll at 3 s if the socket is down |
| Page load on the phone | Interactive within 1.5 s on 4G; the Arkiv and signer bundles load **lazily**, after Tap to start | Code splitting (VK-12 measures it) |
| Chain operation longer than 400 ms | A labelled chip with elapsed seconds after 2 s ("Still saving, play continues") | Never disables a control that worked without it ([05](05-ui-integration.md) rule 7) |
| Offline or a provider down | One banner, one plain sentence, one action | Section 3 error pattern; the Ledger says **Saved locally** |

**Feedback loops, every one closed.** The four-state chip is the single vocabulary; the TV and the phone show the **same** state at the same time (the phone is not allowed to say "Paid" before the TV can); each background event also raises a **balloon** (at most three queued, suspended in play); the pot, the market and the challenge each emit one sound and, when a match is not running, one mascot reaction. Every **loop is closed by a visible end state**: nothing stays "Saving…" for more than 30 seconds; after that the chip becomes **Saved locally** or **Needs attention** with one action.

## 10. Acceptance: numbers, tests and the review checklist

| Criterion | Target | How it is tested |
| --- | --- | --- |
| Time to first play (stranger, no coaching) | median at most 20 s, worst of five at most 35 s | VX-07, stopwatch, five people |
| Time to first prediction | median at most 40 s; second prediction at most 8 s | VX-07 |
| Taps for a repeat prediction | 2 | Playwright flow |
| Tap acknowledgement | at most 100 ms (95th percentile) | `performance.mark("ui:tap")` and `("ui:ack")` in the phone and TV pages, asserted in Playwright with 4x CPU slowdown |
| Silent wait | none over 400 ms without a labelled state | trace check script |
| TV target size | at least 64 px at 1080p, at least 8 px apart | `scripts/ui-audit.cjs` walks `[data-nav]` bounding boxes in each window and fails the build |
| Phone target size | at least 48 px, CTA at least 56 px | same script at 390 by 844 |
| Choices per view (Hick) | at most 5 primary choices per group; at most 8 actions per window | the audit counts `data-nav` per `data-nav-group` and per window |
| Chunks (Miller) | at most 5 rows per group before "See all"; at most 5 tabs; at most 9 Start menu items | the audit and unit tests |
| Text size | body at least 20 px, secondary at least 16 px at 1080p | the audit reads computed styles |
| Contrast | existing `tests/os/contrast.test.mjs` plus the new surfaces; Luna, Classic and Taxi skins | unit test |
| One accent per view | at most one animated element per view | the audit counts animations; reduced-motion disables them |
| Jargon on the player path | zero occurrences of gas, wallet, chain, transaction, ENS, USDC, hash outside **Proof** and explorer links | a string scanner over `strings.js` and phone strings |
| Provenance honesty | no label stronger than its evidence | the reality gate (`web3:reality`) |

**The one-page review checklist** (copied into every UI pull request): for each new or changed window or phone page, answer yes or no to: aesthetic (looks like the OS)? disclosure (details one step away)? recognition (nothing to remember)? one accent? ends designed? progress visible (where about play)? important first and last? complexity absorbed? input liberal and output strict? anything removable? five or fewer primary choices? targets big and near the edge? familiar patterns? chunked? fast and acknowledged? related things close? same things alike? regions drawn? one clear primary action? every action answered? A "no" needs a written reason.

## 11. Tasks (in order; each is small and testable)

| ID | Task | Files | Depends on |
| --- | --- | --- | --- |
| **UX1** | The kit: `web3.css`, spacing tokens, status chip, name pill, money, group box, empty and error states, `ui/kit.js` | `public/os/web3.css`, `public/os/ui/kit.js`, `strings.js` | none |
| **UX2** | The audit script and the performance marks (the tests in section 10) before any new window | `scripts/ui-audit.cjs`, `tests/os/*` | UX1 |
| **UX3** | Magnetic pointer and the padded hit areas | `core/pointer.js` consumers in the shell (`shell/*`), `os.css` | UX2 |
| **UX4** | Welcome window with QR and room name; Start menu "Most played"; `data-help` in the status line | `windows/welcome.js`, `shell/startmenu.js`, `status` | UX1 |
| **UX5** | Results: reveal, three buttons plus More, status chips, closing card | `windows/results.js`, `result-data.js` (add the receipt fields to the `signature` array) | UX1, web3 receipts |
| **UX6** | Shut Down "Tonight" summary | `windows/shutdown.js` | UX5 |
| **UX7** | The Funcaster Live hub (Live, Boards, Crew, Shelf, Proof) | `windows/chonks-live.js`, `manifest.js` (one tuple), `icon-grid.js` (one system icon), `startmenu.js` | UX1 to UX3, web3 state |
| **UX8** | Phone: join card (prefill, preview, liberal join, rejoin chip), Home menu items | `public/controller.html`, `public/party/phone.js`, `phone.css` | UX1 |
| **UX9** | Phone: prediction slip (quick predict), challenge sheet, cheer, My Funcaster passport | `public/party/phone-predict.js`, `public/me/` | UX8, [20](20-feature-expansion.md) FX7, FX12 |
| **UX10** | Sound, haptics, mascot hooks, balloons | `shell/*`, `public/os/sounds` through `sounds.json` | UX5 |
| **UX11** | Strings: all copy for all of the above; jargon scanner | `public/os/strings.js` | all |
| **UX12** | Stranger tests, fixes, and a re-run of the acceptance table | none | all |

**Do not touch** `core/**` for game logic (only the shell pointer helpers named above), `games/**`, `sdk/**`; never change the literal `"Ready to play"`; every change keeps `PARTNERS=off` rendering **byte-identical** to `main` except where a task above is a general UX improvement (UX3, UX4, UX5's three-button footer, UX6): those are **not** web3 features and **may be done on `main`** with the owner's say, which is why they are tagged separately in [06](06-tasks-and-codex-prompts.md) when scheduled.

## 12. Improvements that do not depend on web3 (candidates for `main`)

The code read shows these are worth doing even if no partner feature ships; each is small and follows the working agreement (commit to `main` only when asked).

1. **Welcome window shows the join QR and room name** (UX4): the single largest effect on Goal 1.
2. **Start menu "Most played"** instead of a fixed four (UX4).
3. **Results: three buttons plus a "More" disclosure and a short reveal** (UX5): reduces choice and gives the win a moment.
4. **`data-help` in the status line on focus for every control** (UX4): recognition without a manual.
5. **Target audit and padded hit areas for the TV pointer** (UX2, UX3): Fitts on the least precise input device we have.
6. **"Restart" wording check** in the Start menu (UX4).
