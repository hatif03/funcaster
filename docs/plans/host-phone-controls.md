# Host phone controls: how a phone runs the party

> **Note, 6 November 2026.** The TV screens in this plan (Kiosk attract screen, "next up", leaderboard, staff windows) are now designed as windows of the Windows-XP-style shell: see [xp-console-ui.md](xp-console-ui.md) sections 4.5 and 6. The delegation protocol and the Party and Kiosk rules here are unchanged.

Status: plan, 6 November 2026, **decision D-H1 approved the same day**. Nothing here is built. It is grounded in a read of `server/party.cjs`, `public/party/host.js`, `public/party/phone.js`, `docs/NETWORKING.md` and `docs/RELEASE.md` at commit 3607d9a.

## 1. The problem in one paragraph

Today the "host" is a **browser tab on the big screen**. It creates the room, holds a secret `hostToken` in its own `sessionStorage`, and is the only socket allowed to select a game, change setup, start, pause, go back to the lobby, or remove a player (`server/party.cjs:677-912`, every one of those handlers checks `membership.role === "host"`). Phones can only ready up, send input, press the one game action, guess in drawing, and leave. That is why a person on the sofa with a phone cannot start the next game, and why the setup form is a column of `<select>` dropdowns on the TV page that someone has to click with a mouse. The plan wanted a **host seat on a phone**; the build has a **host device**. This document designs the missing piece: a phone that runs the party.

## 2. The constraint that shapes the whole design

The previous developers recorded (`docs/RELEASE.md`, `docs/NETWORKING.md`, the status block in `plan.md`) that "designated-host phone administration" and "automatic game-host migration" are **not approved**: an automatic review rejected a broad rewrite of who has authority. Two things are being conflated and must be separated:

| | What it is | Moves with the host phone? |
| --- | --- | --- |
| **Simulation authority** | The browser tab that runs the game rules (Kart Rush `Race`, Golf `GolfRound`, and so on) and reports scores. Today it is the host tab's iframe | **No.** Stays on the screen. This design never changes it |
| **Room administration** | Who may pick the game, edit setup, start, pause, go to lobby, kick, lock | **Yes, by delegation.** This is all the host phone gets |

So the design is a **delegation of administrative commands**, not a change of authority. The host tab remains the room's owner and can always override or revoke. The server validates every delegated command exactly as it validates a host-tab command today. This is small, reviewable and reversible, which is what an approval review needs.

**Decision D-H1: APPROVED on 6 November 2026.** The owner delegated the choice ("do whatever is better for running this in the hackathon and make people come and play our game") and approved phone administration as a revocable delegation with the TV keeping full control. Because the best policy differs between a private group and a public booth, this design has **two operating modes** (section 4.1). The fallback in section 11 is kept only as a record of the alternative; it is no longer needed.

## 3. What the host phone can and cannot do

| Command | Host tab | Host phone (delegated) | Notes |
| --- | --- | --- | --- |
| Create the room, reclaim it, destroy it | yes | **never** | `hostToken` stays on the TV |
| Issue and revoke displays (`/screen` invites) | yes | no | Keeps the access boundary |
| Grant, revoke, transfer the host-phone role | yes | transfer only (to another seat, with TV consent rules below) | |
| Choose game (`select`) | yes | yes | Lobby or results phase only, as today |
| Edit setup (mode, CPU count, laps, holes, variant, drawing mode, rotation, pair pick, playlist) | yes | yes | Same whitelist as `setup` (`party.cjs:811-846`) |
| Start / Run it back | yes | yes | Server still enforces the start gate (`party.cjs:278`) |
| Pause / resume | yes | yes | Global pause today; see section 8 |
| Back to lobby / end match | yes | yes, **hold to confirm** | Ends the round for everyone |
| Kick a seat | yes | yes, **hold to confirm** | Not the host phone's own seat |
| Lock / unlock the room | yes | yes | New. Auto-lock when a match starts (section 7) |
| Volume, gentle effects | yes | yes | Room-wide, optional |
| Export a round record | yes | **no** (TV only) | Downloads belong to the screen |
| Approve a late joiner (if "ask to join" is on) | yes | yes | New |
| Rename the room, set an invite note | yes | optional | Later |

## 4. Who becomes the host phone

Options, with a recommendation.

| Option | How | Pros | Cons |
| --- | --- | --- | --- |
| A. First phone in is the VIP | The first seat to join is offered the role (the Jackbox pattern: the first person to connect is the VIP who starts the game, per Jackbox's own how-to) | No setup; people understand it | The first phone may be a kid or a troll |
| B. The TV picks | A "Make this phone the host" button next to each seat on the TV | Full control | Needs someone at the mouse |
| C. Hybrid (recommended) | The first phone is *offered* VIP; the TV shows a prompt "Priya's phone wants to run the party. Allow?" with **Allow / Not now**, and **auto-allows after 5 seconds** unless the TV declines. The TV can revoke or reassign at any time | Walk-up friendly, still gives the TV an override | A little UI on both sides |

**Rules.** At most one host phone at a time. If the host phone leaves or is kicked, the next seat in join order is offered the role by the same prompt. The TV always has override. Host powers never move to a seat that is not ready or not connected.

### 4.1 Two operating modes: Party and Kiosk

The right answer to "who runs the room" is different when five friends share a sofa and when strangers walk up to a screen at an event. So the room has an **operating mode**, set by the TV tab (default Party), and the same delegation machinery serves both.

| | **Party mode** (friends, a home, a class) | **Kiosk mode** (a booth or any public screen) |
| --- | --- | --- |
| Who runs it | The **VIP phone**: the first phone in is offered the role; the TV auto-allows after 5 s unless declined (option C above) | **Nobody on a phone.** The TV runs itself; **staff** hold an optional PIN-protected staff phone or press keys on the TV |
| Starting a game | The VIP picks and starts, or auto-start when everyone is ready | **Automatic:** an attract loop invites people to scan; when at least one phone is ready (solo games) or two (multiplayer), a 10-second countdown starts the next game from a **rotating playlist** |
| Why this choice | Walk-up friendly inside a group; someone always has the remote | At an event a stranger must never become the person who can end everyone's game or kick people; and nobody should have to ask "who is the host?" |
| Game choice | VIP chooses | A curated rotation of short games (60-90 s); the staff can pin a game |
| Between rounds | Results, then lobby | A 10-second results screen with the **leaderboard**, then the next round auto-starts; the next waiting phones are promoted into free seats |
| Kick, lock, end match | VIP (hold to confirm) | **Staff only** (PIN) |
| Waiting players | Spectator seats | A visible **"next up"** queue; promoted automatically |
| Idle | The room stays until the host tab closes | Attract mode returns after 60 s with no phones; state resets |
| Remote screens (`remoteScreens` setting) | `invite` by default: the host can invite a friend on another screen ([plan.md §5h.5](../../plan-history.md#5h5-pairing-how-a-remote-friend-joins)) | `off` by default (6 November). Staff can switch it on per room with the PIN; changing the default later is a one-line change. Switching it on for a public booth first needs H5a (rate limits, invite hygiene) |

**Why Kiosk matters for the hackathon.** The goal is to make people come and play. Every extra step ("who is the host?", "pick a game", "press start") loses a passer-by. In Kiosk mode a person scans, swings and is playing within about 20 seconds with no decision to make. The detailed event plan is [hackathon-floor-plan.md](hackathon-floor-plan.md).

**What Kiosk needs beyond Party mode:** a playlist manager and auto-start timer on the server (the playlist and auto-start machinery already exist in `party.cjs`: playlists at `:837-842`, auto-start at `:966-972`), a spectator and "next up" queue (X2 and X8 in [remaining-games.md](remaining-games.md)), a staff PIN and a staff phone profile (a restricted host sheet), an attract screen and a persistent leaderboard on the TV, and a reset-to-attract timer.

## 5. Protocol

New events on the `/party` namespace. All are acknowledged with a result and a reason string so the phone can show *why* something failed.

| Event | From | Purpose |
| --- | --- | --- |
| `host.offer` | server → phone | "You can run this party." Carries an `offerId` and a short expiry |
| `host.accept` / `host.decline` | phone → server | Seat answers the offer |
| `host.granted` | server → all | Broadcasts who the host phone is (the state view gains `hostSeat`) |
| `host.revoke` | host tab → server | Removes the role; the phone returns to normal |
| `host.transfer` | host phone → server | Propose a new host seat; applies per rules above |
| `host.cmd` | host phone → server | `{ cmd, args, seq }` where `cmd` is one of `select`, `setup`, `start`, `pause`, `lobby`, `remove`, `lock`, `next`, `allow-join`, `volume` |
| `host.result` | server → phone | `{ seq, ok, reason }` |

**Server design (`server/party.cjs`).**
- Replace the inline `membership.role !== "host"` checks with one function, `canAdmin(membership, room, cmd)`, returning allowed or a reason. It allows the host tab for everything, and the delegated seat for the subset in section 3.
- Store the delegation on the room (`room.hostSeat = { slot, token, grantedAt, expires }`). The delegation is tied to the seat's own device token; it is not a new bearer secret that can leak.
- A delegated command is converted to the same internal call a host-tab command makes. No handler is duplicated, so every existing rule (start gate, whitelist validation, phase checks) applies unchanged.
- `seq` makes commands idempotent: a repeated or stale `seq` is ignored and answered with the last result.
- Rate limit delegated commands per seat (for example 5 per second, 30 per minute) and log every admin command with who issued it.
- The delegation is revoked automatically when the seat leaves, is kicked, times out, or the TV revokes.

**State view.** `view()` (`party.cjs:45-85`) gains `hostSeat` (slot or null), `locked`, `pendingOffer`, and per-seat `canHost`. The phone and the TV both render from it, so there is one source of truth.

## 6. The phone UI

The host phone looks like every other phone with one addition: a small **crown** chip in the header and a **host sheet** that slides up from the bottom. It must not get in the way of playing.

```
 Lobby (host phone)                          Host sheet (opened by tapping the crown)
+--------------------------------+          +--------------------------------+
| chonks.        [crown] Priya   |          | HOST                    [close]|
|                                |          |  Game        Kart Rush  [change]|
|   YOU'RE READY                 |          |  Players     Auto (3 ready)    |
|                                |          |  CPU racers  0   [-] [+]       |
|   [      Ready  /  Not ready ] |          |  Laps        1 | 3             |
|                                |          |  -----------------------------  |
|   3 of 4 seats ready           |          |  [        START  ]  needs 2 ready|
|   Waiting: Sam                 |          |  [ Nudge Sam ]  [ Lock room ]   |
|                                |          |  Seats: Priya (you) Ravi Asha   |
|   [  Host menu  ]              |          |         [hold] kick per seat    |
+--------------------------------+          +--------------------------------+
```

- **Game picker:** a grid of the 13 games with the same mode chips the TV shows. Greyed-out entries say why ("needs 2 players", "needs a screen with room for four").
- **Setup form:** generated from the game's manifest options, so a new game's options appear without phone code changes (section 7). It shows the same reason text the server returns.
- **Start button:** large (at least 96 px tall), disabled with a reason line. The server's reason strings are the single source ("Waiting for another player. Scan the QR on the screen.").
- **Destructive actions** (Back to lobby, End match, Kick, Leave): **hold for about 800 ms** with a visible fill; a plain tap does nothing. Fixes the audit finding that Leave and Recenter are unconfirmed taps.
- **During a game:** the host sheet is behind a long-press on the crown (so a thumb on a pedal never opens it). Pause is one tap in the sheet. In landscape wheel layout the crown sits in the top-left corner outside the pedal zone.
- **Seat identity:** the crown plus the seat colour and shape. A non-host phone shows a muted crown icon on whoever is host so people know who to ask.
- **TV mirror:** the TV highlights what the host phone is doing ("Priya is choosing a game"), so the room is not confused by a screen that changes on its own.

## 7. Setup forms generated from the manifest

The manifest already declares modes and, in `core/catalog.js`, a `matchSetup` function with the options each game accepts. Today these are hard-wired in `matchSetup` (`core/catalog.js:309-343`) and in a block of selects in `public/index.html:93-167`. To serve both the TV and the phone from one definition:

1. Describe each option declaratively in the catalog: `{ key, label, type: "choice" | "number" | "toggle", choices, min, max, default, showWhen, reasonWhenDisabled }`.
2. Have the server publish the schema with the state view and validate against it (the whitelist already exists).
3. Render the schema on the phone (host sheet) and on the TV from the same renderer function.
4. The "Players" option shows the reason the server computes ("Solo: 1 ready. Multiplayer needs 2.") instead of the UI inferring it (audit: the "2" is hard-coded in `host.js:272`).

This is also the first step toward manifest `options` for outside creators (`plan.md` section 5g.3).

## 8. Situations and edge cases to design for

| # | Situation | Behaviour |
| --- | --- | --- |
| 1 | Two phones (or the TV and the host phone) press Start at the same moment | First valid `seq` wins; the other gets "Already starting". The server is the single serialiser |
| 2 | The host phone disconnects in the lobby | The role is held for the 20 s seat grace; if the phone returns it keeps the role; otherwise the next seat is offered it |
| 3 | The host phone disconnects mid-game | The game is unaffected (the TV owns the simulation). The role passes after the grace period; pause stays available on the TV |
| 4 | The host phone is also the active player (for example it is Player 1's turn in Golf) | Admin and play are separate surfaces; the host sheet never takes the swing input |
| 5 | The host phone is in landscape wheel mode with pedals down | Host menu only via long-press on the crown outside the pedal area; sheet opens as a modal and releases the pedals |
| 6 | The host phone's tab is evicted (iOS) and the player rescans | Today a rescan gives a *new* seat because the token is in `sessionStorage` (audit). Fix first: move the seat token to `localStorage` so the seat, and the role, survive (see the controller plan) |
| 7 | The TV and the host phone issue conflicting commands (TV picks Golf, phone picks Kart Rush) | Apply in server arrival order with `seq`; TV commands win ties; both screens update from the state view |
| 8 | A child or a troll is the host phone | The TV can revoke at once. Optional "vote to remove host" (2 of 3 seats) later. Destructive actions need a hold |
| 9 | The host kicks someone who immediately rejoins | Add a per-room kick list by device token for 10 minutes; today `remove` frees the slot and the same phone can rejoin (audit) |
| 10 | The host locks the room and a friend arrives | The newcomer sees "Room is locked" and a "Ask to join" button; the host sheet shows a join request with Allow/Deny |
| 11 | A late joiner arrives mid-round | Spectator seat (new): a watch screen with reactions, joins the next match. Today they get "Four players are in" (audit) |
| 12 | The host leaves the party on purpose | "Leave" is a hold; the host is asked to pick a successor, or the next seat is offered automatically |
| 13 | The room has no ready phones (everyone asleep) | Start stays disabled with the reason; TV shows "Waiting for players" |
| 14 | A game needs a screen setup the host phone cannot see (split-screen quality) | The setup form shows a hint "4 players will use split-screen" |
| 15 | The host phone is offline for 30 s but the TV is fine | Nothing breaks; the TV shows "Priya's phone is reconnecting" and the TV regains admin by default |
| 16 | Two rooms, one phone | A phone belongs to one room at a time; joining another leaves the first (explicit prompt) |
| 17 | The host changes setup while someone is ticking "ready" | Setup changes un-ready everyone only when the change affects the match (for example mode), with a toast |
| 18 | The host presses Start with a stale setup | Server validates against the latest frozen setup; the phone shows the reason if changed |
| 19 | Accidental tap on Start while someone is mid-calibration | The server waits for readiness; calibrating phones count as not ready |
| 20 | The host screen is asleep or backgrounded | Phone commands are queued and the TV shows a "tap to wake" overlay; pause stays honest |
| 21 | Host pause when only one phone is paused-eligible | One global pause now; per-pattern pause semantics later (`plan.md` 5d D6) |
| 22 | Left-handed or one-handed host | Sheet controls reachable in the lower half; no two-handed gesture |
| 23 | Screen reader users | Sheet controls have labels and a logical order |
| 24 | Spectator displays (`/screen`) are connected | They mirror the host's choices read-only; the host phone cannot issue display tokens |
| 25 | Offline TV (the tab closes) while the host phone is open | Room pauses, as today; the phone shows "Waiting for the big screen" and the 120 s countdown (add this visibility) |

## 9. Security and abuse

- The delegated role is bound to the seat's device token and the room; it cannot be exercised from another connection or room.
- No new secret leaves the TV: `hostToken` and `displayToken` are never sent to a phone.
- Commands are whitelisted, schema-validated and rate-limited; the same validators as the host tab.
- Every admin command is logged with seat, command, and result for the room's history (useful for disputes and for the tests).
- Revocation is immediate and checked on each command, not only at grant time.
- Fuzz tests for malformed and replayed `host.cmd` (see the controller stress plan, section "Security fuzz").

## 10. Milestones

Ordered for the hackathon: **the walk-up path first (Kiosk and the VIP phone's basics), hardening before the event, nice-to-haves after.**

| ID | What | Depends on | Size | Hackathon-critical? |
| --- | --- | --- | --- | --- |
| H0 | ~~Decision D-H1~~ **done** (6 November); agree the consent prompt wording | none | S | yes |
| H2 | Persist the seat token in `localStorage` (not `sessionStorage`) so a closed or evicted tab keeps its seat and role | none | S | **yes** (a walk-up's phone will sleep or switch apps) |
| H1 | Server: `canAdmin`, the delegation record, `host.*` events, `seq`, rate limits, logging; no UI. Tested through `socket.io-client` | H0 | M | yes |
| K1 | **Kiosk mode, server side:** operating mode flag, auto-start from a playlist, results-then-next, idle reset, promotion from the waiting queue | H1 | M | **yes** |
| K2 | **Kiosk TV UI:** attract screen, big QR and code, "next up" list, leaderboard; staff keys (see the visual plan V1) | K1 | M | **yes** |
| H3 | Party mode phone: crown chip, host sheet with Start, Pause, Back to lobby, and server-supplied reasons | H1 | M | yes |
| K3 | Staff phone: PIN, restricted host sheet (pin a game, skip, pause, kick, end, mode switch) | H1, K1 | S-M | yes |
| H5a | Hardening needed before a public booth: room lock and auto-lock at match start, kick list by device token, join and room-creation rate limits (the audit confirmed one client can create all 100 rooms and four anonymous joins fill any room) | H1 | M | **yes** |
| H4 | Option schema in the catalog and the shared renderer; setup on phone and TV from one definition | H1 | M | no |
| H5b | TV consent prompt with 5 s auto-allow, revoke, successor logic, "ask to join" | H1, H3 | M | no |
| H6 | Spectator seat and watch profile (shared with Kiosk's "next up") | H5a | M | yes (queue) |
| H7 | Stress tests and the human playtest ([controller stress plan](controller-stress-tests.md)); an on-site dress rehearsal | H3-H6 | M | **yes** |

**Smallest hackathon-ready slice:** H2, H1, K1, K2, K3 and H5a. That gives a booth that runs itself, can be steered by staff, and cannot be griefed. Party-mode VIP polish (H3-H5b) can follow.

## 11. Fallback (kept for the record; not needed now that delegation is approved)

Keep all administration on the TV tab and make the TV *drivable by a phone*: the phone sends only **navigation intents** (up, down, left, right, confirm, back) to the host tab, and the host tab turns them into its own commands exactly as a keyboard would. The setup form remains on the TV but becomes focusable by those intents, with big targets for the 10-foot UI. This changes no authority, but it needs a TV UI built for focus navigation (see the visual direction plan) and is less flexible than a phone-native sheet.

## 12. Acceptance

- A phone that has been granted the host role can pick a game, change setup, start, pause, return to the lobby and kick, entirely without touching the TV, in a four-phone room.
- Every destructive action requires a hold; none is reachable by a single stray tap.
- The TV can revoke the role at any time and always regains control if the host phone disappears.
- A second room, or a second tab, can never use another room's or seat's delegation.
- All `host.cmd` paths are covered by session tests that run in CI, including races and replays.
- A human playtest with a first-time host shows they can start the second game without help.
