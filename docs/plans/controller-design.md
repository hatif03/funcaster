# The Funcaster Remote: our own controller design

> **Superseded in part, 6 November 2026.** The owner reversed the decision in section 7: the remote now returns to a classic layout (D-pad, A, B, 1, 2, minus, home, plus) as **one universal chassis**, with our branding. See [phone-controller-v2.md](phone-controller-v2.md), especially section 4 (the chassis) and section 12 (the decision record). Sections 1 to 6 here (identity lamp, skins, feedback, targets) remain useful input.

Status: design spec, 6 November 2026. **Decision (owner, 6 November):** not a literal copy of the classic motion remote; an original design that *resembles* a classic remote, matches our design system ([visual-direction.md](visual-direction.md)) and serves our use case. This spec turns that into something a front-end developer can build. It is not legal advice; the "how this differs" checklist in section 7 is a design discipline, not a clearance.

It builds on the audit findings in [controller-stress-tests.md](controller-stress-tests.md) (small targets, weak identity, one layout, no away state) and the host controls in [host-phone-controls.md](host-phone-controls.md).

## 1. Design goals

1. **Reads as a remote at a glance.** Slim handheld, one big round primary button, an indicator at the top, a hand-held feel. That is the nostalgia you asked for.
2. **Unmistakably ours.** Chunkier proportions, a taxi roof-lamp, a checker band, Mumbai paint jobs, our own glyphs and labels.
3. **Identity first.** Across a table of four identical phones, a player finds theirs from three metres by colour, shape and number.
4. **Usable before pretty.** Every control at least 48 px (primary at least 96 px); the "body" never shrinks a control. If style and usability conflict, usability wins.
5. **One shell, many contexts.** The body is constant; what is inside it changes (aim pad, steering, swing, keyboard, watch, results).
6. **Cheap on the phone.** Static gradients and inline SVG, no blur filters, animations only on transform and opacity, so battery and heat stay low.

## 2. Anatomy (portrait)

```
        +-----------------------------+
        |  [ROOF LAMP]  chonks.       |   roof lamp: four seat-shape bulbs
        |   (o)  (^)  (#)  (*)        |   your bulb lights in your colour;
        |   ^lit = you                |   the lamp also shows link quality
        +-----------------------------+
        |                             |
        |      CONTEXT WINDOW         |   aim pad / power meter / keyboard /
        |   (what the game needs)     |   standings, at least 45% of height
        |                             |
        +-----------------------------+
        |   [ back ]   (  PRIMARY  )  |   primary: 96-120 px, seat colour,
        |   small       contextual    |   label says what it does:
        |   circle      label         |   "READY" "SWING" "FIRE" "GO"
        |             [ menu: hold ]  |
        +=============================+
        |/ / / / checker band / / / / |   skin pattern, seat-colour glow
        +-----------------------------+
        |  ping 34ms  *  battery  *   |   readout, text at least 14 px
        +-----------------------------+
```

| Part | What it is | Notes |
| --- | --- | --- |
| **Roof lamp** | A bar at the top like the roof sign on a taxi, with four **bulbs in our four seat shapes** (circle, triangle, square, diamond). Your bulb is lit in your seat colour; the others are dim | Replaces the row of four identical dots. Link quality: steady = good, slow pulse = weak, amber blink = reconnecting. Static when reduced motion is on |
| **Context window** | The interactive area; holds the pad, steering meter, power meter, keyboard or standings | At least 45% of screen height in portrait; never covered by chrome |
| **Primary button** | A large round button in the **seat colour** with a **contextual word** ("READY", "SWING", "FIRE", "GO") and black text | 96-120 px; at least 96 px tall always. Words, not letters, so there is nothing to learn |
| **Back** | A small round button, bottom-left | At least 48 px; confirms nothing destructive |
| **Menu** | A small round button, bottom-right, **hold about 800 ms** to open the menu sheet (host sheet for the host) | A tap does nothing; protects against stray thumbs |
| **Checker band** | A pattern band across the lower body in the skin's pattern, glowing in the seat colour | Pure decoration plus identity; costs one small SVG tile |
| **Readout** | Ping, battery where available, seat number | Text at least 14 px, black or cream on the body colour per contrast table |

**Proportions.** Chunkier than a classic remote (roughly a 1 : 2.4 width-to-height body inside the phone's viewport, not the 1 : 4+ of a slim stick), because the phone is a wide rectangle and fat targets matter. The silhouette has soft shoulders and a slightly fuller lower body (a deliberate "chonk" belly) so it cannot be mistaken for a straight slab.

## 3. Landscape wheel layout (racing)

```
+-----------------------------------------------------------------------+
| (o)(^)(#)(*)  chonks.    < steering meter: LEFT ---o--- RIGHT >  [menu]|
|-----------------------------------------------------------------------|
|  +-------------+     +----------------+     +-----------------------+ |
|  |   BRAKE     |     |  BOOST  x3     |     |      ACCELERATE       | |
|  |  (kaali)    |     |  (marigold)    |     |     (seat colour)     | |
|  +-------------+     +----------------+     +-----------------------+ |
|=======================  checker band, thin  ==========================|
+-----------------------------------------------------------------------+
```

- Chrome is a **thin frame** in this mode so pedals stay at least 102 px tall (today's landscape pedals are 102 px; the lamp and band share the top and bottom edges).
- Pedals sit under the thumbs; the menu is a small hold-to-open control at the top corner outside the pedal zone.
- Portrait-locked users get a clear "turn your phone" card **and** a one-tap touch-steering alternative (audit finding F12).
- Mirrored-pedals option for left-handed players (exists).

## 4. Contexts: what lives inside the body

| Context | Context window shows | Primary button says | Other |
| --- | --- | --- | --- |
| **Join and permission** | Seat colour reveal, shape, number, coaching for the motion permission | "LET'S PLAY" | A visible "use touch instead" at 48 px; iOS Settings path if denied; in-app-browser warning |
| **Calibrate** | A ring that fills while the phone is held still | (none) | Cancel is a 48 px back button |
| **Lobby (player)** | Seat identity large, who is ready, game and mode | "READY" / "NOT READY" | Crown icon on whoever is host |
| **Lobby (host)** | Host sheet launcher, start reason | "START" (disabled with the reason) | See host plan |
| **Pointer play** (Slice Dojo, Shooting Range, Drawing) | Aim pad with a crosshair | Game verb ("FIRE", "DRAW") | Recentre on long-press of the primary |
| **Swing** (Golf, Table Tennis, Foam Fencers) | Power meter on the left spine, aim pad, "YOUR TURN" card | "HOLD TO LINE UP", then "SWING" | Wind and distance readouts for Golf |
| **Wheel** (Kart Rush, Time Trial, Neon Drift) | Landscape layout above | Gas on the right | Touch steering as the alternative |
| **Flight** (Cloud Cruise, Alien Attack) | Tilt indicator | "FIRE" or "BOOST" | |
| **Keyboard** (Drawing guesses, names) | A native text field, scrolling enabled | "SEND" | Text selection allowed here only |
| **Watch** (waiting, spectating) | Whose turn, countdown, standings, quick reactions | "REACT" | Reactions are icons, rate-limited |
| **Results** | Rank, score, rematch vote | "AGAIN" | |
| **Away / reconnecting** | A large ring with a seat-held countdown ("Your seat is held for 20 s") | "TAP TO COME BACK" | The lamp blinks amber; the screen shows the seat as away |

## 5. Skins (paint jobs) and the design tokens

A skin changes the body and band, never the controls. Seat colour is always the accent so identity survives any skin.

| Skin | Body | Band | Lamp glass | Notes |
| --- | --- | --- | --- | --- |
| **Kaali-Peeli** (default) | `--kaali` `#111111` | Black and `--peeli` `#F7C600` checker | Smoked | The signature look |
| **City Bus** | `--red` `#E0314B` | `--cream` `#FFF1D6` stripe | Clear | Generic bus red, not a brand colour |
| **Local** | `--blue` `#2A6FDB` | `--cream` stripe | Clear | Train blue and cream |
| **Deco** (later) | `--mint` `#9EE6CF` | `--peach` `#FFC9B5` | Frosted | Marine Drive pastel |

**Seat identity (replaces Lilac, Peach, Mint, Sunny):** Peeli ● circle, Magenta ▲ triangle, Cyan ■ square, Marigold ◆ diamond. **Text on any bright seat fill is black** (`--kaali`): contrast is 11.7:1 on peeli, 5.5:1 on magenta, 12.1:1 on cyan and 9.2:1 on marigold (computed). White text fails on the old seat colours (2.0 to 3.0:1) and on magenta (3.46:1), so it is not used on fills. If more than four seats are ever added, extra seats get further shape and colour pairs defined in the seat plan.

Content window background is `--night-900` with `--cream` text (16.1:1). All tokens come from the shared `tokens.css` so the phone, TV and games match.

## 6. Behaviour and feedback

| Aspect | Spec |
| --- | --- |
| **Press feel** | A chunky 4 px depress on `pointerdown` (we already send on `pointerdown`, not `click`, so there is no lag); no animation longer than 80 ms |
| **Hit area** | Visible shape plus at least 8 px of invisible slop on every control; 8 px minimum gap between neighbours (16 px in motion modes) |
| **Haptics** | Per event patterns where `vibrate` exists: tap 10 ms, ready 20 ms, hit 30 ms, your turn 40-60-40 ms, crash 80 ms, countdown tick 8 ms |
| **iPhone** | No Vibration API in Safari: every event also gets a full-screen colour pulse (80 ms) and a phone-speaker click; an iOS switch-checkbox haptic is an optional bonus (unreliable, test on current iOS) |
| **Sound** | A small synth click set (the old remote's click, swoosh and thud can be reused) at a volume the player controls |
| **Lamp** | Heartbeat pulse tied to round-trip time; amber blink when reconnecting; static in reduced motion |
| **Safety** | First-run safety card (grip, space, no throwing); gentle mode scales swing thresholds; break reminder after about an hour |
| **Left-handed** | Mirror switch moves back and menu; pedals mirror; nothing needs two hands |
| **Accessibility** | Colour plus shape plus number always; high-contrast skin option; large-target mode (primary at least 120 px); every control labelled; reduced motion stills the lamp; visual and audio cues for every haptic |

## 7. How this differs from the original (the discipline)

**Kept, because it is the genre's shared vocabulary:** a slim handheld, one big round primary button, a secondary trigger-like action, an indicator showing which player you are, buttons that give hand feedback.

**Deliberately different, so it is ours:**

| Classic motion remote | Funcaster Remote |
| --- | --- |
| White slab, near-straight sides | Chunkier body with soft shoulders and a fuller lower half; Mumbai paint jobs |
| Cross-shaped D-pad | None; the aim area is the pad; no directional cross |
| A, B, +, -, Home, 1, 2 labels and arrangement | Contextual **words** on the primary; small back and hold-menu circles; no +/- pair, no house icon, no numbered 1/2 |
| Four identical blue player LEDs | A roof lamp with four **shaped** bulbs in colours (circle, triangle, square, diamond) |
| Speaker grille on the face | None |
| Brand mark on the body | "chonks." wordmark in our own type |
| Wrist-strap lug | A decorative checker band instead |
| Grey and white only | Seat colour as the identity accent on every skin |

Do not add: the "Wii" name or logo, a house-shaped Home icon, the +/- pair in that arrangement, or the exact outline proportions. If the team ever wants something closer to the original than this table, treat it as a new decision with the trade-dress risk in view.

## 8. Implementation

- **Technique:** inline SVG for the body silhouette, CSS grid for the content, skins as CSS variables on `[data-skin]`, one small SVG pattern tile per skin (target under 8 KB each). No images required for the shell. No blur or backdrop filters.
- **Where:** `public/controller.html`, `public/party/phone.css` (890 lines today), `phone.js` (state rendering; add the away and reconnecting overlays and the contextual labels). The motion logic (`core/party-motion.js`, `racing-motion.js`) is untouched.
- **Weight:** phone page under 500 KB total, fonts subset to Latin plus Devanagari.
- **Retire** the classic remote (`public/classic-controller.html`, `controller.js`) or move it behind a clearly labelled "legacy" route; it is the Wii-remote clone and shares no code with the party phone.

| Step | Work | Gate |
| --- | --- | --- |
| C0 | Tokens, seat colours and shapes, fonts | Contrast tests pass for every text and fill pair |
| C1 | The shell: body, roof lamp, band, readout; target sizes | Automated check: every control at least 48 px (primary at least 96); neighbours at least 8 px apart |
| C2 | Contexts: join, calibrate, lobby, pointer, swing, wheel, flight, keyboard, watch, results, away | Each context renders at 360x640 and 430x932, portrait and landscape |
| C3 | Skins and settings (skin, mirror, large targets, reduced motion) | Screenshot tests per skin and seat colour |
| C4 | Feedback: haptic table, iPhone visual and audio cues, lamp states | Every event has a non-haptic cue |
| C5 | Tests and playtests ([controller-stress-tests.md](controller-stress-tests.md)) | A first-timer finds their phone from 3 m; mis-press rate under 3%; no "blocks play" finding |

## 9. Open questions

1. A name for the controller ("Funcaster Remote" is the working name).
2. Whether a skin chooser appears at join or only in settings (recommend settings, with the paint job defaulting from the seat).
3. Whether the roof lamp should show a tiny live ping number (recommend no; the pulse is enough).
4. Whether to ship Deco in the first release (recommend after the first three).
