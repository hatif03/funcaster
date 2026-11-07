# XP direction: assets, licensing, mascot and game backgrounds

> **Superseded in part, 6 November 2026 (later).** The owner decided to **use the supplied Windows pack as supplied, without further questions**, and **keeps the name Funcaster with a cat mascot, Chonk**. Section 1's licence gate, the two-build rule and the guard test are **no longer required**; the facts in that section (what the pack contains and who made it) remain true. The implementation of the asset work, with exact coordinates and scripts, is now in the [build specification](build/README.md), especially [build/02](build/02-theme-and-assets.md) and [build/01](build/01-brand-and-rename.md). This document remains the brief for **later production art**: custom mascot sheets and the 13 game backdrops.

Status: plan, 6 November 2026. Companion to [xp-console-ui.md](xp-console-ui.md) (the interface), [phone-controller-v2.md](phone-controller-v2.md) (the phone) and the [North star in plan.md](../../plan.md#north-star-and-direction-6-november-2026). This file answers three questions for the person adding assets: **what is in `assets/source/` and what may we ship**, **what do we still need to make**, and **what are the mascot and the 13 game backdrops**.

## 1. The finding that shapes everything: most of `assets/source/winxp` is Microsoft's work

`assets/source/winxp` is a pack by NullTale (the included shortcut points to `https://nulltale.itch.io/`). Looking inside it, the pack is made of **Microsoft artwork, sounds and fonts**, plus a UI sprite sheet that recreates the Luna look. Having it on disk is fine for private experiments. **Serving it from a public URL, a hosted instance, a booth screen that is photographed, a judging submission, or a public repository is not.** This is the same trap as the extracted Kart Rush pack, and the repository already carries one lesson about it ([plan-history.md](../../plan-history.md), assets section).

I could not read the pack's licence (there is none in the folder; the itch.io page was not consulted). Treat the licence as **unknown, and assume that the pack's rights cover only NullTale's own contribution, not Microsoft's underlying artwork**.

| Folder | What it holds | Origin as far as I can tell | Ship publicly? |
| --- | --- | --- | --- |
| `Icons/` (`WinIcons_16/32/48.png`, 23 x 22 grids) | The real Windows XP system icons, including Internet Explorer, Windows flag, MSN butterfly, My Computer, Recycle Bin, Control Panel | **Microsoft** | **No.** Redraw our own |
| `Cursor/` (216 PNGs: arrows, busy, help, resize, scroll, link) | The XP cursor scheme in several colour variants | **Microsoft** (shapes and animation frames) | **No.** Use our own SVG cursors |
| `Sounds/` (30 WAVs: "Windows XP Startup", "Logon", "Shutdown", "Ding", "Error", "Balloon", "Recycle", etc.) | The XP sound scheme | **Microsoft** | **No.** Synthesise our own |
| `Fonts/` (`tahoma.ttf`, `framdit.ttf`) | Tahoma and Franklin Gothic Medium Italic | **Microsoft / ITC**, commercial fonts | **No.** Use an open-licence font |
| `Logo/` (`WindowsLogo-small.png`, "Boot Settings Screen", Windows 2000 logo, two more) | The Windows flag and wordmarks, the XP boot screen | **Microsoft trademarks** | **No, and avoid anything that reads as Microsoft** |
| `Wallpapers/` (21 PNGs: Bliss, Autumn, Azul, Tulips, Stonehenge, etc.) | The XP wallpaper set | **Microsoft** (Bliss is a photograph licensed by Microsoft) | **No.** We use `mumbai-pixelated.png` instead |
| `Clip/` (25 Aseprite files, 25 sprite sheets of 33 frames, 240 x 240 each) | **Clippit**, the Office Assistant paperclip, animated | **Microsoft** | **No.** We make our own mascot (section 4), but copy the *format* |
| `Misc/mineswapper.png` | A Minesweeper sprite sheet | **Microsoft** | **No** |
| `Frame/UI Theme.png` (1024 x 1024) | A sprite sheet of Luna-style window frames, buttons, check boxes, scroll bars, title-bar buttons, taskbar pieces and the green Start button, with a "packed by @NullTale" tag and a tiny Windows flag | A **recreation of Luna**, by the pack author | **Probably not as is**: licence unknown, and it contains a Windows flag. Use as **reference for proportions and states** only |
| `xp1.jpg` to `xp4.jpg` | Four small (246 px wide) reference screenshots | Screenshots of XP, classic Windows and a teal classic desktop | Reference only, never shipped |
| `mumbai-pixelated.png` (1376 x 768) | The Mumbai pixel-art wallpaper | **Yours** (appears to be AI-generated; see section 3) | **Yes, after clean-up** |

### What the owner wants, and the line we draw

The owner wants the *experience* of Windows XP: the desktop, windows with title bars and a close button, a taskbar with a Start button, dialogs, property sheets with tabs, the cursor, the sounds, a helper character. **The experience is allowed; the specific artwork is not ours.** The widely used practice (browser desktop-simulator sites, open-source CSS recreations) is to recreate the layout and feel with **original or openly licensed artwork** and to avoid Microsoft's names, logos and files. We follow that:

- **No** Microsoft or Windows names, flag, wordmark, boot screen, Clippit, Bliss, XP icons, XP sounds, Tahoma or Franklin Gothic. We say "Funcaster" everywhere.
- **Yes** to the *conventions* (title bar with three buttons, task pane, tabs, a green start-style button, a taskbar with a tray and a clock).
- **Our own** palette and shapes inside those conventions, so it looks like a loving homage and not a copy. The Luna blue-and-green is a colour scheme and a layout; the pixels will be ours.

### The two-build rule (so work can start today)

Building with the supplied files is useful **now**, to prove layouts at pixel level. So we allow it **in a private build only**, behind a switch, and we make the swap checkable.

| Rule | Detail |
| --- | --- |
| `THEME_ASSETS=supply` | Dev and private rehearsal builds may load files from `assets/source/` through a single manifest, `assets/os/theme-manifest.json`, which maps each role (for example `icon.folder`, `sound.startup`) to a file |
| `THEME_ASSETS=original` | The default, and the **only** setting allowed for a deployed or public build. Every role in the manifest resolves to a file in `assets/os/` that we made or licensed |
| A guard test | A test (and the Docker build) fails if the public build references any path under `assets/source/` or any file whose hash is on a blocklist generated from `assets/source/winxp` |
| `assets/source/winxp` stays out of version control | **Do not `git add` it.** It is 91 MB, untracked right now, and committing it would repeat the history problem the plan already lists as an open item. Recommended: add `assets/source/winxp/` to `.gitignore` and to `.dockerignore`. Keep `assets/source/wallpaper/mumbai-pixelated.png` and the reference JPGs only if the owner is happy to have them in history |
| Credits | Every shipped asset is recorded in `assets/CREDITS.json` and shown on the Credits page, with the licence and where it came from |

This costs little: a role-to-file manifest is how the UI should be built anyway (it makes skins and the later creator themes possible).

## 2. What we need to make or source (the checklist)

Format notes: **PNG sprite sheets with a small JSON atlas** (or SVG where the art is vector), WebP for large backdrops, **OGG and MP3** for audio (WAV only for sources). Pixel art is shown with `image-rendering: pixelated` at integer scales. The first-load budget for the whole shell is **under 3 MB**; backdrops load lazily.

**Priority.** P0 = needed for 6 November event; P1 = needed for a complete release; P2 = later.

### 2.1 Interface art

| ID | Asset | Spec | Priority |
| --- | --- | --- | --- |
| U01 | **Window chrome**: title bar (active, inactive), frame, three title-bar buttons (minimise, maximise, close) in normal, hover, pressed, disabled | Prefer **pure CSS gradients and borders** (no bitmap); if bitmap, a 9-slice PNG at 1x and 2x | P0 |
| U02 | **Controls**: push button (normal, hover, pressed, focus, disabled), default-button halo, checkbox, radio, drop-down, tabs, list view, tree view, progress bar (blocks), scroll bar, slider, group box, status bar, tool tip, menu | CSS | P0 |
| U03 | **Start-style button** (green, rounded, with our logo and the word "Funcaster") in three states | CSS plus a small logo | P0 |
| U04 | **Taskbar** and **tray**: bar, task button states, a clock, volume, connection-quality, four seat lamps | CSS | P0 |
| U05 | **Start menu**: two-column panel, user header, "all games" flyout, footer buttons | CSS | P0 |
| U06 | **Task pane** (the blue panel on the left of explorer windows, with collapsible groups) | CSS | P0 |
| U07 | **Message-box icons** (info, warning, error, question) | 32 px, original | P0 |
| U08 | **Boot and logon art**: "Funcaster" logo, progress bar animation, "select who is playing" tiles | PNG or SVG | P1 |

### 2.2 Icons (original, three sizes each: 16, 32, 48 px)

At least **45**: the 13 games (one each, drawn to match their backdrops), My Games folder, Recent, Playlist, Leaderboard, Results (a trophy), Players / Crew (the four seat shapes), Invite a friend, Remote screen, QR code, Settings, Controller, Sensors test, Help, About, Credits, Creator Studio, Community Gallery, Network, Volume, Mute, Battery, Pause, Power / Shut Down, Folder (closed and open), Document, Error, Warning, Info, Check, Lock, Clock, Star, Heart, Search, plus the mascot head. **P0:** the 13 games, My Games, Players, Invite, Settings, Power, Help and the message-box set.

### 2.3 Cursors

Arrow, link hand, busy (our own spinner, not the hourglass), help, text, move, resize (4 directions), no, and a **large TV pointer** (48 px) in the four seat colours with their shapes. Provide as **SVG** with CSS `cursor: url(...)` and a PNG fallback. **P0:** arrow, link, busy, and the four TV pointers.

### 2.4 Sound (all original, synthesised)

Start-up (about 3 s), shut-down, log-on, click, menu command, window open, window close, minimise, restore, ding, error, exclamation, notify, balloon pop, critical stop, countdown tick, go, win, lose. Tools: jsfxr, ChipTone, Bosca Ceoil, or a commissioned composer. **P0:** start-up, click, error, ding, notify, countdown, go, win. The repo already has synthesised cues; extend the same generator.

### 2.5 Fonts

Replace Tahoma and Franklin Gothic with **open (SIL OFL) fonts** and store them locally with their licence files (the repo already bundles local fonts in `public/fonts/` and `public/party/fonts.css`): a clean humanist sans for UI (for example Noto Sans, Open Sans or Nunito Sans, whichever is already licensed here), and a pixel face for titles and the logo (Pixelify Sans, Silkscreen or Press Start 2P). **Verify each font's licence before adding it.** A **"TV scale" setting** multiplies the UI size by 1.5 or 2, because XP's 11 px text is unreadable across a room.

### 2.6 The wallpaper (`mumbai-pixelated.png`): clean-up and variants

The image is good and right for the brief: the dome of the Taj Mahal Palace hotel, a glass tower, the Gateway of India with a portal, the Chhatrapati Shivaji Terminus building on a hill, a red double-decker bus, boats on the harbour, drones, and coin-and-star items. **It needs work before it is the desktop:**

| Issue | What I see | Fix |
| --- | --- | --- |
| **A baked-in clock "10:38"** near the top right | It will always be wrong and will fight with the real taskbar clock | Paint it out (a clean sky patch) |
| **A small sparkle mark** at the bottom right | It looks like an image generator's watermark | Remove it. Also **record which tool made the image and its terms of use for commercial use**, and keep that in `assets/CREDITS.json` |
| **1376 x 768** | The target screens are 1920 x 1080 and larger. 1.4x is a non-integer scale and makes pixel art shimmer | Have a **1920 x 1080 master** painted (or upscaled with a pixel-art-aware tool and hand-cleaned). Also supply **480 x 270** at 4x (exact integer) if the team prefers a true low-res look. Serve with `image-rendering: pixelated` |
| **The bottom 40 px sits under the taskbar** | The foreground road and people are cropped | Keep important content above the lower 6% (the safe area), as the plan's TV safe-area rule says |
| **One time of day** | Day only | **P1:** dusk and night versions for the attract screen, switched by the real clock |
| **Static** | A still image | **P1:** a few animated layers (bus crossing, boat bobbing, drone drifting, clouds) as separate transparent sprites over the still. **P2:** parallax from the phone's pointer |
| **Icon-shaped hot spots** | Hotels, a tower and a gate sit where desktop icons will go | Lay out icon columns on the left over the road and sea, and keep the Gateway, the dome and the tower clear |

A **blur or darken layer is not needed**; keep icon labels readable with the XP-style white text and a dark drop shadow, as XP did.

## 3. Provenance of AI-generated art

The Mumbai wallpaper looks machine-generated. Before it ships: record the tool, the prompt, the date and the tool's terms; confirm commercial use is allowed; do not let a generated image depict a real person or a real trademark (the Taj hotel is a landmark building, which is normally fine for a stylised illustration, but avoid readable signage or brand logos, and avoid anything that looks like a real private residence); and keep the layered source so it can be edited. The same rules apply to every generated backdrop and to the mascot sheet.

## 4. The mascot: Chonk

The owner asked for a mascot for the whole app. The XP precedent is **the helper character** (the paperclip), which is also the strongest nostalgia lever the interface has. **Rule one: we copy its role and its animation format, not its design.**

### 4.1 Recommendation: Chonk, the street cat in kaali-peeli patches

| Option | Idea | For | Against |
| --- | --- | --- | --- |
| **A. Chonk the street cat (recommended)** | A round, chubby Mumbai street cat with **black and taxi-yellow patches** (the kaali-peeli palette), a small **tiffin carrier** on its back whose four tiers are the four seat colours | The name "Funcaster" already means a chubby cat; desktop pets have a long tradition; the patches tie to the palette; the tiffin ties to the four seats and the chonkswala relay story | Cats are common mascots, so the drawing must be distinctive |
| B. Tiffin creature | A four-tier tiffin carrier with a face, arms and a handle that works as an antenna | Strong link to seats and the relay | Harder to animate expressively |
| C. Vada-pav character | A friendly vada-pav | Instantly Mumbai | Narrow, less able to act |

**Personality:** helpful, a bit lazy, easily delighted. It sleeps when nothing is happening, perks up when a phone joins, and points at things. **It must never nag.** The paperclip was disliked for interrupting; Chonk speaks only on events the user caused, can be dismissed with one click, and is **off by default in Kiosk mode** except in attract mode, where it is the star.

### 4.2 Format and animation list

Match the supplied sheet format so the playback code is trivial: **a horizontal strip of 240 x 240 px frames**, with an Aseprite source per animation and a JSON frame list, 12 fps, transparent background, drawn on a 1x pixel grid (the shell scales 2x or 3x).

| Animation | When it plays |
| --- | --- |
| `wakeup` | Boot finishes; the shell opens |
| `idle` (blink, tail flick) | Default loop |
| `watch-left / right / front` | Eyes follow the cursor |
| `point-left / right / up / down` | Pointing at the control that matters (the **Start** button, the QR code, the ready button) |
| `listen` | A phone is joining or the host phone is typing |
| `think` | Loading a game; the host is choosing |
| `noted` | A tip is shown (with a bubble) |
| `check` | A phone became ready; a setting was saved |
| `cool` (sunglasses) | A win, a new high score |
| `music` | A game with a soundtrack is selected; the volume is changed |
| `read` | The rules window is open |
| `airplane` / `shovel` | A long load, or a deploy-style wait |
| `weird` | An error or a disconnect |
| `tired` / `sleep` | Idle for a minute (attract mode: sleeping on the Gateway of India steps) |
| `leave` | The room closes ("Shut Down") |
| `spyglass` | Looking for remote friends (the invite window) |
| `office` | The staff/admin window |
| `eyes` | A surprise (a record broken) |

**P0:** `wakeup`, `idle`, `watch-front`, `point-*` (at least left and down), `check`, `weird`, `sleep`, `cool`, `think`. **Three expressions are enough to start;** the rest follow.

### 4.3 Where else the mascot appears

The app icon and favicon; the boot and log-on screens; the empty states ("No friends here yet"); the share card for results; stickers for the booth; the phone controller's idle screen; and a small badge on each game icon showing the game's emoji-style pose.

## 5. A backdrop for each game's menu

Each game has a **backdrop** used in three places: the **game properties window** header (so choosing options feels like entering that game), the **desktop icon** art, and the **loading and results windows**. A distinct Mumbai scene per game keeps 13 games from looking alike.

**Spec per game:** a pixel-art scene in the same style and palette as the wallpaper, **960 x 540** master (a 4x of 240 x 135), plus a **480 x 120** header crop, a **96 x 96** icon-ready crop, and a **transparent mascot-pose overlay** in its corner. Light and dark variants are not needed. Keep the lower third calm so text over it stays readable (the windows put a solid panel behind text anyway).

| Game | Scene | Mood and palette hints |
| --- | --- | --- |
| **Kart Rush** | Marine Drive's curve at golden hour with the Queen's Necklace of lights; karts racing past a kaali-peeli taxi | Warm orange sunset against teal sea |
| **Time Trial** | A suburban local-train platform at dawn, a train arriving, a stopwatch on the clock tower | Cool blue, yellow signal lamps |
| **Cloud Cruise** | An aerial view of the sea link and the harbour at midday, with rings floating over the water | Bright sky and aqua sea |
| **Pocket Greens** | The Oval Maidan on a Sunday: cricket nets, the Gothic university tower, a flag on the green | Fresh green, old stone |
| **Slice Dojo** | Crawford Market fruit stalls, mangoes and coconuts in the air | Saturated fruit colours |
| **Table Tennis** | A chai chonks with a table-tennis table beside steaming glasses of cutting chai | Warm browns, steam |
| **Foam Fencers** | The Dhobi Ghat's rows of colourful laundry with two foam-sword fencers on the wash stones | Bright washed colours |
| **Shooting Range** | A Juhu Beach funfair stall, balloons and prizes | Carnival red and white |
| **Alien Attack** | The skyline at night with a friendly saucer above the sea link | Deep blue, neon |
| **Drawing** | A street of hand-painted film hoardings in the art district, a painter on a ladder | Poster pinks and yellows |
| **Star Catch** | Chowpatty on Diwali night: diyas, lanterns and falling stars | Gold and indigo |
| **Neon Drift** | A late-night Bandra street of neon signs and auto-rickshaws drifting | Magenta and cyan |
| **Bubble Burst** | Holi at the maidan: clouds of coloured powder and floating bubbles | Pastel powder colours |

**Generation notes for each backdrop:** state "pixel art, 240 x 135 grid, limited palette, Mumbai, [scene], no text, no real people, no logos"; ask for a calm lower third; generate several, pick one, then **hand-clean** (palette snapping, remove artefacts, no baked-in text or UI). Keep source layers. Log the tool and terms for each (section 3).

## 6. Folder layout in the repository

```text
assets/os/
  theme-manifest.json      role -> file (the only place the shell names files)
  icons/{16,32,48}/*.png   plus atlas.json
  cursors/*.svg            plus png fallbacks
  sounds/*.ogg|*.mp3
  fonts/                   OFL fonts and their licence files
  wallpaper/mumbai-1920.webp (day, dusk, night) and layer sprites
  mascot/chonk-<animation>.png, chonk.json
  games/<slug>-backdrop.webp, <slug>-header.webp, <slug>-icon.png
  boot/                    logo, progress art
```

`assets/CREDITS.json` gets one record per shipped file; the Credits page reads it.

## 7. The shopping list in order of urgency

**By 6 November (needed to build and rehearse 6 November):** the cleaned 1920 x 1080 wallpaper (section 2.6); 13 game icons at 32 and 48 px and 13 header crops (placeholders allowed: a flat colour with the game's name); the Chonk mascot in `idle`, `watch-front`, `point-down`, `check`, `weird`, `sleep`; the eight P0 sounds; six message and folder icons; the TV pointers. Everything else can follow after the event.
