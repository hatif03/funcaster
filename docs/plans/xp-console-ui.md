# Funcaster: the whole console as a Windows-XP-style desktop

> **Superseded in part, 6 November 2026 (later).** The detailed implementation is in the [build specification](build/README.md); where this document disagrees, that folder wins. Changes: the app **keeps the name Funcaster** (the shell is "Funcaster") and the mascot is a **cat, Chonk**; the default skin is **Luna blue**; the **legacy dashboard is kept** at `/?shell=classic` as a safety net; **1280 by 720 is 1x** (not 1920 by 1080); the focus ring is a **double white and black ring** (the orange ring failed contrast); there is **no seed or practice option**; the supplied Windows asset pack is **used as supplied** (the public-build licence gate is withdrawn); the phone chassis is the **previous controller face with a skin change** and the **previous pointer is retained**. See [build/README.md](build/README.md) section 3 for the full list.

Status: plan, 6 November 2026. Nothing here is built. This is the interface plan for the new direction the owner set on 6 November. It replaces the "Bombay Arcade neon" direction in [visual-direction.md](visual-direction.md) for the shell, the TV screens and the menus; games keep their own in-game art. Companion documents: [phone-controller-v2.md](phone-controller-v2.md) (the remote that steers this), [xp-assets-and-licensing.md](xp-assets-and-licensing.md) (what we may ship, the mascot, the 13 game backdrops), and the [North star in plan.md](../../plan.md#north-star-and-direction-6-november-2026).

**Read this first if you are another agent.** Section 1 states what the owner wants and why, in their words. Section 14 says what is fixed and what you are free to improve. The evidence for every problem named here is in section 2 and comes from reading the shipped code on 6 November, not from running it.

## 1. What the owner asked for

Verbatim intent, 6 November 2026:

1. *"The user experience of the dashboard is completely terrible. I cannot control everything from my controller. All the options available before starting a game should be packaged better. The options are at the bottom and very confusing."*
2. *"The dashboard should be full screen and games should be adapted to the screen size."*
3. *"I want to go into a complete new direction with the UI: build the entire game console and menu like the Windows XP interface. When we click on a game it opens first a small window in which you can select all the configurations of the game, like the menu before, and then when you start the game, it launches everything and runs like our existing games, but the entire UI needs to be like the Windows XP UI."*
4. *"Instead of the normal Windows wallpaper use the mumbai-pixelated I have added."*
5. *"Create a mascot for our overall app and game specific backgrounds for each game's menu."*
6. *"In the plan document, everything and our goals, so that any other agent can understand our goal and improve on it."*

**The product goal behind this** (see also the North star): a **walk-up, phone-controlled game console that people want to play with friends in the same room**, at an event and at home. The interface is the first thing every player sees, so it must be (a) instantly legible from across a room, (b) fully operable from a phone, (c) charming and unmistakably ours, (d) honest about what is happening, (e) safe to ship publicly.

**What "Windows XP style" means here:** the *experience and conventions* (a desktop with icons, windows with title bars and three buttons, a taskbar with a Start button and a tray, dialogs, property sheets with tabs, a task pane, a helper character, balloon notifications, a log-on screen, a shut-down dialog), drawn with **our own artwork** over **our Mumbai wallpaper**. It does not mean shipping Microsoft's files or names ([xp-assets-and-licensing.md](xp-assets-and-licensing.md) section 1).

## 2. Diagnosis: why the current dashboard fails (evidence)

From a code audit of `public/index.html` (the TV page), `public/party/host.js` (594 lines), `party.css` (1,446 lines), `arcade.css`, `layout.css`, `host-admin.js` and `phone-admin.js`. Estimates of scroll depth come from CSS and are **not rendered measurements**.

| # | Problem | Evidence | How the new shell fixes it |
| --- | --- | --- | --- |
| P1 | **Options and Start are at the bottom of a long page.** Order is: top bar, a 390 px decorative hero, QR card, player row, 13 game cards in a 3-column grid, then the match options, then Start. Start is probably 2,000 px or more down | `index.html:44-177`, `arcade.css:84-91` | The **Game Properties window** opens on top of the desktop with its options inside and **Start pinned to the window's bottom edge**, always visible (section 5) |
| P2 | **Three overlapping option mechanisms** (static selects turned into buttons, schema buttons, and a phone dialog of selects) with different wording for the same option ("Everyone who joins" vs "Everyone ready") | `index.html:109-167`, `choices.js`, `schema-options.js`, `phone-admin.js` | **One renderer** driven only by `optionSchema()` in `core/catalog.js`, used by both the TV window and the phone (section 5.4) |
| P3 | **Misleading start hint** ("We'll start as soon as everyone finds their balance") while arcade rooms need a manual Start | `host.js:384-393`, `party.cjs:1391` | The status bar shows the server's real `startReason` verbatim, for example "Waiting for 1 more player (multiplayer needs 2)" |
| P4 | **No way to start without a phone**; the only keyboard route leaves the party | `host.js:330-333` | A "This computer" seat (keyboard and mouse) can be added in the Players window (later stage, section 12) |
| P5 | **Destructive TV actions have no confirmation** (a player's `x` bans them for 10 minutes; "Game room" mid-game ends the round) while phones require hold-to-confirm | `party.cjs:301-313`, `party.cjs:1427` | Every destructive action opens an **XP message box** with an explicit verb ("Remove Priya for 10 minutes?"), same rule on TV and phone |
| P6 | **No pause or extend in server-simulated arenas** | `host.js` arena section | The taskbar button of the running game has a context menu: Pause, Add 60 seconds, End game |
| P7 | **The playlist menu is write-only** and changes the selected game as a side effect | `host.js:542-547` | A **Playlists** window reads and writes state, and says what it does |
| P8 | **Volume only scales the beep**, not music or ambience; "Gentle effects" does not apply after a reload | `host.js:49`, `host.js:569-584` | One **volume mixer** in the tray controls all audio; settings apply on load |
| P9 | **Text boxes need a keyboard on the TV** | `schema-options.js:57-72` | Text entry happens on the phone and mirrors in the window |
| P10 | **Host rights are hard to find on a phone** (the button appears only after a player is ready; a 5 second consent banner can race the automatic grant) | `host-admin.js:14-19`, `phone.js:208` | The remote's **Home button always opens the party menu**; consent is a balloon with a visible countdown |
| P11 | **Two collapsed drawers at the very bottom** ("Make it your party", "Booth and host controls") with different visibility rules | `index.html:184-227`, `host-admin.js` | Their contents move into the **Start menu**, **Settings**, **Players** and **Invite** windows |
| P12 | **Icon-only buttons** (a note, a fullscreen glyph, an x) and sound off by default with no indicator | `host.js:489-504` | Labelled controls and a tray speaker icon that shows state |
| P13 | **Text is far below TV size**: 7 to 14 px for most actionable text; labels at 12 px; footer at 8 px | `party.css:269`, `274`, `501`, `555`, `1343` | **16 px minimum at 1x**, a **TV scale** setting at 1.5x or 2x, and a size contract (section 8) |
| P14 | **No TV-remote navigation**: arrow keys move through DOM order only after something is focused; no default focus; no spatial navigation; gamepad moves by DOM order and B only closes dialogs | `choices.js:46-65`, `core/gamepad-menu.js` | **Spatial focus navigation** and a pointer cursor, both driven by the remote (section 6) |
| P15 | **The page scrolls and jumps to the top on every phase change**; layout caps at 1,328 px, leaving dead bands on a 1,920 px TV | `host.js:429`, `party.css:148`, `:1012` | **A fixed, non-scrolling, full-viewport desktop**; windows are the only things that move |
| P16 | **Results modal auto-returns after 12 seconds** while the user may be reading | `party.cjs:298` | A **Results window** with explicit buttons and a visible, pausable countdown only in Kiosk mode |
| P17 | **Pairing failure is a spinner with no way out**, and no manual code entry on the TV | `host.js:88-91` | A **retry button and a typed room code** in the Invite window |
| P18 | **Light-theme defaults leak into the dark theme** and hex colours are scattered (about 100 literals) | `party.css:2-14`, `tokens.css` | One token file for the shell (section 9); the old CSS stays only for the legacy page |

The audit also records what is **already good and must be kept**: the server protocol, the option schema in `core/catalog.js` (`optionSchema`, `matchSetup`), the start gates (`startReason`), delegation to a phone with a TV veto, Party and Kiosk modes, remote screens, and the hold-to-confirm pattern. **The shell is a new client of the existing server**; it changes no game and, in its first stages, no server code.

## 3. The concept: Funcaster

The console becomes a tiny operating system whose desktop is the lobby. Each XP idea is given a job that already exists in the product.

| XP idea | In Funcaster | Replaces |
| --- | --- | --- |
| **Desktop** with a wallpaper | The lobby. Wallpaper: `mumbai-pixelated` | The hero, the card grid |
| **Desktop icons** | The 13 games, plus My Games, Invite, Recycle Bin, Help | The game-card grid |
| **Double-click an icon** | **A** on a focused icon (one press), or a double click with a mouse | Clicking a card then scrolling to Start |
| **Properties dialog with tabs** | **Game Properties**: all pre-game options for one game, with Start | The options block at the page bottom |
| **Start menu** | The **party menu**: games, players, invite, records, settings, lock, end room | Both bottom drawers |
| **Taskbar** | Room status, one button per open window, the running game | Nothing (new) |
| **System tray** | Four seat lamps with names, connection quality, volume, room code, clock | The top bar and the QR card |
| **Explorer window with a task pane** | **My Games** (all games, playlists, records), and the Players and Invite windows | The page itself |
| **Control Panel** | **Settings**: sound, TV scale, gentle effects, language, skins, kiosk | Gentle effects, volume, extras |
| **Network Setup Wizard** | **Invite a friend**: QR, code, link, remote screen pairing | The join card |
| **Log On screen** | **Who is playing**: the seat tiles at the start of a session | The player row |
| **Message boxes** | Confirmations, errors, "not enough players" explanations | Silent disabled buttons |
| **Balloon notifications** | Toasts: "Priya joined", "Dev is ready", "Remote screen connected" | The toast |
| **Task Manager** | **Diagnostics**: latency, build id, frame rate, per-seat device tier | The self-test link |
| **Recycle Bin** | **Removed players** (restore a removed player; the 10-minute ban list) | The `x` button with no undo |
| **The helper character** | **Chonk**, our mascot ([xp-assets-and-licensing.md](xp-assets-and-licensing.md) section 4) | Nothing |
| **Screensaver** | **Attract mode** (the desktop dims, the mascot sleeps, the Mumbai wallpaper animates, "Scan to play" appears) | Idle reset |
| **Shut Down** | **End room** (and Back to Lobby, Restart game) | The Back buttons |
| **Boot screen and chime** | Opening animation and the start-up sound | Nothing |

### 3.1 The flow, end to end

```text
 Boot ──► Who's here ──► Desktop ──► Game Properties ──► Loading ──► Game (maximised) ──► Results ──► Desktop
 (logo)  (seat tiles)   (icons)     (options + Start)    (mascot)    (taskbar hides)       (window)
                              ▲                                                    │
                              └──────────── Pause menu / End game (taskbar) ◄──────┘
```

- **Boot** plays once per session (skippable). In Kiosk mode it is the attract intro.
- **Who is here** shows four seat tiles filling as phones join. The host can proceed with one tile for solo games.
- **Desktop** is the home state. It has no scrolling and no text smaller than the contract in section 8.
- **Game Properties** (section 5) is a window, not a page. It is where every pre-game decision lives.
- **Loading** is a small window with the mascot, the game's backdrop, and a progress bar tied to the real load and to remote-screen readiness (the existing start gate).
- **Game** is the same iframe (or iframes) that runs today, shown in a **maximised window** with the chrome and taskbar hidden. Games are unchanged ([section 8](#8-fullscreen-and-fitting-games-to-any-screen)).
- **Results** is a window with the ranking, stats and verification label, and explicit buttons: *Play again*, *Change options*, *Back to desktop*, *Save record*.

## 4. Screens, drawn

Sizes are at the 1x design size of 1920 by 1080; the shell scales ([section 8](#8-fullscreen-and-fitting-games-to-any-screen)).

### 4.1 Desktop

```text
+----------------------------------------------------------------------------------+
|[Kart][Time ][Cloud]                                                       (Chonk)|
|[Rush ][Trial][Cruise]      Mumbai pixel wallpaper                    ( mascot    |
|[Golf][Slice][Table ]       (icons sit over road and sea,              standing   |
|[    ][Dojo ][Tennis]        the Gateway, dome and tower stay clear)   bottom-right)|
|[Foam][Shoot][Alien ]                                                             |
|[Fenc][Range][Attack]                                                             |
|[Draw][Star ][Neon  ]    [My Games] [Invite] [Recycle Bin] [Help]                 |
|[ing ][Catch][Drift ]                                                             |
|[Bubble Burst]                                                                    |
+----------------------------------------------------------------------------------+
|[ Start ]  [Kart Rush Properties]            ● ▲ ■ ◆   ▮▮▮▯  ♪   Room KQ7F2P  10:38|
+----------------------------------------------------------------------------------+
```

Icons are 96 px at 1x with 18 px labels in white with a dark shadow. The **icon grid is on the left over the road and the sea** so the Gateway, the dome and the glass tower stay visible. Focus is a visible selection box. The **taskbar** is 56 px at 1x and sits above the wallpaper's bottom safe margin.

### 4.2 Game Properties (the heart of the redesign)

```text
+-- Kart Rush — Game Properties ----------------------------------------[_][□][X]-+
|  +-------------------------+  [ Play ] [ Rules ] [ Players ] [ Advanced ]       |
|  |  game backdrop (960x...)|  ----------------------------------------------   |
|  |  KART RUSH              |  Who plays                                         |
|  |  Race 1 to 4 friends.   |   (•) Everyone who is ready     ( ) Solo  ( ) 2+   |
|  |-------------------------|                                                    |
|  | Game tasks              |  Summary                                           |
|  |  ▶ Start the race       |   3 laps · 3 players · humans only · standard      |
|  |  ⟲ Reset to defaults    |                                                    |
|  |  ✎ Rules of this game   |  Players                                           |
|  |-------------------------|   ● Priya  ready    ▲ Sam  ready    ■ Dev  waiting |
|  | Presets                 |                                                    |
|  |  (Quick) (Standard) (My)|                                                    |
|  +-------------------------+  ----------------------------------------------   |
|  status: Waiting for Dev to get ready                      [ ▶ Start ] [Cancel] |
+---------------------------------------------------------------------------------+
```

Rules for this window:

- **One window, four tabs, one purpose.** *Play* answers "who and how many, and are we ready". *Rules* holds the game's own rules. *Players* holds seats, CPU opponents, helpers and rotation. *Advanced* holds the seed, practice, records and playlist. **Most groups never leave the Play tab.**
- **Start is always visible**: the bottom button row is pinned; tab bodies scroll inside the window if they must.
- **The status bar shows the real reason Start is disabled**, copied from the server's `startReason`.
- **Presets** (*Quick*, *Standard*, *My settings*) reduce decisions. *My settings* remembers the last choice per game (stored on the TV, per room).
- **The left task pane** carries the game's backdrop, a one-line tagline, the primary task (Start), Reset, and a short **rules sheet** that opens as a second window (replaces the how-to text).
- **Nothing is hidden in a drawer**, and no option appears twice.
- **The window can be left open while friends join**: it updates live, and the status bar and the tray lamps change as phones become ready.

### 4.3 The other windows

| Window | Contents | Opened from |
| --- | --- | --- |
| **My Games** (explorer style) | Task pane (Playlists, Records, Leaderboard, Random game) and an icon view of the 13 games with last scores | Desktop icon, Start menu |
| **Players** | The four seats with shape, colour, name, ready state, device tier chip (for example "touch mode"), and per-seat actions (Remove, Make host) with confirmations; the waiting queue; **Add a computer seat** (later) | Tray lamps, Start menu |
| **Invite a friend** | Big QR, the room code in large type, the link with a Copy button, **remote screen pairing** (its own QR and status) and a manual room code; the "keep this window open" hint | Tray room code, Start menu |
| **Playlists** | The saved playlists (quick, sports, race), the current queue, a Run button; replaces the write-only dropdown | My Games |
| **Records** | Recent rounds with verification labels and Save/Export | My Games |
| **Settings** | Sound mixer, TV scale, gentle effects, language, skin (Luna, Classic), Kiosk configuration (PIN-gated), diagnostics link | Start menu |
| **Results** | Ranking, per-seat stats, verification label, the four buttons | End of a round |
| **Message box** | A question or a reason, with an icon and one to three verbs | Anywhere |
| **Diagnostics** | Per-seat latency and tier, build id, frame rate, room health | Settings |
| **Recycle Bin** | Removed players with a **Restore** action and the ban timer | Desktop icon |
| **Help and Rules** | How to join, how to play each game, the controller map | Start menu |

### 4.4 The Start menu

```text
+--------------------------------------------------+
| Chonk  ·  Room KQ7F2P            3 of 4 players  |
+----------------------+---------------------------+
| ▸ Kart Rush          | My Games                  |
| ▸ Pocket Greens      | Players                   |
| ▸ Slice Dojo         | Invite a friend           |
| ▸ Table Tennis       | Playlists                 |
|   All Games ▸        | Records and Leaderboard   |
|----------------------| Settings                  |
| Recent               | Help and Rules            |
| ▸ Star Catch         |                           |
+----------------------+---------------------------+
| [Lock room]       [Restart game] [ Shut Down ▾ ] |
+--------------------------------------------------+
```

The footer holds the destructive and room-level actions, each behind a message box. **Shut Down** offers *Back to desktop*, *End match* and *End room*.

### 4.5 Kiosk: the screen that sells itself

In Kiosk mode (host plan K1-K3) the desktop becomes the **attract mode**: the wallpaper animates (a bus crosses, boats bob), the mascot sleeps on the Gateway steps, a floating window says **"Scan to play"** with a large QR, the leaderboard window sits at the right, and the playlist runs games automatically. A person with a phone sees a window titled "Find a free player slot", scans, and the next game starts. No menu, no decision.

## 5. Packaging the options

### 5.1 Where every option goes

Derived from the shipped `optionSchema` (see the audit table). **Every option in the schema appears exactly once**, in a tab chosen by its job.

| Game | Play tab | Rules tab | Players tab | Advanced tab |
| --- | --- | --- | --- | --- |
| **Everyone** | Mode: everyone ready, solo, multiplayer (2 or more); readiness; summary | none | Seats; waiting queue | Seed (shown, optional); practice on or off; round record |
| **Kart Rush** | as above | Laps (1 or 3) | CPU racers (none, 2, 4, fill); driver per player | none |
| **Pocket Greens** | as above | Holes (1, 3, 6); format (stroke, match, skins, closest, scramble); course (classic, seeded); wind | CPU golfers; skill (rookie, club, pro) | Ready golf; turn clock (30, 45, 60, 90 s) |
| **Slice Dojo** | as above | Variant (co-op, battle, race) | Helper blade | none |
| **Drawing** | as above | Drawing mode (guess, free, vote); language; theme | none | Custom words (typed on the phone) |
| **Table Tennis** | as above | Match type (duel, co-op); score to win (7 or 11) | Rotation (winner stays, pick, bracket); pick-two players | none |
| **Foam Fencers** | as above | none (first to 3 is fixed) | Rotation; pick-two players | none |
| **Star Catch, Neon Drift, Bubble Burst** | as above | Interaction (independent lanes or claim/slipstream) | none | none |
| **Shooting Range** | as above | World mode (race, shared, steal) | Helper crosshair | none |
| **Alien Attack** | as above | World mode (race, co-op, versus) | Wingman | none |
| **Cloud Cruise** | as above | World mode (race, shared) | Helper | none |
| **Time Trial** | as above | none | none | Ghost: previous winner on or off |

The playlist (today a TV-only dropdown) lives in **Advanced** for a game and as a window of its own for the room.

### 5.2 Wording and defaults

One wording per option, kept in `core/catalog.js` next to the schema. Defaults are the schema's defaults (`matchSetup`), so the window and the server cannot disagree. Every choice has a plain label and, where it helps, a one-line description shown as a tooltip balloon. Dangerous or unusual options are never defaults.

### 5.3 Presets

Three per game, defined in the catalog as small objects over the same schema: **Quick** (shortest laps and holes, no extras), **Standard** (the defaults), **My settings** (the last custom choice, stored per game). Picking a preset updates every control, and editing a control switches the preset to *My settings*.

### 5.4 One renderer, two surfaces

A single function takes `optionSchema(gameId)` and produces the tab bodies. The **TV window** draws it with the shell's components; the **phone's party menu** draws the same list in a compact form (the schema fields as large rows, grouped under the same four tabs). The static selects in `index.html`, `choices.js`'s special cases and the phone's separate select list go away, which removes problem P2 for good.

### 5.5 Everything is reachable from the remote

Every control in these windows can be focused and changed with the remote's D-pad and A (section 6) and from the phone's own party menu. The only text entry (custom words, nickname) happens on the phone.

## 6. Controlling everything from the controller

The owner's complaint: *"I cannot control everything from my controller."* The shell is designed so **no action requires a mouse or keyboard**, and so a player on a phone with no gyroscope can do everything too.

### 6.1 Two ways to point, one remote

| Mode | How | When it takes over |
| --- | --- | --- |
| **Pointer** | Tilt the phone; a cursor in the seat colour moves on the TV. **A** clicks. **B** goes back. Hold **1** to recentre | When the phone moves |
| **Focus** | **D-pad** moves a visible focus ring to the nearest control in that direction (spatial, not DOM order). **A** activates. **B** backs out | When a D-pad button is pressed |

The cursor hides after three seconds of stillness; the focus ring hides when the pointer moves. **Home** (⌂) always opens the Start menu. **Plus and minus** change a focused slider or stepper. These are the same buttons the remote has for games ([phone-controller-v2.md](phone-controller-v2.md) section 4), so there is nothing new to learn.

### 6.2 Who steers

- **Party mode:** the host (or the delegated VIP phone) steers the shell. Other seats see their own **Player setup** window on their phone (driver, colour, nickname, sensitivity); their cursor is hidden unless the host shares control ("Let Sam point").
- **Kiosk mode:** the shell runs itself; staff steer with the PIN.
- **TV veto stays:** the TV can always take control back; revoking is one confirmed action in Players.

### 6.3 What moves from host-only to reachable by phone

| Action (today host-only) | New path |
| --- | --- |
| Volume, gentle effects, music and sound | Tray volume mixer and Settings, steerable |
| Playlist | Playlists window, steerable |
| Operating mode and PIN | Settings, PIN-gated |
| Remote screens on or off and the display list | Invite window |
| Recent rounds and save record | Records window |
| Next player (rotation) and pick-two | Players window |
| Invite QR and copy link | Invite window |
| Fullscreen | The shell is already fullscreen after the first tap; a Settings toggle and the F11 hint remain |

### 6.4 Navigation rules

- **Default focus** is always set on phase change (the Start button in Game Properties, the first icon on the desktop).
- **Dialogs trap focus** and return it to the opener on close.
- **Gamepad parity:** a physical gamepad uses the same focus mode; B means *back* everywhere (the current build only closes dialogs).
- **No input leaks into a running game:** while a game is up, the shell ignores gamepad and pointer input except Home and the pause shortcut.
- **Timeouts never dismiss a window the user is reading**, except Kiosk results.

## 7. Windows on a TV

XP windows were made for a mouse at arm's length. On a TV with a pointer from a sofa, small drag handles are cruel. So:

- **Windows open centred and sized to the content**, never cascading to the corners; **at most one tool window and one message box at a time** (a second request replaces or queues).
- **Title bars are large** (48 px at 1x) and the three buttons are 40 px squares; **maximise** and **minimise** exist for fidelity but are never needed.
- **Dragging** is available (hold A on a title bar) but optional.
- **Resizing** is not offered except for the game window.
- **Taskbar buttons** are labelled and big; the running game shows with its backdrop thumbnail.
- **Modal means modal:** a message box dims the desktop behind it.
- **Motion** is short (120 ms) and respects "Gentle effects".

## 8. Fullscreen and fitting games to any screen

The owner wants the dashboard **fullscreen** and games **adapted to the screen size**.

### 8.1 The shell is fullscreen and never scrolls

- The first interaction on the TV (the boot's "Press any key or click" or the first phone ready) calls `requestFullscreen` on the document. Kiosk and rehearsal use the browser's own kiosk flags (`--kiosk` or `--start-fullscreen`) so no click is needed, and the plan documents the launch command per OS. A small tray toggle and the F11 hint remain.
- The document is `height: 100dvh`, `overflow: hidden`, one stacking context: the **desktop layer** (wallpaper and icons), the **window layer**, the **taskbar**, the **cursor layer**, the **balloon layer**. No page scroll, no jump.
- Escape from fullscreen is handled (the shell stays usable and offers "Return to full screen").

### 8.2 One scale for everything

The shell is authored at **1920 by 1080 at 1x** and scaled by a single CSS variable:

```text
--unit = min(100vw / 1920, 100vh / 1080)        (the fit)
--ui   = --unit * tv-scale                      (tv-scale: 1, 1.25, 1.5, 2, set in Settings and auto-picked)
```

All sizes are multiples of `--ui`. Pixel-art assets (icons, mascot, wallpaper) snap to **integer scale steps** (1x, 2x, 3x, 4x) using `image-rendering: pixelated` so the art never shimmers; the layout around them scales smoothly. **TV scale** is automatic when the viewport is at least 1,600 px wide and `(pointer: coarse)` is false, and can be forced.

**Safe area.** A 5% margin toggle for TVs that overscan; the taskbar and icons stay inside it, the wallpaper does not.

### 8.3 The game viewport contract

Today the game iframe fills its box with no aspect handling and each game resizes itself (`resize` listeners; Slice Dojo forces 16:9; Kart Rush and the independent views use a grid of `data-views` 1 to 4). The contract keeps that and makes it explicit.

| Rule | Detail |
| --- | --- |
| **The shell gives a game an exact rectangle** | `--game-w`, `--game-h` in CSS pixels, the full desktop minus nothing (taskbar hidden) in the maximised window, or the window's content box when windowed |
| **Each game declares its fit in the catalog** | `fit: "fluid"` (fills any rectangle, the default), or `fit: "16:9"` / `"4:3"` (the shell letterboxes with bars in the wallpaper's sky colour) |
| **A game must not scroll or overflow** | A test at every viewport in the matrix checks that the document in the iframe has no horizontal or vertical overflow |
| **Split views** | Computed from the rectangle; wide windows prefer side by side, tall prefer stacked; the 2 by 2 grid remains for four views |
| **Resolution** | The game's canvas uses `devicePixelRatio` capped at 2; heavy games lower resolution first (the existing quality governor), never below 0.6 |
| **HUD text** | The shared HUD sets a minimum of 16 px at 1x and uses the same `--ui` unit |
| **Taskbar** | Hides while a game is maximised; revealed by moving the pointer to the bottom edge or pressing Home |

### 8.4 The viewport matrix every release must pass

1,280 by 720; 1,366 by 768; 1,920 by 1,080; 2,560 by 1,440; 3,840 by 2,160; a 21 by 9 ultrawide (2,560 by 1,080); a 4 by 3 projector (1,024 by 768); a short laptop window (1,280 by 600); and the TV scale at each. For each: the desktop, a properties window, a maximised game of each fit type, and the results window; no clipped controls, no scroll, all text at least 16 px at 1x.

## 9. The design system: "Funcaster Luna"

Our palette and shapes, in the XP *layout language*. Colour values are ours; they are not copied bitmaps.

### 9.1 Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--luna-blue-1` | `#0A58D6` | Title bar, window frame |
| `--luna-blue-2` | `#3A8DFF` | Title bar highlight, task pane header |
| `--luna-blue-3` | `#D6E4FF` | Task pane body, selected rows |
| `--start-green-1` | `#2E8B2E` | Start button |
| `--start-green-2` | `#58C458` | Start button highlight |
| `--taskbar` | `#1B4FBF` | Taskbar |
| `--face` | `#F0EEE4` | Window body, control face (the warm cream of the era) |
| `--ink` | `#16161D` | Body text on the face |
| `--ink-soft` | `#4A4A58` | Secondary text |
| `--danger` | `#C62F3B` | Close button, destructive verbs |
| `--seat-peeli`, `--seat-magenta`, `--seat-cyan`, `--seat-marigold` | `#F7C600`, `#EF5DA8`, `#4DE2DF`, `#FFAD42` | **Unchanged** from the shipped `tokens.css`; the four seat colours with their shapes (circle, triangle, square, diamond) |
| `--focus` | `#FF9F1C` | Focus ring (visible on blue and cream) |

Contrast is to be computed for every pair before use (the project already has a contrast script approach); text on the title bar is white (about 7:1 on the darker blue), text on the face is `--ink`.

### 9.2 Skins

| Skin | Look | Why |
| --- | --- | --- |
| **Luna** (default) | Blue title bars, cream faces, green Start | The brief |
| **Classic** | Grey faces, navy title bars, no gradients (like the teal and grey screenshots the owner supplied) | A **high-contrast and low-power** option, and a nostalgia toggle |
| **Taxi** | Kaali-peeli (black and yellow) | A paint job that matches the phone's skin |

Skins are token sets only, so a creator or event can add one without touching components.

### 9.3 Typography

Two **open-licence** families (stored locally with their licences): a clean humanist sans for text, and a pixel face for the logo and window titles. **16 px minimum at 1x for any actionable text**, 20 px for primary buttons, 24 px for the status bar on TV scale. Bold titles at 20 px. No text is ever conveyed by colour alone.

### 9.4 Components (a small kit, built once)

Window, title bar with the three buttons, task pane with collapsible groups, tab strip, group box, push button (with default-button halo), check box, radio group, drop-down, stepper, slider, list view, icon view, tree view, progress bar (blocks), scroll bar, status bar, tool tip and balloon, menu and context menu, message box, and the cursor set. Every component supports **pointer, focus, press, disabled** and **gentle (no animation)** states, and exposes a stable **focusable id** so the spatial navigator can order it.

## 10. Building it

### 10.1 Where it lives

A new client, `public/os/`, served at `/` behind a switch, with the old dashboard kept at `/?shell=classic` until the new shell is accepted. **It talks to the same Socket.IO events the host page uses today** (`select`, `setup`, `start`, `pause`, `lobby`, `remove`, `next-player`, `record`, `arcade.configure`, `host.assign`, `host.cmd`, `remote.configure`, `revoke-view`) and receives the same `state`. **No server change is needed for stages U0 to U5.**

```text
public/os/
  index.html          shell host page
  os.js               boot, session state machine, settings
  wm.js               window manager: open, focus, modal, minimise, maximise, close, z-order, taskbar buttons
  shell.js            desktop, icons, start menu, tray, taskbar, balloons
  nav.js              pointer cursor + spatial focus navigation (remote, gamepad, keyboard)
  options-ui.js       renders optionSchema() into tab bodies (TV and phone share its model)
  windows/            game-properties, my-games, players, invite, playlists, records,
                      settings, results, message-box, diagnostics, recycle-bin, help
  theme/              tokens.css, luna.css, classic.css, taxi.css, theme-manifest.json
  mascot.js           sprite playback and event rules
  audio.js            cue bus (original sounds)
```

Games are untouched. The shell loads a game exactly as `host.js` does today (the same iframe URLs, the same remote-screen logic), inside a window.

### 10.2 State and events

The shell keeps one store fed by the server `state`. Windows are views over it plus a few local UI facts (which windows are open, the selected tab). Opening Game Properties for a game emits the existing `select`; changing an option emits `setup`; **Start** emits `start`. The pointer and focus navigator are independent of windows.

### 10.3 Accessibility and fidelity

Focus order is explicit; every control has a visible label; `prefers-reduced-motion` and "Gentle effects" disable animation; seat identity is always shape plus colour; the Classic skin is the high-contrast option; the TV scale doubles every size without breaking layout.

## 11. Testing

| Layer | What |
| --- | --- |
| **Schema to window** | A unit test renders Game Properties for each of the 13 games and asserts: every schema field appears **exactly once**, defaults equal `matchSetup`, and the same field list appears in the phone's party menu |
| **Navigation** | Scripted pointer, focus and gamepad runs: every control in every window is reachable and operable without a mouse; B always goes back; focus returns to the opener; no focus loss on phase change |
| **Visual** | Screenshots at the viewport matrix (section 8.4) for desktop, Game Properties and Results; geometry checks: no overflow, no overlap, all text at least 16 px at 1x |
| **Games in the window** | Each game loads in the maximised window at each viewport with no scroll, correct fit, and a working Pause and Back |
| **Start gates** | The status bar shows the server's `startReason` for each state (not enough players, not ready, a remote screen not loaded) |
| **Destructive actions** | Remove, End match and End room each require the message box; Escape cancels |
| **Performance** | Shell first load under 3 MB; desktop at 60 frames per second with the animated wallpaper; under 5% CPU at idle |
| **Licence guard** | The public build contains no file from `assets/source/winxp` ([xp-assets-and-licensing.md](xp-assets-and-licensing.md) section 1) |
| **Real TV** | A rehearsal on an actual TV across a room: can everyone read the options from 3 m? |

## 12. Build order

Today is 6 November; Devcon starts on **6 November, 13 days away**. This is a lot to build in 13 days, so the plan is cut in two: **what must exist for the event**, and **what follows**. Nothing before the cut line changes a game or the server.

| Stage | What | Depends on | Size | Event? |
| --- | --- | --- | --- | --- |
| **U0 Spike** | `public/os/` with a wallpaper desktop, the window manager, one real **Game Properties** window wired to live state for Kart Rush and Star Catch, Start working. Behind `?shell=os`. Built with `THEME_ASSETS=supply` for speed | none | M | **Yes** |
| **U1 All 13 properties windows** | The schema renderer, tabs, presets, status bar with `startReason`, per-game backdrops (placeholders allowed) | U0 | M | **Yes** |
| **U2 Shell chrome** | Desktop icons for all games, taskbar, tray (seat lamps, room code, volume, clock), Start menu, message boxes, balloons | U0 | M | **Yes** |
| **U3 Remote navigation** | Pointer cursor and spatial focus navigation; the phone's first-tap gate and universal chassis from [phone-controller-v2.md](phone-controller-v2.md) (C0 to C4) | U2 | L | **Yes** |
| **U4 Game window** | Maximised game window, hidden taskbar, the viewport contract, the viewport matrix | U1 | M | **Yes** |
| **U5 Other windows** | Players, Invite (with remote pairing), Results, Records, Playlists, Settings, Recycle Bin | U2 | M | Players, Invite and Results **yes**; the rest after |
| **U6 Kiosk shell** | Attract mode, leaderboard window, auto playlist, idle reset, staff PIN windows | U2, U5 | M | **Yes** (a light version) |
| **U7 Mascot** | Sprite playback, event rules, bubble tips, off switch | assets | M | Idle, wake, point, check, error only |
| **U8 Sound** | The original cue set | assets | S | The P0 set |
| **U9 Skins and polish** | Classic and Taxi skins, TV scale auto, safe-area toggle, boot animation, diagnostics window | U2 | M | No |
| **U10 Asset swap (the licence gate)** | Replace every `assets/source/winxp` role with original or licensed files; run the guard test; **required before any public deployment** | assets | M | **Yes for any public URL** |
| **U11 Later** | A computer (keyboard) seat; Funcaster Remote as an installed app; desktop widgets; theming for creator events | U5 | M | No |

**The cut line 6 November:** U0 to U4, the light version of U5 and U6, the P0 mascot and sound, **and U10 if the instance is public**. If time runs out, the order of sacrifice is U6 polish, then U5's extra windows, then the mascot; never U1 (the options problem) or U10.

**Parallel work (suggested):** one person or agent on the shell (U0, U2, U4, U5), one on the phone (C0 to C4), one on assets ([xp-assets-and-licensing.md](xp-assets-and-licensing.md) section 7). The three meet at U3.

## 13. Risks

| Risk | Mitigation |
| --- | --- |
| **Intellectual property:** the supplied pack is Microsoft's artwork, sounds and fonts, and the wallpaper is AI-generated | Section 1 of the assets document: private builds only with supply files, an `original` theme for anything public, a guard test, credits |
| **Thirteen days is short** for a new shell, a new remote and new assets | The cut line above; the shell is additive and switchable; the old dashboard stays as a fallback |
| **XP conventions are tiny on a TV** | 16 px minimum, TV scale, large title bars, one window at a time, spatial focus, tested across a real room |
| **Pointer from a sofa is imprecise** | Large hit targets, magnetic snap to controls, a D-pad focus mode that never needs the pointer |
| **Nostalgia may not land with everyone** (people who never used XP) | The interface must be self-explanatory first (labelled controls, a mascot that points), nostalgic second |
| **The mascot becomes a nag** | Events the user caused only; one-click dismiss; off in Kiosk except attract mode |
| **Two UIs to maintain** | The legacy page is frozen; the shell is the only place new features go; remove the legacy page after acceptance |
| **Schema drift** between TV window, phone menu and server | One renderer; the schema test in section 11 |
| **Games' own HUDs clash with the shell's style** | Games keep their style; the shell only frames them; the shared HUD stylesheet adopts the same size contract |
| **Wallpaper art covers real content** | Icon layout designed around the landmarks; a safe area |

## 14. For the next agent: what is fixed and what you may improve

**Fixed (owner decisions, do not reverse without asking):** the console becomes a Windows-XP-style desktop; the wallpaper is `mumbai-pixelated`; there is a mascot and a backdrop per game; Game Properties is a small window opened from a game icon and it holds every pre-game option; the dashboard is fullscreen; games adapt to the screen; everything is operable from the phone; **nothing from `assets/source/winxp` ships publicly**; the server protocol and games are not rewritten for the shell.

**Open for you to improve:** the exact tab split in section 5.1; the wording of labels; the Start menu contents; whether the Recycle Bin metaphor earns its place; the mascot's final design (section 4 of the assets document recommends Chonk the street cat but the owner has not chosen); the skin set; how Kiosk attract mode behaves; the boot sequence; and anything the real-TV rehearsal shows to be unreadable. **Measure before you decide:** this plan's sizes and scroll estimates come from reading code; replace them with measurements.

**Decisions I need from the owner:** the mascot (A, B or C in the assets document); the default skin (Luna or Classic); whether Kiosk mode keeps the boot animation; whether to keep the legacy dashboard reachable after launch; and who owns asset production 6 November.
