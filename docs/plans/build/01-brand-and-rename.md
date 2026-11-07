# Build 01: the brand stays Funcaster, the mascot is a cat

Part of the [build specification](README.md). Status: plan, 6 November 2026.

**Decision (owner, 6 November 2026): the name stays Funcaster, and the mascot is a cat.** A rename was explored earlier the same day (Dabba, then Tapri) and dropped; the file name `01-brand-and-rename.md` is kept so links keep working. **No rename pass is needed**, which also removes the replay-hash problem that a rename would have caused (see the appendix). Product: **Funcaster**. Desktop shell: **Funcaster**. Mascot: **Chonk**, a chubby Mumbai street cat.

## 1. The mascot: Chonk the cat

"Chonk" is internet slang for a gloriously chubby cat, which fits the Funcaster mascot; a round street cat is the natural helper character, and cats have a long history as desktop companions.

### 1.1 Design

- **Body:** a round, chubby Mumbai street cat that often sits like a loaf, with **black-and-taxi-yellow (kaali-peeli) patches**: a black back and ears, yellow belly and face blaze, black tail with a yellow tip. A small notch in one ear (the street-cat mark). Big round eyes with white highlights; a small content smile.
- **Collar with the join meter (a real function, not decoration):** a thin collar with **four small tags** in the seat colours and shapes (peeli ●, magenta ▲, cyan ■, marigold ◆). **A tag lights up each time a phone joins**, so a fully lit collar means four players. Chonk is therefore also the room's join indicator.
- **Movement vocabulary:** the eyes follow the cursor; the tail flicks when idle; ears turn toward a joining phone; it **sleeps as a loaf** with a slow breathing loop; it stretches on waking; it points with one paw; it sits on a window's title bar or the Gateway steps in attract mode.
- **Style:** limited palette (black, taxi yellow, cream, the four seat colours, white highlights), hard pixel edges on a 1x pixel grid so it scales at 2x, 3x and 4x without shimmer.

### 1.2 Personality and rules

Easygoing, a little lazy, easily delighted. It **never nags**: it speaks only about something the user just did, can be dismissed with one click, and stays quiet in Kiosk mode except in attract mode (where it is the star, asleep on the Gateway steps until someone walks up). It never interrupts a running game.

### 1.3 Using the supplied pack first

The supplied Windows pack includes 25 animation sheets of a paperclip helper (`assets/source/winxp/Clip`). **Ship day one with those sheets as the stand-in**, so the helper behaviour, bubbles and event rules are all real, and swap in Chonk's sheets when they exist. The playback engine reads **a skin descriptor** and does not know which character it plays:

```json
{
  "id": "clippit",
  "frame": [240, 240],
  "anims": {
    "idle":   { "file": "mascot/clippit/idle.png",   "frames": 33,  "frameDurationsMs": [70, 130, "..."], "loop": true },
    "wakeup": { "file": "mascot/clippit/wakeup.png", "frames": 22,  "frameDurationsMs": ["..."], "loop": false },
    "leave":  { "file": "mascot/clippit/leave.png",  "frames": 13,  "frameDurationsMs": ["..."], "loop": false, "emptyFrames": [5,6,7,8,9,10,11,12] }
  },
  "anchor": [120, 232]
}
```

**Measured facts about the supplied sheets** (from the indexing pass; data in [data/clip.json](data/clip.json)): every frame is 240 by 240, but the **frame count varies by animation, from 12 (`watch right`) to 145 (`noted`, `sleep`)**; only `idle` has 33. **Timing is not a fixed 12 fps**: the Aseprite files hold per-frame durations of 60 to 2,110 ms (mostly 60 to 200 ms), so playback is driven from a `frameDurationsMs` array in JS, not from a CSS `steps()` animation. Only `idle` loops; every other animation is one-shot and starts and ends on the rest pose. Three have frames where the character has left the box and the frame is blank (`leave` frames 5 to 12, `airplane` 74 and 75, `cool` 58 and 59): hold the last visible frame, or snap back to `idle`. Each frame also includes a **lined yellow paper sheet** under the character (it is part of the sprite). There are no Aseprite tags.

Swapping to Chonk is a different JSON file with the same animation names, so no code changes when the art arrives. The animation vocabulary is in [03-shell-architecture.md](03-shell-architecture.md) section 11. The **collar meter** is a Chonk-only feature driven by a separate `meter` field in the skin descriptor (`{ "tags": 4, "overlay": "mascot/chonk/collar.png" }`); the stand-in helper has none.

### 1.4 Brief to produce Chonk (for whoever makes the art)

Produce one Aseprite file per animation (as the pack does), exported as a horizontal strip of 240 by 240 frames (any frame count; per-frame durations come from the file) plus a `frameDurationsMs` list, using the 25 animation names in the helper vocabulary, with cat translations:

| Animation | Chonk does |
| --- | --- |
| `idle` | Loaf with a slow blink and an occasional tail flick |
| `wakeup` | Stretches and yawns |
| `watch front / left / right` | Eyes and head turn |
| `point down / left / right / up` | One paw points |
| `check` | Happy squint and a tag flashes |
| `weird` | Fur puffs, tail question mark |
| `sleep` | Loaf with closed eyes and a slow breathing loop |
| `cool` | Tiny sunglasses |
| `think` | Paw on chin, tail curls into a question mark |
| `listen` | Ears swivel |
| `leave` | Walks off the edge |
| others | Reuse `idle` until drawn |

**P0 set** (needed first): `idle`, `wakeup`, `watch front`, `watch left`, `watch right`, `point down`, `point left`, `check`, `weird`, `sleep`, `cool`, `think`; plus a four-frame `collar` overlay (one to four tags lit). Generation prompt for an image tool (to be hand-cleaned into pixel art): *"pixel art character sprite, a cute round chubby Mumbai street cat with black and taxi-yellow patches, big friendly eyes, a notched ear, a thin collar with four small coloured tags in yellow, magenta, cyan and orange, sitting like a loaf, black outline, limited palette, front view, transparent background, 240x240"*. Keep the layered source. Record the tool in `assets/CREDITS.json` as a note (not a blocker).

### 1.5 The cat sprites already in the repository

The CraftPix street-animal pack has two small pixel cats (an orange cat and a second cat, 48 by 48) that are used as **taskbar pets** ([02](02-theme-and-assets.md) section 13.3). They are Chonk's neighbours, not Chonk: Chonk is the larger, patched helper. If the two read as confusing, drop the cats from the pet list (dogs and the crow remain); that is a one-line change.

## 2. The brand kit (existing, kept)

The repository already has the brand: the wordmark **Funcaster** on the remote (`public/classic-controller.html`), a logo mark and wordmark SVG and PNGs in `assets/brand/`, the palette in `assets/brand/palette.*`, the manifest name **Funcaster** in `public/manifest.webmanifest`, and social tags `og:title` "Funcaster · Scan. Tilt. Play." The build keeps all of it. Additions:

| Item | Spec |
| --- | --- |
| **Wordmark in the shell and on the remote** | The word **Funcaster** in the supplied Franklin Gothic Medium Italic (`assets/source/winxp/Fonts/framdit.ttf`, subset to WOFF2) in the era-style lockup on the XP desktop and phone remote |
| **Mascot mark** | A cropped Chonk head (when the art exists) as an optional badge on the splash, the share image and the stickers. Until then the existing logo mark is used |
| **Colours** | The seat colours (peeli `#F7C600`, magenta `#EF5DA8`, cyan `#4DE2DF`, marigold `#FFAD42`), kaali `#111111`, cream `#FFF1D6`, plus the Luna palette for the shell ([02-theme-and-assets.md](02-theme-and-assets.md)) |
| **Tagline** | "Scan. Tilt. Play." (unchanged) |
| **Voice** | Warm, relaxed, a sprinkle of Hinglish ("Chalo!" when a game starts); the cat can say "Mrow!" when something goes well |

**One constant for the name** (so the shell, the boot screen and the credits agree): `public/os/brand.js` exports `BRAND = { name: 'Funcaster', os: 'Funcaster', mascot: 'Chonk', wordmark: 'chonks', tagline: 'Scan. Tilt. Play.' }`. It is a convenience, not a rename mechanism.

## 3. What does not change (and why that is a relief)

Because the name stays, **none of the identifiers move**: the `chonks.<slug>` game ids and `legacyIds`, the `chonks.*` storage keys (including `chonks.host`, which the game iframes read, and `chonks.player.<code>`, the seat token on already-open phones), the `chonks:*` message types, `openwii.*`, `CHONKS_REMOTE_VIEWS`, the creator-registry reserved names, and the game titles ("X — Funcaster") and the Kart Rush stadium signage ("CHONKS CUP"). The bundle hash is not disturbed by this work except by the changes the other documents actually make.

New keys the shell adds use the same prefix directly (`chonks.volume`, `chonks.tvScale`, `chonks.skin`, `chonks.setup.<gameId>`); the existing keys it reads (`chonks.party-volume`, `chonks.reduced-effects`, `chonks.sensitivity`, `chonks.nickname`) are read as they are.

## Appendix: if the name ever changes (reference only; not part of this build)

Measured on 6 November 2026 over 617 tracked files: 311 occurrences of "chonk" (141 identifier-shaped), 83 of "openwii", 30 of "wii" as a word. Kept here so a future rename starts informed.

- **The hash rule.** `bundleHash` (`server/bundle-hash.cjs`) hashes `games/<id>/`, all of `core/`, `sdk/`, `public/fonts`, `public/party/fonts.css`, `server/party-engine.cjs` (and `server/shared-round.cjs` for three games); `scripts/replay-check.cjs` refuses to verify a stored record whose hash differs. Any byte change in those trees, even a title, invalidates old records. Tag the build first (for example `pre-rename`).
- **Display strings only** (safe, outside the hash): `public/*.html` titles and wordmarks, `og:title`, `public/manifest.webmanifest`, `public/credits.html`, `assets/CREDITS.json` (26 `author` fields), `server.js:406`, `scripts/share.cjs:74`, `scripts/local-cert.cjs:48`, `server/creator-gallery.cjs:22`, README and docs. In-game titles and the Kart Rush signage (`stadium-*.js`, `world.js:69`, `index.html:68`) are inside the hash.
- **Never rename:** the `chonks.<slug>` game ids and the literal maps keyed on them (`server/logic-replay.cjs:231-238`, `server/shared-round.cjs:239-241`, `scripts/replay-check.cjs:43,50,56` including `slice(7)`); the `chonks.*` and `openwii.*` storage keys; the `chonks:*` message types (`chonks:input` reaches sandboxed creator games); `window.__openwii`; the creator-registry reserved names (add the new name, keep the old).
- **Rename with a read-both shim:** `CHONKS_REMOTE_VIEWS`; the settings keys the shell reads.
- **Candidate names considered and why they were dropped:** Dabba (box, tiffin; rejected by the owner), Tapri (the roadside tea stall; dropped when the owner kept Funcaster), Kabootar (pigeon; **ruled out** because Mumbai's pigeon-feeding ban and the protests and court cases of August 2025 make a pigeon a live community issue: [The Week](https://www.theweek.in/wire-updates/national/2025/08/11/bom12-mh-pigeons-jain-monk.html), [Scroll](https://scroll.in/article/1085342/why-mumbai-ban-on-feeding-pigeons-has-pitted-neighbours-against-each-other)), Vada, Jugaad, Local, Timepass.
