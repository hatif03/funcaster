# Build 02: the Luna theme, every supplied asset, and the asset pipeline

Part of the [build specification](README.md). Status: plan, 6 November 2026. **Owner decision (6 November): use the supplied Windows asset pack (`assets/source/winxp`) as it is, without further questions, and use what has been added.** This document therefore specifies exactly how each supplied file is used. Machine-readable data from the indexing passes is in [data/](data/): `atlas.json` (131 sprite roles with coordinates, 9-slice insets and sampled colours), `atlas-report.md`, `icons-48.json` (133 named icons), `roles.json` (role to icon picks), `cursors.json`, `clip.json`, `sounds.json`, `fonts.json`, and the generator `tools/atlas-build.py`.

**Recorded once, not repeated:** the pack contains Microsoft artwork, sounds and fonts, so anything served from a public address carries that exposure; the owner has accepted it. To keep that decision cheap to reverse, the shell never names a file directly: it asks the **theme manifest** for a role (section 7), so swapping an asset is one line.

## 1. Skin decision: Luna blue

**Question asked:** what is the most recognisable Windows theme that also matches the product? **Answer: Windows XP "Luna" blue** (blue title bars, cream window faces, a green Start button, a blue taskbar). It is the single most recognised desktop of the era; its blue and green sit well against the wallpaper's sky and water; the green Start button is a natural primary call to action; and the supplied sprite kit is exactly this theme. Default skin is therefore **`luna`**. The grey **`classic`** skin (from the owner's reference screenshots `xp2.jpg` and `xp4.jpg`) is kept as the high-contrast and low-power option; **`taxi`** stays as a kaali-peeli paint job. The phone's default skin is also `luna` (a blue remote that matches the shell); the previous white remote stays as the `cream` option ([06](06-phone-remote-and-pointer.md) section 3).

## 2. What is in the pack and how each part is used

| Folder | Contents (measured) | Use in the build |
| --- | --- | --- |
| `Frame/UI Theme.png` | 1024 by 1024 sprite sheet, 131 labelled roles | Window frames, title bars, title-bar buttons, push buttons, check boxes, scrollbars, task buttons, the Start button (section 4) |
| `Icons/WinIcons_{16,32,48}.png` | 48 px: 20 by 20 cells; 32 px: 23 by 22; 16 px: 23 by 23; origin 0,0, no gaps; most icons come as a triplet (dithered, smooth with dark shadow, smooth with white halo): **use the smooth one** | System and shell icons (section 5); **none of the 13 games has a matching icon** |
| `Cursor/` | 216 PNG, 32 by 32, **no hotspots recorded**, non-3d sets are pure white on transparent (invisible on light UI) | Cursors with computed hotspots and generated black outlines (section 6) |
| `Clip/sheets` and `Clip/ase` | 25 animations, 240 by 240 frames, **12 to 145 frames each, per-frame timing 60 to 2,110 ms**, a yellow paper sheet inside each frame | The helper character until Chonk's art exists ([01](01-brand-and-rename.md) section 2.3) |
| `Sounds/` | 30 PCM WAV (1.78 MB), mostly 22.05 kHz mono; three byte-identical pairs; peaks from minus 0.2 to minus 24 dBFS | The cue set (section 8), gain-normalised |
| `Fonts/` | `tahoma.ttf` (2,036 glyphs, Regular only), `framdit.ttf` (Franklin Gothic Medium Italic, the Start button face) | UI text and the wordmark (section 9) |
| `Wallpapers/` | 21 PNG, 800 by 600 | **Not used.** The Mumbai wallpaper replaces them |
| `Logo/` | Windows logos and a boot screen | **Not used.** The brand is Funcaster. (The owner's decision to use the pack does not extend to showing another product's logos as ours.) |
| `Misc/mineswapper.png` | A game sprite sheet | **Not used** (could be a future easter egg) |
| `assets/source/wallpaper/mumbai-pixelated.png` | 1376 by 768, the wallpaper | The desktop (section 3) |
| `docs/references/ui/xp1.jpg to xp4.jpg` | 246 px reference screenshots | Reference only |

## 3. The wallpaper pipeline (`mumbai-pixelated.png`)

### 3.1 Measured problems and their exact boxes

| Issue | Where (source pixels, 1376 by 768) | Fix |
| --- | --- | --- |
| Baked clock "10:38" in the sky | Text bounding box **(1057,152) to (1130,177)**; patch box with 4 px margin: **(1052,147) to (1136,183)** | Replace the box with sky copied from the same rows at a horizontal offset of minus 110 px, i.e. source box **(942,147) to (1026,183)** (clean sky and cloud; verify by eye); feather a 2 px edge |
| Corner sparkle mark (a generator watermark) | About **(1296,690) to (1344,737)**, centred near (1320,712); patch box with margin: **(1290,682) to (1350,744)** | Replace with sea copied from the same rows at plus or minus 70 px horizontally, source box **(1220,682) to (1280,744)**; feather 2 px |
| Resolution | 1376 by 768 (ratio 1.7917 versus 16:9 = 1.7778) | Produce two masters (3.2) |
| Pixel look | The art's "pixels" are about 4 px blocks (the clock digits are 4 px strokes), i.e. a true low resolution of about 344 by 192 | Upscale in two steps (3.2) so pixel edges stay crisp at non-integer scales |
| Content under the taskbar | The bottom ~6% (the road and people) is covered | Keep key content above the lower 6%; the taskbar covers it by design |

### 3.2 Outputs

1. Clean the two boxes (above).
2. **Step A:** upscale with nearest-neighbour by 3 (to 4128 by 2304).
3. **Step B:** resample to the target with Lanczos: **1935 by 1080** (the cover size for 1080p: scale 1.4063, width 1935, crop 15 px at runtime with `object-fit: cover`) and **3870 by 2160** (for 4K).
4. Encode as **WebP, quality 90**: `assets/os/wallpaper/mumbai-1080.webp` (target under 1.2 MB) and `mumbai-2160.webp` (under 3.5 MB); keep a 1376 by 768 PNG as the source in `assets/source/`.
5. The shell chooses by `innerHeight * devicePixelRatio >= 1500 ? 2160 : 1080`, via `<picture>` or `image-set()`, with the flat sky colour `#a9e4f4` as the placeholder background.
6. CSS: `object-fit: cover; object-position: 50% 40%`. `image-rendering` is **auto** (the master is pre-scaled; `pixelated` would bring the shimmer back).

### 3.3 Layout over the picture

The landmarks (left to right at 1x): the Taj-style hotel dome and facade (x about 8 to 33%), the glass tower (32 to 44%), the Gateway arch (50 to 76%), the station building on the hill (76 to 96%), the bus bottom-left, the harbour bottom-right. **Desktop icons**: three columns at the **left** (x from 16 to 352 design px), which covers part of the hotel facade (accepted; the dome and the tower stay visible); **system icons** in one column at the **right edge** under the sky; the **mascot** bottom-right above the taskbar over the water. A Settings option **Icon placement** (left, top, right) is a later nicety. Icon labels: white 16 px text with a 1 px dark-blue shadow (the era's treatment) over a 40% black pill when over a busy part.

### 3.4 Later (P1/P2)

Dusk and night variants for attract mode; animated sprite layers (a bus crossing, boats bobbing, drones drifting) as transparent PNGs over the still; parallax from the pointer. These need layered art that does not exist yet.

## 4. The UI sprite sheet: from one PNG to usable CSS

`border-image` cannot take a sub-region of a sprite sheet, so the prep script **crops each labelled sprite to its own PNG** and generates a stylesheet.

### 4.1 The atlas (key roles; the complete list is in `data/atlas.json`)

| Role | Sheet x,y,w,h | Layout | 9-slice [l,t,r,b] |
| --- | --- | --- | --- |
| `window.frame.active` | 12,42,66,66 | 4-sided, 5 px border, fill `#efeee0` | [5,5,5,5] |
| `window.frame.opentop` | 12,122,66,66 | the frame without a top border (sits under a title bar) | [5,0,5,5] |
| `window.title.active` / `.inactive` | 83,393 / 83,422; 66 by 29 | top corners rounded (the standard caption) | [8,10,8,10] (scale X only; height fixed at 29) |
| `window.title.rounded.*`, `window.title.flat.*` | x=14 / x=152, same y | all corners rounded (tool windows) / square (maximised) | same |
| `window.border.left.*`, `window.border.bottom.*` | 221,393,5,31 / 229,393,49,5 | edge strips; mirror for the right edge and corner | [5,0,0,0] for the bottom |
| `titlebtn.{min,max,restore,close,help}.<state>` | x = 375, 399, 423, 447, 471; y = 236 + 21 by row; 21 by 21 | rows: normal, hover, pressed, disabled, inactive, inactive.hover, inactive.pressed, inactive.disabled | [4,4,4,4] |
| `button.{normal,hover,pressed,disabled,default}` | 375, 37 + 23k; 20 by 23 | push button, 1 px outline `#003c74` | [4,4,4,4] |
| `checkbox.*` (13 px) | 144, 42 + 13k; 13 by 13 | k = 0 to 11: unchecked, checked, mixed, each normal, hover, pressed, disabled; 16, 25 px and shadowed versions exist | none |
| `scrollbar.button.v/h`, `.arrow.left/right`, `.thumb.v/h` | see atlas | scrollbar parts (up and down arrows are missing: rotate the left and right arrows) | [4,4,4,4] |
| `taskbar.bar` | 375,519,50,28 | tile in X | [0,3,0,2] |
| `taskbar.task.{normal,hover,active}` | 460, 519 + 23k; 26 by 23 | task buttons | [4,4,4,4] |
| `start.{normal,hover,pressed}` | 497, 37 + 33k; 97 by 31 | green pill with **no label** (we draw the word and our own logo) | [6,6,14,6] |
| `taskbar.chevron.down` | 107,128,9,6 | combo-box arrow | none |
| `closebtn.mini.*` | 94,42 + 18k; 17 by 18 | balloon-style close | none |

**Missing from the sheet** (draw in CSS, section 4.3): radio buttons, tabs and tab pages, menus, progress bar, group box, tooltip, text-input border, slider, status bar, resize grip, the Start menu panel, the tray, a window shadow, the right and bottom frame edges (mirror the left and bottom strips), scrollbar up and down arrows (rotate the left and right ones).

### 4.2 Generation script and its output

`scripts/os-assets/prepare.py` (new; run locally; outputs are committed to `assets/os/`):

```text
for role in atlas.sprites:
    crop (x, y, w, h) from assets/source/winxp/Frame/UI Theme.png -> assets/os/ui/<role>.png     # lossless PNG
    for roles with a `states` pitch (titlebtn, button, checkbox, scrollbar, task, start) also write each state
emit assets/os/ui/luna-sprites.css:
    :root { --sp-window-frame-active: url(ui/window.frame.active.png); ... }
    .sp-window-frame-active { border-style: solid; border-width: 5px; border-image: var(--sp-...) 5 fill / 5px / 0 stretch; }
```

Rules: names use dots replaced by dashes in CSS; every sprite is used at **integer scale** where it is pixel art (title-bar buttons, check boxes, icons) and at **smooth scale** where it is a gradient (frames, title bars, buttons): `border-image-width` is the inset times `--ui` (so 5 px becomes 5 times `--ui`), with `image-rendering: auto`. `window.title` scales in X only, so the title bar is a `border-image` with slice `[8,10,8,10]`, `border-image-width` `calc(8 * var(--px)) calc(10 * var(--px))` and a fixed `height: calc(29 * var(--px))`.

### 4.3 CSS recipes for what the sheet lacks (colours from the atlas report; those marked * are standard Luna values, not sampled from this sheet)

```css
/* Tokens (assets/os/theme/tokens.css), section 10 gives the full set */
.xp-radio   { width: calc(13*var(--px)); height: calc(13*var(--px)); border-radius: 50%;
              border: 1px solid #1c5180; background: radial-gradient(circle at 35% 30%, #fbfbfa, #e2e2de); }
.xp-radio[aria-checked="true"]::after { content:""; position:absolute; inset:30%; border-radius:50%; background:#21a121; }
.xp-radio:hover { box-shadow: inset 0 0 0 2px #ffedc6, inset 0 0 0 3px #f9bb43; }

.xp-tab        { background: linear-gradient(#fff, #ece9d8); border: 1px solid #919b9c; border-bottom: 0;   /* * */
                 border-radius: 3px 3px 0 0; padding: 0 12px; height: calc(24*var(--px)); }
.xp-tab[aria-selected="true"] { border-top: 3px solid #ffc73c; /* * */ background: #fcfcfe; margin-bottom: -1px; }
.xp-tabpage    { background: #fcfcfe; border: 1px solid #919b9c; /* * */ padding: 16px; }

.xp-progress   { height: calc(18*var(--px)); background: #fff; border: 1px solid #686868; /* * */ padding: 2px; }
.xp-progress > i { display:block; height:100%; width: var(--p); background:
                   repeating-linear-gradient(90deg, transparent 0 2px, #fff 2px 3px),
                   linear-gradient(#8abc89, #41a041 50%, #44b644); }          /* green stops from the Start button */

.xp-group      { border: 1px solid #d0d0bf; border-radius: 4px; padding: 12px; position: relative; }
.xp-group > legend { color: #0046d5; padding: 0 4px; }                          /* contrast 6.3:1 on the face */
.xp-input      { border: 1px solid #7f9db9; background: #fff; }                 /* * */
.xp-tooltip    { background: #ffffe1; border: 1px solid #000; }                 /* * */
.xp-menu       { background: #fff; border: 1px solid #aca899; }                 /* * */
.xp-menu [aria-selected] { background: #316ac5; color: #fff; }                 /* 5.25:1 */
.xp-status     { background: #ece9d8; border-top: 1px solid #fff; }             /* * */
```

Scrollbars use the sprite parts and rotate the arrows with `transform: rotate(90deg)`.

## 5. Icons

### 5.1 How the icon sheet is read

`WinIcons_48.png` is a 20 by 20 grid of 48 px cells: **x = col times 48, y = row times 48** (cells (14,7) and (19,19) are empty). Most icons come in three renderings: a dithered 256-colour version, a smooth version with a dark drop shadow, and a smooth version with a white halo: **always use the smooth one** (the picks below are the smooth cells). The 32 px and 16 px sheets are in a different order; `data/icons-48.json` includes the pixel-matched 32 px cell for each icon (do not assume the same coordinates).

### 5.2 Role picks (row, col in the 48 px sheet; full alternates in `data/roles.json`)

| Role | Pick | Alternate |
| --- | --- | --- |
| My Games folder | 9,1 | 8,9 (no shadow) |
| Players and crew | 0,5 | 0,4 |
| Invite and network | 7,17 | 15,9 |
| Settings | 7,18 | 0,16 (gear) |
| Help | 19,10 | 8,12 |
| Records and history | 8,3 (document and clock) | 6,9 |
| Leaderboard | 14,11 (star) | custom trophy if wanted |
| Playlists | 16,5 | 17,7, 1,3 |
| Diagnostics | 0,18 (pie chart) | 19,9 (RAM chip) |
| Recycle Bin empty and full | 9,10 and 9,13 | 15,5 and 15,7 |
| Power and shut down | 9,4 | 11,6 |
| Lock | 11,0 | 10,19 |
| Volume | 1,3 (note and speaker) | none plain |
| Message: error | 7,4 (no-sign) | 17,16 (red X) |
| Message: info | 19,12 | 19,13 |
| Message: question | 19,10 | 19,11 |
| QR and camera | 4,5 | 4,6 |
| Remote screen | 18,0 (blue monitor) | 17,19 |
| Phone | 4,7 | 4,8 |

**Gaps to fill:** no warning triangle (the only "!" is a red badge on document icons): draw a yellow triangle in CSS or SVG; no trophy, joystick or plain speaker. **Avoid** the Internet Explorer "e", the Windows flag and the MSN butterfly (brand marks of other products).

### 5.3 The 13 game icons

No XP icon matches any game. **Rule:** a game icon is the game's own **card artwork** rendered into a square XP-style tile. The repository already has original SVG art for every game (`artwork(id)` in `public/party/art.js`, an SVG fragment drawn on a wide card with `color` and `bg` accents from `core/catalog.js`).

```html
<div class="game-icon" style="--bg:#ffe5d8;--c:#d74842">
  <svg viewBox="70 20 190 130" preserveAspectRatio="xMidYMid slice"> <!-- art(id) inner markup --> </svg>
</div>
```

```css
.game-icon { width: calc(48*var(--px)); height: calc(48*var(--px)); border-radius: calc(6*var(--px));
  border: 1px solid #003c74; background: linear-gradient(var(--bg), #fff);
  box-shadow: inset 0 0 0 1px #fff, 2px 2px 0 #00000040; overflow: hidden; }
.game-icon svg { width: 100%; height: 100%; display: block; }
```

Per-game `viewBox` crops are chosen once (a map `ICON_CROP[id]`) so the main subject (the kart, the fruit, the ball) is centred; the same art at full width is the header of the properties window. Custom backdrops from [xp-assets-and-licensing.md](../xp-assets-and-licensing.md) section 5 replace these when produced.

### 5.4 Sizes

Desktop icons: 48 px native (a 32 px icon is shown at 48 only if no 48 exists); Start menu rows: 32; tray and title bars: 16; large icon view in My Games: 48 at 1x. Drawn at integer scales (`k = round(ui * dpr)`) with `image-rendering: pixelated`.

## 6. Cursors

### 6.1 Facts

All 216 files are 32 by 32 RGBA with **no hotspot metadata and no .cur or .ani**; the sprites are not anchored at (0,0), so the hotspots were computed from the pixels (table below, and per file in `data/cursors.json`). **Every non-3d cursor is pure white on transparent**, invisible on a light face: the indexing pass generated **black-outlined copies** (`cursors-halo/`, 30 files). The coloured `3d*` sets (gold, cyan, white) are visible as they are but lack busy, link and scroll sprites.

### 6.2 The set to ship

Use the `_m` (medium, filled) sprites with the generated black outline. Hotspots (x,y within 32 by 32):

| Role | File | Hotspot |
| --- | --- | --- |
| arrow, help, working-in-background | `arrow_m`, `help_m`, `wait_m` | 3,6 |
| link hand | `link_m` | 8,1 |
| text beam | `beam_m` | 14,15 |
| busy | `busy_m` | 16,16 |
| move | `move_m` | 16,16 |
| resize N-S / W-E | `size4_m` / `size3_m` | 16,16 / 15,16 |
| resize NE-SW / NW-SE | `size1_m` / `size2_m` | 16,16 / 15,16 |
| not allowed | `no_m` | 16,15 |
| crosshair | `cross_m` | 15,16 |
| pen | `pen_m` | 3,4 (approximate) |
| scroll arrows | from `default_scroll_*` | centre |

**Halo generation** (in `prepare.py`): for each chosen PNG, dilate the alpha channel by 1 px (3 by 3 maximum filter), paint the dilated minus original area `#000000`, composite the original on top, save to `assets/os/cursors/<role>.png`.

### 6.3 Using them

For the **TV pointer cursors** (one per seat, drawn by `pointers.js`): the arrow at 2x or 3x (`image-rendering: pixelated`), a 3 px ring in the seat colour around the sprite's silhouette (CSS `filter: drop-shadow(0 0 0 colour)` stack, or a duplicated element behind), and a small seat-shape badge at the lower right. For the **real mouse** over the shell: `cursor: url(cursors/arrow.png) 3 6, auto`, and likewise per role; the hotspot goes in the CSS (`url(...) x y`). The game iframes keep their own `cursor: none`.

## 7. The theme manifest (the only place files are named)

`assets/os/theme/theme-manifest.json`:

```json
{
  "id": "luna",
  "wallpaper": { "1080": "wallpaper/mumbai-1080.webp", "2160": "wallpaper/mumbai-2160.webp" },
  "sprites": "ui/luna-sprites.css",
  "icons": {
    "sheet48": "icons/WinIcons_48.png", "cell": 48, "cols": 20,
    "roles": { "folder.my-games": [9, 1], "players.crew": [0, 5], "invite.network": [7, 17], "settings": [7, 18], "help": [19, 10],
               "records.history": [8, 3], "leaderboard": [14, 11], "playlists": [16, 5], "diagnostics": [0, 18],
               "recycle.empty": [9, 10], "recycle.full": [9, 13], "power": [9, 4], "lock": [11, 0], "volume": [1, 3],
               "msg.error": [7, 4], "msg.info": [19, 12], "msg.question": [19, 10], "qr": [4, 5], "remote.screen": [18, 0], "phone": [4, 7] }
  },
  "games": { "iconSource": "artwork(id)", "cropMap": "public/os/icon-crop.js" },
  "cursors": { "arrow": ["cursors/arrow.png", 3, 6], "link": ["cursors/link.png", 8, 1], "busy": ["cursors/busy.png", 16, 16],
               "text": ["cursors/beam.png", 14, 15], "help": ["cursors/help.png", 3, 6], "no": ["cursors/no.png", 16, 15] },
  "sounds": { "startup": "sounds/startup.ogg", "shutdown": "sounds/shutdown.ogg", "click": "sounds/click.ogg" },
  "fonts": { "ui": "fonts/tahoma-latin.woff2", "logo": "fonts/framdit-latin.woff2" },
  "mascot": "mascot/clippit.json"
}
```

Loading rule: `theme.js` reads the manifest once and exposes `asset(role)`; nothing else in the shell contains a path to the pack. A different manifest (`theme-original.json`) can replace every role later.

## 8. Sounds

### 8.1 The supplied files and their facts

30 PCM 16-bit WAV, 1.78 MB total. 22.05 kHz mono for most; Startup, Shutdown, Logon and Logoff are stereo; two are 44.1 kHz stereo. Three byte-identical pairs (Pop-up Blocked, Information Bar, Navigation Start equal XP Start). **Peaks range from minus 0.2 to minus 24 dBFS**, so every cue needs a per-cue gain.

### 8.2 The cue map (the shell's cue names to files; full notes in `data/sounds.json`)

| Cue (doc 03 section 13) | File | Length | Notes |
| --- | --- | --- | --- |
| `startup` | `Windows XP Startup.wav` | 4.8 s | First user gesture; duck other audio |
| `shutdown` | `Windows XP Shutdown.wav` | 3.2 s | |
| `logon` | `Windows XP Logon Sound.wav` | 2.2 s | Session start |
| `logoff` | `Windows XP Logoff Sound.wav` | 2.0 s | Session end |
| `click`, `open`, `menu` | `Windows XP Menu Command.wav` | 30 ms | XP has no window-open sound; reuse |
| `launch` | `Windows XP Start.wav` | 50 ms | Launching a game |
| `minimise` | `Windows XP Minimize.wav` | 0.5 s | |
| `restore` | `Windows XP Restore.wav` | 0.44 s | |
| `error` | `Windows XP Error.wav` | 1.0 s | Rejected action |
| `critical` | `Windows XP Critical Stop.wav` | 0.9 s | Fatal error, disconnect |
| `warning` | `Windows XP Exclamation.wav` | 0.96 s | |
| `ding` | `Windows XP Ding.wav` | 0.39 s | OK and info message boxes |
| `notify` | `Windows XP Notify.wav` | 1.1 s | Toast |
| `balloon` | `Windows XP Balloon.wav` | 0.14 s | Tray balloon, mascot bubble |
| `recycle` | `Windows XP Recycle.wav` | 0.52 s | Remove a player |
| `joined` | `Windows XP Hardware Insert.wav` | 0.83 s | A phone joined (rising) |
| `left` | `Windows XP Hardware Remove.wav` | 0.83 s | A phone left (falling) |
| `failed` | `Windows XP Hardware Fail.wav` | 0.83 s | Connection failed |
| `denied` | `Windows XP Pop-up Blocked.wav` | 0.17 s | Action refused |
| `finished` | `Windows XP Print complete.wav` | | A round finished |
| `invite` | `Windows XP Ringin.wav` / `Ringout.wav` | | Invite received or sent |
| `edge` | `Windows XP Default.wav` | 0.56 s | Navigation edge |
| `countdown`, `go`, `win`, `lose` | **not in the pack** | | Use the existing game cues (`core/audio.js` synth) or generate with the shell's synth |

### 8.3 Processing

`prepare.py`: read each WAV, measure the peak, apply a gain to reach **minus 6 dBFS** peak (never amplify noise above a limit of +12 dB), convert to **OGG Vorbis** (fall back to MP3 where `canPlayType` says no OGG; Safari supports OGG only recently, so **also write an AAC/M4A or MP3 copy**), keep stereo for the four long ones, mono for the rest; write `assets/os/sounds/<cue>.ogg` and `.mp3`. Target total under 800 KB. The loader decodes lazily: `startup`, `click` and `error` first.

## 9. Fonts

| Font | Use | Notes |
| --- | --- | --- |
| **Tahoma** (`tahoma.ttf`, Regular only, 2,036 glyphs) | All UI text | There is **no bold**: `font-weight: 700` gives the browser's faux bold, which smears at small sizes; avoid bold except in the title bar (where a text-shadow gives the XP look) and use size and colour for hierarchy. The XP caption face (Trebuchet bold) is not supplied: use Tahoma with 1 px dark text shadow |
| **Franklin Gothic Medium Italic** (`framdit.ttf`) | The wordmark, the Start button label, window titles optionally | The XP Start button face |
| Fallback stack | `"Tahoma XP", Tahoma, Verdana, "Hind", system-ui, sans-serif` | `Hind` is already bundled for Hindi and Devanagari text (Tahoma has no Devanagari) |

**Subset to fit the budget** (fonts must be under 200 KB together; Tahoma alone is 383 KB): `pip install fonttools brotli`, then

```text
pyftsubset tahoma.ttf  --unicodes=U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2022,U+2026,U+20B9 --flavor=woff2 --output-file=tahoma-latin.woff2
pyftsubset framdit.ttf --unicodes=U+0020-007E,U+00A0-00FF --flavor=woff2 --output-file=framdit-latin.woff2
```

(`U+20B9` is the rupee sign.) `@font-face { font-family: "Tahoma XP"; src: url(tahoma-latin.woff2) format("woff2"); font-display: swap; }`, and a size-adjust metric for the swap so the layout does not jump. Check that the supplied fonts render the characters we use (the rupee sign may be missing: the fallback covers it).

## 10. The complete token file (`assets/os/theme/tokens.css`)

```css
:root {
  /* Luna, sampled from the sprite sheet unless marked * */
  --lu-title-active: linear-gradient(#4198ff 0%, #0370ff 7%, #0058e8 14%, #0050e1 28%, #004fe4 45%, #0055f1 58%, #005efc 70%, #0166fe 80%, #005af8 92%, #0043cf 100%);
  --lu-title-inactive: linear-gradient(#99b3e9, #88aee9 20%, #7994de 50%, #81a8e9 85%, #7a92df);
  --lu-title-ink: #ffffff;       --lu-title-shadow: 1px 1px 0 #0a1f6b;      /* active title text; large text */
  --lu-title-ink-inactive: #000000;                                           /* 7.1:1 on #7994de; white is only 2.96:1 */
  --lu-frame-fill: #efeee0;      --lu-face: #efeee0;     --lu-face-alt: #f5f4ea;     --lu-track: #ebebe4;
  --lu-ink: #111111;             --lu-ink-soft: #4a4a58;                       /* 16.2:1 and 7.45:1 on the face */
  --lu-btn-outline: #003c74;     --lu-hover-ring: #f8b330;   --lu-default-ring: #89ade4;
  --lu-check: #21a121;           --lu-select: #316ac5;       --lu-select-ink: #ffffff;      /* 5.25:1 */
  --lu-taskbar: #2257d5;         --lu-task: #4085f5;         --lu-task-hover: #559df8;      --lu-task-active: #164dbc;
  --lu-start-1: #45b845;         --lu-start-2: #2c743a;      --lu-start-pressed: #178717;
  --lu-link: #0000ee;            --lu-legend: #0046d5;       --lu-danger: #c62f3b;
  --lu-tab-border: #919b9c;      --lu-tab-top: #ffc73c;      --lu-status: #ece9d8;          /* * */
  --lu-menu-border: #aca899;     --lu-input-border: #7f9db9; --lu-tooltip: #ffffe1;         /* * */
  /* seat identity (shipped tokens, unchanged) */
  --seat-peeli: #f7c600; --seat-magenta: #ef5da8; --seat-cyan: #4de2df; --seat-marigold: #ffad42;
  /* focus: a double ring that reads on the cream face, the blue title and the wallpaper */
  --focus: 0 0 0 2px #ffffff, 0 0 0 5px #111111;
  /* metrics at 1x (multiply with var(--px)) */
  --m-title: 29; --m-border: 5; --m-taskbar: 42; --m-icon: 48; --m-target: 40; --m-radius: 6;
  --dur: 120ms;
  --font-ui: "Tahoma XP", Tahoma, Verdana, "Hind", system-ui, sans-serif;
  --font-logo: "Franklin Gothic XP", "Franklin Gothic Medium", "Hind", sans-serif;
}
```

### 10.1 Contrast results (computed; the token test re-checks them)

| Pair | Ratio | Rule |
| --- | --- | --- |
| Ink `#111` on the face | 16.2:1 | body text |
| Soft ink `#4a4a58` on the face | 7.45:1 | secondary text |
| White on the selection blue `#316ac5` | 5.25:1 | menus, selected rows |
| White on title bar (mid `#0370ff` 4.41, dark `#0050e1` 6.49, bottom `#0043cf` 7.77, top `#4198ff` only 2.93) | **title text is 20 px or larger with the 1 px dark shadow, so it is "large text" (3:1) and the shadow secures it** | |
| White on the inactive title `#7994de` | **2.96:1 fails**: inactive title text is black (7.1:1) | |
| White on **task button** `#4085f5` (3.56), hover `#559df8` (**2.78 fails**), active `#164dbc` (7.44) | Task labels are **20 px bold-weight look with a 1 px dark shadow** (large text); the **hover state does not lighten the sprite** (use an inner 2 px white outline instead) | |
| White on the **Start button** green `#45b845` | **2.56:1 fails** at body size: the label "chonks" is 26 px with a 2 px dark-green shadow (large text and a strong outline); fallback if it reads poorly in the rehearsal: black text (8.2:1) | |
| Group legend `#0046d5` on the face | 6.34:1 | |
| **Previous focus colour `#ff9f1c`** on the face | **1.76:1 fails** (needs 3:1 for UI components) | **Replaced by the double ring** (white 2 px then black 3 px): visible on cream, blue and the wallpaper |
| Ink on seat colours (peeli 11.7, magenta 6.1, cyan 11.9, marigold 10.2) | pass | labels on seat chips are dark ink |

## 11. Credits and records

Every file copied from `assets/source/` is recorded in `assets/CREDITS.json` with: `file`, `author` ("NullTale pack; underlying artwork, sounds and fonts © Microsoft Corporation" for the Windows-derived files), `sourceUrl` ("https://nulltale.itch.io/"), `licence` ("unknown; used by owner decision of 6 November 2026"), `modified` (true where cropped, outlined, gain-adjusted or subset), `dateAdded`. The Credits page reads it. The Mumbai wallpaper is recorded as "supplied by the owner"; the generating tool and its terms are **not** recorded, by the owner's instruction.

## 12. What `scripts/os-assets/prepare.py` does, in order (one command, idempotent)

1. Create `assets/os/{ui,icons,cursors,sounds,fonts,wallpaper,mascot,theme}`.
2. Wallpaper: clean, upscale, encode (section 3).
3. UI sprites: crop 131 roles, write `luna-sprites.css` (section 4.2).
4. Icons: copy `WinIcons_48.png` (and 32, 16) and write `icons.json` from `data/icons-48.json` and `data/roles.json`.
5. Cursors: build the outlined PNGs and `cursors.json` hotspots (section 6).
6. Mascot: copy the 25 sheets, write `mascot/clippit.json` from `data/clip.json` (frames, `frameDurationsMs`, `emptyFrames`).
7. Sounds: normalise, convert, write the cue map (section 8).
8. Fonts: subset and write `@font-face` CSS (section 9).
9. Write `theme-manifest.json` (section 7) and update `assets/CREDITS.json` (section 11).
10. Print a size report against the budgets (wallpaper under 1.2 MB, fonts under 200 KB, sounds under 800 KB, shell total under 600 KB excluding the wallpaper) and fail if exceeded.

Python 3 with Pillow and numpy (both were present on this machine for the indexing pass), plus `fonttools` and `brotli` (to install) for the font subsets, and `ffmpeg` (not verified as installed) for audio. These are build-time tools; the Node repo and CI are unaffected because the generated outputs are committed.

## 13. Where every asset lives now, and the CraftPix packs

### 13.1 The move (6 November 2026; nothing deleted, nothing committed)

The owner asked for everything in `supply/` to be moved to an appropriate place. The repository already had a convention for this: its `.gitignore` says *"Asset source archives and alternate packs stay local"* and ignores `/assets/*` apart from an explicit whitelist. So raw sources go under `assets/source/`, small reference images under `docs/references/`, and generated, shippable output under `assets/os/`. **Update, same day:** the owner then asked for the assets to be **committed to GitHub** so the teammate has them, so `.gitignore` whitelists `!/assets/source/` and `!/assets/os/`, the server blocks `/assets/source` from being served, and `.dockerignore` excludes it from the image.

| Was | Now | In git? |
| --- | --- | --- |
| `supply/WinXp/` (the NullTale Windows pack: Clip, Cursor, Fonts, Frame, Icons, Logo, Misc, Sounds, Wallpapers, the `.url`) | `assets/source/winxp/` | Yes (6 November) |
| `supply/mumbai-pixelated.png` | `assets/source/wallpaper/mumbai-pixelated.png` | Yes (6 November) |
| `supply/craftpix-net-*.zip` (10 packs, kept as zips for provenance) | `assets/source/craftpix/` | Yes (6 November) |
| `supply/xp1.jpg` to `xp4.jpg` (the reference screenshots) | `docs/references/ui/` | Yes, when committed (4 files, 6 to 11 KB) |
| (generated by `prepare.py`) | `assets/os/**` (UI sprites, icons, cursors, sounds, fonts, wallpaper, mascot, pets, avatars, theme manifest) | Yes, when the owner asks for the commit |
| `supply/` | removed (it was empty) | |

Every path in this folder and in `plan.md`, `CLAUDE.md` and `AGENTS.md` was updated to these locations. `scripts/os-assets/prepare.py` reads only from `assets/source/` and writes only to `assets/os/`; it extracts any zip it needs into `assets/source/craftpix/_extracted/<pack>/` (ignored).

### 13.2 What the ten CraftPix packs contain (6 November) and the verdict

Each zip contains a `license.txt` or `Licens.txt` that holds **only the address** `https://craftpix.net/file-licenses/`; the terms themselves were not available to read, the owner has since confirmed that the licences allow free use (recorded in the credits as "CraftPix free-asset licence; owner confirmed free use"). Each zip also holds promotional coupon files and a font note (Future Millennium, Digital Disco, Dimbo from dafont); **those fonts are not shipped**.

| Pack | Contents | Sprite size | Verdict |
| --- | --- | --- | --- |
| **Street animals** (`610575`) | Dog, Dog 2, Cat, Cat 2, Rat, Rat 2, Bird (a dark crow-like bird, **not a pigeon**); sheets Idle (4 frames), Walk (6; rats 3), Attack, Hurt, Death; 37 PNG plus PSD | 48 by 48 (bird and rats 48 by 32) | **Use: "street pets"** (dogs, cats, the crow). Skip the rats. Use Idle and Walk only |
| **3 cyberpunk characters** (`856554`) | Biker, Punk, Cyborg with idle, run, jump, climb, attacks, hurt, death (12 sheets each) | 48 by 48 | **Use: seat avatars** (idle and run only) |
| **Townspeople, cyberpunk** (`481510`) | 12 characters with Idle (4 frames), Walk, Special; some have a smoking animation | 48 by 48 | **Use: one non-smoking character as the fourth seat avatar** (candidate: character 4, to confirm on the contact sheet); avoid the smoking ones |
| **City men** (`516149`) | 3 men: Idle, Walk, Run, Attack, Hurt, Dead | 128 by 128 | Later (resolution does not match the 48 px set) |
| **City trader** (`922426`) | 3 NPCs with Idle, Dialogue, Approval | 128 by 128 | Later (a possible host for the Help window) |
| **Industrial zone** (`314143`) | 81 tiles, 44 objects, 12 animated objects, 6 layered backgrounds, PSD | 32 px tiles; backgrounds 576 by 324 | Later: raw material for an Alien Attack or Neon Drift backdrop (needs composing) |
| **Urban shooter, top-down kit** (`942642`) | 527 PNG: 257 city tiles, 189 UI pieces, enemies, characters; 550 MB unpacked | 32 px | Not used now (could feed a Shooting Range backdrop later) |
| **Urban zombie survival kit** (`794432`) | Characters, enemies, a city tileset, UI | 32 px | **Not used**: zombie and gunplay theme is not ours |
| **Homeless character sheets** (`724171`) | 3 characters with a full action set | 128 px | **Not used**: not appropriate as game characters at a public Mumbai event |
| **Cartoon market tileset** (`434146`) | Vector-style assets (EPS, AI, PNG), canopies, building parts, backgrounds 1,334 by 750 (the two checked are forest silhouettes, not a market); 156 MB unpacked | 128 to 256 px pieces | **Not used**: the backgrounds do not match the brief and the vector style clashes with the pixel UI |

The packs are kept (as zips) for later use; "not used" means not used in this build.

### 13.3 How the chosen packs are used

**Street pets** (`public/os/shell/pets.js`, a small ambient feature, full build level, off in games):

- Species: dog, dog 2, cat, cat 2, crow. At most **two pets** at once, chosen at random per session.
- They walk along the **top edge of the taskbar**: Walk sheet at 40 design px per second, then Idle for 2 to 6 seconds, turn at the screen edges. The crow hops and idles. **Idle and Walk only** (no attack, hurt or death animations).
- Drawn with `image-rendering: pixelated` at an integer pixel scale (`k = max(2, round(2 * ui * devicePixelRatio))` device pixels per source pixel, so a 48 px frame is about 96 to 144 design px square, the animal itself about half that).
- Timing: the packs carry no timing; use 120 ms per frame.
- Settings toggle **Street pets** (on by default in Party mode, on in attract mode, off during a game and under Gentle effects, which shows a static idle frame).
- A pointer click or A on a pet makes it sit and look at the cursor (Idle). Nothing else.

**Seat avatars** (the XP "log on" idea: every user tile has a picture):

- The four seats get fixed avatars: **Biker**, **Punk**, **Cyborg** and the chosen **townsperson**, drawn from the Idle sheet (4 frames at 120 ms) at 3x to 4x integer scale.
- Where: the **Who's playing?** tiles, the Players window rows, the Results ranking (the winner uses the Run sheet), and the tray tooltips.
- **Seat shape and colour remain the primary identity** (they are the accessible, colour-blind-safe identity used everywhere else); the avatar is decoration beside them.

**Not in this build:** pedestrians walking across the wallpaper. The wallpaper's own people are about 12 wallpaper pixels tall on 4 px blocks, whereas these sprites are about 30 sprite pixels tall: placed over the wallpaper they would look sharper than the scene. Revisit with a scale experiment after the event.

### 13.4 Extraction and credits

`prepare.py` additions (task AS4 in [07](07-schedule-tests-runbook.md)): unzip the three packs used (street animals, 3 cyberpunk characters, townspeople) into `assets/source/craftpix/_extracted/`; copy the chosen sheets to `assets/os/pets/<species>-<idle|walk>.png` and `assets/os/avatars/<name>-<idle|run>.png`; write `assets/os/pets/pets.json` and `avatars.json` with `frames = width / 48` (32 for the bird and rats) and 120 ms timing. `assets/CREDITS.json` gets one record per used pack: `author` "CraftPix.net", `sourceUrl` "https://craftpix.net/file-licenses/", `licence` "CraftPix free-asset licence; owner confirmed free use, 6 November 2026", `modified` false (true if recoloured), `dateAdded` 2026-11-06.
