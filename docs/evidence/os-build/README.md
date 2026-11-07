# Funcaster software evidence — 6 November 2026

[Combined checks](checks.json): **587 tests pass** (313 unit, 106 party, 168 OS), plus catalog/game validation, formatting and diff checks. This evidence was captured before commit; the owner subsequently authorized PR delivery and merge. No deployment was performed. Tests used isolated local relays and real Chromium; manual UI inspection used the in-app browser. The complete screenshot sets remain in the ignored `.local/os-evidence/` run folders listed below. These are measurements and representative images, not golden-image assertions or physical-device certification.

| Evidence | Result | Original run |
| --- | --- | --- |
| [Game viewport matrix](viewport-matrix.json) | **234/234**: 13 games × nine sizes × solo/max-human configurations; no document/container overflow, clipped menu text, invalid canvas/camera geometry or unexpected runtime errors | `viewport-2026-11-06T10-03-05-097Z` |
| [Pixel-budget stress](viewport-dpr.json) | **6/6**: Kart Rush four-player, Pocket Greens and Star Catch at 4K with DPR 2 and 3 | `viewport-2026-11-06T10-06-03-093Z` |
| [Compact arenas](arena-compact.json) | **6/6**: three arenas at 640×360, solo/four players; over 200 px of unobscured playable height | `viewport-2026-11-06T10-04-02-777Z` |
| [Shell round trip](shell-flow.json) | **12/12**: boot, option change/Cancel, source isolation, Escape/Pause/Resume, iframe F10 navigation, touch phone, arena round, retained Results, actual record download and return | `shell-2026-11-06T10-06-48-543Z` |
| [Final Golf/Time Trial corrections](viewport-final-corrections.json) | **36/36** targeted cases; 18 scaled power-meter checks and 45 Time Trial frame-offset checks | `viewport-2026-11-06T10-12-39-443Z` |
| [Current representative layouts](representative-layouts.json) | Four HD cases after clearing in-game notification balloons; Drawing separately recaptured after correcting canvas label alignment | `viewport-2026-11-06T10-09-51-067Z`; Drawing `10-10-59-383Z` |
| [Racing phone flow](wheel-flow.json) | **4/4**: real touch join/driver confirmation; portrait→landscape→portrait labels and pedal bounds; three boosts; simultaneous Accelerate+Boost decrements stock and enters cooldown; no runtime/console errors | `wheel-2026-11-06T10-18-33-597Z` |
| [Manual layout review](manual-layouts.json) | All 13 game option panels, utility windows, skins, recovery/shutdown and representative game/phone screens | In-app browser |
| [Asset reproducibility](asset-reproducibility.json) | **359/359 byte-identical** files, including credits, across two complete builds after the source freeze | Local Python/FFmpeg pipeline |

The main matrix includes 20 zero-size recovery configurations covering 35 real frames, 189 finite-camera checks, 45 Slice Dojo aim round-trips, and 18 projected Table Tennis boundary checks. Kart four-player backing store stayed at 8,396,472 pixels (under 4 × 2.1 million); single Golf/arena canvases stayed at 4,199,084 (under 4.2 million). DPR screenshots use CSS-pixel output to avoid generating 74-megapixel images; devicePixelRatio and backing stores were still measured at their actual values.

The full matrix precedes the final localized Golf/Time Trial CSS and Drawing-label fixes. Those have separate targeted evidence; it is not represented as an unchanged-hash rerun of all 234 cases. Each report records its own build ID. Existing optional game-audio URL probes return 404 before using synthesized sound; reports list only those recognized probes separately. Unexpected errors still fail the suites.

Representative HD maximum-human screenshots for all 13 games were inspected, along with compact arenas, phone screens, all option tabs and the three skins. The automated matrix measures every case; not every one of its 234 screenshots was individually reviewed.

![Luna desktop and Game Properties](luna-final.png)

[Classic](classic-properties.png) · [Taxi](taxi-properties.png) · [Four-player Kart Rush](mario-kart-4p-hd.png) · [Compact arena](star-catch-4p-compact.png) · [Drawing](drawing-4p-hd.png) · [Results](results-held.png) · [Small phone](remote-320-final.png) · [Choose driver](choose-driver-320x568.png) · [Landscape pedals](racing-844x390.png) · [Boost cooldown](boost-cooldown-320x568.png)

## Still unverified

Physical iPhone/Android motion permissions and samples, simultaneous touches, haptics, orientation lock persistence, sleep/reconnect and a recorded motion trajectory; real-TV readability/overscan; booth kiosk fullscreen/audio; cold-load timing; cellular/LAN fallback; sustained thermal/network/one-hour soak behavior. HTTP local checks exercised touch and fake-phone input only. Task-owned servers and browser contexts were stopped after verification. See [progress and next tasks](../../OS-BUILD-PROGRESS.md).
