# Funcaster build progress

6 November 2026. This is implementation evidence against [build 07](plans/build/07-schedule-tests-runbook.md), not a replacement specification. The scheduled software through **SH11, VP5 and HO3 is implemented** in this change. Automated checks and browser evidence are recorded below; physical acceptance and hosting remain pending. The active-game phone hold-A conflict is explicitly documented as a software/spec gap.

The build is based on `origin/main` commit `8d2654e`. After software verification, the owner explicitly requested a PR and merge into `main` on 6 November; delivery uses `codex/chonks-os-build`. No deployment is included. `package-lock.json`, `scripts/gen-cert.js`, `assets/source/` and `docs/plans/web3/` were not changed. The retained `core/pointer.js` and the legacy glove source image are unchanged.

## Implemented software

| Task IDs | Result |
| --- | --- |
| AS1, AS2 | Reproducible asset preparation, cleaned two-resolution wallpaper, Luna sprite crops, role icons, outlined cursors, normalized cues, subset fonts, helper animation metadata, theme manifest, provenance and budget report. Source directories stay blocked from HTTP. |
| AS3 | Cropped existing artwork for all 13 desktop game icons; preview at `/os/icon-preview.html`. |
| AS4 | Street dogs, cats and crow; Biker, Punk, Cyborg and a visually checked non-smoking townsperson; per-frame metadata and source hashes. Sheets are extracted directly from the archives into `assets/os/`, with no source extraction directory. |
| BR1 | Funcaster brand constants and safe preference storage, with legacy preference fallback. Room credentials retain the existing session-storage shape. |
| SV1, SV3 | `/?shell=os`, `/?shell=classic`, `/os`, and `CHONKS_SHELL` routing; existing remote-view switch and reserved `chonks` creator name audited. Explicit classic fallback remains available. |
| SV2 | Validated pointer/button/device relay, stable seats, independent sequences/rate limits, lifecycle resets and tests. Pointer data is sent reliably; calibrated game input remains intact. |
| SH0, SH1 | Luna wallpaper desktop, tokens, scaling, socket-free `?demo=1`, window manager, pin/minimise/maximise/restore/close, taskbar entries, modal queue and focus return. 1280×720 is 1×. |
| SH2, SH3 | Game icon grid, tray, Start menu, balloons, live session/reclaim, complete state feed, full-object setup, serialized commands, bounded retries, pairing and connection recovery. |
| SH4 | Game Properties for all 13 games, options and presets, schema/default/choice/coercion/dependency coverage, server start reasons, selection/setup ordering and Cancel restoration. Drawing word entry is requested on the current host phone. |
| SH5 | Spatial keyboard/D-pad navigation, retained-pointer client, per-seat cursors, recenter/sensitivity, pointer/focus switching and bounded magnetism. Stationary streams do not reset idle activity. Clipped controls cannot be selected through panel footers. XP arrow and optional legacy glove use measured tip offsets and seat badges. |
| SH6 | Loading, owned game frames, server-game arena, round-bound message handling, pause/resume confirmation, results and record capture, fit/split integration and explicit results retention in Party mode. |
| SH7 | Players, Invite, Settings, Playlists, Records, Recycle Bin, Help and Diagnostics connected to live state and existing room APIs; honest unavailable values, bounded navigation targets and internal panel scrolling. Restore access uses an opaque, expiring host-only handle. |
| SH8 | Boot/retry, Who's playing, attract, Staff and shutdown flows. Ending a room uses explicit confirmed cleanup; it is not implemented as a temporary socket disconnect. |
| SH9 | Lazy helper animation engine, per-frame timing, mascot interactions, audio bus, supplied cues, volume/mute and gentle-effects behavior. The supplied paperclip remains the documented stand-in for Chonk. |
| SH10 | Luna, Classic and Taxi shell skins and Settings wiring; Classic contrast fixes. |
| SH11 | Lazy street pets along the taskbar and seat avatars in Who's playing, Players and Results, with Settings switches and reduced-motion/gentle behavior. |
| PH1, PH2 | Locked phone page, safe areas, manifest/theme-color, universal chassis, Luna default with optional Cream/Taxi/Classic, four shape-coded seat lamps, touch pad, accessible settings and compact layouts. |
| PH3, PH4 | Captions/actions for all 13 games, portrait/sideways postures, landscape pedals, one-tap capability gate, permission/error handling, bounded probe and touch fallback tiers. |
| PH6, PH8 | Reliable raw sample/rate/button and touch-pointer streams, host-phone text request, wordmark font, skins and phone cues. Real device capabilities remain a separate acceptance check. |
| VP1, VP2 | Shared HUD text/overflow, bounded canvases, zero-size guards, fit map, letterbox/split utilities and Kart Rush party menu. Driver confirmation begins the room's configured race; solo keeps its original menu flow. |
| VP3 | Pixel-budget helper used by the eight Three.js games and shared canvas games; split-view budgets, bounded composer targets and resize behavior. |
| VP4 | Real Chromium viewport harness with solo/max-human configurations and nine viewport sizes. |
| VP5 | Aspect-aware split layouts; scaled arena art and Drawing labels; measured HUD/menu clearances; unobscured arena play bounds; responsive Golf meter and Time Trial offsets. The complete matrix and targeted corrections pass. |
| HO3 | Cross-platform Chrome/Edge kiosk launcher, isolated temporary profile, URL validation, OS-specific candidates and dry-run support. Actual kiosk startup/fullscreen/audio still need the booth browser. |
| QA1 | Unit, relay, session, theme, options, lifecycle and integration tests added with the implementation; OS tests are included in `npm run check`. Browser suites run separately. |

The live OS can now launch and render games. `/?shell=os&demo=1` remains a visual fixture, and `/?shell=classic` remains the playable fallback. Solo behavior and the two-ready-human default for Multiplayer are unchanged. No wallet, chain, betting or other deferred Web3 feature was added.

## Verification snapshot

- `npm run check`: **587 tests pass** — 313 unit, 106 party, 168 OS — plus catalog and game validation. `npm run format:check` and `git diff --check` pass.
- The two known Windows-only CRLF/symlink failures were not encountered on this macOS machine and were not changed.
- Two complete asset builds after the shell source freeze produced **359/359 byte-identical files**, including credits. [Hashes and comparison](evidence/os-build/asset-reproducibility.json). Checks also cover manifest paths, crop bounds, frame metadata, source provenance and font coverage.
- Wallpaper: **302,468 bytes** at 1080 and **804,742 bytes** at 2160. Fonts: **57,088 bytes**. Cues: **399,793 bytes**. Optional 128×128 glove: **10,021 bytes**, loaded only when selected.
- Final measured initial shell graph: **597,359 bytes / 600,000**. It includes static imports, used sprite PNGs, fonts and eager assets, including imported `core/` and party artwork helpers; lazy windows, game runtimes, animation sheets, audio, wallpaper and the existing Socket.IO transport are outside this initial-shell measurement. See [the generated report](../assets/os/theme/size-report.json). This is a static uncompressed budget, not a cold-load performance claim.
- Kiosk `--dry-run` correctly reported that Chrome/Edge was not installed at the discovered paths. Launcher tests cover path/flag selection; no real booth fullscreen/autoplay success is claimed.

### Browser evidence

[Current browser reports and screenshots](evidence/os-build/README.md):

- **234/234 game viewport cases pass**: all 13 games, nine viewports, solo/max-human configurations. Includes zero-size recovery, finite cameras, Slice Dojo aim mapping and Table Tennis bounds checks.
- **6/6 DPR 2/3 stress cases pass** at 4K. Kart four-view backing stays below 4 × 2.1 million pixels; single Golf/arena canvases stay below 4.2 million.
- **6/6 compact arena cases pass** at 640×360. The HUD/footer reserve measured bounds so buckets, cars and combo labels remain visible; queued join/desktop balloons clear during games.
- **36/36 targeted Golf/Time Trial cases pass** after their final scaling corrections. Drawing's cursor/name overlap was corrected and recaptured. Reports identify each build and distinguish this targeted verification from the earlier complete matrix.
- **12/12 shell flow checks pass**: live boot/phones, option change and exact Cancel restoration, independent frames, wrong-source message rejection, Escape→Pause→Resume, F10 navigation, touch phone, complete arena round, Results held beyond 12 seconds, real record export, and return to Properties/desktop.
- Manual review covered all 13 Game Properties panels (44 tabs), utility windows at 640×360, Luna/Classic/Taxi, retained arrow/glove cursors, reconnect over a confirmation, shutdown cancellation/farewell, demo fixtures and representative HD maximum-human screenshots for every game. Every matrix sample was measured; not every exported screenshot was individually inspected.
- Phone dimensions 320×568, 390×844 and 844×390 fit without outer scrolling. The focused racing-phone suite passes **4/4** checks: driver setup, whole-word captions, portrait/landscape pedal geometry, three boosts and simultaneous Accelerate+Boost stock/cooldown behavior. Physical sensors and real multitouch are not certified by these tests.

![Luna desktop](evidence/os-build/luna-final.png)

[Classic](evidence/os-build/classic-properties.png) · [Taxi](evidence/os-build/taxi-properties.png) · [Kart Rush](evidence/os-build/mario-kart-4p-hd.png) · [Compact arena](evidence/os-build/star-catch-4p-compact.png) · [Results](evidence/os-build/results-held.png)

The earlier [D1/D2 measurements](evidence/os-d1-d2/desktop-matrix.json) remain historical evidence. Local checks used HTTP with touch/fake-phone input; no tunnel or deployment was created.

## Deviations and resolved uncertainties

1. The full 48 px icon sheet is 728 KB; initial UI loads lossless role crops through the manifest. The sheet and coordinates remain available lazily. Supplied helper sheets total 46.98 MB and also load lazily. The 600 KB limit covers initial shell files, not the entire generated asset directory.
2. Tahoma lacks the rupee glyph. Existing bundled Hind covers it; fallback metrics were computed from both fonts. The local Homebrew FFmpeg lacks Vorbis, so the documented build uses `imageio-ffmpeg` through `FFMPEG` in a temporary Python environment. No Node dependency or lockfile was changed.
3. The supplied crow frames are **32×32**, not 48×48; metadata and rendering use measured dimensions. The chosen non-smoking Townsperson 4 has a Walk sheet rather than Run, used for its moving role with `sourceAnimation: "walk"` preserved in metadata. All archive members and source hashes are recorded.
4. Build06 §6.4 names an arrow hotspot `(0,0)`, while the measured build02 §6.2 and cursor data specify `(3,6)` for `arrow_m`. The implementation follows the measured data. The optional glove keeps the legacy fractional tip `(0.32,0.09)` and is re-exported from the unchanged repository image to 128×128.
5. Pointer extremes follow build06's clamping rule; touch x/y follows §6.3 even though the compact event table omits it. Activity follows meaningful rendered movement, not receipt of stationary sensor packets. Keyboard navigation can scroll to offscreen controls, while pointer assistance cannot activate clipped controls.
6. The shell required small protocol contracts absent from the initial event list: actual-TV-host-only `phone-text`, confirmed `end-room`, and confirmed `restore-player`; plus results retention so Party results do not auto-dismiss. Tests cover roles, room scope, stale grants/hosts, timeouts and lifecycle cleanup. Text relay carries only the field request, not words or credentials. Restoring removes a join ban without reclaiming or replacing a seat.
7. The current server treats Kiosk configuration as **setting/replacing** the six-digit staff PIN, not verifying an old PIN. Settings explicitly says this replaces the PIN and signs out staff phones; it asks for six digits and confirmation. Phone staff authentication is unchanged.
8. Diagnostics shows latency as unavailable where the state does not provide it. It does not invent a measurement. Records read the existing local room summary and request the actual server record for export.
9. The controller-specific manifest uses the existing room-code page. The separately installable `/remote` app, commissioned Chonk cat sheets and 13 bespoke backdrops remain later-tier work per build07, not blockers for the supplied-art build.
10. HO1/HO2 remain last by the owner's earlier instruction. Physical phone testing is deferred by the owner. Neither needs to interrupt the remaining software verification, and no product decision is being reopened.

11. **Unimplemented conflicting gesture:** build03 §14.3 describes holding phone A over the running-game taskbar. Build06 §6 and the relay restrict `pointer`/`shell-button` to lobby/results and reset pointer mode at round start. The implementation preserves those phase gates, so phone hold-A cannot open a shell taskbar context menu during a round. In-game phone Home opens the party/admin sheet for pause/end controls; the TV Game menu, Home or Escape opens Pause, and native mouse/taskbar context remains available. These are alternative paths, not evidence that the hold-A gesture was implemented. Supporting that gesture would require an explicit change to the active-round input contract; physical behavior is still unverified.

12. Phone capability probing allows the existing Generic Sensor fallback to complete before declaring touch-only. Unsupported secondary game actions are dimmed with honest captions; no new game mechanics were invented. Orientation locks now reconcile posture changes and release safely, but physical behavior still needs QA2.
13. Mascot/pet/avatar animations and retained-pointer frame loops suspend during active games or hidden-page states. A cheap 120 ms navigation poll retains its in-game early return; clock/state/recovery/loading timers remain intentional, and countdown/go/results cues still decode on demand. This is a documented narrower reading of the blanket “all timers/audio decoding” pause rule. The helper hides if neither bottom corner has room.
14. Existing game audio probes for optional replacement files return 404 before synthesized fallback. Browser suites list only those known probes separately and fail unexpected errors. A deterministic touch trajectory and synthetic raw-sample tests pass; replaying a physically recorded motion trajectory remains QA2 work.

## Remaining work and next step

1. **QA2 — deferred physical device matrix:** iPhone Safari and Android Chrome permissions, actual sensor events/rates/units, grip and landscape directions, recentre, haptics, simultaneous pedals, sleep/reconnect and accessibility. Desktop/fake-phone tests do not satisfy this gate.
2. **QA3 — venue acceptance:** real TV readability at three metres, overscan, kiosk fullscreen/audio, mixed Wi-Fi/cellular joins, four-phone performance/thermal soak and both rehearsals. The kiosk machine needs Chrome/Edge or an explicit `CHONKS_BROWSER` path.
3. **HO1 then HO2 — hosting last:** obtain the chosen account/domain, provision the stable HTTPS service and monitoring/deploy/rollback path, then prepare and rehearse the trusted-certificate LAN/DNS fallback. No stable destination is deployed.
4. **Release:** the owner authorized PR delivery and merge on 6 November. Physical acceptance, the release/freeze gate and deployment remain separate pending work.

The conflicting active-game phone hold-A gesture above remains a documented software/spec gap; it is not marked complete or silently enabled through broader relay authority. No product question blocks verification of the implemented alternative controls. The only later destination input is the hosting account/domain. Custom Chonk art, bespoke backdrops, installable remote and other post-event features retain their planned later scope.
