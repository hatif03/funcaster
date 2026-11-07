# Build 07: the schedule, the tests, the launch commands and the event runbook

Part of the [build specification](README.md). Original schedule: 6 November 2026. Status updated **6 November 2026**: the scheduled software through SH11, VP5 and HO3 is implemented in this change; checks and browser evidence are recorded. QA2/QA3 physical acceptance is deferred, and HO1/HO2 remain last pending the hosting destination. The owner requested PR delivery and merge on 6 November after verification; no deployment is included. The dated schedule below is the original dependency/acceptance plan, not a claim that future rehearsals have occurred. See [the progress log](../../OS-BUILD-PROGRESS.md) for current checks, deviations and remaining work.

## 1. Honest scope statement

The whole specification (new shell, 13 option windows, universal remote, retained pointer, asset pipeline, mascot, viewport fixes for 13 games, hosting) is far more than 12 working days for one lane. So the plan has **three levels**, and the schedule works to the first:

| Level | Meaning | Contents |
| --- | --- | --- |
| **MVE: minimum viable event build** (must exist on 6 November) | A stranger can scan, tap once, and play, and the host can run everything from the TV or a phone | Shell desktop over the Mumbai wallpaper; window manager; **Game Properties for all 13 games**; taskbar, tray, Start menu, message boxes; the game window with the fit contract; Results, Players, Invite windows; **focus (D-pad) navigation and the shell pointer**; the phone **gate, probe, universal chassis in both postures with captions**; legacy dashboard kept as the fallback; hosting tiers 1 and 2 rehearsed |
| **Full build** (target by 6 November if lanes run in parallel) | Everything in docs 01 to 06 for the event | MVE plus the Kiosk attract window, boot sequence, mascot and sounds, skins `luna`/`classic`/`taxi`, viewport fixes for all games, the street pets and avatars, the asset pipeline complete |
| **After the event** | | Dusk and night wallpapers, animated layers, the installable `/remote` page, swing input, custom Chonk art and game backdrops, removing the legacy dashboard, trademark search |

**Order of sacrifice** if time runs out: street pets and avatars (SH11) first, then Kiosk polish, then the extra windows (Playlists, Records, Recycle Bin, Diagnostics), then the mascot, then the sounds beyond the P0 set, then the boot sequence; **never** Game Properties (the original complaint), the phone gate, the chassis, or the legacy fallback.

## 2. Lanes and task IDs

Lanes can run in parallel (people or agents). IDs are used everywhere in the checkpoints. "Doc" says where the detail is.

| Lane | ID | Task | Doc | Size (hours, my estimate) | Depends on |
| --- | --- | --- | --- | --- | --- |
| **AS** assets | AS1 | `scripts/os-assets/prepare.py`: wallpaper clean and scale, sprite crops and CSS, icon index, cursors with outlines, sounds, fonts subset, mascot JSON, manifest, credits | 02 | 8 | none |
| | AS2 | Run it; commit-ready `assets/os/**`; size report | 02 s12 | 1 | AS1 |
| | AS4 | Extract and prepare the CraftPix sheets: street pets (dogs, cats, crow) and seat avatars (Biker, Punk, Cyborg and one non-smoking townsperson); `pets.json`, `avatars.json`; credits | 02 s13 | 2 | AS1 |
| | AS3 | `icon-crop.js`: per-game `viewBox` crops of `artwork(id)` for the 13 icons | 02 s5.3 | 2 | none |
| **BR** brand | BR1 | `public/os/brand.js` (the name constant), `storage.js` | 01 s2 | 1 | none |
| **SV** server | SV1 | `/` route switch (`?shell=os\|classic`, `CHONKS_SHELL`), `/os` path | 03 s17 | 1 | none |
| | SV2 | `pointer-mode`, `pointer`, `shell-button`, `device` events and `view().pointerMode`; **tests** (`tests/party/pointer.test.cjs`) | 06 s6, 8 | 6 | none |
| | SV3 | `CHONKS_REMOTE_VIEWS` fallback; reserve `chonks` in the creator registry | 01 s5.4 | 1 | none |
| **SH** shell | SH0 | Scaffold `public/os/` (index, main, scale, tokens, wallpaper desktop), `?demo=1` states | 03 | 4 | AS2 (or stub) |
| | SH1 | `wm.js` window manager and `message-box.js`; taskbar buttons | 03 s8 | 6 | SH0 |
| | SH2 | Desktop icon grid, taskbar, tray, Start menu, balloons | 03 | 8 | SH1, AS3 |
| | SH3 | `session.js` (handshake, state feed, `host.cmd` client, pairing), store | 03 s4 | 5 | SH0 |
| | SH4 | `option-ui.js` and Game Properties for all 13 games; presets; tests | 04 | 10 | SH1, SH3 |
| | SH5 | `nav.js` spatial focus; `pointers.js` (needs SV2, PH6); hit-test, magnetism | 03 s9, 06 s6.4 | 10 | SH2, SV2 |
| | SH6 | `game-host.js`, game window, loading, results, arena canvas slot | 03 s14, 05 | 10 | SH3, VP2 |
| | SH7 | Players, Invite, Settings windows (MVE); Playlists, Records, Recycle Bin, Help, Diagnostics (full) | 03 s15 | 10 | SH1, SH3 |
| | SH8 | Boot, who-is-here, attract (Kiosk), staff window | 03 s12 | 8 | SH6, SH7 |
| | SH9 | Mascot engine and audio bus | 03 s11, 13 | 6 | AS2 |
| | SH11 | `pets.js` (street pets along the taskbar) and the avatar tiles in Who's playing, Players and Results | 03 s11.5, 02 s13.3 | 4 | AS4, SH8 |
| | SH10 | Skins `classic` and `taxi`; Settings wiring; polish | 02 | 4 | SH2 |
| **PH** phone | PH1 | Page lock, theme-color, manifest, safe areas, text sizes, in-app list, feedback fix | 06 s5.4 | 4 | none |
| | PH2 | `remote.css`, skeleton with ids kept, `luna` default skin (and `cream`), seat lamps | 06 s2, 3 | 8 | none |
| | PH3 | `paintButtons`, postures, sideways grid, captions for 13 games | 06 s4 | 8 | PH2 |
| | PH4 | The gate (one tap) and the probe; `device` event; tiers | 06 s5 | 6 | SV2 |
| | PH6 | Raw sample capture, `rotationRate`, event-driven flush, `shell-button`, touch-tier pointer | 06 s6.3 | 5 | SV2, PH2 |
| | PH8 | Skins `luna`, `taxi`, `classic`; wordmark font; ported cues | 06 s3 | 3 | PH2 |
| **VP** viewport | VP1 | `arcade-hud.css` text sizes and overflow (S1, S2); `shared.html` overflow (S8); zero-size guards (S6) | 05 s5 | 4 | none |
| | VP2 | `public/os/game-fit.js`, the letterbox rule, Kart Rush party-mode menu and fullscreen fixes | 05 s6 | 6 | none |
| | VP3 | `core/pixel-budget.js` and its use (S3, S4, S5) | 05 s5 | 5 | none |
| | VP4 | Viewport matrix test harness | 05 s8 | 6 | SH6 |
| | VP5 | Aspect-aware split (S9), arena font scaling, S7, drawing text | 05 s5, 6 | 6 | VP4 |
| **QA** | QA1 | Test files in section 5; `npm run check` stays green | 5 | 10 (spread) | with each task |
| | QA2 | Device matrix pass | 06 s10 | 8 | PH4 |
| | QA3 | Real-TV rehearsals (1 and 2) and a one-hour soak | 6 | 8 | feature complete |
| **HO** hosting | HO1 | Staging instance, domain, HTTPS, `trust proxy`, health monitor, deploy and rollback scripts | plan.md 5h.14.1 | 8 | none |
| | HO2 | LAN offline fallback with the real certificate and router DNS override; rehearse | plan.md 5h.14.1 | 6 | HO1 |
| | HO3 | `scripts/launch-kiosk.cjs` (section 4) | 7 s4 | 2 | none |

Total estimate (hours): about 220; with three parallel lanes of work and testing overhead this is the realistic ceiling for 12 days, which is why the MVE exists.

### Implementation status — 6 November

| Status | Task IDs / gate |
| --- | --- |
| Software implemented | AS1–AS4, BR1, SV1–SV3, SH0–SH11, PH1/PH2/PH3/PH4/PH6/PH8, VP1–VP5, HO3 |
| Tests pass | QA1; combined results: 313 unit, 106 party, 168 OS |
| Browser checks pass | VP4/VP5 234 samples; six DPR stress and six compact arena samples; 12 shell flow checks; 36 targeted final corrections; utility/skin/phone visual review |
| Deliberately deferred | QA2 physical iPhone/Android matrix; QA3 real-TV rehearsals and soak |
| Hosting last, destination needed | HO1 stable HTTPS; HO2 trusted-certificate LAN/DNS fallback |
| Launcher implemented, actual launch unverified | HO3 unit checks pass; local dry-run found no Chrome/Edge at discovered paths |

Completed code does not complete an acceptance gate that requires physical devices, cellular access, a real TV or a hosted deployment. The next action is the owner-deferred physical device matrix, then venue acceptance and hosting work. The in-game phone hold-A contract conflict and intentional timer exceptions remain documented in the progress log. Custom cat/backdrop art and the installable remote stay in the after-event tier.

## 3. Day by day

| Date | Day | Lane work | Gate at end of day |
| --- | --- | --- | --- |
| Wed 21 Oct | D0 | This specification; the owner reviews the open items in the README | Specification accepted |
| Thu 22 Oct | D1 | AS1 then AS2; BR1; SV1, SV2 (with tests); SH0; PH1; VP1; HO1 begins | A wallpaper desktop at `/?shell=os&demo=1` showing the Luna theme; `npm run check` green |
| Fri 23 Oct | D2 | SH1, SH3; PH2; VP2; SV3; AS3 | Windows open and close; the session connects to a live room and a state feed prints |
| Sat 24 Oct | D3 | SH2; SH4 spike (Kart Rush and Star Catch); PH3 begins | **Checkpoint 1:** desktop with icons, taskbar, tray and Start menu on a live room; one Game Properties window starts a game; the chassis visible on a phone |
| Sun 25 Oct | D4 | SH4 for all 13 and tests; PH3 captions | All 13 option windows pass the coverage and parity tests |
| Mon 26 Oct | D5 | SH5 focus navigation and `pointers.js`; PH4 gate and probe; PH6 | A phone steers a cursor on the TV; D-pad navigation works without it |
| Tue 27 Oct | D6 | SH6 game host, game window, loading, results; VP3; PH8 | A full round plays inside the shell window |
| Wed 28 Oct | D7 | SH7 MVE windows; VP4 harness; QA2 first pass | **Checkpoint 2:** join, properties, start, game, results, desktop on one laptop and two real phones, plus the pointer |
| Thu 29 Oct | D8 | SH8 boot, who, attract; HO1 staging live; HO2; HO3 | The hosted staging URL loads over cellular |
| Fri 30 Oct | D9 | SH9 mascot and audio; SH10; VP5; QA2 second pass; fixes | Full build feature-complete |
| Sat 31 Oct | D10 | **Rehearsal 1** on a real TV with friends; a one-hour soak; bug triage | **Checkpoint 3:** the P0 bug list is empty or owned |
| 6 November | D11 | **Freeze**: P0 fixes only; **Rehearsal 2** using the runbook and both fallbacks; deploy to the hosted instance; tag the release | Build tagged; hosted instance verified over cellular; LAN fallback verified; classic dashboard verified |
| 6 November | D12 | No code. Pack the kit, charge everything, issue the offline certificate, print signage, dry-run the runbook | Kit ready |
| 6 November | Event | Devcon 8 India begins; the booth runs; the team does not merge code | |

(ETHGlobal Mumbai's hacking period is 6 November; its schedule is in the earlier plans.)

## 4. Launch commands (kiosk and rehearsal)

The older launcher (`scripts/open-browser.cjs`) opens the default browser. **HO3 is implemented:** `scripts/launch-kiosk.cjs` (`npm run kiosk`) locates Chrome or Edge, validates an HTTP(S) URL without embedded credentials, adds `shell=os`, and uses a fresh temporary profile. It does not start the relay server. Run the server or hosted endpoint first.

```sh
npm run kiosk -- --dry-run https://your-console.example/
npm run kiosk -- https://your-console.example/
```

`CHONKS_URL` supplies the URL when no positional URL is given; `CHONKS_BROWSER` supplies an absolute browser executable path. Without a URL, the launcher uses local HTTPS and `PORT` (default 8443), or HTTP when `HTTP=1`. `--dry-run` prints the resolved command without starting a browser. The local dry-run on 6 November reported no installed Chrome/Edge, so use the booth installation for the real check. Representative flags:

```text
Windows (Chrome): "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --start-fullscreen
    --autoplay-policy=no-user-gesture-required --user-data-dir=%TEMP%\chonks-kiosk --no-first-run
    --disable-session-crashed-bubble --disable-infobars "https://HOST/?shell=os"
Windows (Edge):   "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk --edge-kiosk-type=fullscreen ...same flags...
macOS:            open -na "Google Chrome" --args --kiosk --autoplay-policy=no-user-gesture-required --user-data-dir=/tmp/chonks-kiosk "https://HOST/?shell=os"
Linux:            google-chrome --kiosk --autoplay-policy=no-user-gesture-required --user-data-dir=/tmp/chonks-kiosk "https://HOST/?shell=os"
```

Notes: paths and flags are the standard Chromium ones and are **not verified on the booth laptop**; test them in rehearsal. `--kiosk` hides the address bar and prevents leaving by accident (exit with Alt+F4 on Windows). The host tab must remain open and awake: set the OS power plan to never sleep, disable screen saver, and plug in power.

## 5. Tests to add (they keep `npm run check` honest)

Wire-up is implemented: `npm run test:os` covers `tests/os/*.test.mjs`, `public/os/**/*.test.mjs` and the universal remote tests, and runs inside `npm run check`. CI (`.github/workflows/check.yml`) already runs `npm run check` and `format:check`; the new shell files are included in formatting. The table is the original test contract; current tests also cover utility/protocol/asset/lifecycle additions.

| Area | File | What it asserts |
| --- | --- | --- |
| Options | `public/os/option-ui.test.mjs` | Schema coverage for 13 games; default parity with `matchSetup`; choice parity; coercion; dependencies; empty tabs |
| Navigation | `public/os/nav.test.mjs` | The spatial scoring function on fixed rectangle sets (grid, rows, tabs, a wide button above two small ones); wrap rules; group behaviour; focus return |
| Window manager | `public/os/wm.test.mjs` | Singleton behaviour; modal queue; z-order; placement clamps; one tool window rule |
| Scale | `public/os/scale.test.mjs` | `--ui` for the matrix of viewports; the 0.9 floor; design viewport sizes |
| Store, storage | `public/os/store.test.mjs` | Subscribe by selector; `chonks.` with `chonks.` fallback and migration |
| Session | `tests/os/session.test.mjs` | Handshake sequence, reclaim, `update:true`, `host.cmd` sequence numbers and rate-limit handling, `setup` sends the full object (against the real server in the party harness) |
| Theme | `tests/os/theme.test.mjs` | Every manifest role resolves to an existing file; atlas coordinates are inside the sheet; sprites do not overlap; sound cues all mapped; sizes within budgets |
| Tokens | `tests/os/contrast.test.mjs` | The contrast table in doc 02 section 10.1 (ratios computed, thresholds asserted) |
| Pointer | `tests/party/pointer.test.cjs` | Doc 06 section 6.5, all cases |
| Pointer client | `public/os/pointers.test.mjs` | A recorded sample sequence ends within 20 px of the expected cursor position; timeouts; touch-tier `party` wrapping |
| Phone | `tests/party/phone-remote.test.cjs` and `public/party/remote.test.mjs` | Caption map complete for every game and button; roles per posture; the probe with fake events (no sensors; stale sensors; iOS-like permission rejection); `device` payload sanitised |
| Games | `tests/os/viewport.e2e.mjs` (Playwright, run on demand) | Doc 05 section 8: for each game and viewport, no overflow, fills its rectangle, text size, no `NaN` |
| Shell e2e | `tests/os/shell.e2e.mjs` (Playwright with the FakePhone harness) | Boot, desktop, open properties, change an option (one debounced `setup`), start, game window, results, back; the pause menu instead of an instant `lobby` on `chonks:home` |

The Playwright dev dependency is already in `package.json`. E2E runs are separate from the default `check` and start an isolated server/browser. Install its Chromium once with `npx playwright install chromium`, then run:

```sh
node tests/os/shell.e2e.mjs
node tests/os/viewport.e2e.mjs --smoke
node tests/os/viewport.e2e.mjs
```

Use `--games=mario-kart,drawing` for a targeted viewport run. `HEADED=1` shows the test browser; `OS_BROWSER_CHANNEL` selects its channel. Reports and screenshots go under `.local/os-evidence/` (override with `OS_EVIDENCE_DIR`). The full run passed all 234 samples. Additional modes are `--dpr` (4K DPR 2/3), `--compact` (640×360 arenas), and `--representative` (HD screenshots). `node tests/os/wheel.e2e.mjs` checks real browser-phone driver setup, pedal layouts and boost behavior. [Saved reports and visual review](../../evidence/os-build/README.md) record exact run/build IDs and the targeted final corrections.

## 6. The rehearsals

### 6.1 Rehearsal 1 (6 November) and 2 (6 November)

Run the hosted instance and the real TV, with at least six people who have not seen it.

| # | Step | Pass if |
| --- | --- | --- |
| 1 | Launch with `npm run kiosk` against the hosted URL | Boot plays; fullscreen with no click; audio on |
| 2 | Four people scan the QR on their own phones (mixed iPhone and Android, mobile data and Wi-Fi) | Each is "ready" in under 20 s; none needs help beyond the gate |
| 3 | Open Kart Rush from the desktop with the phone pointer; change laps; Start | Properties window readable from 3 m; Start works; the game fills the screen |
| 4 | Play the three racing games (sideways pedals) and one aim game | Controls match captions; no stuck pedals |
| 5 | Results; Play again; Change options; Back to desktop | No auto-dismiss surprises; focus lands sensibly |
| 6 | A phone sleeps and wakes; one leaves | Reconnects within the grace; the penalty rule applies |
| 7 | Open Invite, pair a remote screen (if enabled for the demo) | As designed |
| 8 | Switch to the classic dashboard (`/?shell=classic`) and back | Both work with the same room |
| 9 | Pull the network from the laptop for 20 s | The reconnect message, then recovery; no data loss |
| 10 | One hour soak with a game running every 3 minutes | No memory growth over 500 MB in the shell tab; no event-loop stall beyond 20 ms p99 on the server |
| 11 | Fall back to the **offline LAN** setup (travel router, real certificate) | Phones join with a valid certificate and play |

### 6.2 Event-day runbook (extends the floor plan's runbook with the shell's states)

| Symptom | First action | Then |
| --- | --- | --- |
| The shell shows a blank desktop or a script error | Reload the TV tab; the room is reclaimed with the saved token | If it persists: open `/?shell=classic` (the old dashboard shows the same room) |
| A phone is stuck on the gate | Ask for one tap on **Tap to start**; if motion is denied, tell them to use touch (the gate offers it) | Lend a spare phone |
| The pointer is jumpy or the wrong way | Hold **1** to recentre; plus and minus change speed | Use the D-pad focus mode; it needs no sensors |
| The cursor is invisible on a busy part of the wallpaper | Press the D-pad (focus mode) | |
| Audio does not play | Click the page once (the browser needs a gesture); check the tray volume | Kiosk flag `--autoplay-policy` was missed: relaunch with `npm run kiosk` |
| A game looks cropped or has a scrollbar | Report the game and the screen size; switch the game's fit class in `game-fit.js` as an emergency hot-fix (outside the bundle hash) | |
| The hosted instance is down | Use the LAN fallback: connect the laptop to the travel router, open the local HTTPS hostname | Tunnel (`npm run share`) as a last resort |
| A stranger is disruptive | Staff window: lock the room, remove the player (the message box confirms) | Reset to attract |
| The mascot is annoying someone | Settings: mascot off | |

## 7. Acceptance checklist for the event build

These boxes are release acceptance, not an implementation checklist. Keep them open where they combine a completed software behavior with physical, venue or deployment verification. Task implementation status is recorded above and in the progress log.

- [ ] A stranger joins and is playing in under 20 seconds, on iPhone and Android.
- [ ] Every option of all 13 games is reachable and works from the phone pointer, the D-pad and the keyboard.
- [ ] Start's disabled reason is always the server's real reason.
- [ ] The shell never scrolls, at all nine matrix viewports; the TV text is readable from 3 m (rehearsal).
- [ ] All 13 games fit the window with no scrollbar and no clipped controls; Kart Rush party-mode has no in-frame lap or Start button.
- [ ] `chonks:home` (B or Esc in a game) never ends a round without confirmation.
- [ ] Destructive actions (remove, end match, end room) always ask.
- [ ] The universal remote shows the same buttons in every game; captions are correct for all 13.
- [ ] A phone with no gyroscope plays in touch mode; a phone in an in-app browser is told how to fix it.
- [ ] The classic dashboard still works and shows the same room.
- [ ] `npm run check` and `format:check` are green; the hosted instance verified over cellular; the LAN fallback verified.

## 8. Risks specific to this schedule

| Risk | Mitigation |
| --- | --- |
| Too much for 12 days | The three levels; the order of sacrifice; the MVE definition |
| The shell is unstable on the day | The classic dashboard fallback, tested on 6 November |
| The pointer feels bad on some phones | The learned axis map is designed for this; D-pad focus mode needs no sensors; recentre on hold 1 |
| Safari or iOS behaviours differ from the study | The device matrix on 28 6 November; touch tier as the safety net |
| An asset or sound is missing at the last moment | The manifest falls back to a neutral placeholder per role; the shell never throws on a missing file |
| A game breaks in the letterbox | The fit map is outside the hash and can be edited live |
| Hosting is not ready | Tier 2 (LAN) and tier 3 (tunnel) are rehearsed; the event can run without the hosted instance |

## 9. After the event

Remove the legacy dashboard two weeks after if unused; produce Chonk and the 13 backdrops; the installable remote; swing input; dusk and night wallpapers and layered animation; a proper trademark and domain search for the name; the full documentation pass (README, `docs/IMPLEMENTATION.md`) to describe the shell; and a retrospective against the funnel numbers from the booth.
