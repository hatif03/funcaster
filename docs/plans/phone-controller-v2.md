# Phone controller v2: one tap to fullscreen, one universal remote, honest sensor tiers

> **Superseded in part, 6 November 2026 (later).** The implementation spec is [build/06](build/06-phone-remote-and-pointer.md). Changes: the chassis is **the previous controller face (`classic-controller.html`) with a skin change**, not a new design; the default skin is **`luna`** (blue, matches the shell; the owner does not want the white remote as default) with the wordmark **funcaster**, and the previous white remote is the optional `cream` skin; the **previous pointer (`core/pointer.js`) is retained** and fed by a new raw-sample stream; the app keeps the name **Funcaster**. The one-tap gate, the capability probe, the tiers and the postures in this document stand and are specified in code terms in build/06.

Status: plan, 6 November 2026. Nothing here is built. It answers owner requests 1, 3 and 4 6 November: *go fullscreen immediately, make the remote universal again (like the previous controller or a classic remote, with our branding), and map Android and iPhone sensors properly.* It builds on the audit of the shipped phone (`public/controller.html`, `public/party/phone.js`) and on a sourced capability study. Companion docs: [xp-console-ui.md](xp-console-ui.md) (the TV interface the phone steers), [xp-assets-and-licensing.md](xp-assets-and-licensing.md), [controller-design.md](controller-design.md) (superseded in part, see section 12), [controller-stress-tests.md](controller-stress-tests.md).

## 1. What the owner asked, and the short answer

| Ask | Short answer |
| --- | --- |
| 1. Fullscreen immediately after opening | **A browser will not enter fullscreen without a tap**, so "immediately" means *the first thing the player does is one tap, and that single tap does everything*: motion permission, audio, wake lock, fullscreen and orientation lock. On **Android and iPad** that gives real fullscreen. On **iPhone Safari there is no fullscreen for web pages** (Apple confirmed in December 2024 that there is no supported way), so iPhone gets the best immersive layout a tab can have, plus an optional installable app mode for regulars |
| 3. A universal remote with continuity, looking like the previous controller or a real classic remote, with our branding | **One fixed physical remote** (D-pad, A, B, 1, 2, minus, home, plus, identity lamp) that never changes. Games change **what the buttons mean**, shown on a small display strip, not **what the remote looks like**. Original layout from the first commit is the starting point; the look is ours (section 4 and the decision record in section 12) |
| 4. Android and iPhone expose different sensors; map everything | A **capability probe** at the first tap measures what this phone really does, assigns an **experience tier**, and tells both the phone and the TV. Per-tier behaviour is specified in section 7 so every player gets the best experience their phone can give |

## 2. What exists today (verified by reading the code, not by running it)

- **The live phone is `controller.html` plus `phone.js`** (1,163 lines). The original Wii-remote clone is `classic-controller.html` plus `controller.js`, no longer the default; it was replaced on 6 November and is reachable only by a pairing link.
- **No fullscreen, no orientation lock, no standalone handling** on the party phone. The legacy page did both inside the first tap (`lockUpright()`); the party phone dropped them.
- **Entry cost today:** scan, wait for the seat to be accepted (the button is disabled until then), tap "Let's play", answer the iOS motion prompt, hold still for about one second. Wheel games also need the phone rotated by hand.
- **The remote changes per game** (a roughly 200-line `render()` with per-game branches): wheel games show three pedals and a steering meter in landscape; aim games show a motion pad and one contextual button; Drawing shows a text box; Golf shows a hold-to-power button; Cloud Cruise and Slice Dojo hide the button entirely.
- **What the server accepts is small and clean:** `x`, `y`, `pulse`, `gas`, `brake`, `boost`, `seq`, `sampledAt`, at about 33 Hz, plus discrete `action` events (`primary`, `left`, `right`, `confirm`, `address`, `release`, `cancel`). Raw sensor data never leaves the phone. That wire format is a good base and **does not need to change** for a universal remote.
- **Motion maths:** relative to a calibrated neutral grip, so iOS and Android absolute-heading differences cancel out. Good. It never reads `rotationRate`, never reads `deviceorientationabsolute`, and the Android fallbacks the legacy page had (named Generic Sensor errors, empty-event filtering) were lost.
- **Gaps found:** no global scroll lock (pull-to-refresh and back-swipe can still fire); in-app browser detection covers only Instagram, Facebook and Line; the 5.5 s "no motion" hint is skipped for wheel games held in portrait; the vibration checkbox also turns off the iPhone visual fallback; two conflicting `theme-color` tags; the manifest's `start_url` is `/` instead of the controller; many touch targets and captions are far below readable size (6-8 px text, sub-48 px targets).

## 3. The one-tap entry flow

### 3.1 What a browser allows

| Capability | Android Chrome and Samsung Internet | iPhone Safari (and Chrome on iOS, which is WebKit) | iPad Safari |
| --- | --- | --- | --- |
| Fullscreen on a page element | Yes, **needs a tap** | **No.** No supported way | Yes, needs a tap |
| Orientation lock | Yes, usually **needs fullscreen** or an installed app | **No** | No |
| Motion events | Yes, no prompt today (a coming Chrome change may add one, so always call `requestPermission` when it exists) | Yes, **needs `requestPermission()` inside a tap** | Same as iPhone |
| Wake lock | Yes | Yes (iOS 16.4 and later; inside an installed app from 18.4) | Yes |
| Vibration | **Yes** (Chrome, Samsung); Firefox reports success but does nothing | **No** | No |
| Generic Sensor API (gyroscope, absolute orientation) | Chrome only | No | No |
| `deviceorientationabsolute` | Yes | No | No |

Source quality: the table is drawn from MDN compatibility data, WebKit and Apple developer-forum staff statements, and the Chromium intent-to-ship; the iPhone fullscreen finding is from December 2024 and **could not be re-checked for the newest iOS**. It is the first thing to test on a real device.

### 3.2 The gate: one screen, one button

The current "Let's play" screen becomes **the gate**. It is the only screen before the remote, it is never disabled (it queues the tap if the seat is still being accepted), and it carries the whole job. Its single big button says **"Tap to start"** and, inside that tap, in this exact order:

1. **Motion permission first, synchronously**, for both orientation and motion where `requestPermission` exists (iOS needs it inside the gesture; the order matters because awaiting anything earlier can use up the activation).
2. Create and `resume()` the **AudioContext** (also needed for the audio cues on a muted-haptics iPhone).
3. Request the **wake lock**.
4. **Fullscreen** where `document.fullscreenEnabled` is true, hiding the system navigation bar on Android (`navigationUI: "hide"`).
5. **Orientation lock** where supported, after fullscreen succeeds (the posture the current game wants; see section 6).
6. Run the **capability probe** (section 7) and send its result with the join.

Everything after step 1 is best effort and **never blocks play**: a failed fullscreen or lock shows nothing scary. A denied motion permission goes to the touch tier with one clear sentence and the exact Settings path (the existing message is good).

### 3.3 iPhone: what is honestly possible

A tab cannot hide Safari's chrome on iPhone. The plan, in order:

1. **Make the tab as immersive as a tab can be.** Lock the document (`position: fixed; inset: 0`, `overscroll-behavior: none`, `touch-action: none` on control surfaces), size with `100dvh` and `env(safe-area-inset-*)`, keep every control inside the safe area, keep targets away from the screen edges where the back-swipe lives, and design so the remote works with the address bar visible. In landscape Safari's bar is small, which suits the sideways posture.
2. **Offer installation once, at the right moment** (after a first successful game, not before): "Add to Home Screen for a full-screen remote". An installed page runs with no Safari chrome; with `apple-mobile-web-app-capable`, a status-bar style of `black-translucent` and `viewport-fit=cover` it fills the screen. Each room is a new URL, so installation only helps if the installed app is **the remote, not a room**. That needs a separate page: **"Funcaster Remote"**, start URL `/remote`, which asks for a room code or scans the TV's QR with the camera, then behaves exactly like the controller page. The existing manifest's `start_url: "/"` is wrong for this and is fixed as part of C3.
3. **Never block anything on installation.** Walk-up players at the event will not install; they get step 1.

### 3.4 Android: the best case

`requestFullscreen({navigationUI: "hide"})` followed by an orientation lock gives true immersive play. Handle the three errors (`NotSupportedError`, `SecurityError`, `AbortError`); release the lock when the player leaves. Samsung Internet follows Chrome. **Firefox Android** has a broken orientation lock in many versions (working again from version 144), so treat a lock failure as normal.

### 3.5 Rotation without a lock

On iPhone (and anywhere the lock fails) the player may have the system rotation lock on. Today wheel games show a "turn your phone sideways" blocker. **Remove the blocker.** Steering is a roll about the axis perpendicular to the screen; that is the same physical gesture whether the layout is portrait or landscape, and the existing steering maths already measures it relative to the calibrated grip. So: a **portrait layout for the three pedals** (1, A, 2 in one bottom row) is added, and "sideways" becomes a *preference*, not a requirement. **This needs a real-device check** that calibration holds in portrait; if it does not, the blocker returns for that case only.

## 4. The universal remote

### 4.1 Principles

1. **The remote never changes between games.** The same buttons are in the same places on the same body. This is the continuity the owner remembers from the original controller.
2. **Games assign meanings, the remote shows them.** A one-line caption near each button (A: "Fire", B: "Back", 2: "Gas") appears while a game is on, and fades when nothing is assigned.
3. **Motion is always there.** Tilt, roll, aim, flick and swing come from the same sensors; the game decides which it uses.
4. **A "context window" shows the one thing that changes:** the power meter, the steering meter, the guess box, the wind arrow, the sensitivity slider. It is a screen inside the remote, like the small display strip on a modern remote, not a different remote.
5. **Identity is constant:** the four-lamp strip, shape and colour for your seat, always at the top.
6. **A design that survives a bad phone:** every button is a large touch target (48 px minimum, 96 px for A), and text is readable (14 px minimum).

### 4.2 Anatomy: pointer posture (portrait, held upright)

```text
        (O) power / link lamp          ● ▲ ■ ◆   seat lamps (yours lit)
   +--------------------------------+
   |            CHONKS              |  wordmark (our brand, not the original's)
   |   +------------------------+   |
   |   |   context window       |   |  game name, meters, guess box,
   |   |   (changes per game)   |   |  captions for A / B / 1 / 2
   |   +------------------------+   |
   |         [ ^ ]                  |
   |     [ < ] [ . ] [ > ]    ( A ) |  D-pad, large A
   |         [ v ]                  |
   |    ( - )   ( ⌂ )   ( + )  [ B ]|  minus, home, plus, B trigger
   |                                |
   |       ( 1 )       ( 2 )        |  1 and 2
   |        ||||||||||              |  speaker grille (pulses on feedback)
   +--------------------------------+
```

### 4.3 Anatomy: sideways posture (landscape, held in two hands)

```text
   +------------------------------------------------------------------+
   | ● ▲ ■ ◆   CHONKS     [ context window: steering meter, boost ]   |
   |   [ ^ ]                                                          |
   | [<] [.] [>]   ( - ) ( ⌂ ) ( + )          ( 1 )   ( A )   ( 2 )   |
   |   [ v ]                                                          |
   +------------------------------------------------------------------+
        left thumb                                    right thumb
```

In the sideways posture **1, A and 2 are the three racing pedals, enlarged**: 1 is Brake, A is Boost, 2 is Gas. That is the order the legacy remote used for 1 and 2 and the order the shipped racing controller uses (Brake left, Boost centre, Accelerate right), so the muscle memory is kept and the labelling finally agrees with the remote.

### 4.4 Button roles (constant meanings, game-assigned details)

| Control | Constant role | Typical game meaning |
| --- | --- | --- |
| **D-pad** | Move focus; choose | Menus; Kart Rush driver select; Cloud Cruise trim; item cycling |
| **A** | Primary: confirm, act | Fire, Strike, Return, Take shot, Pen down, Boost, Start |
| **B** | Secondary: back, cancel, trigger | Back, Cancel shot, Brake in some games, Hold-to-aim |
| **1** | Left-hand secondary | Brake (racing); Recenter (hold) elsewhere |
| **2** | Right-hand secondary | Gas (racing); Status sheet elsewhere |
| **minus, plus** | Sensitivity down and up (the original use); adjust a value | Sensitivity, volume, zoom |
| **Home (⌂)** | Open the **party menu**; hold to recenter or leave | The same everywhere; host-only items appear for the host |
| **Motion** | Pointer, aim, steer, flick, swing | Per game, below |
| **Speaker** | Pulses with feedback; plays cues where allowed | Hit, win, error |

**Hold rules** (the existing ones, made universal): hold **Home** 0.8 s for the party menu; hold **Home** 1.8 s to leave; hold **1** 0.65 s to recenter. Buttons never do two things on a single tap.

### 4.5 Skins and branding

The remote is **ours**: our name, our proportions, our colours. Default skin **"Funcaster Cream"**: warm white body, kaali-peeli (black and taxi-yellow) accent ring on the lamp strip and A button, the seat colours on the lamps. Skins that already exist in the code (**Taxi**, **City Bus**, **Local**) are kept as paint jobs, and a **"Luna"** skin (the console's blue and green) matches the XP interface. The wordmark is "CHONKS" in the console's logo face. Buttons carry letters and numerals only; **no Nintendo marks, names, fonts or logos**, and the product never calls anything "Wii".

## 5. Per-game mapping

Constant: the chassis (4.2/4.3). What changes: the posture, the caption on each button, and the context window. "Motion" is what the game reads from the sensors (the party wire format is unchanged: tilt becomes `x` and `y`, buttons become `action` and the pedal flags).

| Game | Posture | Motion | A | B | D-pad | 1 | 2 | Context window |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Launcher / desktop** (TV shell) | Pointer | Pointer (cursor) | Click | Back | Move focus | Recenter | Help | The current pointer mode and a hint |
| **Kart Rush** | Sideways (or portrait pedals) | Roll steers | Boost (three uses) | Look back | Left and right: driver select in setup | Brake | Gas, and confirm | Steering meter, boost stock and recharge |
| **Time Trial** | Sideways | Roll steers | Boost (if the game gives it) | Look back | Menu | Brake | Gas | Steering meter, lap time |
| **Neon Drift** | Sideways | Roll steers | Boost | none | Menu | Brake | Gas | Steering meter, boost budget |
| **Pocket Greens** | Pointer | Aim by tilt | Hold to build power, release to putt | Cancel shot | Club or spin where the game has it | Recenter | Scorecard | **Power meter** and wind arrow |
| **Slice Dojo** | Pointer | Blade follows aim | none | none | Menu | Recenter | Pause | Combo and score |
| **Table Tennis** | Pointer | Paddle by aim | Power return | none | Menu | Recenter | Serve | Score and serve |
| **Foam Fencers** | Pointer | Blade by aim | Strike | Guard | Menu | Recenter | Taunt (cosmetic) | Stamina |
| **Shooting Range** | Pointer | Crosshair | Fire | Reload | Menu | Recenter | Zoom | Ammo, targets |
| **Alien Attack** | Pointer | Move by tilt (side) | Fire | Special | Menu | Recenter | Pause | Lives, power-ups |
| **Cloud Cruise** | Pointer | Bank and pitch | none | none | Menu | Recenter | Trim | Altitude, rings |
| **Drawing** | Pointer | Pen follows aim (drawer) | Pen down and up | Undo | Pick colour | Clear (hold) | Submit guess | **Guess box** (guessers) or the palette (drawer) |
| **Star Catch** | Pointer | Steer by tilt | none | none | Menu | Recenter | Pause | Score |
| **Bubble Burst** | Pointer | Aim, **flick** pops extra | Pop a little extra | none | Menu | Recenter | Pause | Score, combo |

Anything marked "none" shows no caption, and the button remains on the remote but dimmed, never removed.

## 6. Postures and rotation

- **Pointer posture** is the default for every game that is not a wheel game and for all shell navigation.
- **Sideways posture** is the default for the three racing games.
- The gate asks the game for its default posture and applies the orientation lock to match (Android and iPad). Everywhere else the layout simply follows the way the phone is held, and a game never refuses to work because of the orientation (section 3.5).
- A rotation does **not** trigger a full recalibration. Today every rotation drops 0.7 to 0.85 s of input; v2 re-bases the neutral pose by the known rotation angle and recalibrates only if the result looks wrong.

## 7. Sensors: tiers, the capability probe and what each player gets

### 7.1 The probe

Runs inside the first tap and for about one second afterwards, and costs nothing visible. It records:

| Probe | Method | Why |
| --- | --- | --- |
| **Platform and engine** | Feature tests first; user agent only for in-app browsers | Route code; coach the right fix |
| **Gyroscope present** | Orientation events arrive with non-null `beta` and `gamma`; `rotationRate` non-null | Decides the motion tier |
| **Real event rate** | Count events over one second, for `deviceorientation` and `devicemotion` separately | Tune smoothing; spot throttling |
| **Sensor family available** | Relative orientation; absolute orientation (Android); Generic Sensors (Chrome) | Choose the best source; keep the Generic Sensor fallback |
| **Gravity sign convention** | Sign of `accelerationIncludingGravity.z` when the phone is roughly flat | Normalise flick detection (empirical, not user-agent based; it is fragile if the phone starts upright, so flicks use magnitude only) |
| **`rotationRate` units** | Compare its magnitude with the angular speed derived from successive orientation samples | Detect degrees versus radians per second, if the swing path ever uses it |
| **Haptics** | `navigator.vibrate` present; on iPhone the hidden-switch haptic as a best-effort probe | Pick the feedback channel |
| **Touch capacity** | `navigator.maxTouchPoints` | Cap simultaneous-touch designs (pedals plus D-pad) |
| **Display** | `fullscreenEnabled`, standalone, safe-area insets, `100dvh`, screen size and pixel ratio | Layout and the install hint |
| **Environment** | In-app browser signals (Instagram, Facebook, Line, WhatsApp, Telegram, TikTok, Snapchat, X, WeChat, Messenger, Android WebView); secure context | Coach "open in Chrome or Safari"; explain missing sensors |

The result is a small **`device`** object sent with `join` and shown to the TV: `{platform, tier, gyro, hz, haptics, fullscreen, standalone, touchMax}`. The server stores it per seat (no personal data) and the lobby shows a quiet chip such as "Priya: touch mode" so the group understands.

### 7.2 The tiers

| Tier | Who | Controls | What changes for them |
| --- | --- | --- | --- |
| **A: Full motion** | iPhone with permission granted; Android Chrome or Samsung with a gyroscope | Everything: pointer, aim, roll, flick, swing, buttons | iPhone: no fullscreen (hint to install), visual and audio feedback, best-effort haptic; Android: fullscreen, lock, vibration |
| **B: Touch only** | Android with no gyroscope or sensors missing; any phone with motion denied; HTTP LAN | A drag pad for aim, a slider or swipe for steering, the same buttons | All 13 games playable at reduced precision; pointer shell works with a drag pad and the D-pad; the lobby tags the seat |
| **C: Constrained browser** | In-app browsers, old WebViews, anything detected as limited | Starts in B; the gate shows one line: "Open in Chrome or Safari for motion" with a copyable link | After they reopen, they become A or B |
| **D: Big screen** | iPad, Android tablet, desktop (a mouse is the pointer) | Same as A or B, larger | A tablet can use fullscreen (iPad) and the large layout; a desktop browser is a development and test controller |

Rules: a tier is **chosen automatically and can be changed by the player** ("Use touch instead" is always one tap; "Try motion again" always available). A phone that fails the probe never sees a dead screen: it is placed in tier B within two seconds, not after the existing 5.5 s timeout, and that includes **wheel games held in portrait**, which the current timeout skips.

### 7.3 Mapping the signals (how a sensor becomes an input)

| Signal | Source (best first) | Becomes | Notes |
| --- | --- | --- | --- |
| **Tilt aim** | Relative orientation, calibrated neutral | `x`, `y` in -1..1 | Existing, unchanged; the neutral cancels iOS and Android heading differences |
| **Steering roll** | Relative orientation, roll about the screen normal | `x` for wheel games | Existing; works in any posture |
| **Pointer** (shell) | Same aim path, mapped to the TV's pixels with a gentle curve and a dead zone | Cursor position | Recenter on **hold 1** |
| **Flick** | `devicemotion` linear acceleration, else low-passed gravity-inclusive acceleration | `pulse` | Existing for Bubble Burst; now a shared service |
| **Swing** | `devicemotion` `rotationRate` (units normalised by the probe) plus acceleration | A new `swing` flag with strength | For games that want a real swing (Table Tennis, Foam Fencers); optional, behind the probe |
| **Touch pad** | Pointer events | `x`, `y` | Tier B |
| **Touch pedals and buttons** | Pointer events with capture, one id per control | Flags and `action` | Existing |
| **Haptic** | `vibrate` on Android; the iOS switch trick best effort; always a visual and audio cue | Feedback | The vibration setting no longer disables the visual fallback |

The server wire format does not change except for an optional `swing` field; this keeps the proven path stable.

## 8. Robustness rules

1. **Lock the page:** `html, body` fixed, `overscroll-behavior: none`, `touch-action: none` on control surfaces, `-webkit-touch-callout: none`, `user-select: none`, tap highlight off, `contextmenu` blocked. Add a global `touchmove` guard (the legacy page had one).
2. **Back gesture:** the iOS edge swipe cannot be stopped; keep targets off the edges. On Android add a `popstate` guard so the system back opens the party menu instead of leaving.
3. **Multi-touch:** each control tracks its own pointer id; plan for at most three simultaneous touches (steering is motion, so two thumbs plus the D-pad is the real maximum). Read `maxTouchPoints`.
4. **Visibility:** on hide, release controls and mark away; on return, re-acquire the wake lock, reconnect the socket if needed, and show "Tap to resume" rather than guessing.
5. **Readable and reachable:** 48 px minimum targets, 14 px minimum text, captions at least 12 px, contrast 4.5:1 or better, labels not by colour alone (seat shapes stay).
6. **Safe areas:** every layout, including landscape, keeps controls inside `env(safe-area-inset-*)` (the landscape override today drops the bottom inset).
7. **One theme colour**, consistent with the shell; manifest `start_url` and `orientation` fixed; the apple status-bar style set.

## 9. Steering the TV shell from the remote

Requirement from the owner: *"I cannot control everything from my controller."* The shell ([xp-console-ui.md](xp-console-ui.md)) is designed to be **fully operable from the remote**:

- **Pointer mode:** tilt moves a cursor on the TV; A clicks; B goes back; Home opens the Start menu; hold 1 recenters. The cursor is drawn in the seat colour with the seat shape.
- **Focus mode:** the D-pad moves a focus ring across icons, tabs and buttons; A activates; B backs out. Pressing the D-pad switches to focus mode; moving the phone brings back the pointer. This is how TV interfaces work, and it makes the shell usable by a tier B player with no gyroscope.
- **Text entry** (a nickname, a room name, a drawing guess): a text field opens **on the phone**, mirrored in the TV window. No on-screen keyboard.
- **Who steers:** the host (or the delegated VIP phone) controls the shell. In party mode other seats get a small **"Player setup" window** on their own phone for the choices that are theirs (driver, colour, nickname, sensitivity). In Kiosk mode the shell runs itself.

## 10. Implementation plan

| Step | What | Depends on | Size | 6 November? |
| --- | --- | --- | --- | --- |
| **C0** | Fix the cheap defects: lock the page and add the global touch guard, one theme colour, manifest start URL and orientation, readable text and 48 px targets, the in-app browser list, the wheel-in-portrait hint, the visual-feedback decoupling | none | S | **Yes** |
| **C1** | **The gate:** one "Tap to start" tap that runs permission, audio, wake lock, fullscreen, orientation lock and the probe, in order, never disabled | C0 | M | **Yes** |
| **C2** | **The capability probe** and the `device` object, tiers A to D, automatic fall back to touch within two seconds, lobby chips | C1 | M | **Yes** |
| **C3** | **The universal chassis** in both postures, the context window, caption system, constant button roles, portrait pedals for wheel games, skins | C0 | L | **Yes (the portrait and sideways chassis for all games, with captions)** |
| **C4** | **Pointer and focus navigation** for the shell, text entry on the phone, recentering | C3 and the shell's window manager (U3) | M | Yes for the shell's basic flow |
| **C5** | Installable "Funcaster Remote" for iPhone (`/remote`, room-code entry or camera scan, status bar, safe areas) | C1 | M | No |
| **C6** | Swing detection service and the optional `swing` input; Generic Sensor fallback restored from the legacy page | C2 | M | No |
| **C7** | Device matrix testing, then the stress plan ([controller-stress-tests.md](controller-stress-tests.md)) | C1-C4 | M | The matrix is **yes**; the full stress plan is no |

### Device matrix (the minimum to pass before the event)

iPhone Safari (current and one version back), iPhone Chrome, iPad Safari; Android Chrome on a flagship and a mid-range phone; Samsung Internet; Android Firefox; **one Android phone known to lack a gyroscope**; an in-app browser launched from a messaging app. For each: the gate, the permission outcomes (granted, denied), fullscreen and lock, calibration in both postures, pointer shell navigation, a Kart Rush round with pedals in both layouts, haptics, sleep and reconnect, back gesture, and a 30-minute run.

## 11. Risks and open questions

| Risk | Mitigation |
| --- | --- |
| iPhone fullscreen behaviour has changed in the newest iOS | First device test; the plan already works without it |
| Permission grants on iOS may not persist across reloads | Always call from the gate; treat denial as tier B with the Settings path |
| Portrait wheel steering may calibrate differently | Check on real phones; keep the blocker only for that case |
| The iOS haptic trick may be patched (reports say possibly in 26.5) | Always give visual and audio feedback; never rely on it |
| `rotationRate` units and the gravity sign convention differ on older devices | The probe measures them; the existing aim and steer paths do not depend on either |
| A bigger remote means more to build | C3 is split: portrait first, sideways second; captions can ship before skins |
| A universal chassis crowds small phones (320 px wide) | Section 4 sizes were checked against the 320 by 568 and 390 by 844 phones in the UI review; the context window collapses first |

Open for the owner: the default skin ("Funcaster Cream"); whether the remote may show a captioned **tutorial** the first time each game starts (recommended); and whether tier B players should be flagged to the group in the lobby (recommended, quietly).

## 12. Decision record: the remote's look (supersedes controller-design.md section 7)

On 6 November the owner decided the remote should be **original**, resembling a classic remote but not a copy, and [controller-design.md](controller-design.md) section 7 listed what it deliberately omits (a D-pad, plus and minus, a house-shaped home button, numbered 1 and 2) to stay clear of the trade dress of the original.

On 6 November the owner asked for the remote to **look like the previous controller or the real classic remote, with our branding**, and for **continuity** across games.

**This plan follows the newer request.** The functional layout of a classic remote (D-pad, A, B, 1, 2, minus, home, plus) returns, and the shipped phone's per-game redesign is replaced by one constant chassis. What keeps it ours: the name and wordmark "FUNCASTER"; our own proportions and colour ("Funcaster Cream" with kaali-peeli accents, the seat shapes and colours on the lamp strip); our own icons; no Nintendo names, logos, fonts or typography; the product never uses the original's name; and the legacy page was already a Funcaster-branded CSS clone, so this is a return to our own earlier work, not a new borrowing. **One risk is recorded and not repeated:** a remote that closely resembles a famous product is still a resemblance, the repository is private, and the exposure is the public demo and any shared screenshots. If the project is ever challenged, the fix is a skin change (colour, proportions, the home glyph), not a rebuild, because the chassis is data-driven (section 4.5).
