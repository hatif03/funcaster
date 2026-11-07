# Build 06: the phone: one tap, one remote, the retained pointer, sensor tiers

Part of the [build specification](README.md). Status: plan, 6 November 2026. It turns [phone-controller-v2.md](../phone-controller-v2.md) into an implementation spec and applies the owner's decisions of 6 November: **keep the previous pointer (the "moving probe") for the shell; base the universal remote on the previous controller face with a skin change; the name stays Funcaster.** Grounded in a read of `public/party/phone.js`, `public/controller.html`, `public/classic-controller.html`, `public/controller.js`, `core/pointer.js`, `core/channel.js`, `public/menu.js`, `server/party.cjs` and `tests/party/harness.cjs`. Nothing was run on a real phone.

## 1. Decisions in force

| Decision | Detail |
| --- | --- |
| **The pointer is kept** | "The previous GPS-like moving probe" is the Wii-menu pointer: `core/pointer.js` (class `Pointer`: rate-based gyro aiming with a learned per-device axis map, display lead, recentre), used by `core/channel.js` and `public/menu.js` (a hand cursor per phone). It drives the shell's cursor. The party phone currently sends only calibrated `x, y`, so the raw-sample stream must be added (section 6). |
| **Chassis = the previous controller face, re-skinned** | The white slab, cross D-pad, A, B trigger, minus, home, plus, 1, 2, speaker grille, power lamp and seat LEDs from `classic-controller.html` become the universal remote. Brand, colours and proportions are ours; nothing else changes (the owner: "you basically give it a skin change"). |
| **One remote for every game** | The remote never changes; games assign meanings (captions) and the context window shows the one thing that changes. Per-game mapping stays as in [phone-controller-v2.md](../phone-controller-v2.md) section 5. |
| **One-tap gate, capability probe, four tiers** | As in v2 sections 3 and 7, specified in code terms below. |
| **Name** | Wordmark "chonks" ([01](01-brand-and-rename.md)). |
| **Default skin** | **`luna`**: a Luna-blue body with white buttons and a green Home button, matching the shell. **Not white** (owner, 6 November). The previous white remote is kept only as the `cream` option, alongside `taxi` and `classic`. |

## 2. Reuse map: previous controller to new chassis

Facts from the audit of `classic-controller.html` (348 lines): lines 10 to 266 are one inline `<style>` (about 257 lines); the remote markup is lines 272 to 314; there is **no inline JS** (behaviour is in `controller.js`, 665 lines). It uses almost no CSS variables (only `--remote-vh`, `--remote-width`, `--remote-height`, `--remote-angle`, `--remote-scale`, set by JS) and **every colour is a hex literal**.

### 2.1 Files

| New file | Content |
| --- | --- |
| `public/party/remote.css` | The chassis CSS from `classic-controller.html:11-266`, with every hex literal replaced by a variable (section 3), **every selector scoped under `.remote`** (the original has global rules that would clobber `party.css` and `phone.css`: `html,body{overflow:hidden;touch-action:none}`, `button{border:none;background:none}`, `*{box-sizing}`, and generic class names `.hide`, `.dot`, `.muted`, `.pill`, `.num`, `.sp`, `.dp`), and a `[data-posture="sideways"]` block that replaces the legacy `.wheel-mode` rules |
| `public/party/remote-skins.css` | `[data-skin="luna" \| "luna" \| "taxi" \| "classic"]` variable sets (section 3.2); replaces the single `--shell` override in `arcade.css:355-360` |
| `public/party/phone.css` (existing) | Keeps dialogs, views and the settings dialog; loaded after `remote.css` |
| `public/controller.html` (edited) | The skeleton in section 2.2 |
| `public/controller.js` (legacy) | **Stays** for `classic-controller.html`; its useful pieces are ported (section 7) |

### 2.2 Markup skeleton for `controller.html` (keep every id `phone.js` reads)

```html
<body class="phone-page" data-skin="cream" data-posture="pointer">
<div id="stage">
 <div id="remote" class="remote asleep">
  <div id="row-top">
    <button id="power" aria-label="Link status"></button>
    <div id="brand">chonks</div>
    <div id="seat-lamp" class="leds" aria-label="Your seat">
      <i data-seat="0"></i><i data-seat="1"></i><i data-seat="2"></i><i data-seat="3"></i>
    </div>
  </div>
  <section id="screen" class="context-window" aria-live="polite">
    <!-- #join-view, #waiting-view, #play-view live here unchanged:
         #phone-title, #phone-hint, #motion-pad, #guess-panel, meters, #rotate-phone ... -->
  </section>
  <div id="dpad"><button class="dp u" id="dp-up"></button><button class="dp l" id="dp-left"></button>
    <span class="dp c"></span><button class="dp r" id="dp-right"></button><button class="dp d" id="dp-down"></button></div>
  <button id="btn-a" data-caption=""></button>
  <button id="btn-b" data-caption=""></button>
  <div id="row-mid"><button class="pill" id="btn-minus"></button><button class="pill" id="btn-home"></button>
    <button class="pill" id="btn-plus"></button></div>
  <div id="speaker" aria-hidden="true"><i></i>×20</div>
  <div id="ones"><button class="num" id="btn-1" data-caption=""></button><button class="num" id="btn-2" data-caption=""></button></div>
 </div>
</div>
<dialog id="settings"> ...unchanged... </dialog>
```

**Ids that `phone.js` queries** (these must survive; the full list from the audit): identity and status: `seat-lamp`, `phone-status`, `connection-detail`, `player-identity`, `play-identity`, `phone-score`, `phone-phase`; copy: `phone-title`, `phone-hint`, `join-title`, `join-description`, `join-error`, `browser-coaching`, `personal-best`; views and controls: `join-view`, `waiting-view`, `play-view`, `code-form`, `code-input`, `enable`, `touch-mode`, `recover-connection`, `queue-position`, `queue-leave`, `recenter`, `tune`, `leave`, `switch-mode`; game controls: `classic-action`, `pulse`, `gas`, `brake`, `boost`, `gas-label`, `gas-hint`, `boost-label`, `boost-left`, `boost-recharge`, `boost-recharge-fill`, `driver-choices`, `driver-left`, `driver-right`, `driver-name`, `wheel-controls`, `steering-dot`, `touch-steer`, `touch-steer-wrap`, `rotate-phone`, `rotate-touch`; motion surface: `motion-pad`, `motion-dot`, `pad-caption`, `phone-countdown`, `calibration-track`, `calibration-progress`, `sensor-message`, `retry-sensors`; drawing: `guess-panel`, `guess-form`, `guess-text`, `guess-note`, `secret-word`; settings: `settings`, `close-settings`, `settings-title`, `settings-description`, `settings-note`, `sensitivity`, `sensitivity-label`, `sensitivity-value`, `range-low`, `range-middle`, `range-high`, `reset-sensitivity`, `left-handed`, `phone-haptics`, `phone-sound`, `profile-name`, `remote-skin`, `large-targets`, `calm-phone`; others used by `phone-admin.js`: `phone-admin-open`, `settings`, `[data-staff-open]`. `phone.js` also toggles `body.wheel-mode`, `.left-handed`, `.feedback-pulse` and `dataset.skin`.

**Mapping of the previous remote's parts:**

| Previous | New role |
| --- | --- |
| `#gate` card ("Wake the remote", `#enable`) | The styling for `#join-view` (it already holds `#enable`): the one-tap gate |
| `#sheet` bottom sheet (status, legend, diagnostics) | Covered by `#connection-detail` and `#settings`; the legend becomes the **help** shown by button 2 |
| `#power` (red power button, blue link halo) | Link indicator: blue halo = linked, red = unreachable (`setNet`) |
| `#leds` (4 lamps, `.seek` pairing blink) | `#seat-lamp`: each lamp takes its **seat colour and shape**; "NEXT UP" (queued) uses the blink |
| `#speaker` (20 dots, `.talk`) | Pulses on feedback and plays the ported cues |
| `#btn-1`, `#btn-2` | Brake and Gas in sideways posture; recentre and help in pointer posture |
| 3D lean (`tick()` sets `rotateX/Y` from pitch and roll) | Optional skin flourish; **off in sideways posture** (the legacy wheel profile did the same) |

## 3. Skins

### 3.1 The variable set (about 14 variables replace the hex literals)

`--bg`, `--body-hi`, `--body-mid`, `--body-lo`, `--edge`, `--btn-hi`, `--btn-lo`, `--ink-icon`, `--power`, `--home-hi`, `--home-lo`, `--trigger-hi`, `--trigger-lo`, `--lamp-on`, `--gate-btn`. The previous values (read from the file) become the optional `cream` skin.

### 3.2 Skins

| Variable | `cream` (option: the previous white remote) | `luna` (**default**) | `taxi` | `classic` |
| --- | --- | --- | --- | --- |
| `--bg` | `#0d1424` | `#0a58d6` | `#111111` | `#008080` |
| `--body-hi / mid / lo` | `#fdfdfe / #eef1f5 / #e2e7ed` | `#6aa6ff / #3a82f2 / #1f5fcf` | `#ffd84a / #f7c600 / #e0b000` | `#e6e6e6 / #d4d0c8 / #c0bcb2` |
| `--edge` | `#cfd6de` | `#144aa8` | `#111111` | `#808080` |
| `--btn-hi / lo` | `#ffffff / #e9eef4` | `#ffffff / #dce8ff` | `#222222 / #111111` | `#ffffff / #d4d0c8` |
| `--ink-icon` | `#55708e` | `#0a3a8c` | `#f7c600` | `#000000` |
| `--power` | `#e0314b` | `#e0314b` | `#e0314b` | `#c62f3b` |
| `--home-hi / lo` | `#4a5560 / #39424c` | `#3fa13f / #1f7a1f` | `#111111 / #000000` | `#808080 / #606060` |
| `--trigger-hi / lo` | `#a7b0ba / #8a939d` | `#2a5fb8 / #1a438a` | `#444444 / #222222` | `#a0a0a0 / #808080` |
| `--lamp-on` | `#45c1ff` | `#ffd84a` | `#ffffff` | `#00ff00` |
| `--gate-btn` | `#2f7de1` | `#0a58d6` | `#111111` | `#000080` |

The wordmark is the text node `chonks` in the supplied Franklin Gothic Medium Italic (`@font-face` to `assets/os/fonts/framdit.ttf` converted to WOFF2). The existing in-code skins (taxi, bus, local) map to `taxi`, `luna` (bus) and `classic` (local) so a saved preference keeps working: map the old `remote-skin` values once.

## 4. Postures, captions, and button roles

### 4.1 Postures

`document.body.dataset.posture` is `pointer` (portrait, held upright: shell navigation and all non-wheel games) or `sideways` (landscape, two hands: the three racing games). Set in `render()` in place of `classList.toggle("wheel-mode", wheel)` (`phone.js:530`):

```js
const racing = isWheel() && ['classic','practice','countdown','playing'].includes(state.phase);
document.body.dataset.posture = (racing && landscape() && !pointerOn()) ? 'sideways' : 'pointer';
```

`!pointerOn()` matters because `state.game` persists into the lobby: after a kart game the lobby would otherwise stay "sideways". Portrait racing (a rotation-locked iPhone) uses the `pointer` posture with the pedals as a bottom row (the v2 section 3.5 rule); if device tests show calibration fails in portrait, restore the "turn your phone" card for that case only.

### 4.2 Roles

| Button | `pointer` posture | `sideways` posture |
| --- | --- | --- |
| **A** (`#btn-a`) | Primary action: Fire, Strike, Power return, Take shot (golf address and release keep the existing flow at `phone.js:928-964`), Pen, Confirm; in the shell: click | **Boost** (`#boost`) |
| **B** (`#btn-b`) | Back, cancel; in the shell: back | Look back where the game has it |
| **1** (`#btn-1`) | Hold 650 ms: recentre (`holdButton`, `phone.js:1101`) | **Brake** (`#brake`) |
| **2** (`#btn-2`) | Help sheet (the legend) | **Gas** (`#gas`), also confirm during setup (`phone.js:982-986`) |
| **D-pad** | Menu directions; Kart Rush driver select is left and right (`driver-left` and `driver-right`, server maps to `left` and `right`) | Same |
| **minus, plus** | Sensitivity (`setSensitivity`, `phone.js:94`) | Same |
| **Home** | Tap: party menu; hold 0.8 s: leave confirmation; hold 1.8 s: leave | Same |

In sideways posture the existing `#brake`, `#boost`, `#gas` elements **are** buttons 1, A and 2: keep them (the `DriveControls` pointer capture, `.pressed`, the disabled logic at `phone.js:598-605` and the `boost-recharge` bar stay), and place them with grid areas:

```css
.remote[data-posture="sideways"] {
  display: grid;
  grid-template-columns: 1fr 1.6fr 1fr 1.3fr 1.3fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "lamp  screen screen screen brand"
    "dpad  screen screen screen  .   "
    "dpad  mid    one    boost  two  ";
}
```

(tune in a browser; targets: A at least 96 px, 1 and 2 at least 72 px). The **legacy wheel profile's counter-rotation of the portrait face is dropped**: it kept the portrait face and did not enlarge buttons, and the sideways grid supersedes it. The legacy labels were A=DRIFT, 1=BRAKE, 2=GAS/OK and D-pad right=ITEM; party racing has no drift, so A becomes Boost.

### 4.3 The caption system

```js
// Writes captions, disabled and hidden states; called from render()
function paintButtons(map) {              // map: { A:'Fire', B:'Back', '1':'Recentre', '2':'Help', minus:'Slower', plus:'Faster' }
  for (const [name, el] of buttons) {
    const c = map[name];
    el.dataset.caption = c ?? '';
    el.disabled = !c;                     // dimmed, never removed
    el.classList.toggle('is-idle', !c);
  }
}
```

CSS shows the caption with `content: attr(data-caption)` below or on the button, replacing the legacy hard-coded `::after` labels. Existing computed strings (`gas-label`, `boost-label`, `boost-left`, `classic-action` text) are rerouted into the map rather than inventing copy. The per-game caption table is in [phone-controller-v2.md](../phone-controller-v2.md) section 5.

### 4.4 The context window

`#screen` hosts the existing views. It shows, per game and phase: the title and hint, the motion pad or the steering meter, the golf power meter and wind line, the guess box or palette (drawing), the boost stock. Minimum height 40% of the remote in pointer posture; it collapses first on small phones (320 by 568).

## 5. The one-tap gate and the capability probe (code level)

### 5.1 The gate

`#join-view` is the gate. `#enable` is **not disabled** while the seat is being accepted: a tap queues until the seat is ready (today the button is `disabled` until accepted, `phone.js:224`, and an early tap does nothing). The handler runs this order:

```js
async function startPlaying() {                   // inside the click handler
  // 1. motion permission, synchronously collected, both APIs where present
  const asks = [];
  for (const E of [window.DeviceOrientationEvent, window.DeviceMotionEvent])
    if (E && typeof E.requestPermission === 'function') asks.push(E.requestPermission());
  // 2. audio context (also unlocks the speaker cues)
  audio = audio || new AudioContext(); audio.resume();
  // 3. wake lock (re-acquire on visibility)
  keepAwake();
  // 4. fullscreen where allowed, hide nav bar on Android
  if (document.fullscreenEnabled) { try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch {} }
  // 5. orientation lock after fullscreen succeeded, for the current game's default posture
  try { await screen.orientation.lock(defaultPostureFor(state.game)); } catch {}
  // 6. wait for permissions, then run the probe and join with the device object
  const results = await Promise.allSettled(asks);
  const denied = results.some(r => r.status === 'rejected' || r.value !== 'granted');
  const device = await probe({ denied });
  socket.emit('device', device);                  // new, section 8
  denied ? useTouchTier(device) : beginCalibration();
}
```

Constraints (from the study): `requestPermission` must be called synchronously inside the tap, before any `await`; iOS counts `touchend` or `click`, not `touchstart`; steps 4 and 5 are best effort and **never block play**; iPhone has no web fullscreen and no orientation lock, so those calls simply fail quietly. Call `requestPermission` whenever the function exists on any platform (Chrome is adding it).

### 5.2 The probe (about one second, silent)

```js
async function probe({ denied }) {
  const ua = navigator.userAgent;
  const inApp = /Instagram|FBAN|FBAV|Line\/|WhatsApp|Telegram|TikTok|Snapchat|Twitter|MicroMessenger|Messenger|; wv\)/i.exec(ua)?.[0] || null;
  const t0 = performance.now(); let n = 0, motionN = 0, gyro = false, gravityZ = null;
  const onO = (e) => { if (e.beta != null && e.gamma != null) n++; };
  const onM = (e) => { motionN++; if (e.rotationRate && e.rotationRate.alpha != null) gyro = true;
                       if (e.accelerationIncludingGravity) gravityZ ??= e.accelerationIncludingGravity.z; };
  addEventListener('deviceorientation', onO); addEventListener('devicemotion', onM);
  await sleep(1000);
  removeEventListener('deviceorientation', onO); removeEventListener('devicemotion', onM);
  const hz = Math.round(n / ((performance.now() - t0) / 1000));
  const platform = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios'
                 : /Android/.test(ua) ? 'android' : matchMedia('(pointer: fine)').matches ? 'desktop' : 'other';
  const haptics = 'vibrate' in navigator && platform === 'android' ? 'vibrate' : platform === 'ios' ? 'ios-switch' : 'none';
  const hasMotion = !denied && n > 5;                       // events actually arrived with non-null angles
  const tier = inApp ? 'C' : hasMotion ? ((platform === 'desktop' || /iPad|Tablet/.test(ua)) ? 'D' : 'A') : 'B';
  return { platform, tier, gyro: gyro && hasMotion, hz, haptics, fullscreen: !!document.fullscreenElement,
           standalone: !!navigator.standalone || matchMedia('(display-mode: standalone)').matches,
           touchMax: navigator.maxTouchPoints | 0, inApp, secure: isSecureContext };
}
```

Notes: the user agent is used **only** for in-app detection and the iOS and Android split; capabilities are tested by events. The gravity-sign probe (`gravityZ`) is recorded for diagnostics only because the code uses acceleration magnitude. The Generic Sensor fallback (the quaternion path at `phone.js:404-423`) is tried when no `deviceorientation` events arrive within 1.5 s, as today; **the legacy page's named errors** (`SecurityError`, `NotAllowedError`, `NotReadableError`) and its empty-event filtering are restored into that path (the party phone swallows errors silently).

### 5.3 Tiers and what they change

As in v2 section 7.2. In code: `tier B` and `C` start the touch pad immediately (`#touch-mode` path) with the gate showing one line ("Open in Chrome or Safari for motion" for C, with a copy-link button); `tier A` runs calibration; `tier D` runs calibration with a mouse-friendly pad. **A phone that fails the probe is in tier B within two seconds**, including wheel games held in portrait, which today skip the 5.5 s "no motion" hint (`phone.js:326`).

### 5.4 Page lock (CSS and JS, one block)

```css
html, body.phone-page { position: fixed; inset: 0; width: 100%; height: 100%; overflow: hidden;
  overscroll-behavior: none; touch-action: none; -webkit-touch-callout: none; user-select: none;
  -webkit-tap-highlight-color: transparent; }
button, .remote { touch-action: manipulation; }
.pad, #motion-pad, #gas, #brake, #boost, #touch-steer { touch-action: none; }
```

```js
addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (!e.target.closest('[data-scroll]')) e.preventDefault(); }, { passive: false });
history.pushState({ d: 1 }, ''); addEventListener('popstate', () => { history.pushState({ d: 1 }, ''); openPartyMenu(); });   // Android back = party menu
```

iOS edge-swipe back cannot be stopped; keep controls 24 px away from the screen edges (`env(safe-area-inset-*)` plus a 24 px minimum, including landscape: the current landscape override at `arcade.css:553-559` drops the bottom inset). One `theme-color` (the remote's `--bg`); remove the duplicate (`#f7f5ef` and `#0d1424` both exist today).

### 5.5 Installable app on iPhone (later, C5)

`/remote` page (start URL), `apple-mobile-web-app-capable`, status bar style `black-translucent`, `viewport-fit=cover`; asks for a room code or scans the TV's QR with the camera; then identical to `/controller`. The manifest `start_url` becomes `/remote` and gets an `orientation` hint. Walk-up players are never asked to install.

## 6. Pointer streaming (the retained "moving probe")

### 6.1 What exists

`Pointer` (`core/pointer.js`): constructor options `sensitivity` (1), `degPerScreen` (20), `aspect` (0.6), `deadzoneDps` (0.3), `fallbackDeadzoneDps` (4), `displayLead` (true), `overshoot` (0.15), `healTau` (1.2). Methods `update(sample, dt, now)` (dt in seconds, trusted only when 0 < dt < 0.1; `now` in ms), `sampleAt(now)` (call once per frame; integrates the rate, applies display lead, returns the position `{x, y}` in 0 to 1 with y down; freezes if `live` is false or the last packet is older than 250 ms), `recentre()`, `setViewport(w, h)`, `setFromMouse(nx, ny)`. Fields `live`, `pos`, `display`, `gyroTrusted`, `map`. It learns the gyro axis map per device by correlating true angular velocity from consecutive attitude matrices with the reported rotation rate (sign, scale and axis permutation, so degrees versus radians per second and mirrored axes are absorbed), and until it trusts the gyro it uses the smoothed ground truth, so directions are never wrong. Sensitivity is stored under `openwii.sensitivity.v2` (kept; one of the identifiers that never change, see [01](01-brand-and-rename.md) section 3).

**Input sample** (exactly): `{ quat:[x,y,z,w] }` (device to world, ENU) **or** `{ alpha, beta, gamma }` in degrees, plus optional `motion:{ rx, ry, rz }` (the legacy phone fills `rz = rotationRate.alpha`, `rx = .beta`, `ry = .gamma`). A third form `{ party:{ active, x, y } }` (x and y in minus one to one, already calibrated) maps straight to an absolute position: that is what a **touch-mode phone** sends. Without a gyro it works on orientation-derived rates with a wider dead zone.

**Not to reuse:** `GameLink` (`core/net.js`): it injects `arcade-hud.css`, registers as a game or screen, and sets `body.arcade-game`. `core/filter.js` (One Euro) is exported but unused; `core/calibration.js` is used only for sensitivity persistence.

### 6.2 What the party phone sends today and what must be added

Today: `input {x, y, pulse, gas, brake, boost, seq, sampledAt}` at about 33 Hz, and `action {...}` for discrete actions (only accepted in phase `classic`), and the phone **never reads `rotationRate`**. The server's whitelist and clamps are at `party.cjs:1310-1340` (`input`) and `1071-1126` (`action`); `relayClassic` (`174-208`) sends `{party:{...}}` as `orientation` to game screens only.

**New events (everything below is additive; game and Solo input paths stay untouched):**

| Event | From | To | Payload | Gate |
| --- | --- | --- | --- | --- |
| `pointer-mode` | the host (shell) | server | `{on: boolean}` | `onAdmin` (role host); sets `room.pointerMode` |
| `state.pointerMode` | server | everyone (inside `view()`) | `!!room.pointerMode && !!room.host && ['lobby','results'].includes(room.phase)` | computed; phones already receive `state`, so a reconnect is covered and no push event is needed |
| `pointer` | a phone | server | `{ q:[x,y,z,w] } or { a, b, g }`, optional `r:[rx,ry,rz]`, optional `seq` | role `player`, `room.host`, `pointerMode` true, seat not away; **not** gated on `ready` (that is grip calibration) |
| `pointer` (relay) | server | the host socket only | `{ slot, q or a/b/g, r, t }` | `ns.to(room.host).emit(...)`: addressed by socket id so players, displays and viewers never receive it; `slot` is the stable seat 0 to 3 (matches SEATS and COLORS), **not** `room.active` indices |
| `shell-button` | a phone | server | `{ button, pressed }` with `button` in `["A","B","home","1","2","minus","plus","up","down","left","right"]` | same gates; about a 30 ms floor |
| `shell-button` (relay) | server | the host socket only | `{ slot, button, pressed }` | |

**Validation (build a fresh object; never spread `d`):** `q` is 4 finite numbers with norm within 0.05 of 1; or `a, b, g` finite, clamped to `a` in 0 to 360, `b` in plus or minus 180, `g` in plus or minus 90; `r` is 3 finite numbers clamped to plus or minus 2000; optional monotonic `seq` in its own `p.pointerSeq` (the pattern at `party.cjs:1320`). **Rate:** `if (time - (p.lastPointer || 0) < 8) return;` (about 125 Hz), a per-socket timestamp as at `party.cjs:1325` (not `arcade.limit`, which counts per window). `room.pointerMode` is cleared in the host disconnect branch (`party.cjs:~1482`) and forced off when a round starts.

**Bandwidth:** about 70 bytes at 125 Hz is 8.75 KB/s per phone, about 35 KB/s for four.

### 6.3 Phone side

```js
const pointerOn = () => state?.pointerMode === true && identity && !identity.queued && started;
let rawOri = null, gyro = null, lastPtr = 0;
// in the deviceorientation handler (phone.js:359) and the Generic Sensor fallback (:413):
rawOri = q ? { q } : { a: e.alpha ?? 0, b: e.beta, g: e.gamma };
// in the devicemotion handler, BEFORE its early returns (phone.js:368):
if (e.rotationRate) gyro = [e.rotationRate.beta || 0, e.rotationRate.gamma || 0, e.rotationRate.alpha || 0];   // rx, ry, rz as controller.js:234-236
// event-driven emit like controller.js flush(), not in the 30 ms rAF loop:
function flush() {
  const now = performance.now();
  if (!pointerOn() || !rawOri || now - lastPtr < 8) return;
  if (socket.io.engine?.transport?.writable === false) return;
  lastPtr = now; socket.emit('pointer', { ...rawOri, ...(gyro ? { r: gyro } : {}), seq: ++pseq });
}
```

- **Do not send from `sensor()`**: its `if (isWheel() && !landscape()) return;` (`phone.js:344`) uses `state.game`, which persists into the lobby, so a last-played kart game would silently block pointer samples held in portrait.
- **Touch tier:** send `pointer {x, y}` from the drag pad instead; the host wraps it as `{party:{active:true, x, y}}`.
- **Buttons:** the chassis buttons emit `shell-button` while `pointerOn()`; a 650 ms hold of 1 emits `shell-button {button:"1"}`, which the shell treats as `recentre()`. When `pointerOn()` is false the same buttons do their game roles.
- The `input` stream may continue; the server ignores it outside games.

### 6.4 Host (shell) side

```js
// pointers.js
const seats = new Map();      // slot -> { ptr: new Pointer({ aspect: innerHeight/innerWidth, degPerScreen: 20 }), last: 0, el }
socket.on('pointer', (s) => {
  const e = seatFor(s.slot); const now = performance.now();
  const dt = (now - e.last) / 1000; e.last = now;
  const sample = s.q ? { quat: s.q } : (s.x != null ? { party: { active: true, x: s.x, y: s.y } }
                                                    : { alpha: s.a, beta: s.b, gamma: s.g });
  if (s.r) sample.motion = { rx: s.r[0], ry: s.r[1], rz: s.r[2] };
  e.ptr.update(sample, dt, now); e.ptr.live = true;
});
socket.on('shell-button', ({ slot, button, pressed }) => route(slot, button, pressed));
function frame(now) {
  for (const [slot, e] of seats) {
    if (now - e.last > 500) e.ptr.live = false;
    const p = e.ptr.sampleAt(now);                       // 0..1
    e.el.style.transform = `translate3d(${p.x * innerWidth - TIP_X}px, ${p.y * innerHeight - TIP_Y}px, 0)`;
    e.el.classList.toggle('idle', now - e.last > 3000);
  }
  requestAnimationFrame(frame);
}
```

- `setViewport(innerWidth, innerHeight)` and `aspect = innerHeight / innerWidth` (0.5625 on 16:9; the default 0.6 is a 16:10 guess) on every resize.
- **Hit-testing** replaces `menu.js`'s `hitTest` with `document.elementFromPoint(x, y)` (the cursor layer has `pointer-events: none`), toggling `.hover` on the closest `[data-nav]`; magnetism within 28 px (doc 03 section 9.6).
- **Click:** `shell-button A pressed` calls `.click()` on the hovered or magnet element and plays the cue. B, Home, 1, 2, plus and minus follow doc 03 section 9.3.
- **Steering seat:** the delegated host seat (`state.hostSeat`) or, if none, the lowest ready seat; other seats' cursors are visible but A is inert unless a window is multi-seat (the Player setup window).
- **Cursor art:** the XP arrow from the pack (`default_arrow.png`, hotspot (0,0)) with a seat-colour ring and shape badge; a skin option uses the legacy glove (`public/assets/hand-p1.png`, 1024 by 1024, 1.4 MB: **re-export at 128 by 128 for the shell**; hotspot `HAND_TIP = {0.32, 0.09}` of the sprite).
- **Mode switch** with the D-pad (focus mode) is in doc 03 section 9.6.

### 6.5 Tests

- Extend `tests/party/harness.cjs` `FakePhone` (it has `sample()` at line 62) with `pointer()` and `button()`.
- Assert: the host receives `pointer` with the right `slot`; **a screen, a display, a viewer and another player receive nothing**; the throttle works (a burst of 50 samples in 100 ms yields at most 13); `NaN`, `Infinity`, out-of-range angles and wrong shapes are dropped; nothing is relayed when `pointerMode` is false (including in the `classic` phase and for an away seat); `pointerMode` resets on host disconnect and on round start; `shell-button` ignores unknown button names.
- Unit tests for `Pointer` exist (`core/core.test.mjs`, lines 144 to 501: spec, swapped-axis, rad/s, mirrored, garbage and no-gyro phones; flat, upright and landscape grips; stillness, recentre, packet loss; over-swing, drift healing; display lead). **There is no test for the `party` branch or `setFromMouse`:** add one for the touch tier.
- A shell test that feeds a recorded sample sequence into `pointers.js` and asserts the cursor ends within 20 px of the expected spot.

## 7. Porting the useful parts of the previous controller

| From `controller.js` | To |
| --- | --- |
| The synthesised swoosh, thud and click (`:43-95`) and `speakerTalk()` (`:91`) | `phone.js` feedback: pulse the speaker dots and play the cue when "Phone sound cues" is on |
| `lockUpright()` (`:396-419`: `requestFullscreen({navigationUI:'hide'})` then `screen.orientation.lock`) | The gate, steps 4 and 5 |
| `keepAwake()` | Already present in `phone.js:143-155` (fixed against the repeated-request finding) |
| Generic Sensor named errors, empty-event filtering, `deviceorientationabsolute` latching | The fallback path and the probe's diagnostics |
| `layoutWheelRemote()` (`:461-478`) | **Not ported** (the sideways grid replaces the counter-rotation) |
| `touchmove preventDefault` (`:654`) | Section 5.4 |
| The status and diagnostics sheet | The help sheet and the settings dialog's "Check my phone" |

## 8. Server changes for the phone (consolidated)

All in `server/party.cjs` (outside the bundle hash) unless noted.

1. `pointer-mode` admin event, `room.pointerMode`, `view().pointerMode` (computed), reset on host disconnect and on start.
2. `pointer` and `shell-button` handlers with the validation and relay above.
3. A `device` event: `{platform, tier, gyro, hz, haptics, fullscreen, standalone, touchMax, inApp, secure}` sanitised to enums and bounded numbers, stored on the player and exposed in `players[].device` inside `view()`; **never** forwarded to other phones.
4. Optional: accept `?pointer=1` on `/controller` for tests.
5. `server.js`: the `/` route switch and `/remote` page later; `/api/health` unchanged.
6. Environment: `CHONKS_REMOTE_VIEWS` first, then `CHONKS_REMOTE_VIEWS`.

## 9. Haptics, audio, feedback

- **Android:** `navigator.vibrate(pattern)`; patterns exist (`phone.js:101-129`).
- **iPhone:** no Vibration API. Best effort only, and **always** with the visual pulse and optional audio: a hidden `<label><input type="checkbox" switch></label>` whose `label.click()` produces a system haptic on recent iOS versions (reports differ; one tool page claims a later iOS release blocks scripted haptics: **unverified**, treat as a bonus).
- **Fix:** the "vibration" setting must not also disable the iPhone **visual** fallback (today it does, so an iPhone with vibration off gets no feedback at all).
- **Cues** (ported): swoosh, thud, click; the speaker dots pulse on every cue.
- **Messages the games send and the phone ignores today** (`controller-profile`, `bomb`, `miss`): handle `bomb` with the thud and a heavier pattern; leave `controller-profile` unused (the posture is decided by phase and the game's mode) and `miss` for later (the server's whitelist drops it).

## 10. Work breakdown (maps to the schedule)

| ID | Task | Size |
| --- | --- | --- |
| P1 | Page lock, theme-color, manifest start URL, safe areas, readable text, in-app list, portrait wheel hint, visual-feedback decoupling | S |
| P2 | `remote.css` and the skeleton with ids kept, scoped CSS, `luna` default skin and the `cream` option, lamp rendering fix (`phone.js:204-216`) | M |
| P3 | Captions and roles (`paintButtons`, posture), the sideways grid, the caption table for 13 games | M |
| P4 | The gate (one tap) and the probe, `device` event, tiers, gate copy | M |
| P5 | Server: `pointer-mode`, `pointer`, `shell-button`, `device`; tests | M |
| P6 | Phone: raw sample capture, `rotationRate`, event-driven flush, shell buttons, touch-tier pointer | M |
| P7 | Shell: `pointers.js`, cursor art, hit-test, magnetism, steering seat | M |
| P8 | Skins `luna`, `taxi`, `classic`; wordmark font; port the cues | S |
| P9 | Device matrix pass and fixes | M |
| P10 | Later: `/remote` installable page, swing input, haptic trick | M |
