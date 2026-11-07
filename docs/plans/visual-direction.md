# A retro-futuristic Mumbai: the visual, sound and asset plan

> **Superseded in part, 6 November 2026.** The owner moved the whole console to a Windows-XP-style desktop over a pixel-art Mumbai wallpaper. For the shell, menus, TV screens, mascot and backdrops, see [xp-console-ui.md](xp-console-ui.md) and [xp-assets-and-licensing.md](xp-assets-and-licensing.md). The neon "Bombay Arcade, 2099" concept in this file no longer governs the shell; its font, sound and licence rules, and the in-game art guidance, still apply where they do not conflict.

Status: plan, 6 November 2026. Based on a read of the current UI code (`public/index.html`, `public/party/*`, `public/controller.html`, per-game HUDs), research into how Devcon 8 and ETHGlobal Mumbai use Mumbai in their branding, what is documented about Mumbattan in *Across the Spider-Verse*, and a licence and technique survey for retro assets. I did not see any rendered screen; descriptions of the current look come from the CSS and markup. Colour suggestions are mine and are labelled as such.

## 1. Why the current UI feels corporate

| Cause | Evidence |
| --- | --- |
| **No font identity.** The CSS asks for a font named "Funcaster" that is never defined, so every host and phone screen renders in the operating system's default font. Kart Rush references `KartMessage` and `KartCounter` fonts that are also never defined | `party.css:10-15`, `fonts.css` is a one-line comment |
| **A SaaS landing page, not a console.** Warm off-white `#f7f5ef`, one purple accent, rounded 24-28 px pastel cards, tiny letter-spaced uppercase labels, copy like "LESS SCROLLING. MORE PLAYING." | `party.css:2-9`, `index.html` |
| **A long scrolling web page with dropdowns in the middle**, not a single screen you navigate from a sofa | `index.html:93-167` |
| **Type too small for a TV.** 6-10 px labels on the TV page; the plan's own 10-foot rule was nothing under about 24 px | `party.css` |
| **No motion or sound language** in the lobby; the three 2D games draw pastel lane panels | `render.js` |
| **The games do not match each other or the shell.** Slice Dojo is browns and cream with a remote marker font; Golf, Time Trial and Fencers are slate blues; Shooting Range greens and tans; Kart Rush navy and gold | per-game inline CSS |
| **Emoji-like glyph icons** (✦ ✳ ✷ ♪ ⛶) used as text | host and phone |
| **Low-contrast seat colours with white text:** Peach 2.65:1, Mint 2.99:1, Sunny 2.04:1 (computed). Only Lilac passes (4.76:1) | seat colours in `party.cjs:26-27` |

Pieces worth keeping: the original inline-SVG game covers (`public/party/art.js`), the original robot drivers and kart art, the synthesised audio, and the pastel idea as a *secondary* palette for kids' modes.

## 2. What the references actually do with Mumbai

### 2.1 Devcon 8 India (devcon.org/en)

Verified from the page and its CSS (research agent, 13 Oct 2026):
- **Hero art:** a night-time illustrated collage of the Gateway of India in front of a huge glowing cyan moon, a teal mandala and a Mughal-style border frame, a sky gradient from orange through magenta and violet to indigo, floating Ethereum diamonds, and two anime-style characters with a fox and a cat. Mood: "Infinite Garden", mystical, dreamy, bioluminescent. **It is not street-level Mumbai**: only the Gateway and a bridge and skyline silhouette appear; no vehicles.
- **Fonts:** Poppins (body, OFL), a self-hosted display serif "Chloe" (licence unverified, assume commercial), Inter as fallback.
- **Colours from its CSS:** `#160b2b` (header dark), `#221144` and `#1a0d33` (deep purples), `#7235ed` (primary violet), `#e55066` (coral), `#0fadcf` (cyan), `#fee506` (yellow), `#00b3a4` (teal), `#88c43f` (green), a pastel gradient `#ffdc8b → #f7d9d4 → #ffb8e3`.
- No designer or agency credit found; the art is Ethereum Foundation copyright.

### 2.2 ETHGlobal Mumbai

- **Logo:** a **diya** (oil lamp) in magenta, crimson and teal stripes with an orange Ethereum-diamond flame and yellow sun rays; "MUMBAI" in a tall, flared, Art-Deco or Victorian-signage display face in maroon; a flat peach background with a tone-on-tone **paisley and mehndi** pattern. Flat vector, a festive Diwali feel. The Mumbai identity lives in the logo and the og image only; the event page itself is the generic ETHGlobal template.
- **Sampled colours** (from the og image, not the CSS): peach `#f8dbb3`, maroon `#830333`, orange `#ff6205`, marigold `#f4a70d`, crimson `#c00146`, teal `#02b890`.
- **Fonts on the site:** Roobert (commercial, from memory), Geist, Plus Jakarta Sans.

### 2.3 Mumbattan in *Across the Spider-Verse*

- Earth-50101 is a hybrid of **Mumbai and Manhattan**; the director said they "emptied out the East River", so the river becomes a chasm and the city is built in stacked levels (SlashFilm).
- The look was **based on 1970s Indrajal Comics**: a simple style with heavy outlines and backgrounds that "dissolve into a very simple representation", and the team recreated the **printing method** to give the "tooth and texture of the paper" (Motion Picture Association interview with Look of Picture Supervisor Bret St. Clair; SlashFilm).
- Pavitr's costume drew on Theyyam and Yakshagana dancers, temple architecture, henna patterns and contemporary Indian fashion (SlashFilm).
- **Correction to a memory:** I found no source tying Mumbattan to truck art, Bollywood posters or halftone as documented influences; the documented influence is Indrajal comics. And I found **no official game, website, AR experience or interactive map** of Mumbattan (only a few searches; fan games are unverified). The "game-like" feeling most likely comes from the film's stacked-level city, comic-print texture and frenetic design.

### 2.4 Other Mumbai retro work

Thin results. Indofuturist work exists (Antariksha Studio's *Antariksha Sanchar* and *Elsewhere in India*) but not set in Mumbai. I found **no Mumbai pixel-art or synthwave arcade game**; that may be an open niche, but it is only "not found in a few searches". A manual search of itch.io for "Mumbai" and "Bombay" would settle it before we commit.

## 3. The concept: "Bombay Arcade, 2099"

**One line:** the console is a neon-lit Bombay arcade parlour from a future that kept all its Art Deco, taxis and trains: pixel-sharp, CRT-glowing, street level.

**Why this is distinctive.** Devcon is dreamy and mystical (garden, moon, mandala). ETHGlobal is festive and flat (diya, paisley, deco type). Mumbattan is printed comic paper. Ours is **street-level, kinetic and arcade**: kaali-peeli taxis, local trains, BEST-style buses, chai, hoardings, monsoon, Marine Drive's curve in neon, rendered as pixel art and low-poly with CRT scanlines and a synth-meets-raga sound.

**Four pillars.**
1. **A city you can navigate.** The menu is a **local-train route map**: each game is a station on a line; picking a game means "boarding". (Distinctive, functional, and instantly Mumbai.)
2. **Arcade honesty.** Chunky pixel type, scoreboards with initials, coin-slot and ticket metaphors, attract-mode loops.
3. **Warm neon, not cold cyber.** Magenta, cyan and marigold against deep indigo, with taxi yellow as the hero accent; not blue-on-black "hacker".
4. **Printed texture.** Halftone dots, paper grain and slight misregistration on key art (borrowing the *idea* of Indrajal printing, never its art).

**Original metaphors to build on** (all mine, none lifted from the references):

| Metaphor | Where it appears |
| --- | --- |
| **Local-train route map** as the game picker; stations are games, the line colour is the game type | TV menu |
| **Dabbawala tiffin carrier** with four stacked tiers = the four player seats (a tier lights up as a phone joins) | Lobby |
| **Taxi meter** for score and timers; the flag drops when a round starts | HUDs, results |
| **Hoarding** (a giant painted billboard) for each game's key art | Game cards, loading screens |
| **Chai-stall menu board** (chalk and brass) for settings and how-to-play | Settings, onboarding |
| **Station indicator / flip board** for transitions and the playlist | Series, round changes |
| **Rain on glass** and neon puddle reflections | Idle, results, loading |
| **Bus route board** for playlists and series standings | Series mode |

**What to avoid copying:** the Devcon hero illustration, its lotus-eye-in-diamond logo and the "Infinite Garden" characters; the ETHGlobal diya-with-diamond logo and MUMBAI wordmark; **Ethereum diamonds as a motif** (they tie us to those events); the Chloe and Roobert fonts; anything named or shown from Spider-Verse ("Mumbattan", Pavitr, stills, Indrajal's art); a close trace of any existing Gateway of India picture (draw our own silhouette).

## 4. The design system

### 4.1 Palette (suggestions; final palette is 16-24 colours)

| Token | Hex | Role |
| --- | --- | --- |
| `--night-950` | `#0B0820` | Deepest background |
| `--night-900` | `#14103A` | Main background |
| `--night-700` | `#3B1C6E` | Panels |
| `--kaali` | `#111111` | Taxi black: text on bright fills |
| `--peeli` | `#F7C600` | Taxi yellow: **hero accent**, primary buttons |
| `--marigold` | `#FF9F1C` | Warm secondary |
| `--magenta` | `#FF2E93` | Neon accent |
| `--cyan` | `#19E3FF` | Neon accent, highlights |
| `--sunset` | `#FF6A3D` | Warnings, heat |
| `--teal` | `#1D7A8C` | Monsoon, cool surfaces |
| `--mint` | `#9EE6CF` | Art Deco pastel |
| `--peach` | `#FFC9B5` | Art Deco pastel |
| `--cream` | `#FFF1D6` | Light text and paper |
| `--red` | `#E0314B` | City-bus red (generic, not a brand colour) |
| `--blue` | `#2A6FDB` | Local-train blue |

**Contrast, computed (WCAG 2.x ratios):**

| Pair | Ratio | Use |
| --- | --- | --- |
| cream on night-900 | 16.14 | Body text |
| cream on night-700 | 11.92 | Panel text |
| peeli on night-900 | 11.19 | Accent text, scores |
| cyan on night-900 | 11.57 | Highlights |
| marigold on night-900 | 8.78 | Secondary text |
| mint on night-900 | 12.60 | Secondary text |
| magenta on night-900 | 5.21 | Accent text (AA) |
| kaali on peeli | 11.72 | Primary button label |
| kaali on cyan | 12.11 | Button label |
| kaali on marigold | 9.20 | Button label |
| kaali on magenta | 5.45 | Button label (AA) |
| kaali on sunset | 6.64 | Button label |
| white on teal | 4.98 | OK for UI text |
| white on blue | 4.78 | OK |
| **white on magenta** | **3.46** | **Large text and icons only, never body text** |
| **white on sunset** | **2.85** | **Fails: do not use** |
| cream on teal | 4.46 | Large text and UI only |

**Rule:** bright fills carry **black (`--kaali`) text**, not white. This also fixes the seat colours: black text passes on all four existing seat colours (3.97 to 9.27), white fails on three of them.

**Seat colours (player identity).** Four colour-plus-shape pairs so colour is never the only cue: **Peeli ● circle, Magenta ▲ triangle, Cyan ■ square, Marigold ◆ diamond**, each with black text, a large number and a name. (Replace Lilac/Peach/Mint/Sunny.)

### 4.2 Typography (all open licences; self-host WOFF2 with the licence file)

| Role | Font | Notes |
| --- | --- | --- |
| Arcade title and score | **Press Start 2P** (OFL) | Wide; titles, scores, big numerals |
| Pixel UI and labels | **Pixelify Sans** or **Silkscreen** (OFL) | Menus, chips, captions |
| TV body and phone body | **Poppins** or **Space Grotesk** (OFL) | Readable paragraphs, hints |
| Art Deco display | **Poiret One**, **Limelight** (OFL) | Marine Drive-style headings, logo |
| Latin neon signage | **Bungee** (OFL) | Vertical signs, taxi-meter text |
| Devanagari headline | **Yatra One**, **Rozha One** (OFL) | Hindi and Marathi titles; hoarding feel |
| Devanagari HUD and labels | **Khand**, **Teko**, **Rajdhani** (OFL) | Closest to arcade or sci-fi in Devanagari |
| Devanagari body | **Hind**, **Mukta** (OFL) | Readability |
| Chalk menu board | **Kalam** (OFL) | Chai-stall settings |

**No pixel-style Devanagari font was found.** Options: (1) use Khand or Teko and get the pixel feel by rendering a few titles to a small canvas and upscaling with `image-rendering: pixelated`; (2) commission or draw a small bitmap Devanagari set for about 20 signs; (3) a neon `text-shadow` stack. **Rule: Devanagari text stays in the DOM layer (or baked into textures); never in WebGL text**, because complex shaping (conjuncts, vowel reordering) is not confirmed in the 3D text libraries.

**Sizes (TV, 1080p reference):** body 28-32 px, labels 24 px minimum, headings 56-96 px, scores 96-160 px. **Phone:** body 17-20 px, labels 14 px minimum, primary button 24 px. Nothing a player must read is smaller than these.

### 4.3 Components

A small kit used by *every* game, so the shell and the games finally look like one product: panel (9-slice pixel border), button (primary peeli, secondary outline, danger), chip, toggle, slider, list row, seat badge (colour, shape, number), scoreboard (HI-SCORE style), taxi-meter timer, HUD frame (truck-art border), toast, dialog, focus ring (neon, thick), progress bar (train moving along a line). Defined as CSS variables in one `tokens.css` and a sprite atlas, consumed by the TV, the phone and each game's HUD.

## 5. The TV experience: from a web page to a console

**Navigation model.** The host page is operable by **host phone** (see [host-phone-controls.md](host-phone-controls.md)), **keyboard**, **mouse** and **gamepad**, all driving one focus system with large focus targets. No dropdowns; setup is a "dip-switch" panel with big toggles.

**Screens.**

```
ATTRACT (idle)            JOIN                         LINE MAP (pick a game)
+------------------+      +------------------+         +--------------------------------+
| neon skyline,    |      |  [ BIG QR ]      |         |  WESTERN LINE ------------------|
| rain, taxi drives|      |  CODE  K7M2QX    |         |   o Kart Rush   o Golf   o Slice|
| past; "PRESS     |      |  neon sign       |         |  CENTRAL LINE ------------------|
|  START / SCAN"   |      |  4 tiffin tiers  |         |   o Tennis  o Fencers  o Draw   |
+------------------+      |  light as phones |         |  HARBOUR LINE ------------------|
                          |  join            |         |   o Star Catch o Drift o Bubble |
                          +------------------+         +--------------------------------+
LOBBY                                   RESULTS
+-----------------------------------+   +-----------------------------------+
| game hoarding (key art)           |   | HI-SCORE table, initials, taxi    |
| setup dip-switches   [ START ]    |   | meter times, confetti, rematch    |
| seats: 4 tiffin tiers (colour/    |   | "Run it back"  "Next game"        |
| shape/number/name, READY lamps)   |   | series standings on a route board |
+-----------------------------------+   +-----------------------------------+
```

**Transitions.** Boarding a train (doors close, scenery slides) between menu and game; a flip-board for round changes; CRT power-on for boot.

**Motion language.** Parallax skyline (5 layers), neon flicker on signs, rain with puddle reflections, a taxi that crosses at idle, diya-flame pulse on the focused item, a taxi-meter flag dropping at round start. **All motion respects reduced-motion and has a "calm" setting.**

**Retro rendering options (each a quality toggle, default chosen by the governor):** pixel-art DOM scaled by integer factors with `image-rendering: pixelated`; a CSS **scanline and vignette** overlay; Three.js **pixelation** pass for the 3D games (`RenderPixelatedPass`, a stock three.js example effect, renders at reduced size so it can be cheaper than native; its outline option costs extra); bloom only at half resolution or replaced by CSS glow; no SSAO or GTAO; palette quantisation through a lookup table pass. Target: about 60 fps on an integrated GPU with CRT low.

## 6. Sound

| Class | Direction |
| --- | --- |
| **Music** | Chiptune built on a **drone** with raga-inspired melodies (for example Bhairav, C Db E F G Ab B, or Yaman, C D E F# G A B, written by us), tabla-like noise and kick patterns in a 16-beat cycle, pitch-bend slides for a gamaka feel, a sitar-like pluck. Writing our own melodies from a scale avoids copying any existing Bollywood song. Tracks: attract, lobby, per game (13), series, results win and lose stingers |
| **SFX** | Generated with a tool such as jsfxr: UI move, select, back, error, ready, countdown tick, "go", coin, hit, miss, power-up, boost, horn, crash, win, lose, whoosh, taxi-meter click |
| **Ambience** | Street traffic, rain, train rumble, sea, crowd (30-60 s seamless loops) |
| **Voice** | Short lines only ("Ready", "Go", "Winner"), in English and Hinglish; recorded by us or a cleared voice actor. A **station-announcement chime** for transitions |
| **AI-generated music** | Avoid for anything public; if used for placeholders, record the tool, plan and date. Terms vary and are not settled for our use |

## 7. The controller

> **6 November 2026:** the owner does not want a literal copy; the controller is an **original design that resembles a classic remote, matches our design system and fits our use case**. The full build spec is [controller-design.md](controller-design.md) (anatomy, contexts, skins, tokens, feedback, a how-this-differs checklist, implementation steps). The text below is the earlier reasoning and the three starter skins.

**The ask:** a controller that looks like a classic motion remote, with colour. **The tension to settle first:** the classic motion remote's industrial design (the slim white slab, A button, D-pad, +/- and Home cluster, numbered 1/2 buttons, four player LEDs) is Nintendo's, and the earlier plan flagged copying it as a trade-dress risk and removed it. I am not a lawyer. My recommendation, so you get the feel without the copy:

- **Keep the silhouette idea, change the details.** A slim rounded handheld body, one big round primary button, a trigger-shaped secondary button, small round utility buttons, and a row of player lamps. But: **original proportions**, **different glyphs and labels** (our own icons; Hinglish labels like "चलो" / "GO"), **no "Home" house icon cluster**, and **player lamps shaped like our four seat shapes (circle, triangle, square, diamond) as small neon bulbs**, not four identical blue dots.
- **Colour it like Mumbai.** The body is a **paint job**: taxi **peeli-and-kaali stripes**, city-bus red and cream, local-train blue and cream, or Art Deco mint and peach. Each seat's colour is the paint job, so the whole phone is that player's colour (full-bleed identity), with black text on bright fills.
- **The skin is cosmetic; the controls are real.** Targets stay at least 48 px (primary at least 96), the layout still changes by context (lobby, aim, steer, "your turn"), and a skeuomorphic body must never shrink a control. If a design choice and a touch target conflict, the target wins.
- **If the owner wants a literal Wii-remote look anyway,** that is the owner's call, but it re-opens the earlier risk; please decide knowingly. (Options in section 11.)

```
 Portrait pointer layout                    Landscape wheel layout
+------------------------+                +---------------------------------------------+
|  chonks.   (o) (^)(#)(*)|  player lamps  |  <-- steering meter -->           [crown]   |
|  +------------------+  |                |  [ BRAKE ]   [ BOOST x3 ]   [  ACCELERATE ] |
|  |                  |  |                |   (kaali)       (marigold)        (seat paint)|
|  |   aim / swing    |  |                +---------------------------------------------+
|  |   pad            |  |
|  +------------------+  |
|      (  A  )  big      |
|   [ B ]    [ menu(hold)]|
+------------------------+
```

**Three starter skins:** Kaali-Peeli (black and yellow checker stripe), City Bus (red and cream), Local (blue and cream). More as cosmetics later (see [the business plan](../../business-plan.md)).

## 8. Art direction for each game (a skin system, applied tier by tier)

A theme is a set of tokens, sprites, a music track and HUD frame. Games keep their mechanics and gain a Mumbai set piece.

| Game | Mumbai set piece | Notes |
| --- | --- | --- |
| Kart Rush | A night circuit along a Marine Drive-style curve and a cable-stayed sea link; neon hoardings; rain | Replaces "Aurora Circuit"; Art Deco facades as low-poly |
| Pocket Greens | A maidan (open ground) mini-course with a skyline behind | Stays bright; kites in the sky |
| Slice Dojo | A fruit-seller's cart: mango, banana, coconut, sugarcane, lime; the dojo wall becomes a painted hoarding | Keep gameplay; swap art and the Permanent Marker font |
| Table Tennis | A chawl terrace at dusk with laundry lines | |
| Foam Fencers | A courtyard stage with a paper-lantern ring | |
| Time Trial | A local-train platform dash with station boards | |
| Cloud Cruise | Flying through monsoon clouds and kites over the skyline | |
| Shooting Range | A seaside fair balloon stall | |
| Alien Attack | A retro-future skyline defence | |
| Drawing | Chalk on a chai-stall board, rangoli colours | |
| Star Catch, Neon Drift, Bubble Burst | Neon stars over the harbour; a taxi drift lane; chai steam and soap bubbles | Currently pastel lane panels in `render.js` |

## 9. Implementation phases

| Phase | What | Gate (how we know it worked) |
| --- | --- | --- |
| **V0 Tokens and fonts** | `tokens.css`, the palette, self-hosted fonts, the seat colours and shapes, contrast tests in CI | Every text pair 4.5:1 or better; fonts load offline |
| **V1 TV shell** | Rebuild the host page: attract, join, line map, lobby (tiffin seats), results; focus navigation; 10-foot sizes | 3-metre readability check; no dropdowns; operable with phone, keyboard, mouse |
| **V2 Phone skin** | New controller shell, full-bleed seat paint, shapes, target sizes, contexts | All controls at least 48 px (automated); first-timer identifies their phone from 3 m |
| **V3 Motion and sound** | Transitions, ambience, SFX, menu and lobby music, reduced-motion | Frame budget holds on a weak laptop; mute and calm modes work |
| **V4 Game skins, Tier 1 first** | Kart Rush, Golf, Slice Dojo get a Mumbai set piece and the shared HUD kit | The three games read as one family with the shell |
| **V5 The rest and 3D set pieces** | Remaining games; taxi, bus, train, Gateway, sea link, chawl props | Per-game bundle budget met |

**Uniqueness check at each gate:** show screenshots to five people and ask what they remind them of. If the answer is Devcon, ETHGlobal or a Nintendo menu, iterate.

**Budgets (suggested, not sourced):** menu payload under 3 MB, each game under 5 MB lazy-loaded, phone page under 500 KB; 3D props under 300 KB each (taxi 1.5k triangles, bus 2.5k, local train car 3k, Gateway 4k, sea link 5k, a chawl block 1.5k instanced); music OGG about 96-128 kbps, 3-5 MB total.

## 10. THE ASSET LIST (what you add to the project)

**How to read it.** *Priority:* P0 needed to ship V0-V1, P1 for V2-V3, P2 for V4, P3 later. *Who:* **You** (you create or commission), **Source** (a free asset you download from the listed kind of source), **Gen** (I can generate it procedurally in code, so you do not have to). Every file you add needs an entry in `assets/CREDITS.json` (section 10.3) before it is committed. Use lowercase kebab-case names.

### 10.1 Foundation (P0)

| ID | Asset | Spec | Format | Path | Who | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | **Palette file** | The 16-24 final colours with names | CSS variables, `palette.png` strip, `.gpl` for Aseprite | `public/party/tokens.css`, `assets/brand/palette.*` | You (with me) | Start from section 4.1 |
| A02 | **Press Start 2P** | Latin | WOFF2 + `OFL.txt` | `public/fonts/` | Source (Google Fonts) | Titles, scores |
| A03 | **Pixelify Sans** (or Silkscreen) | Latin | WOFF2 + `OFL.txt` | `public/fonts/` | Source | UI labels |
| A04 | **Poppins** (or Space Grotesk) | Latin, 2 weights | WOFF2 + `OFL.txt` | `public/fonts/` | Source | Body |
| A05 | **Yatra One** | Devanagari + Latin | WOFF2 + `OFL.txt` | `public/fonts/` | Source | Hindi headlines |
| A06 | **Khand** or **Teko** | Devanagari + Latin | WOFF2 + `OFL.txt` | `public/fonts/` | Source | Devanagari HUD |
| A07 | **Hind** or **Mukta** | Devanagari + Latin | WOFF2 + `OFL.txt` | `public/fonts/` | Source | Devanagari body |
| A08 | **Poiret One** or **Limelight** | Latin | WOFF2 + `OFL.txt` | `public/fonts/` | Source | Deco headings and logo |
| A09 | **Bungee** | Latin | WOFF2 + `OFL.txt` | `public/fonts/` | Source | Neon signage |
| A10 | **Wordmark and logo** | "chonks." in the new style; mark; one-colour and neon variants; readable at 64 px | SVG master + PNG 512 and 1024 | `assets/brand/logo-wordmark.svg`, `logo-mark.svg` | You | Text kept as outlines |
| A11 | **Favicon and app icons** | One master | SVG favicon; PNG 192, 512, 180 (apple-touch), maskable 512 | `public/icons/` | You (from A10) | |
| A12 | **Social and share image** | 1200x630, under 300 KB | PNG/JPG | `public/og-default.png` | You | |

Subset fonts to Latin plus Devanagari with a tool such as `pyftsubset` or `glyphhanger`, convert to WOFF2, declare with `font-display: swap`, and preload only the one or two used on the menu.

### 10.2 Visual assets

| ID | Asset | Spec | Format | Path | Pri | Who |
| --- | --- | --- | --- | --- | --- | --- |
| B01 | **Menu skyline, 5 parallax layers** (sky, far skyline, mid landmarks, near chawls, rain overlay) | 1920x1080 at pixel scale 2 or 4, seamless horizontal tile, each under 150 KB | PNG-8 or WebP | `public/assets/bg/menu-0-sky.png` ... `menu-4-near.png` | P0 | You (or Gen first draft) |
| B02 | **Line-map graphics** (line colours, station markers, train sprite) | Sprite sheet 2048 max | PNG-8 + JSON | `public/assets/ui/linemap.*` | P0 | Gen + You polish |
| B03 | **UI kit:** 9-slice panel, buttons (3 states), chips, toggle, slider, focus ring, progress train | Panel 24x24 with 8 px border; icons 16 and 32 px | PNG-8 + JSON | `public/assets/ui/kit-*.png` | P0 | You or Source (Kenney UI) |
| B04 | **Icon set** (about 40: play, pause, kick, lock, crown, volume, gear, trophy, coin, star, etc.) | 16 and 32 px, pixel style | SVG or PNG sheet | `public/assets/ui/icons-*.png` | P0 | Source (game-icons.net is **CC BY 3.0, credit each author**) or You |
| B05 | **Game key art, 13 hoardings** | 1280x720 (and a 480x270 tile), same style | PNG-8 or WebP | `public/assets/games/key-<id>.webp`, `tile-<id>.webp` | P1 | You |
| B06 | **Seat badges** (4 shapes x paint) and the tiffin-carrier lobby graphic | SVG | SVG | `public/assets/ui/seat-*.svg`, `tiffin.svg` | P1 | You (I can Gen a first pass) |
| B07 | **Controller skins** (3 paint jobs: Kaali-Peeli, City Bus, Local) | 512x1024 body textures plus CSS | PNG/WebP, under 100 KB total | `public/assets/controller/skin-*.png` | P1 | You |
| B08 | **HUD frame kit** (truck-art border, taxi-meter, scoreboard frame) | 9-slice | PNG-8 | `public/assets/hud/*.png` | P1 | You |
| B09 | **Particle and FX sprites** (rain, sparks, steam, confetti, speed lines, neon glow) | 8x8 to 32x32 frames | PNG sheet | `public/assets/fx/*.png` | P1 | Gen |
| B10 | **Loading screens** (3 hoardings or a CSS-only animation) | 1280x720, under 200 KB | WebP | `public/assets/load/` | P2 | You |
| B11 | **Tone-on-tone pattern tiles** (paisley or mehndi, rangoli radial, halftone dots, paper grain) | Seamless 256x256 | PNG-8 | `public/assets/patterns/` | P1 | You or Source (CC0 textures) |
| B12 | **Sprite sheets per game** (coins, stars, fruit, targets, ships, bubbles) | 16/32/64 px frames, atlas at most 2048x2048, 8-12 fps | PNG-8 + JSON | `games/<slug>/assets/` | P2 | You or Gen |
| B13 | **3D Mumbai props:** kaali-peeli taxi, city bus, local-train car, Gateway silhouette, sea link tower, chawl block, tiffin, chai glass | Triangle budgets in section 9, vertex colours or one 256-512 px palette texture | glTF/GLB with meshopt or Draco | `assets/models/prop-<name>.glb` | P2-P3 | You (Blender) or Source (Quaternius CC0 as a base) |
| B14 | **Tileable textures** (asphalt, wet road, brick, corrugated metal) | 256 or 512 px, nearest filtering | PNG-8 | `assets/textures/` | P2 | Source (Poly Haven, ambientCG: both CC0, verify) |

### 10.3 Audio assets

| ID | Asset | Spec | Format | Path | Pri | Who |
| --- | --- | --- | --- | --- | --- | --- |
| C01 | **Boot jingle** (2-4 s) | Raga-inspired chiptune sting | OGG + MP3 | `public/assets/audio/mus-boot.ogg` | P0 | You or Gen |
| C02 | **Menu loop** | 60-90 s, clean loop at a zero crossing, 96-128 kbps | OGG (primary) + MP3 | `mus-menu.ogg` | P0 | You |
| C03 | **Lobby loop** | 45-60 s | OGG | `mus-lobby.ogg` | P1 | You |
| C04 | **Per-game loops (13)** | 60-90 s each | OGG | `mus-<id>.ogg` | P2 | You |
| C05 | **Win and lose stingers, series fanfare** | 2-4 s | OGG | `stg-win.ogg`, `stg-lose.ogg`, `stg-series.ogg` | P1 | You or Gen |
| C06 | **UI SFX** (about 20: move, select, back, error, ready, tick, go, coin, hit, miss, power-up, boost, horn, crash, whoosh, meter click) | Mono, 22-44.1 kHz, each under 30 KB | OGG or WAV | `sfx-<name>.ogg` | P0 | Gen (jsfxr) |
| C07 | **Ambience loops** (traffic, rain, train, sea, crowd) | 30-60 s seamless, 64 kbps stereo | OGG | `amb-<name>.ogg` | P2 | Source (Freesound CC0 or CC BY) or You |
| C08 | **Voice lines** ("Ready", "Go", "Winner", a few more) in English and Hinglish | Mono 64 kbps | OGG | `vo-<line>.ogg` | P3 | You or a cleared voice actor |
| C09 | **Station chime** (transition) | 1-2 s | OGG | `sfx-chime.ogg` | P1 | Gen |

### 10.4 Credits and licences (required)

Keep **one** `assets/CREDITS.json` listing every file: `file`, `author`, `sourceUrl`, `licence`, `attributionRequired`, `modified`, `dateAdded`. It also feeds an in-game Credits screen. Licence rules:

- **CC0** (Kenney, Quaternius, Poly Haven; ambientCG to be checked): no credit needed.
- **CC BY** (game-icons.net, Incompetech, some OpenGameArt and Freesound files): credit is **required** and must be shown to players.
- **CC BY-SA and GPL** (some OpenGameArt files): copyleft; avoid for anything we ship unless we accept the terms.
- **NC (non-commercial) files:** do not use.
- **Pixabay content:** free to use but not CC0; **do not commit raw Pixabay files into a public repository as an "asset pack"**.
- **itch.io packs:** many forbid redistributing raw files; this repo is public, so read each page.
- **Fonts:** all listed above are OFL: ship the licence file; do not rename a modified font without following the OFL.
- **AI-generated assets:** avoid for public work; if used as placeholders, record tool, plan and date.
- **Never use:** real brand logos (including city bus and railway marks, unverified), the State Emblem of India (its use in trademarks and designs is restricted by Indian law, per the research), real actors' faces or film posters, religious figures inside gameplay.

### 10.5 Minimum viable set to ship V0 and V1

A01, A02-A09 (fonts), A10 (wordmark), B01, B02, B03, B04, C01, C02, C06. Everything else can follow, and many B-class sprites and C06 sounds I can generate in code so you do not have to supply them.

## 11. Decisions for you

| ID | Question | Recommendation |
| --- | --- | --- |
| V-1 | ~~**Controller look:** original "classic-remote-inspired" or a literal classic motion remote~~ **Decided (13 Oct): original design resembling a classic remote, our own, matching the design system** | See [controller-design.md](controller-design.md) |
| V-2 | **Pixel art or smooth vector** for the shell | Pixel for UI and sprites; low-poly pixelated 3D; vector only for the logo |
| V-3 | **A mascot?** The name suggests chunky characters; none exists yet | Optional; decide after V1 |
| V-4 | **Languages** | English plus Hinglish labels now; Hindi and Marathi strings behind a string table later |
| V-5 | **Who makes the art:** you, a commissioned artist, or free packs plus procedural generation | Mix: free CC0 for textures and SFX, procedural for particles, commission the logo and key art |
| V-6 | **Final palette** | Approve or adjust section 4.1 |

## 12. Risks

Looking derivative of Devcon, ETHGlobal or a Nintendo menu (mitigation: the uniqueness check, our own metaphors); legibility of pixel Devanagari (mitigation: DOM text, large sizes, a separate font stack); performance of CRT and bloom effects on weak GPUs (toggles and the governor); asset licence mistakes (the credits file and the rules above); scope creep (the V-phase gates); a controller skin that hurts usability (targets win); cultural care with religious imagery and real brands (avoid both).
