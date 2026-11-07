# Release evidence — 6 November 2026

Branch: `codex/hackathon-party-experience`. Delivery: draft PR #1, no merge. Runtime: Node 22.12+; a single server instance holds rooms in memory.

## Automated checks

- **262 unit tests pass.** This includes the inherited rules/rendering regression suite, motion calibration and racing sensitivity, boost stock/cooldowns, independent human karts, fixed-step behavior across render rates, golf turn/stroke/recovery rules and seeded computer golfers, human tennis/fencing, viewport layouts, manifest validation, scoped storage, snapshots and result hashing.
- **29 party/session/replay tests pass.** Coverage includes four-phone capacity and reconnects, authorization/room isolation, old-build rejection, frozen setup and pause, independent views, read-only display restrictions, duplicate result prevention, replay tampering, Slice Dojo score replay, timed classic results retaining their results phase, explicit duel pairs, brackets, playlists and private Drawing prompts/guesses.
- `npm run format:check` and `git diff --check` pass.
- Production dependency audit reports **zero vulnerabilities** after updating compatible dependency resolutions.
- Public HTTPS smoke checks pass across **all 13 games**: four active controllers where supported, two plus waiting crew for duels, QR origin, practice/countdown/scoring, and authenticated classic inputs.
- Public health/SDK/build routes return 200, the catalog returns 13 entries, Three.js transfers compressed, and extracted kart asset routes return 404.

The full regression run exposed a timed-game transition bug and a timing-sensitive guess-bonus test. Both were corrected; the affected party suite was rerun successfully. Record checks verify score agreement, not that the inputs came from physical human movement.

## Browser checks

The local and public browser flows were exercised with four independent controller tabs in touch mode. The racing phone layout was checked at 844 × 390 CSS pixels with no vertical overflow, keeping Brake left, Boost center and Accelerate right. Checks covered all game launches, original driver selection and four kart cameras, gentle pedal layout, one golf shot and turn handling, independent slicing/racing/flight/shooting views, human duel actions, results and return to the lobby with the same phones.

Additional checks: Drawing reveals its prompt only on the artist phone, accepts correct guesses on other phones, awards points and rotates the artist; Pick two starts exactly the chosen players; a remote display follows Player 2 with the correct driver and hides its loading cover after receiving a snapshot. A natural Slice Dojo round displayed **“Replay checked · scores match”**. The creator template validates and renders in the sandbox, with the preview sliders moving its pointer. The self-test detects WebGL, matching build and connection round trips.

The lobby’s recent-round picker keeps completed exports available after rematches. A Star Catch record was downloaded through the public HTTPS demo and passed the standalone verifier: **1,772 recorded frames, 293 points, matching replay and result hashes**. Its result was `completed` and `verified`.

## Open acceptance gates

Stable hosting/account/domain is deferred at the user’s request. Approved host-phone and scoped remote-screen controls are implemented on PR #2. The TV remains required. Online Kart/Tennis/Fencing are implemented with server-owned simulation; peer lockstep is optional research. Creator publication stays gated on an outside trial, with the registry/review/gallery workflow already implemented.

Physical iOS/Android permission prompts, actual sensor feel, QR readability at venue distance, mixed-network latency, sustained four-player frame rate and a one-hour thermal/soak session have not been established by desktop simulation. The container recipe is prepared; deployment to a hosting provider has not been performed. Do not label this release hardware-accepted or create a final launch tag yet.

The current implementation and approval status are tracked in [IMPLEMENTATION.md](IMPLEMENTATION.md). Enable remote availability with `CHONKS_REMOTE_VIEWS=1`, then opt in per room on the TV. Keep `EVENT_STORE` and `CREATOR_STORE` on persistent private storage when deploying. See [CREATOR-PUBLISHING.md](CREATOR-PUBLISHING.md) for operator review/publication commands. `STRESS_SECONDS=3600 npm run test:stress` runs the simulated-controller hour test; `STRESS_POLLING=1` selects polling. This complements, rather than replaces, the physical phone soak.
