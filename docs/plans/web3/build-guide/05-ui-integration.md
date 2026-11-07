# Build guide 05: adapting the Funcaster UI and the phone to show the web3 layer

Part of the [build guide](00-README.md). Status: plan, 6 November 2026. **No code is written.** This is the complete UI specification: every surface that changes, where in the real code it changes (from a code read of `main` at `4a182fe`), what state feeds it, what copy it shows, and the rules that keep it reachable from the phone and safe. The data it shows is defined in [01](01-architecture.md) section 7 (`view().web3`), the ENS content in [02](02-ens-guide.md), the Arc content in [03](03-arc-guide.md) and the Arkiv content in [04](04-arkiv-guide.md).

> **Amendment, 6 November 2026: the window inventory changes.** The separate **Chain**, **Leaderboard**, **Predictions** and **Ledger** windows and their Start-menu and desktop entries (surface rows 2, 9 and 11 below, [11](11-prediction-market-ui.md), [12](12-reality-and-ledger.md)) are replaced by **one `Funcaster Live` window with five tabs** (Live, Boards, Crew, Shelf, Proof) and **one** new desktop icon, as specified in [21](21-ux-laws-and-os-ux.md) section 5. The **content** of each window in this document is unchanged and moves into its tab (Chain and Ledger into **Proof**, Leaderboard into **Boards**, Predictions into **Live**). The twenty UX laws, the target sizes, the Doherty budget and the acceptance tests in [21](21-ux-laws-and-os-ux.md) apply to every surface below.

## 1. Rules for every UI change

1. **Invisible when off.** With `PARTNERS=off` nothing new renders and no DOM node is added, except the standing exception: the Stakes row in Game Properties **always appears, disabled, with a plain reason** (the owner's standing rule for Ranked, Dare and Stakes).
2. **Plain words.** No "gas", "wallet", "chain", "transaction", "ENS" or "USDC" on a phone in the normal flow. Use *name*, *party name*, *play money*, *stake*, *pot*, *receipt*. Technical words live in the **Chain window** (for judges and the curious) and in explorer links. Every staked surface carries the label **PLAY MONEY** while the build is testnet.
3. **Reachable from the phone.** Every interactive control in the shell is a real `<button>` or `<input>` with **`data-nav`** and a unique **`data-id`** (the `button()` helper in `public/os/windows/utility.js` does this); it must be visible, enabled and not inside a clipped panel; groups use `data-nav-group` and `data-nav-axis`; a popover uses `data-nav-scope="active"`; back is the `os:back` event. **Nothing that a player must press from the phone may live outside the lobby or results phases** (the shell pointer and `shell-button` relays work only there). **Typed input is impossible with the pointer** (no keyboard): typing (a nickname, a party name) happens on the phone only.
4. **Never `innerHTML`** player text; use the `h()` builder (`textContent`). Names come sanitised from the server and are still treated as untrusted.
5. **Scaling units.** Sizes are `calc(N * var(--px))` so TV scaling works; colours come from the `--lu-*` and `--seat-*` tokens; new CSS goes in **one new stylesheet `public/os/web3.css`** with a `<link>` added to `public/os/index.html`; contrast is unit-tested (`tests/os/contrast.test.mjs`); skins `classic` and `taxi` must not break (test with `?skin=`).
6. **All copy in `public/os/strings.js`** (frozen objects), new keys listed in section 8; existing tests assert on some strings.
7. **Never block play.** A pending or failed chain operation changes a label; it never disables a control that worked without it (the one exception is the **start gate**, only for a staked match and only until the pot locks, with its reason shown).
8. **Do not change** `core/**`, `games/**`, `sdk/**` (inside `bundleHash`), and **never change the literal `"Ready to play"`** (six places compare it). The stakes gate adds a *different* reason string through `startReason`.
9. **Every new state field has a demo fixture.** `?demo=1&state=<scenario>` must be able to show every state below (section 9); `public/os/demo.test.mjs` asserts them.

## 2. Surface inventory

| # | Surface | File(s) to change or add | Fed by | New `data-id`s | Phase |
| --- | --- | --- | --- | --- | --- |
| 1 | Tray lamp | `public/os/shell/tray.js` | `web3.health`, `web3.party.status` | `tray-web3` | always |
| 2 | **Chain window** (new) | `public/os/windows/manifest.js` tuple `["chain", "Chain", iconRole, w, h]` plus `windows/chain.js` | all of `web3` | `chain-*` | any |
| 3 | Invite window | `public/os/windows/invite.js` | `web3.party` | `invite-party-name`, `invite-copy-name` | lobby |
| 4 | Players window | `public/os/windows/players.js`, `window-data.js` | `web3.seats`, `web3.host`, `stakes.funded` | `players-host-revoke`, `players-seat-<n>-name` | lobby |
| 5 | Game Properties: Stakes row | `public/os/option-ui.js` (non-schema field), `windows/game-properties.js` `fieldControl`, `strings.js` | `web3.stakes`, `startReason` | `gp-stakes`, `gp-stakes-amount`, `gp-stakes-rule`, `gp-stakes-cancel` | lobby |
| 6 | Start gate | `option-ui.js` `startStatus`, server `arcade.startReason` | `stakes.status` | (existing start button) | lobby |
| 7 | Results receipt | `windows/results.js` (**add receipt fields to the `signature` array**), `result-data.js` | `web3.receipts[matchId]`, `web3.stakes` | `results-receipt-pot`, `results-receipt-ens`, `results-receipt-arkiv`, `results-open-pot` | results |
| 8 | Records window | `windows/records.js`, `game-host.js rememberResult` | `web3.receipts`, ENS history | `records-chain-history` | lobby |
| 9 | **Leaderboard window** (new) | manifest tuple `["leaderboard", ...]`, `windows/leaderboard.js` | Arkiv live feed, `room.leaderboard` fallback | `lb-*` | lobby |
| 10 | Attract / Kiosk | `shell/boot.js` attract window | `web3.party.name`, Arkiv board | `attract-join-name` | kiosk |
| 11 | Start menu | `shell/startmenu.js` (system-button array), `DESKTOP_STRINGS` | none | `start-chain`, `start-leaderboard` | any |
| 12 | Balloons | `main.js` `reflect()` | state transitions | (balloon keys) | any |
| 13 | Session and demo | `public/os/session.js` (new request `stakes`; new signals), `demo-session.js`, `demo-state.js` | | | |
| 14 | Phone: name claim | `public/controller.html` `#join-view`, `public/party/phone.js` `acceptIdentity`, `phone.css` | `web3.seats` | `name-claim`, `name-claim-input`, `name-claim-save` | join |
| 15 | Phone: terms and funding card | new `public/party/phone-stakes.js` imported from `phone.js`; `<dialog id="terms">` in `controller.html` | `web3.request` | `terms-card`, `terms-accept`, `terms-decline` | lobby |
| 16 | Phone: settle card and status | same module | `web3.request kind=settle`, `web3.stakes` | `settle-card`, `settle-agree` | results |
| 17 | Phone: join by name | `#code-form` in `controller.html`, `phone.js` | `party.join` | `join-by-name` | before join |
| 18 | Phone: host sheet chip | `public/party/phone-admin.js` | `web3.host` | `admin-onchain-chip` | lobby |
| 19 | Phone: settings (key notice, reset) | `controller.html` settings dialog | | `reset-key` | any |

## 3. The shell, surface by surface

### 3.1 Tray lamp and the Chain window

The tray gets one more button (after the connection button): a small lamp that is **hidden when `mode` is `off`**; green when `party.status` is `ready` and all health is `ok`; amber when pending or degraded; red when down; tooltip "Party name: kart-otter-7k.play.funcaster.eth" or "Naming is catching up". Click opens the **Chain window**.

```text
+------------------------- Chain ------------------------------+
| PARTY                                                        |
|  kart-otter-7k.play.funcaster.eth       [Copy]  [Open in ENS]   |
|  Valid until 18:42 (3 h 12 m left)    status: ready          |
| HOST                                                         |
|  Host: asha  (on-chain: control, kick)      [Revoke host]    |
| POT          PLAY MONEY                                      |
|  Golf  - 1.00 USDC each - winner takes all   Locked          |
|  [Open pot console]   create 0xab12..  lock 0xcd34..         |
| RECEIPTS                                                     |
|  Round 3 Golf   Arc 0xef56..  Arkiv a1b2..  ENS kart-otter.. |
| HEALTH                    ENS ok   Arc ok   Arkiv degraded   |
| (host only) worker ok - outbox 0 - relayer balance 14.20     |
|                                            [Close]           |
+--------------------------------------------------------------+
```

Behaviour: read-only except **Revoke host** (TV host only, confirm with `wm.modal`) and the copy and open buttons (open links in a new tab; on a TV these may be no-ops, so each link also shows its text). Sections that have no data are hidden. The window must open next to Players and Invite without closing them: **add `chain` to the `coexists` set or open with `{keep: true}`**. Singleton: yes. It is the judges' window: link the **ENS explorer** (`sepolia.explorer.ens.domains`), the **Arc explorer** (`explorer.testnet.arc.io`) and the **Arkiv explorer** entity pages, using URLs from configuration.

### 3.2 Invite window

Beside the existing room code add, when `web3.party.name` exists, a second line with the party name, a **Copy** button, and the hint "or type this name on your phone". When `party.status` is `pending` show "Getting a party name…" (no spinner needed beyond text); `failed` shows nothing (the code works). The QR and URL are unchanged; the controller URL may also carry `?party=<name>` as a convenience, with the code as the fallback.

### 3.3 Players window

Each seat row keeps shape, colour and nickname and gains: a small **"on ENS"** check when `seats[slot].named`, the **valid-until** time as a tooltip, and, during staking, a **funded** badge (Accepted, Funded, Waiting). The host row shows a chip **"host (on-chain)"** with a **Revoke** button (TV host only). Rows for guest seats show nothing extra. A line under the list shows "Host power is checked on the chain" or, when degraded, "Host power is server-checked right now".

### 3.4 Game Properties: the Stakes row

Add `stakes` to `OPTION_UI` as a **non-schema field** following the `pair` and `customWords` injection pattern in `optionFields` (it is **not** added to `core/catalog.js`, which would change `bundleHash` and `scoreboardKey`). It renders on the **Rules** tab as a `select` with the choices *Off*, *0.50*, *1.00*, *2.00 play-USDC*, and, when not Off, two further fields: **Payout** (Winner takes all, Top two 70/30, Split among the best) and a **Cancel stakes** button. It is **disabled with a reason** when: partners are off ("Stakes need the chain services, which are off in this build"), the mode is not multiplayer with at least two **verified** humans (the humans-only rule), a staked match is already running, or the Arc service is down. **The setting does not go through `session.setup`** (the server whitelist would silently drop the key and it must not enter `room.setup`, `scoreboardKey` or the hashed `result.setup`): it uses a **new admin handler `onAdmin("stakes")`** writing `room.stakes`, called through a new `session.stakes(...)` request (add it to the `api` object in `session.js` and a stub in `demo-session.js`). The existing 150 ms debounce draft model does not apply; stakes changes are explicit and confirm with a message box when they reset funded seats.

### 3.5 The start gate and the status line

While `stakes.status` is `terms`, `funding` or `locking`, the Start button is disabled and the status line (`gp-status`) shows the reason, for example "Waiting for 2 of 3 players to put in their stake". The server enforces it: add a `stakesReason(room)` returning a **new string** (never `"Ready to play"`) injected into `arcade.startReason`, **and** a guard at the top of `party.start()` (beside the existing `remote.reason(room)` guard) so the delegated-host `start` and the kiosk auto-start cannot bypass it. `option-ui.startStatus` already displays any non-"Ready to play" reason; extend it for the funding count. A stalled funding offers **Cancel stakes** and **Play without stakes**.

### 3.6 Results window

Under the existing verification line add, only for matches with receipts or a pot:

```text
  Golf - round 3                 Replay checked
  1 asha   3 strokes     +2.00   (pot: asha takes 2.00 play-USDC)
  2 ravi   5 strokes     0.00
  ---------------------------------------------
  Pot settled in 0.9 s   [Receipt]   (play money)
  Saved to the chain: Arc 0xef56..   Arkiv a1b2..
  Trophy owned by asha.kart-otter-7k.play.funcaster.eth
```

States per line: **Saving…** (receipt pending), **Saved** (link), **Saved locally** (the outbox is waiting; this string does not exist in the code today and is new), **Refunded** (abandoned or contested pot), **Contested**. **The window re-renders only when its `signature` array changes (`results.js` ~lines 104 to 111): add the receipt fields and the stakes status to that array**, otherwise nothing updates. `result-data.resultPresentation(room)` builds the text; extend it, with new `GAME_STRINGS` entries. Buttons: *Receipt* opens the pot console in the browser (also shown as text), *Save* unchanged.

### 3.7 Records window and the Leaderboard window

**Records** keeps its local list and gains a **Chain history** section: the party's `chonks.receipt` history read from the ENS registry's `TextUpdated` logs, one row per match (time, game, result hash, place), each with a **verify** button that fetches `/api/web3/result/<hash>` and shows "hash matches" (a visible demonstration that the receipt can be re-checked by anyone). **Leaderboard** is a **new tool window** (there is none today; the attract window reads `room.leaderboard`): per-game board from Arkiv (nickname or ENS name, score, verified mark), a **live** dot while events arrive, a game selector (`choiceList`), and a fallback to `room.leaderboard` with the note "Local board" when Arkiv is down. Add Start menu entries for both ([3.9](#39-start-menu-balloons-attract-mascot)).

### 3.8 Session, store and demo plumbing

`session.js`: new request `stakes(payload)` (5 s timeout like the others) and **new signals** added to the event list near line 190 (`web3.state` is carried inside the existing `state`; no new signal is needed unless a one-shot event is wanted, for example `web3.revoked`). `store` state gains nothing new (everything is inside `state.room.web3`). `demo-state.js` and `demo-session.js` get every scenario in section 9; `demo.test.mjs` asserts them.

### 3.9 Start menu, balloons, attract, mascot

- **Start menu:** add `["chain", S.chain, "<icon role>"]` and `["leaderboard", S.leaderboard, "leaderboard"]` to the system-button array (`startmenu.js` ~lines 49 to 57), hidden when partners are off.
- **Balloons** (`context.balloons.show`, deduped by key, suspended during a running game, max 3 queued): "Party name ready: kart-otter-7k" (key `party-ready`), "Stakes locked: 3 of 3 in" (`stakes-locked`), "Pot settled: asha takes 2.00 play-USDC" (`stakes-settled`), "Pot refunded" (`stakes-refunded`), "Host power was revoked" (`host-revoked`), and a degraded notice "Chain services are slow: play continues" (`web3-degraded`, once per outage).
- **Attract / Kiosk** (`shell/boot.js`): show the party name and "Type this name on your phone" beside the QR; feed the board from Arkiv with the live dot.
- **Mascot:** optional `mascot.event("pot-locked" | "pot-settled" | "refund")` reactions (Chonk's four collar tags light as seats fund: tie to `stakes.funded`); skip if the mascot lane is busy.

## 4. The phone surfaces

The phone page loads `controller.html` with sections `#code-form`, `#waiting-view`, `#join-view`, `#play-view` and a settings `<dialog>`. All new phone UI is a **card or dialog layered over the existing flow**, never a replacement.

### 4.1 Name claim (in `#join-view`, before the "Tap to start" button)

A single line: the existing nickname (from `chonks.nickname`, `maxlength=20`) shown as "Your name in this party: **asha**" with an edit link; Save emits `name {nick}`. It does **not** replace or delay `#enable`. **Critical iOS rule:** `requestMotionPermissions` is called **synchronously inside the user's tap on `#enable`**; no `await` may precede it. The name claim and the key bind happen **before** the user taps (on `acceptIdentity`) and **never** inside that tap handler. When the seat gets its ENS name, the chip shows "asha - on ENS".

### 4.2 The terms and funding card (`<dialog id="terms">`)

Opened by `web3.request kind=terms`:

```text
+--------- Put in your stake ----------+   PLAY MONEY
|  Golf - 3 players                    |
|  Each puts in      1.00              |
|  Winner takes all (2 of 3 get back   |
|  nothing; one wins 3.00)             |
|  Settles when all of you agree.      |
|  A referee can step in if needed.    |
|  You can always get your stake back  |
|  if the match is not finished.       |
|                                      |
|  [ Put in my stake ]   [ Not now ]   |
+--------------------------------------+
```

**Put in my stake** signs the typed `Accept` and the funding authorization in **one tap** (no wallet screen), shows "Waiting for the others (2 of 3 in)" and then "You are in". **Not now** sends `declined`; the seat is removed from the pot attempt and the host sees why. A stakes request expires with `expiresAt`. The card never mentions chains, wallets or gas. A small "PLAY MONEY - no cash value" ribbon is permanent.

### 4.3 Settle and status

At results with a pot: a compact banner "Result: **1. asha, 2. ravi, 3. mo**. Agreeing in 5…" with a **Dispute** button (a **zero-tap** happy path: the phone checks the placing against the scores it shows and signs `Settle` silently when the countdown ends; **Dispute** signs a `Contest` only if the oracle path is running); then status toasts: "Paid out: you won 3.00 play-USDC", "Refunded: the match did not finish", "A referee is checking (2 min to object)". The banner needs no action; if not every seat has signed within 60 s the oracle path proposes ([03](03-arc-guide.md) section 7).

### 4.4 Join by name, host sheet, settings

- **Join by name:** the `#code-form` accepts either a 6-character code or a party name (anything containing a dot): the phone emits `party.join {name}`; the server resolves it and replies with the code, then the normal `join` runs. Errors: "We could not find that party".
- **Host sheet** (`phone-admin.js`): an **"on-chain"** chip beside the host controls with a tooltip "Your host power is recorded on the chain". If revoked, the sheet closes with "The host power was taken back".
- **Settings dialog:** a line "Your player key lives in this browser (play money only)" and a **Reset key** button (clears the web3 key; warns that unclaimed play money on it is lost).

## 5. What the server must send (so the UI is a pure function of state)

All fields in [01](01-architecture.md) section 7.1. Public fields only in `view()`; per-seat requests through targeted emits (the `admin.state` and `sketch-turn` precedents); host-only details in `view(room, true)`. **No tokens, keys or full addresses in `view()`** (short form `0x1234…abcd` only). `view()` is read synchronously from `room.web3`, updated by receipt handlers.

## 6. Accessibility and device rules

Text at least the existing UI sizes (the shell scales with `--px`); contrast per `tests/os/contrast.test.mjs`; every status has text, not colour alone; the tray lamp has a tooltip and an accessible name; focus order follows DOM order; the double focus ring (2 px white then 3 px black) applies to new buttons automatically through the shared styles; reduced-effects setting respected (no animation required for meaning); keep the initial shell budget (about 600 KB): **lazy-load** `chain.js`, `leaderboard.js` and the phone signer (`import()` inside the window's `open`, as the manifest does).

## 7. Files to add (summary)

`public/os/windows/chain.js`, `public/os/windows/leaderboard.js`, `public/os/web3.css`, `public/os/web3-data.js` (pure functions that turn `room.web3` into row models; **unit-tested without a DOM**, the pattern of `window-data.js`), `public/party/phone-stakes.js`, `public/party/phone-web3.js` (key, bind, name), `public/web3/phone-signer.js` (generated), plus tests ([07](07-tests-evidence-demo.md)).

## 8. New strings (in `strings.js`)

Group under a new frozen `WEB3_STRINGS`: window titles (Chain, Leaderboard); section headings; every state label (Pending, Ready, Failed, Saving, Saved, Saved locally, Refunded, Contested, Locked); the stakes copy; the card copy; the start-gate reasons ("Waiting for N of M players to put in their stake", "Stakes are off in this build"); the disabled reasons for the Stakes row; balloon titles and texts; error messages ("The chain says no: this phone's host power was revoked"); the PLAY MONEY ribbon text. No hard-coded strings in windows or the phone modules.

## 9. Demo scenarios required (`?demo=1&state=<name>`; each also unit-tested)

`naming` (party pending), `named` (party ready, seats named), `host-onchain` (host chip), `host-revoked`, `stakes-terms`, `stakes-funding` (2 of 3), `stakes-locked`, `stakes-playing`, `settling`, `settled` (receipts present), `refunded`, `contested`, `chain-down` (health down, degraded labels, host power server-checked), `leaderboard-live`, `leaderboard-local`. The existing scenarios (`empty`, `three`, `ready`, `playing`, `results`, `reconnecting`, `kiosk`) must be unchanged when partners are off.

## 10. UI tests (see [07](07-tests-evidence-demo.md))

Unit: `web3-data.js` row models for every scenario; strings present; the `signature` array change triggers a Results re-render; `startStatus` shows the stakes reason; `optionFields` includes the Stakes row disabled with a reason when off. Shell e2e (Playwright, manual run like `tests/os/shell.e2e.mjs`): open the Chain window with the D-pad and the pointer; the Stakes row; the start gate. Phone e2e with fake phones: name claim; terms card accept and decline; settle card; join by name; **the motion-permission call stays synchronous** (a regression test that the `#enable` handler awaits nothing before `requestMotionPermissions`).
