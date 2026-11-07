# Build 03: the shell (Funcaster), module by module

Part of the [build specification](README.md). Status: plan, 6 November 2026. This is the implementation spec for the new TV client, `public/os/`. It is grounded in a read of `public/party/host.js`, `server/arcade.cjs`, `server/party.cjs`, `core/catalog.js`, `server.js` and the dashboard audit. Visual tokens and sprites are in [02-theme-and-assets.md](02-theme-and-assets.md); the option window is in [04-game-properties.md](04-game-properties.md); the phone, including pointer streaming, is in [06-phone-remote-and-pointer.md](06-phone-remote-and-pointer.md).

## 1. Constraints and decisions

| Decision | Detail |
| --- | --- |
| **No framework, no build step** | The repo serves plain ES modules from `public/` and `core/` (there is no bundler). The shell is vanilla ES modules, a few hundred lines per module, with a tiny `h()` DOM helper. Matches how `host.js`, `phone.js` and the games are built |
| **A new client of the same server** | The shell emits and receives the same Socket.IO events as `host.js` (section 4). **No server change is required for stages U0 to U5** |
| **Runs beside the old page** | `public/os/index.html` served at `/` when the shell flag is on; the legacy `public/index.html` stays reachable (section 17). `core/` and the games are unchanged except where another document says otherwise |
| **Target browsers** | Current Chrome and Edge (primary: the booth laptop), Safari and Firefox (secondary), Chromium on a TV box (Android TV, Fire TV; **not verified**). Features used: ES modules, CSS custom properties, `ResizeObserver`, Fullscreen API, Pointer Events, `dialog` not required |
| **Brand and strings** | All user-visible names come from `public/os/brand.js` ([01](01-brand-and-rename.md)); all UI strings from one `strings.js` so a later translation is mechanical |
| **State is the server's** | The shell owns only UI state (open windows, selected tab, volume, skin). Everything about rooms comes from the `state` event |

## 2. File tree and responsibilities

```text
public/os/
  index.html            shell page: one <div id="os"> and the module entry; meta viewport, theme-color
  main.js               entry: brand, theme, scale, session, store, wm, shell, nav, boot sequence
  brand.js              exports BRAND (name, os, mascot, wordmark, tagline) and title()
  strings.js            all copy (English), keyed; Hinglish variants later
  util/h.js             h(tag, props, ...children) DOM builder; on(), cx(), clamp(), sleep()
  util/store.js         createStore(): get(), set(patch), subscribe(selector, fn)
  util/storage.js       read and write chonks.<k> (settings; the legacy keys are read as they are)
  session.js            socket, host handshake, reclaim, state feed, host.cmd client, pairing fetch, reconnect UI hooks
  scale.js              --ui and --unit computation; TV scale; safe area; fullscreen
  theme/
    tokens.css          design tokens (colours, metrics, fonts)
    luna.css            the Luna skin: chrome, controls
    classic.css         the Classic skin (high contrast)
    theme-manifest.json role -> asset path (the only place files are named)
    atlas.json          sprite coordinates (from the UI Theme sheet)
    atlas.js            sprite(role) -> CSS custom properties / background props
  wm.js                 window manager (section 8)
  shell/
    desktop.js          wallpaper layer, icon grid, selection, context menus
    taskbar.js          start button, task buttons, tray
    startmenu.js        the party menu
    tray.js             seat lamps, connection quality, volume, room code, clock
    balloons.js         notifications queue
    mascot.js           sprite playback, bubbles, event rules (section 11)
    boot.js             boot, who-is-here, attract sequences (section 12)
    audio.js            cue bus (section 13)
  windows/
    game-properties.js  (see 04)         my-games.js        players.js       invite.js
    playlists.js        records.js       settings.js        results.js       message-box.js
    diagnostics.js      recycle-bin.js   help.js            loading.js       attract.js
    staff.js            game-window.js
  nav.js                spatial focus navigation (section 9)
  pointers.js           per-seat cursors fed by the Pointer class (section 10, doc 06)
  game-host.js          iframe host extracted from host.js (section 14)
  option-ui.js          presentation layer for option schemas (doc 04)
  demo-state.js         synthetic room states for development and tests (section 16)
assets/os/              theme assets copied from assets/source/ (02)
```

Rule: **a window module exports `open(ctx)` that returns `{ el, update(state), destroy() }`**, and registers itself with a manifest entry `{ id, title, icon, size, singleton, modal }` so the window manager and Start menu can list it.

## 3. Page load and the critical path

1. HTML parses; `tokens.css` and `luna.css` load (blocking, small).
2. `main.js` runs: import `brand.js`, compute `--ui`, set the wallpaper placeholder (a flat sky colour) so the first paint is not white.
3. In parallel: load `theme-manifest.json`, `atlas.json`, the two fonts (`FontFace` API with `font-display: swap`), the wallpaper (one `<img>` decoded with `decode()`), the icon sheet.
4. Connect the socket and perform the host handshake (section 4). Show the boot window with a progress bar tied to these steps.
5. When the wallpaper is decoded **and** the handshake has returned, play the boot sequence (section 12) and reveal the desktop.

**Budgets.** First meaningful paint under 1 s on a LAN; interactive under 2.5 s; the shell's own transfer (excluding the wallpaper) under 600 KB; the wallpaper at most 1.2 MB as WebP (the supplied PNG is 2.2 MB); the fonts under 200 KB together. Nothing the shell needs is loaded from a third party (no Google Fonts; the repo already serves fonts locally).

## 4. The session layer (`session.js`) and the server contract

### 4.1 Handshake, copied from `host.js:93-111`

```js
const socket = io('/party', { transports: ['websocket', 'polling'] });
socket.on('connect', () => {
  const saved = recall('chonks.host');                    // sessionStorage {code, token, displayToken}
  socket.emit('host', { ...(saved || {}), buildId, arcade: true }, (ans) => {
    if (ans.error) { forget('chonks.host'); /* retry once without saved; show the error */ }
    else { remember('chonks.host', ans); pairingFor(ans.code); }
  });
});
```

- **`sessionStorage["chonks.host"]` must keep the legacy key and shape** `{code, token, displayToken}`: the game iframes read the host token from that exact key (`core/net.js:161`). This is a hard compatibility rule (the key is one of the identifiers that never change, see [01](01-brand-and-rename.md) section 3).
- `buildId` comes from `import { buildId } from '/build.js'`. An answer of `{update:true}` means the page is stale: show the "Reload to update" message box and reload on confirm.
- Error acks to handle with plain-language messages: "Too many new parties. Try again in a minute.", "The party server is busy. Please try again.", "This tab has already joined.", "Too many connection attempts. Wait a minute, then reload.", "Session expired. Start a new party." (clear saved and create a fresh room).
- `arcade: true` is sent on creation so the room has arcade state (the shell needs `operatingMode`, `options`, `leaderboard`, `startReason`); it is ignored on reclaim.
- Rooms expire 120 s after the host drops and 4 h after creation; `ended` is emitted then. On `ended`: clear saved, show an "This party has ended" window with a **Start a new party** button.

### 4.2 Receiving state

`socket.on('state', next)` replaces the whole store slice `room`. Derived helpers (`selectors.js`, in `session.js`): `isLobby`, `isClassic`, `isArena` (phases practice, countdown, playing), `readyPlayers`, `connectedPlayers`, `canStart`, `serverOffset = next.serverTime - Date.now()` (for clocks), `remainingMs(endsAt)`. Other events: `frame` (arena games: forward to `PartyRenderer`), `pause {paused}`, `displays` (host only when remote is enabled), `match.finish`, `ended`.

### 4.3 Sending

| Helper | Emits | Notes |
| --- | --- | --- |
| `select(game)` | `select {game}` | lobby or results only; no ack |
| `setup(obj)` | `setup {...state.setup, ...obj}` | whole object, always; ack `{ok:true}`; debounced by callers |
| `cmd(name, args)` | `host.cmd {seq, cmd, args}` | `seq` is a strictly increasing integer from 1, per tab; replies `{ok}` or `{error}`; handles "Give it a moment." (rate 5 per second) |
| `start()` | `host.cmd {cmd:'start'}` | returns the real reason on failure (doc 04) |
| `pause()`, `lobby()`, `remove(slot)`, `nextPlayer()`, `extend()` | raw events or `host.cmd` | **All destructive ones go through a message box first** |
| `record(matchId)` | `record {matchId}` with `socket.timeout(5000)` | returns `{result, replay}`; saved as a JSON download named `chonks-<matchId>.json` |
| `arcadeConfigure(opts)` | `arcade.configure` | Kiosk and Party switch; needs the 6-digit PIN to enter Kiosk |
| `hostAssign(slot\|null)` | `host.assign` | grants or revokes the phone host |
| `remoteConfigure(bool)`, `assignSeat`, `revokeView` | as named | only when `state.remoteViews !== undefined` |
| `staffUnlock` | not the TV's job | the TV is already the owner |

### 4.4 Pairing

`GET /api/party/pairing/:code` returns `{url, qr, trusted}`; retry every 3 s on failure **with a visible Retry button and the typed room code** (fixing audit problem P17). `url` is `<origin>/controller?room=<code>`. For a remote screen's own QR: `GET /api/party/pairing/:code?screen=<ref>`.

### 4.5 What the shell never does

It never talks to games except through the iframe URL and the `postMessage` types in section 14; it never writes `setup` outside lobby or results; it never emits `start` directly.

## 5. UI store and rendering

```js
const ui = createStore({
  windows: [],            // {id, z, rect, state}
  focusId: null, mode: 'pointer'|'focus',
  skin: 'luna', tvScale: 'auto', volume: 70, gentle: false,
  game: null,             // game selected in the properties window
  boot: 'booting'|'who'|'desktop'|'game'|'attract',
});
```

- `store.subscribe(selector, fn)` calls `fn` only when the selected slice changes (shallow compare).
- Windows render once, then `update(state)` mutates text and attributes in place. No virtual DOM, no innerHTML with data (all text via `textContent`; names from phones are untrusted: `players[].name` is a fixed seat name today, but nicknames will arrive later, so the rule is "never `innerHTML` for anything from the room").
- Animations are CSS transitions of `transform` and `opacity` only; durations come from `--dur` (120 ms), set to 0 by Gentle effects or `prefers-reduced-motion`.

## 6. Scaling, fullscreen, safe area (`scale.js`)

### 6.1 One unit

The shell is **authored at 1280 by 720 = 1x**. (This replaces the "1920 by 1080 at 1x" line in the earlier plan: 1080p is 1.5x, which makes 16 px text 24 px on a TV and keeps XP's small chrome readable. 1280 by 720 is the smallest laptop we support.)

```js
const designW = 1280, designH = 720;
function computeUi() {
  const u = Math.min(innerWidth / designW, innerHeight / designH);
  const tv = settings.tvScale === 'auto' ? (innerWidth >= 1600 && !matchMedia('(pointer: coarse)').matches ? 1 : 1)
                                          : Number(settings.tvScale);   // 1, 1.25, 1.5, 2
  const ui = clamp(u * tv, 0.9, 4);
  root.style.setProperty('--ui', ui);
  root.style.setProperty('--px', `${ui}px`);          // 1 design pixel
  root.style.setProperty('--vw-d', `${innerWidth / ui}px`);   // viewport width in design px
  root.style.setProperty('--vh-d', `${innerHeight / ui}px`);
}
```

- All layout sizes are written `calc(N * var(--px))`, so 1x metrics are literally the numbers in these documents.
- `ui` is **clamped to a floor of 0.9** so text never falls below 14.4 px (the contract is 16 px at 1x: at 0.9 it is 14.4, acceptable on short windows; below that, windows scroll inside instead).
- **Auto TV scale** needs no extra multiplier because 1080p is already 1.5x; the setting exists for rooms where people sit far away (2x).
- **Design viewport:** the visible area in design pixels is `innerWidth/ui` by `innerHeight/ui`. On 16:9 it is exactly 1280 by 720; ultrawide 21:9 gives about 1680 by 720; 4:3 gives about 1138 by 853. Layout code reads these from `--vw-d` and `--vh-d`.

### 6.2 Pixel art

Sprite sheets and icons are drawn with `image-rendering: pixelated` at **integer scale**: `k = max(1, round(ui * devicePixelRatio))`; the sprite's CSS size is `nativePx * k / devicePixelRatio`, so each source pixel lands on whole device pixels. The layout around it uses the smooth `--px`. The window frames and gradients that the pack draws are smooth, not pixel art; they use `border-image` and are allowed to scale smoothly ([02](02-theme-and-assets.md)).

### 6.3 Fullscreen

- The first user gesture on the TV (a key, a click, or the first phone-driven "A" when the pointer is a seat) calls `document.documentElement.requestFullscreen({ navigationUI: 'hide' })`. Browsers refuse it without a gesture, so **boot ends with a "Press any key or click to start" window** whenever the document is not fullscreen and not in kiosk mode; this is also what unlocks audio.
- Kiosk and rehearsal launch Chrome with `--kiosk` (or `--start-fullscreen`), so the shell is already fullscreen and needs no click; the exact commands per OS are in [07](07-schedule-tests-runbook.md).
- `fullscreenchange` away from fullscreen shows a non-modal balloon "Return to full screen" with a button; it never blocks play.
- A tray toggle and `F11` remain.

### 6.4 Safe area

A setting `safeArea` (off, 3%, 5%) adds padding to the **work area** so icons and the taskbar stay inside TV overscan; the wallpaper still bleeds to the edges.

## 7. Layers and z-order

| Layer | z-index | Contents |
| --- | --- | --- |
| Wallpaper | 0 | `<img>` with `object-fit: cover`, `object-position: 50% 40%`, `image-rendering: pixelated` is **not** used (the wallpaper is pre-scaled, see 02) |
| Desktop icons | 10 | The icon grid, system icons |
| Windows | 100 to 899 | Each focus raises `z` by 1 within this band |
| Modal scrim | 900 | Dims the desktop behind a message box |
| Modal | 910 | The topmost message box |
| Start menu | 950 | Above windows |
| Balloons | 960 | Notifications from the tray |
| Taskbar | 1000 | Hides in game mode (slides down 100%) |
| Mascot | 1500 | Above the taskbar, below cursors |
| Cursors | 2000 | One per seat; the pointer layer ignores events (`pointer-events: none`) |
| Boot overlay | 3000 | Boot, who-is-here, reconnecting |

**Work area** = the viewport minus the taskbar (42 design px) minus the safe area. Windows and icons live in the work area. In game mode the work area is the entire viewport.

## 8. The window manager (`wm.js`)

### 8.1 Model

```js
{ id, title, icon, kind: 'tool'|'modal'|'game', singleton: true,
  rect: {x, y, w, h}, state: 'normal'|'minimised'|'maximised',
  z, owner, canMinimise, canMaximise, canClose, onClose, content }
```

### 8.2 API

| Call | Behaviour |
| --- | --- |
| `wm.open(id, props)` | Looks up the manifest; if a singleton is open, focuses it (and updates props). Else creates it, sizes it from the manifest (clamped to 92% of the work area), **centres** it, adds a taskbar button, focuses it, plays the `open` cue |
| `wm.close(id)` | Calls `onClose` (may veto with a message box), plays `close`, removes the button, restores focus to the opener or the top window |
| `wm.focus(id)` | Raises z, marks active, updates title-bar active state, sets the nav scope to this window |
| `wm.minimise(id)`, `wm.maximise(id)`, `wm.restore(id)` | Animate transform over 120 ms; maximise fills the work area; the game window is maximised by definition |
| `wm.modal({icon, title, text, buttons, defaultButton, cancelButton})` | Pushes onto the modal stack; shows the scrim; **at most one modal visible, the rest queue**; resolves a promise with the chosen button id |
| `wm.drag(id)` | Title-bar drag with pointer capture; clamps so the title bar stays reachable; **optional on TV** |
| `wm.list()`, `wm.top()` | For the taskbar and nav |

### 8.3 Placement rules

- **One tool window at a time by default** (Game Properties, Players, Invite, Settings, ...): opening another tool window **replaces** the current one unless it is "pinned" with its pushpin or the user holds Shift/B-hold (keeps the TV uncluttered). The Players window and Invite window are allowed to coexist with Game Properties (a pair is often wanted).
- Windows open centred; a second window is offset by 28 design px down and right, and never beyond the work area.
- **No resize handles** except none at all in v1 (the game window fills the screen); fixed sizes per manifest keep layout testable.
- Minimise is allowed (restores from the taskbar); closing the last tool window returns focus to the desktop.

### 8.4 The game window

`kind: 'game'` is always maximised, has **no chrome**, hides the taskbar, and contains `game-host.js`'s frames. The taskbar slides in when the pointer reaches the bottom edge for 400 ms, or on **Home** (the remote's home button), or on `Escape`; it slides out after 2 s of inactivity.

## 9. Navigation: spatial focus (`nav.js`)

### 9.1 Concepts

- A **scope** is the container that currently owns focus: the topmost modal, else the topmost tool window, else the Start menu if open, else the desktop.
- A **focusable** is any element with `data-nav` (buttons, tabs, radios, list rows, icons, the three title buttons). Hidden, disabled and `data-nav-skip` elements are ignored. `data-nav-group="name"` marks rows (a segmented control, a tab strip) so Left and Right stay within the group before leaving it.
- `data-nav-default` marks the preferred first focus; otherwise the first in reading order.

### 9.2 Moving focus (the algorithm)

On a D-pad press with direction `d` (left, right, up, down):

1. Let `F` be the focused element's rectangle; if none, focus the default and stop.
2. If `F` is in a group and `d` is along the group's axis, move to the neighbour in the group if one exists; if at the end, fall through.
3. Candidates: every focusable in the scope whose centre lies in the half-plane of `d` from `F`'s centre.
4. For each candidate with rectangle `C`, compute (all in CSS pixels):
   - `primary` = the distance along `d` between the nearest edges (clamped to at least 0).
   - `secondary` = the distance across `d` between the centres.
   - `overlap` = the length of the overlap of `F` and `C` projected on the cross axis, divided by the smaller of the two lengths (0 to 1).
   - `score = primary + 2.0 * secondary - 80 * overlap`.
5. Choose the lowest `score`. If no candidate: wrap rules (section 9.4) or do nothing and play the `edge` cue.
6. Focus it, scroll it into view if inside a scroller, remember it as the scope's last focus.

This weights straight-ahead neighbours and prefers elements whose extent overlaps the current one (so moving down from a wide row lands on the row below, not a far-off small control).

### 9.3 Activation and back

| Input | Effect |
| --- | --- |
| **A** (or Enter, Space, gamepad 0) | Activates the focused element (`click`), plays `click` |
| **B** (or Escape, gamepad 1) | Back: close the topmost modal (its cancel button), else close the topmost tool window, else (on the desktop) do nothing; in a game: open the pause menu |
| **Home** (or the gamepad Start/9, F10) | Toggle the Start menu; in a game, reveal the taskbar and open the party menu |
| **Plus / minus** (or `+` `-`) | Increment or decrement a focused stepper or slider; otherwise volume up and down |
| **1 hold** | Recentre the pointer |
| **2** | Show the help balloon for the focused element (its `data-help`) |

### 9.4 Wrap and edge rules

Within a tab strip, Left and Right wrap. In the icon grid, Left and Right stay in the row, Up and Down stay in the column and wrap to the other end. Between the desktop and the taskbar: Down from the bottom icon row goes to the Start button; Up from the taskbar returns to the last icon.

### 9.5 Focus return and traps

Opening a window records the opener; closing returns focus to it if it still exists, else to the desktop's last icon. Modals and menus **trap**: D-pad never leaves their scope. On a phase change the shell sets a default focus (the Start button in Game Properties; the first icon on the desktop; the primary button in Results).

### 9.6 Pointer and focus together

- The pointer cursor (section 10) hit-tests with `elementFromPoint` ignoring the cursor layer. Hover shows the hover state. **A** on the cursor activates the element under it.
- **Magnetism:** within 28 px of a focusable's edge the cursor's *hit target* snaps to that focusable (the cursor does not jump, but its click goes to the magnet).
- **Mode switch:** any D-pad press sets `mode = 'focus'` (the cursor fades after 600 ms, the focus ring shows); any pointer movement above 2 px sets `mode = 'pointer'` (the ring fades). Both are always available.
- Several seats can have cursors; the **steering seat** (host, or the seat the host shares control with) is the only one whose A activates shell controls. Other cursors are cosmetic unless a window grants them (the Player setup window on a phone is separate).

### 9.7 Gamepads

Reuse the idea of `core/gamepad-menu.js` (poll `navigator.getGamepads()` every 120 ms for edge detection), mapped to the table above: D-pad 12 to 15 or the left stick above 0.5; button 0 = A, 1 = B, 9 = Home, 4 and 5 = tab switch. The existing module polls during games and can click host buttons; the new one **disables itself while `boot === 'game'`**.

## 10. Pointers (`pointers.js`)

Summary here; the full wire design is in [06](06-phone-remote-and-pointer.md).

- One `Pointer` instance (from `core/pointer.js`, the retained "moving probe") **per seat**, fed raw samples forwarded to the host socket only while the shell is in a pointer-capable phase.
- Each frame: `ptr.sampleAt(now)` returns the predicted position in 0 to 1 viewport coordinates; the shell converts to CSS pixels (`x * innerWidth`, `y * innerHeight`) and moves the seat's cursor element with `transform: translate3d(...)`.
- Cursor element: the XP arrow image tinted by a seat-colour ring and shape badge (or the legacy glove, a skin option); a 24 px hotspot at the tip.
- `ptr.recentre()` on hold 1; speed from the user's `Pointer` sensitivity, adjustable with plus and minus, shown in a transient pill ("Pointer speed 1.2").
- A cursor times out (fades) 3 s after its last sample; the phone's seat tray lamp shows "pointing" while live.

## 11. The mascot engine (`mascot.js`)

### 11.1 Playback

The skin descriptor ([01](01-brand-and-rename.md) section 1.3) gives, per animation, the sheet, the frame count and a **`frameDurationsMs` array** (the supplied sheets have 12 to 145 frames and per-frame timing of 60 to 2,110 ms, so a fixed fps or CSS `steps()` is wrong). Playback uses one `<div>` with the sheet as `background-image` and a small JS scheduler:

```js
function play(name, { loop = false, then = 'idle' } = {}) {
  const a = skin.anims[name]; let i = 0; el.style.backgroundImage = `url(${a.file})`;
  const show = () => {
    if (!a.emptyFrames?.includes(i)) el.style.backgroundPositionX = `${-i * 240}px`;   // blank frame: keep the previous image
    timer = setTimeout(() => (++i < a.frames ? show() : loop ? (i = 0, show()) : play(then, { loop: true })),
                       a.frameDurationsMs[i]);
  };
  clearTimeout(timer); show();
}
```

(A blank frame leaves the previous image on screen for its duration; at the end the engine returns to `idle`.) One element, one active animation, a queue of at most 2; `prefers-reduced-motion` and Gentle effects show only the first frame of the requested animation for 1.5 s and then `idle`'s first frame. The whole sprite is 240 px wide at 1x and drawn with `image-rendering: auto` (the sheet is smooth artwork, not pixel art), at `calc(180 * var(--px))` so it is 75% of its native size and does not crowd windows.

### 11.2 Vocabulary (the 25 names the pack uses; Chonk uses the same)

`airplane`, `check`, `cool`, `eyes`, `idle`, `leave`, `listen`, `music`, `noted`, `office`, `point down`, `point left`, `point right`, `point up`, `read`, `showel` (sic, the supplied file name), `sleep`, `spyglass`, `think`, `tired`, `wakeup`, `watch front`, `watch left`, `watch right`, `weird`.

### 11.3 Event rules

| Event | Animation | Bubble (example text) | Notes |
| --- | --- | --- | --- |
| Boot finished | `wakeup`, then `idle` | none | Once per session |
| Idle 20 s | `idle` variants every 8 to 14 s (random `watch left/right/front`) | none | |
| Pointer moves over the desktop | `watch left/right` following the cursor's x | none | Eyes only; throttled to 4 per second |
| A phone joins | `check` | "{Name} joined" | Chonk's chai level rises one notch (Chonk skin; the stand-in helper has no meter) |
| A phone becomes ready | `check` | none | |
| Game Properties opens | `point left` toward the window | "Pick how you want to play" | **First open of each session only** |
| Start disabled | `think` | the `startReason` | When Start is pressed while disabled |
| Loading a game | `airplane` (loop) | none | Until `chonks:loaded` |
| Win or record | `cool` | "{Name} takes it!" | In the results window |
| Error or disconnect | `weird` | the message summary | With the message box |
| Room reconnecting | `tired` | none | |
| Idle 60 s (party) / attract (kiosk) | `tired` then `sleep` (loop) | none | Wakes on any input |
| Invite window opens | `spyglass` | none | |
| Staff window | `office` | none | |
| Volume changed | `music` for 2 s | none | |
| Shut down | `leave` | "See you!" | Then the end-of-room flow |

### 11.4 Manners

- **Unsolicited bubbles at most once per 60 s** and at most 3 per session; a bubble always has a dismiss `x` and disappears after 6 s.
- The mascot **hides** during games and in Kiosk mode except attract. A tray right-click or the Settings toggle turns it off for the session.
- It never covers a button: it sits at the bottom-right of the work area and moves to the bottom-left if the active window's rectangle intersects it.

### 11.5 Street pets and seat avatars (full-build level; first to cut)

Two small ambient features from the CraftPix sheets ([02](02-theme-and-assets.md) section 13.3):

- **Street pets** (`shell/pets.js`): up to two of dog, dog 2, cat, cat 2 and crow walk along the **top edge of the taskbar** (Walk at 40 design px per second, Idle for 2 to 6 seconds, turn at the edges), Idle and Walk sheets only, 120 ms per frame, integer pixel scale, `pets.json` gives frame counts. They stop during a game and under Gentle effects (a static idle frame); a Settings toggle turns them off; A or a click on one makes it sit and look at the cursor.
- **Seat avatars** (`shell/avatars.js`): seats 0 to 3 are fixed to **Biker, Punk, Cyborg and one non-smoking townsperson**. Their Idle sheets (4 frames) appear on the Who's playing tiles, in the Players rows and in the Results ranking (the winner plays the Run sheet). **Seat shape and colour stay the primary identity**; the avatar is decoration beside them, and an empty seat shows a dim silhouette.

## 12. Boot, who-is-here, shut down, attract

### 12.1 Boot sequence (first load of a session, skippable by any input)

| t (ms) | What |
| --- | --- |
| 0 | Black. The wordmark fades in (300 ms) |
| 300 | The progress block animation (the standard sliding three blocks) starts below the wordmark |
| 300 to 2200 | Real work: assets, handshake. The bar loops; the text under it reads the current step ("Setting up the room") |
| 2200 | Startup chime (original sound, section 13); wordmark fades out |
| 2600 | The **who-is-here** screen fades in over the wallpaper (below) |

If the handshake is slow, the boot stays until ready, with the bar and a "Still trying" line after 6 s.

### 12.2 Who is here

A wallpaper with a centred panel titled "Who's playing?": the four seat tiles (shape, colour, the seat's pixel avatar, empty or the seat name; the XP log-on picture idea), the room code and QR on the right, and two buttons: **Scan to join** (focuses the QR) and **Continue to desktop**. Auto-advances 2.5 s after the first phone is ready (party) or immediately (kiosk). This is where the first-tap fullscreen request lives ("Press any key or click to start").

### 12.3 The desktop

On arrival: icons fade in with a 20 ms stagger (13 icons, about 260 ms), the mascot `wakeup` plays, the tray lamps update.

### 12.4 Shut down

The Start menu footer opens a modal "Shut down Funcaster" with a radio list: **Back to the desktop**, **End this match**, **End the room (everyone goes home)**; OK and Cancel. "End the room" requires a second confirm ("This ends the party for everyone"). It plays the shutdown cue, then emits `lobby` or leaves the room and shows "It's now safe to close this tab" (a nod, text only).

### 12.5 Attract (kiosk, or party idle for 5 minutes)

Dims 25%, the mascot sleeps, a floating window "Scan to play" holds a large QR, the room code in 64 px type, the leaderboard window to the right, and a ticker line "Next up: {game}". Any input or a phone joining exits attract with the `wakeup` animation.

## 13. Audio (`audio.js`)

- **Cue bus:** `cue(name)` plays a short sound through one `AudioContext` created on the first user gesture (Press any key). Cues are decoded once and cached as `AudioBuffer`s.
- **Names:** `startup`, `shutdown`, `logon`, `click`, `open`, `close`, `minimise`, `restore`, `menu`, `ding`, `notify`, `balloon`, `error`, `warning`, `edge`, `joined`, `left`, `countdown`, `go`, `win`, `lose`. The mapping to files is in [02](02-theme-and-assets.md) section 6.
- **Mixer:** master volume (0 to 100, default 70) in `chonks.volume` (the legacy `chonks.party-volume` is read as the default), applied to a `GainNode`; a mute toggle in the tray; **the volume slider governs all shell audio**, fixing the old page where it scaled only the beep. The games keep their own audio.
- **Gentle effects** removes the startup chime and animation sounds except `error`.
- **Formats:** keep the WAVs as supplied (small), or convert to OGG for size; the loader picks by `canPlayType`.

## 14. The game host (`game-host.js`)

This is the one place where the old logic is **extracted, not rewritten**, from `host.js:244-313` and `525-539`.

### 14.1 Classic games (phase `classic`)

- **Frame key** `${state.game}:${state.roundId}:${localViews.join(',')}`: rebuild the iframes **only when the key changes** (a changed `roundId` invalidates any open URL, since `screen` registration requires the current `roundId`).
- **URL:** ``/games/${game}/${sharedWorld ? 'shared.html' : ''}?party=${code}&round=${roundId}&view=${viewIndex}${match.serverSimulation ? '&shared=1' : ''}``.
- **Local views:** for independent layouts, the active indices not hosted on a remote screen (`!state.seatViews?.some(v => v.view === i && v.where !== 'host')`); otherwise `[0]`.
- **Layout:** the wrap's `data-views` is the local count; CSS grid 1 column for 1, 2 columns for 2, a 2 by 2 grid for 3 or 4 (copied from `party.css:1361-1376`, rewritten with `--px`). Each independent frame gets a player-name badge in the seat colour.
- **No local views:** show the note "{Name} is playing on {Label}" (the remote case).
- **Iframes** use `allow="autoplay; fullscreen"`.
- **postMessage, same-origin only, source must be one of our iframes:** `chonks:loaded` hides the loading window; `chonks:home` emits `lobby` (open the pause menu instead if a round is running, then confirm); `chonks:error` shows a message box with the message and emits `lobby` on OK.

### 14.2 Arena games (phases practice, countdown, playing, results)

For Star Catch, Neon Drift and Bubble Burst the server simulates and streams `frame`. The game window contains a `<canvas>` driven by the existing `PartyRenderer` (`public/party/render.js`) with its `ResizeObserver`; HUD elements (scoreboard pills, timer, countdown, instruction line) are shell-drawn overlays reading `state` as `host.js:402-455` does. The timer uses `endsAt - (serverTime - Date.now())` (offset computed per state).

### 14.3 Pause and controls in a game

The taskbar button for the running game has a context menu (the phone pointer's hold-A, or `Menu`): **Pause or Resume** (`pause`), **Add 60 seconds** (`extend`), **Next player** when `match.maxHumans === 1` and two or more are ready, **End game** (message box, then `lobby`). The pause state comes from `state.paused`; the game freezes itself from the same event, so the shell sends nothing to the iframe.

### 14.4 Results

The server moves the phase to `results`; the shell opens the **Results window** (section 15). When the server returns the room to the lobby (12 s in party mode, 10 s in kiosk), the window closes and the desktop returns.

## 15. The remaining windows, briefly

| Window | Size at 1x | Contents and bindings |
| --- | --- | --- |
| **Results** | 640 by 460 | Header with the winner line (the old `results()` logic, ported); the ranking list (seat chip, name, score, unit, outcome badge for dnf, forfeit, removed); per-seat stats as secondary lines; crew standings; the verification line (`verified`, `attested`, `failed`, `unverified`, plus "Includes remotely reported views"); buttons **Play again** (`start` via cmd), **Change options** (opens Game Properties), **Back to desktop** (`lobby`), **Save record** (`record`). **No auto-dismiss** in party mode (the server's 12 s return is shown as a countdown that is **paused while the window has focus**; if the server returns anyway, the window shows a final "Back at the desktop" balloon); kiosk mode shows the countdown |
| **Players** | 560 by 420 | Four seat rows (shape, colour, name, status chip: ready, joined, away, dnf; device tier chip; connection), per-row actions (Make host, Remove with a message box, Restore from the Recycle Bin), the waiting queue note, `Lock new joins` check box (`host.cmd lock`), the Next player button, and Add-a-computer-seat later |
| **Invite a friend** | 520 by 560 | The QR (min 240 design px), the room code in 48 px, the link with Copy, a "Open a second screen" link (`/screen?room&key`), the remote-screen section when `remoteViews !== undefined`, a typed code field for pairing retry |
| **Playlists** | 480 by 380 | The three presets (quick, sports, race) plus Kiosk's list, the current queue, Run (emits `setup {playlist}` then `select`); reads `state.playlist`/`playlistIndex` (fixing the write-only dropdown) |
| **Records** | 520 by 400 | Recent rounds from `chonks.records.<code>`, verification labels, Save |
| **Settings** | 560 by 440 | Sound (volume, mute), TV scale (auto, 1, 1.25, 1.5, 2), safe area, Gentle effects, skin (Luna, Classic), mascot on or off, pointer speed, Kiosk and Party mode (PIN-gated), remote screens switch, diagnostics link |
| **My Games** | 640 by 460 | Explorer style: the task pane (Playlists, Records, Leaderboard, Random game) and an icon view of the 13 games with last scores and the leaderboard for the selected game |
| **Diagnostics** | 560 by 420 | Per-seat latency and device tier (from the `device` object), build id, room age, `GET /api/health`, the self-test link |
| **Recycle Bin** | 480 by 320 | Removed players and the ban timer; Restore |
| **Help and Rules** | 640 by 480 | How to join, the universal remote map, the game list with `verb` and `detail` |
| **Loading** | 420 by 220 | The game's header image, the mascot `airplane`, a progress bar (indeterminate; completes on `chonks:loaded`; remote gate text from `startReason`/`gate`) |
| **Message box** | 420 by auto | Icon, text, 1 to 3 buttons, default and cancel |
| **Attract / Scan to play** | 640 by 520 | Section 12.5 |
| **Staff** | 480 by 420 | Kiosk and staff controls: enter PIN, pin a game, skip, pause, lock, kick, mode switch; event counters from `host.cmd stats` |

## 16. Development and test aids

- **`?shell=os|classic`** chooses the client. **`?demo=1`** runs with no server on synthetic states from `demo-state.js` (empty room, three ready, a round in progress, results with a forfeit, kiosk attract, reconnecting), so every window can be developed, screenshotted and tested without a room.
- **`?debug=1`** draws: the navigation graph (focusable boxes and the scores to neighbours), the cursor positions, FPS, `--ui`, and the current scope.
- **`?scale=1.5`**, **`?skin=classic`**, **`?safe=5`** force settings for screenshot tests.
- Hooks for Playwright: every window root has `data-window`, every focusable has `data-nav` and a stable `data-id`.

## 17. Routing, switches and the legacy dashboard

**Decision (the owner left it to me): keep the old dashboard reachable.** Reasons: the event is 13 days away, a new shell can have a bug on the day, and the old page is a working safety net.

- `server.js` serves `public/os/index.html` at `/` by default after the shell is accepted; until then `/` stays the old page and the shell is at `/os`.
- The old page is reachable at **`/?shell=classic`** (and `/classic-dashboard`) at all times. It is **not linked** from the shell UI except the Staff window ("Switch to classic dashboard").
- Server change (tiny, outside the bundle hash): `app.get('/', ...)` chooses the file by query and environment `CHONKS_SHELL` (`os` or `classic`).
- Keep the legacy page frozen (bug fixes only). Remove it two weeks after the event if nothing needed it.

## 18. Performance and robustness

| Concern | Rule |
| --- | --- |
| Animated shell on the same machine as the game | The shell pauses all of its own animation, audio decoding and timers while `boot === 'game'` except the clock and the state feed |
| Memory | At most one game frame set alive; closing the game revokes `src` (`about:blank`) |
| Many state events | `state` arrives about every 400 ms; windows skip DOM writes when values did not change |
| Resize storms | `ResizeObserver` and `resize` are debounced to one frame |
| Long names or strings | Seat names are fixed today; every text node has `overflow: hidden; text-overflow: ellipsis` and a `title` |
| Lost connection | An XP-style modal "Connection paused. Keeping your party together…" with a spinner; closes itself on reconnect |

## 19. Accessibility

- Every control has a visible text label or `aria-label`; focus ring is 3 design px in `--focus`, offset 2; minimum target 40 design px.
- Seat identity is **shape and colour** everywhere; no information by colour alone.
- Title and body text meet 4.5:1 contrast; verified by the token test in [02](02-theme-and-assets.md).
- `prefers-reduced-motion` and Gentle effects set `--dur: 0`.
- A Classic (high-contrast) skin.
- The shell never traps keyboard focus outside dialogs and always allows Escape.
