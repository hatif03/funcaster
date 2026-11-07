# Funcaster: the build specification

Status: scheduled software implemented through SH11, VP5 and HO3, 6 November 2026; automated and browser evidence is recorded. Physical QA2/QA3 and HO1/HO2 hosting remain pending. The owner requested PR delivery and merge on 6 November after verification; deployment remains pending. [Progress, remaining tasks and measured evidence](../../OS-BUILD-PROGRESS.md). This folder is the **implementation spec** for the new direction: a Windows-XP-style desktop console (Funcaster) over a pixel-art Mumbai wallpaper, with a universal phone remote, a mascot, the unchanged Funcaster brand, and the fit of 13 games to any screen. It is written so that another person or agent can build it without asking questions, and improve it by replacing guesses with measurements.

The goals, the guardrails and the whole document map are in the **North star** section of [plan.md](../../../plan.md#north-star-and-direction-6-november-2026). The earlier direction documents ([xp-console-ui.md](../xp-console-ui.md), [phone-controller-v2.md](../phone-controller-v2.md), [xp-assets-and-licensing.md](../xp-assets-and-licensing.md)) give the reasoning; **where they disagree with this folder, this folder wins** (the differences are listed in section 3).

## 1. Reading order

| # | Document | Read it for |
| --- | --- | --- |
| 01 | [Brand and mascot](01-brand-and-rename.md) | The brand stays Funcaster, the mascot (Chonk the cat) with its brief and animation list, the brand kit, and an appendix of rename hazards for the future |
| 02 | [Theme and assets](02-theme-and-assets.md) | The Luna skin decision, **every supplied file and how it is used**, the wallpaper clean-up with pixel boxes, the sprite atlas, icons, cursors, sounds, fonts, the tokens, the asset script |
| 03 | [Shell architecture](03-shell-architecture.md) | `public/os/` module by module: session, scaling, layers, window manager, spatial navigation, pointers, mascot, boot, audio, game host, windows, routing |
| 04 | [Game Properties](04-game-properties.md) | Every option of the 13 games placed on four tabs, the presentation layer, presets, start gating, the window's markup and tests |
| 05 | [Games and viewport](05-games-and-viewport.md) | The fit class of each game, the shared fixes, per-game changes, the viewport matrix and its test |
| 06 | [Phone remote and pointer](06-phone-remote-and-pointer.md) | The previous controller reused as the universal remote, skins, captions, the one-tap gate and probe, **the retained pointer and its wire protocol**, server changes |
| 07 | [Schedule, tests, runbook](07-schedule-tests-runbook.md) | The three scope levels, task IDs and sizes, the day-by-day plan to 6 November, launch commands, the test files, rehearsals, the event runbook |
| data | [data/](data/) | Machine-readable output of the asset indexing: atlas, icon index and picks, cursors, clip timing, sounds, fonts |

## 2. Owner decisions of 6 November 2026 (final; do not reopen without asking)

| # | Decision | Where it lands |
| --- | --- | --- |
| 1 | **Use the supplied Windows asset pack as supplied, without further questions; use what has been added.** The owner later confirmed that all the licences allow free use, and asked for the assets to be **committed to GitHub** so the teammate has them | [02](02-theme-and-assets.md). The pack is used for UI sprites, icons, cursors, sounds, fonts and the helper character. Everything supplied is committed under `assets/source/`; the build generates the shippable subset into `assets/os/`; the server does not serve `/assets/source`. The theme manifest keeps every asset swappable |
| 2 | **Keep the previous GPS-like moving probe** (the legacy pointer) | [06](06-phone-remote-and-pointer.md) section 6: the raw-sample stream and the `Pointer` class drive the shell cursor |
| 3 | **The universal remote is fine**; base it on the previous controller face with **a skin change**; our own colours, wordmark and proportions are fine, and some of the old look can stay. **The default must not be the white remote** (owner, later on 6 November) | [06](06-phone-remote-and-pointer.md) sections 2 to 4: the default skin is **`luna`** (blue, matches the shell); the previous white remote is the optional `cream` skin; wordmark "chonks" |
| 4 | **Write the detailed plan of what to build, what to use, all references, down to the last detail**; do not worry about the time budget in the plan | This folder |
| 5 | **Name: keep Funcaster; the mascot is a cat** (owner, 6 November, after a rename was explored: Dabba and Dabbu rejected, Tapri and Kadak dropped) | [01](01-brand-and-rename.md): Funcaster unchanged; **Chonk**, a chubby kaali-peeli street cat whose collar tags light up as phones join. No rename pass and no identifier changes |
| 6 | **Skin:** the most recognisable Windows theme that matches the product | [02](02-theme-and-assets.md) section 1: **Windows XP Luna blue** (default), grey Classic as the accessibility option, Taxi as a paint job |
| 7 | **The old dashboard** | Kept reachable at `/?shell=classic` as the safety net, unlinked, removed two weeks after the event if unused ([03](03-shell-architecture.md) section 17). The owner left the choice to me |
| 8 | **Assets: just use what has been added** (the owner later added ten CraftPix packs and asked for everything in `supply/` to be moved to appropriate locations, and for me to judge which are needed) | 6 November: everything moved ([02](02-theme-and-assets.md) section 13.1). From the new packs the build uses the **street animals** (desktop pets) and the **cyberpunk characters** (seat avatars); the rest are archived. Where the packs have nothing (game icons, backdrops) the build reuses the repository's own game artwork ([02](02-theme-and-assets.md) section 5.3) |
| 9 | **Hold off on committing** until the owner asks | Nothing in this folder is committed; the working tree has other uncommitted changes that are not part of this work (`package-lock.json`, `scripts/gen-cert.js`) |

Earlier decisions that still bind (see plan.md): Solo unchanged; Multiplayer humans-only by default with two humans to start; four seats; no web3 work now; a forfeit is last place or a loss; remote screens off in Kiosk by default.

## 3. Where this folder changes the earlier documents

| Earlier statement | Now |
| --- | --- |
| Shell authored at 1920 by 1080 as 1x ([xp-console-ui.md](../xp-console-ui.md) section 8.2) | **1280 by 720 is 1x**; 1080p is 1.5x ([03](03-shell-architecture.md) section 6) |
| "Focus ring `#FF9F1C`" | Fails contrast (1.76:1 on the window face). **Double ring: 2 px white then 3 px black** ([02](02-theme-and-assets.md) section 10) |
| A seed option and a practice option in Game Properties; Time Trial ghost and Cloud Cruise helper options | None of these exist in the server; corrected table in [04](04-game-properties.md) section 4 |
| Mascot sheets are 33 frames at 12 fps | Frame counts vary from 12 to 145 and timing is per frame (60 to 2,110 ms), so playback uses a duration array ([01](01-brand-and-rename.md) section 1.3) |
| Nothing from `assets/source/winxp` may be served publicly or committed; a guard test enforces the swap | **Superseded by the owner's decision 1.** The manifest keeps swapping cheap; there is no blocking guard |
| Mascot recommended as Chonk the cat, then Dabbu, Kadak | **Chonk the cat** (the owner kept the name and asked for a cat); the pack's paperclip helper stands in until the art exists |
| Default skin undecided | **Luna** |
| Legacy dashboard question open | **Kept as the fallback** |
| Remote chassis: a new design | **The previous controller face with a skin change** |
| Pointer: a new absolute-tilt cursor | **The retained legacy `Pointer`** |
| Lockstep and several of the remote-play designs in plan.md section 5h | Unchanged by this folder; the shipped online games use server simulation, as recorded in plan.md |

## 4. What was measured, and what remains unverified

**Source audit (6 November):** catalog/options/start rules, state/events, viewport and pointer code, universal remote structure, 131 base atlas roles, icon grids, cursor hotspots, helper timing/frame counts, sound/font facts, wallpaper cleanup boxes and contrast ratios were read or measured directly. This was the planning baseline, not browser evidence.

**Implemented and checked (6 November):** asset generation and provenance, measured CraftPix frame dimensions, source hashes and a visually checked non-smoking townsperson; the legacy glove's 128×128 export/hotspot; Tahoma's missing rupee glyph and the existing Hind fallback; local Python/FFmpeg requirements and reproducibility. The shell, 13 property windows, retained pointer/navigation, game host/results, all utility windows, universal phone maps/probe/streams, skins, helper/audio, pets/avatars and kiosk launcher now exist. The combined check passes **313 unit, 106 party and 168 OS tests**. [Current evidence and deviations](../../OS-BUILD-PROGRESS.md) is the source of truth for updated counts and budget totals.

**Browser evidence:** the complete 234-case game viewport matrix passes, as do six DPR 2/3 stress samples, six compact arena cases, 12 shell round-trip checks and 36 targeted Golf/Time Trial corrections. All 13 Game Properties windows, utility windows, three skins and representative game/phone screens were inspected. The wheel-phone suite passes **4/4** setup/play, portrait/landscape and simultaneous Accelerate+Boost stock/cooldown checks. [Reports and current screenshots](../../evidence/os-build/README.md) distinguish whole-matrix results from final targeted corrections; not every exported screenshot was individually reviewed. The whole asset subset was built twice: **359/359 files byte-identical**, including credits.

**Still unverified:** physical iPhone/Android permissions and persistence, real sensor rates/units, haptics, simultaneous touches, rotation and sleep/reconnect; real-TV distance/overscan/fullscreen/audio; cold-load timing and venue network/thermal/soak behavior. Kiosk dry-run found no Chrome/Edge at the discovered paths, so real launch needs the booth browser. QA2/QA3 cover these. HO1/HO2 need the selected hosting account/domain and then cellular/LAN rehearsal. No renewed asset-licence question is pending: the owner's decisions in section 2 are final.

## 5. Remaining work

1. **QA2/QA3:** perform the deliberately deferred physical device matrix, real-TV rehearsals and soak.
2. **HO1/HO2 last:** use the owner's chosen account/domain for stable HTTPS and the trusted-certificate LAN fallback. HO3 is implemented; real kiosk launch remains a rehearsal check.
3. **PR delivery and merge authorized on 6 November.** The generated subset is included with credits. Deployment, tagging and release acceptance remain pending.
4. **Later tier:** produce Chonk's cat sheets/collar overlay, the 13 bespoke backdrops and installable remote per build07. The supplied helper and selected CraftPix avatars/pets already work; the non-smoking avatar selection is resolved.

The in-game phone hold-A taskbar gesture conflicts with the lobby/results-only relay contract. That gesture remains unimplemented; the phone Home controls and TV Pause/Game menu are available. This conflict and intentional lifecycle/timer exceptions are documented in the progress log. No product question blocks the remaining physical checks.

## 6. References

**Platform behaviour (sensors, fullscreen, haptics)**

- Fullscreen needs a user gesture: [MDN `Element.requestFullscreen`](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen).
- iPhone has no web fullscreen ("no supported way", December 2024): [Apple Developer Forums thread 770080](https://developer.apple.com/forums/thread/770080); the request was closed WONTFIX: [WebKit bug 212934](https://bugs.webkit.org/show_bug.cgi?id=212934).
- Orientation lock (Android; not on iPhone): [MDN `ScreenOrientation.lock`](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock).
- Motion permission on iOS and the coming Chrome change: [MDN `DeviceOrientationEvent.requestPermission`](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static), [W3C Device Orientation](https://w3c.github.io/deviceorientation/), [Chromium Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/ckd2rFmT3PA).
- Wake lock: [MDN Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API); standalone iOS: [WebKit bug 254545](https://bugs.webkit.org/show_bug.cgi?id=254545).
- Vibration: [caniuse](https://caniuse.com/vibration); the iOS switch-input haptic trick (weak, secondary sources): [ios-haptics](https://npmjs.com/package/ios-haptics).
- Home Screen web apps and meta tags: [Apple Safari HTML reference](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html).
- Pinch zoom on iOS: [WebKit, new interaction behaviours in iOS 10](https://webkit.org/blog/7367/new-interaction-behaviors-in-ios-10/).
- Snapshot interpolation (used for remote viewers): [Gaffer on Games](https://gafferongames.com/post/snapshot_interpolation/).

**Brand and context**

- CraftPix asset licence (the pack's licence files contain only this address; terms not read): [craftpix.net/file-licenses](https://craftpix.net/file-licenses/).
- The asset pack author: [nulltale.itch.io](https://nulltale.itch.io/) (the pack's licence was not available in the folder).
- Category competitors found while checking the name (browser party consoles driven by phone QR codes): Tchin, PadConsole, Paaaarty.io, Open Party Lab, Crowded.

**The reference images** the owner supplied (now in `docs/references/ui/`): `docs/references/ui/xp1.jpg` (XP Luna desktop with a start menu and a welcome window), `xp2.jpg` (classic dialogs and a media player), `xp3.jpg` (XP desktop with an explorer window and small apps), `xp4.jpg` (a teal classic desktop). They set the target: friendly blue window chrome with green Start, dialogs with icons, a taskbar with a tray.

**Code and documents in this repository** referenced throughout: `public/party/host.js`, `public/party/phone.js`, `public/controller.html`, `public/classic-controller.html`, `public/controller.js`, `core/pointer.js`, `core/channel.js`, `public/menu.js`, `core/catalog.js`, `server/party.cjs`, `server/arcade.cjs`, `server.js`, `tests/party/harness.cjs`, `docs/UI-REVIEW-2026-11-06.md`, `plan.md`, `plan-history.md`.
