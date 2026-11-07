# Build 05: fitting 13 games into any screen, and the changes each one needs

Part of the [build specification](README.md). Status: plan, 6 November 2026. From a static read of every game, the shared code and the host page on 6 November; **nothing was rendered in a browser**, so every "likely clipped" statement is a prediction that the viewport matrix test (section 8) must confirm or refute.

## 1. How a game is hosted today

- The host page gives a game an iframe whose size is the window width by the window height minus a toolbar of at least 74 px, with **no ratio control**; so any aspect is possible: about 1920 by 1006, 1280 by 646, 3840 by 2086.
- With several local views the iframe wrap is a CSS grid: 1 view is one cell, 2 views are two columns, 3 or 4 views are 2 by 2. On 16:9, two views are each about 0.95:1 (nearly square), and three or four views are each about 1.9:1.
- Iframes carry `allow="autoplay; fullscreen"`, no sandbox.
- **Three games are not iframes at all**: Star Catch, Bubble Burst and Neon Drift are simulated on the server and drawn by the host page with `PartyRenderer` on `#game-canvas`; their `games/*/index.html` is a 5-line redirect to `/?game=<id>` (iframing it would nest the host page in itself).
- Every game listens to `window` `resize`, and an iframe's window receives `resize` whenever its element box changes (including a grid reflow or fullscreen), so **`window.resize` is sufficient; a `ResizeObserver` is not required** inside games. (`PartyRenderer` uses a `ResizeObserver` on its canvas.)

## 2. The contract the shell gives and requires

| Rule | Detail |
| --- | --- |
| **An exact rectangle** | The shell sizes the game iframe (or the grid of iframes) to an exact CSS-pixel rectangle: the whole viewport in game mode (no taskbar, no toolbar), or the window's content box when windowed. |
| **A declared fit class per game** | `fit: 'fluid'` (fills any rectangle) or `'16:9'`, `'16:10'`, `'4:3'`. For a ratio class the shell sizes the **iframe** to the largest rectangle of that ratio that fits and centres it on a backdrop (letterbox), so the game never sees a shape it does not support. |
| **Where the fit map lives** | `public/os/game-fit.js` (outside the bundle hash, so adding it does not invalidate stored replays). It can move into `core/catalog.js` later. |
| **No scroll, no overflow** | The document inside the iframe has no scrollbars at any rectangle in the matrix; the viewport test asserts `scrollHeight <= innerHeight` and `scrollWidth <= innerWidth` for the document and for any element with `overflow: auto` (the scrollbars the audit found in `#overlay` and `#panel`). |
| **Text** | Shared HUD and menu text is **at least 16 CSS px at 1080p-equivalent** (`max(16px, 1.5vmin)`). |
| **Pixel budget** | One helper caps total backing-store pixels (section 5). |
| **Zero size** | A frame with a 0 by 0 viewport (a hidden iframe) must not throw or produce `NaN` cameras. |
| **Keys and fullscreen** | The shell reserves **Home / F10** only; games keep their own keys. Games must not call `requestFullscreen` in party mode. |

## 3. The fit class for every game, with the reason

| Game | Entry | Fit | Reason (from the code) |
| --- | --- | --- | --- |
| **Kart Rush** (`mario-kart`) | `index.html` | **16:9** | The HUD and menus are screenshot-relative and mix `vw`, `vh` and px; 3D with GTAO and bloom is sized from `innerWidth/innerHeight`; ultrawide and short windows can clip the intro. Letterboxing to 16:9 contains all of it. Split views then live inside a known frame. |
| **Time Trial** (`kart`) | `index.html` per seat | **fluid** | Camera has horizontal-plus behaviour; HUD pinned with px offsets |
| **Cloud Cruise** (`island-flyover`) | `index.html` per seat, `shared.html` | **fluid** | Same pattern |
| **Pocket Greens** (`golf`) | `index.html` | **fluid** | Same pattern; the power bar is a fixed 240 by 12 px (scale it) |
| **Slice Dojo** (`fruit-ninja`) | `index.html` | **16:9** | In party it forces `game.setAspect(16/9)` and maps the playfield across the whole window width, so ultrawide floats the field and splash text lands wrong |
| **Table Tennis** | `index.html` | **fluid** | Table fits horizontally; **verify at 4:3** |
| **Foam Fencers** (`swordplay`) | `index.html` | **fluid** | Same pattern |
| **Shooting Range** | `index.html`, `shared.html` | **16:10** (1.6:1) | The playfield is 1.6:1 and the canvas **crops** with `s = max(w/1.6, h/1)`, which loses edges at 21:9, at 4:3 and in near-square split cells; seats in a same-seed race would see different subsets. 16:10 removes cropping |
| **Alien Attack** | `index.html`, `shared.html` | **16:9** | Visible width varies with aspect (vertical FOV 64, lanes of plus and minus 12), so edge aliens can fall off narrow cells. Declare 16:9, or lock a minimum horizontal FOV and then allow fluid |
| **Drawing** | `index.html` | **fluid** (16:9 if strokes are shown on several screens) | Strokes are stored normalised but drawn with `vw` and `vh`, so shapes stretch with aspect; if the drawer's screen and a spectator's screen differ, strokes look different |
| **Star Catch, Bubble Burst, Neon Drift** | not an iframe | **fluid canvas slot** | The shell draws them in its own `<canvas>` with `PartyRenderer` (section 6) |

With the split-view games the fit class applies to **each cell**: the shell computes the cell rectangle and, for ratio classes, letterboxes inside the cell.

## 4. Split views and aspect

- **Kart Rush (internal split)** uses `core/viewports.js`, whose grid is fixed: 1 is 1 by 1; 2 is **two columns, one row** (always side by side, even in a near-square cell, giving 8:9 cells on 16:9); 3 or 4 is 2 by 2 (three views leave a **blank fourth quadrant**). Changes:
  1. Choose the 2-view layout from the container aspect: side by side if `aspect >= 1.2`, stacked otherwise.
  2. For 3 views, give the first view the top half and the other two the bottom, instead of an empty quadrant (an option; the blank quadrant can show the leader camera).
  3. Keep the per-view HUD container queries (`clamp(12px, 2cqw, 24px)`): raise the floor to 14 px (the HUD is read from a sofa).
- **Independent iframes** (Time Trial, Cloud Cruise, Shooting Range, Alien Attack, Slice race): the shell lays the cells itself with the same rule (stack when the container is narrower than 1.2:1; 2 by 2 for 3 or 4); the player badge is placed **inside** each cell at its top centre in the seat colour (replacing the fixed `%` offsets in `host.js:299-303`).
- **Letterbox and split together:** compute cells first, then letterbox each cell by the game's fit class.

## 5. The shared fixes (one change each, list in order of value)

| # | File and line | Change | Why |
| --- | --- | --- | --- |
| S1 | `games/shared/arcade-hud.css` (`#keys`, `#link` at :80-84, `.cta` :146, `header #hud` :187, `footer` :197, `.network-note` :156, compact overrides :208-212) | Set all to `max(16px, 1.5vmin)`; delete the 10 and 12 px overrides | HUD text is 11 to 14 px today |
| S2 | same file, `#overlay{overflow:auto}` (:113), `#panel{max-height:calc(100dvh-32px);overflow:auto}` (:117-119) | `overflow: hidden`, size panels in `vmin` | These produce scrollbars in short iframes |
| S3 | New `core/pixel-budget.js` | `dprFor(w, h, {cap = 2, maxPixels})` returns `min(devicePixelRatio, cap, sqrt(maxPixels / (w * h)))` with `maxPixels` = **4.2 M** for a single 3D view and **2.1 M per view** in split; apply to `renderer.setPixelRatio` in every 3D game, to `shooting-range/game.js:37`, `drawing/game.js:38`, and `games/shared/party-world-view.js:64` | 4K with DPR 2 is 33 M pixels; Kart Rush caps DPR at 1.6 with no pixel cap, and GTAO plus 4x MSAA multiply the cost |
| S4 | `games/shared/party-world-view.js:64-66` | Reassign `canvas.width/height` only when the size changes; today it reallocates every frame | A per-frame reallocation of a 4K canvas |
| S5 | `games/mario-kart/multiview.js:46-48` | `QualityGovernor.scale` **multiplies** the pixel-budget DPR instead of replacing it | The governor currently drops a 1.6 cap to at most 1.0, making hi-DPI soft |
| S6 | Zero-size guards: `mario-kart/game.js:98, 2093-2096` (`GTAOPass`, `WebGLRenderTarget`), `multiview.js:44`, `shooting-range/game.js:35-36`, `drawing/game.js:39-40` | `Math.max(1, ...)` | Mario-kart divides by 0 and sets `camera.aspect = NaN` in a hidden iframe |
| S7 | `games/shared/party-world-view.js:157, 177` | Compensate ship polygons and `fillText` for canvas aspect as `circle()` already does | They stretch at non-square aspects |
| S8 | `shared.html` in alien-attack, island-flyover, shooting-range | `body{overflow:hidden}`; `dvh` or `100%` instead of `100vh` | `100vh` overflows on mobile-like viewports and there is no overflow clamp |
| S9 | `core/viewports.js` | Aspect-aware 2-view layout; configurable 3-view layout | Section 4 |

## 6. Per-game changes

| Game | Change | Size | Event? |
| --- | --- | --- | --- |
| **Kart Rush** | (a) **In party mode hide `#lap-options` and the Start button** when `link.party` and read laps from `setup.laps` only (the in-frame lap buttons can override the lobby value and are not synced to the server; whether the replay verifier sees an in-frame lap change is **unverified**: remove the risk by removing the control); keep the driver (character) pick, which is per player. (b) In party mode do **not** call `requestFullscreen` on `F` (`game.js:2099-2107`): inside an iframe it fullscreens the iframe and covers the shell. (c) Make HUD sizes `vmin`-based and delete the duplicated `vw`, `vh` and px rules in `style.css:1315-1560`, **or** keep 16:9 and rely on the shell's letterbox (recommended: keep 16:9, delete only the sub-16 px fonts: `#item-caption` 8 px at :278, `#bottomline` 8 px at :628, `#drift-label` 8 px at :742, 9 to 11 px in `#topline`, `#home span`, `#track-label`, `.eyebrow`). (d) Guard against zero size (S6). (e) Minimap is a fixed 250 by 220 canvas: scale with `--hud-scale`. | M | Yes |
| **Time Trial** | S1, S3, S6; HUD offsets `left:28 / right:30` px become `vmin` | S | Yes |
| **Cloud Cruise** | S1, S3, S8 | S | Yes |
| **Pocket Greens** | S1, S3; the 240 by 12 px power bar scales with `vmin` | S | Yes |
| **Slice Dojo** | Declared 16:9; **verify `toWorld` and `toScreen` (`game.js:1033-1048`) use the letterboxed viewport**; with the shell letterbox the iframe itself is 16:9 so the mapping is right with no code change | none | Yes |
| **Table Tennis** | S1, S3; **verify the table fits at 4:3 and in a stacked cell** | S | Yes |
| **Foam Fencers** | S1, S3 | S | Yes |
| **Shooting Range** | Declared 16:10; no code change needed once the shell letterboxes (the `max(...)` crop never triggers); S1, S3, S6 | S | Yes |
| **Alien Attack** | Declared 16:9; later lock a minimum horizontal FOV; S1, S3 | S | Yes |
| **Drawing** | Scale canvas text with `vh` (`drawing/game.js:259, 265` use fixed `bold 14px` and `bold 24px`); S6; if several screens show strokes, switch to 16:9 | S | Yes |
| **Star Catch, Bubble Burst, Neon Drift** | No game change. The shell hosts them in its own canvas slot (below). `render.js` has fixed-px art (sprites capped at 48 px at :214, `700 11px` combo text at :296, strokes 2 to 5 px): make these scale with the canvas (`canvasHeight / 720`) | S | Yes |

### 6.1 The arena canvas slot

The shell's game window for the server games contains:

```text
<div class="arena" data-views="n">
  <canvas id="game-canvas"></canvas>          // PartyRenderer (ResizeObserver, dpr cap 2)
  <div class="arena-hud">…timer, scoreboard pills, instruction, countdown…</div>
</div>
```

`PartyRenderer` splits the canvas into n equal vertical lanes (4 players on 16:9 gives 4:9 lanes); it is acceptable as is, but the lane art scale must follow the lane size (above).

## 7. The host-side iframe rules the shell must keep

| Rule | Detail |
| --- | --- |
| **Tag the frames** | The `postMessage` check accepts a message only if `event.source` is one of the game iframes; the shell tags its frames with `data-game-frame` and checks that. |
| **`chonks:home` must not end a round on its own** | The games send it on **B or Esc** (via `goHome`) and on their home link; `host.js` turns it straight into `lobby`, ending the round for everyone. **The shell shows the pause menu instead** (Resume, End game for everyone: confirm) while a round is running; only in the results or lobby phases does it return to the desktop. |
| **Pointer shield** | While a window is being dragged, or the pointer is over a game frame, a transparent overlay above the iframes captures events, because the games use `cursor: none` and capture pointer events themselves. |
| **No fullscreen from inside** | Block `F` in Kart Rush (above). The shell's own fullscreen covers the whole page. |
| **Keys the games own** | Space, Enter (A), B, Esc (home), C and R (recentre), left and right arrows (sensitivity, `preventDefault`), D (debug); Kart Rush also uses Z, X, Shift, Space, F, C. The shell binds none of these while a game has focus. |
| **Gamepad** | The shell's gamepad poller is off while a game runs; the existing one clicks host buttons during games. |
| **Loading overlay** | Hidden on `chonks:loaded`; if it never arrives within 20 s show "This game is taking a while" with Retry (re-create the frame) and Back. |
| **View errors** | `chonks:error {message}` shows a message box and then `lobby`. |

## 8. The viewport matrix and the test

### 8.1 Viewports

| Name | Size | Why |
| --- | --- | --- |
| HD laptop | 1280 by 720 | smallest supported |
| Common laptop | 1366 by 768 | |
| Full HD TV | 1920 by 1080 | the booth |
| QHD | 2560 by 1440 | |
| 4K TV | 3840 by 2160 | pixel-budget stress |
| Ultrawide | 2560 by 1080 | 21:9 |
| Projector | 1024 by 768 | 4:3 |
| Short window | 1280 by 600 | the toolbar-less game area is short |
| Split cell | 960 by 1006 | the 2-view cell on 1080p (near square) |

### 8.2 What each run checks

For every game and viewport, once with 1 view and once with the maximum views the game supports: load; wait for `chonks:loaded`; then assert (a) no horizontal or vertical scrollbar in the document or any overflow container; (b) no element wider than the viewport; (c) the canvas box fills its letterboxed rectangle; (d) the smallest computed font among visible text nodes is at least 16 px at 1080p-equivalent (scaled by `viewport / 1080`); (e) no `NaN` in camera or canvas dimensions (console clean of errors); (f) screenshot saved for human review.

### 8.3 How to run it without phones

Use the existing fake-phone harness (`tests/party/harness.cjs`, `FakePhone`) to create a room and ready 1 to 4 phones, start each game, and drive Playwright (or any headless Chromium) against `/?shell=os&demo=0`. The pure checks (a), (b), (e) work headless; (c), (d) need layout, which headless Chromium has. Keep the screenshots as artefacts, not golden images.

## 9. Order of work for this area

1. S1, S2 (shared CSS), S6, S8 (fast, safe, event-critical).
2. The shell's letterbox and the fit map (`game-fit.js`); Kart Rush party-mode menu and fullscreen fixes.
3. The pixel-budget helper (S3, S4, S5).
4. The viewport matrix test and a fix pass on what it finds.
5. Aspect-aware split layout (S9), the arena font scaling, S7, Drawing text.
