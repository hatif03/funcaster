> Historical arcade milestone. Current merged-main architecture is [ARCHITECTURE.md](../ARCHITECTURE.md); current release work is [plan.md](../plan.md).

# Arcade launch implementation — 6 November 2026

Branch: `codex/arcade-launch-plan`, based on main `086d9b2`. Delivery: [PR #2](https://github.com/hatif03/web3-multiplayer-games/pull/2). No merge or deployment is authorized. This dated ledger supersedes the old audits and approval-blocked notes in the historical plan.

## Implemented

| Workstream | Delivered behavior |
| --- | --- |
| Catalog and identity | One generated catalog for all 13 games, neutral published IDs with old aliases, declarative setup and round policies, four seat colours/shapes, phone identity recovery for four hours, explicit takeover and away states. |
| R1 lifecycle | Four active seats plus a bounded waiting queue; reconnect/promotion without rescanning; no mid-round new active seat; 30-second grace, duel pause, forfeit/removal/DNF/no-contest outcomes; timed/turn/until-done policies and bounded host extensions. |
| Host phone | Revocable player-token delegation, five-second TV veto window, transfer/decline, scoped idempotent commands and setup; the owner credential never reaches a phone. TV keeps control. |
| Kiosk | Six-digit staff PIN with room/IP attempt limits, staff lock, room lock/remove, ten-second ready countdown, queue rotation, playlist, idle reset, event counters and persistent bounded leaderboards. Atomic event storage excludes controller inputs and credentials. |
| Hardening and local setup | Origin/payload/room/access-attempt limits, trusted loopback proxy handling, explicit LAN IP choice, pure Node certificate generation and cross-platform launcher. |
| Controller | Gentle calibrated landscape wheel; Brake left / Boost centre / Accelerate right, three boosts and eight-second cooldown; adaptive input pacing, brief boost preservation, touch fallback, hold-to-recenter/leave, larger controls, skins, reduced effects and host/staff panels. |
| Visual and sound | Original Bombay Arcade skyline and route menu, seat badges and controller skins, shared game HUD, original vector game art, local WOFF2 fonts/licences, synthesized audio cues/fallbacks, app icons, palette, wordmark, share image and Credits page. |
| Kart Rush | Small-grid item odds/CPU pacing, idle assistance, configurable field/laps, per-seat HUD, first-finisher 30-second window and deterministic logic-log checking. Online rounds use server-owned rules with paired per-seat cameras, phone driver selection, shared start/recovery and verified input journals. |
| Pocket Greens | Aim latch/address/release and stroke sequence IDs; previous-hole honours; 30/45/60/90-second turns and ready-golf option; seeded tees/pins/wind; CPU skill; stroke/match/skins/closest/scramble modes; four-player match best-ball pairs; verified replay; stroke-driven remote flight with snapshot reconciliation. |
| Slice Dojo | Shared Co-op lives/fatal bomb, seat scaling, Battle and independent same-seed Race, three-second countdown, bounded timestamp mapping and swept-hit arbitration, per-mode bests/stats, opt-in helper blade, acknowledged replay chunks. |
| Tennis and Fencing | Fixed steps and replay checking, tennis win-by-two/serve rotation/7-or-11 scoring and co-op paddles, fencing deciding-point sudden death; crew rotation/brackets retained. Online rounds run on the server and paired screens render each player’s perspective. |
| Time Trial / Cloud Cruise | Live non-colliding ghosts; previous verified Time Trial winner ghost; Cloud shared-ring claims/time bonus; original independent 3D modes retained. |
| Shooting Range / Alien Attack | Original independent 3D modes plus shared targets/tag-and-steal and shared co-op/versus patrol, unique kill credit, revival pickups, opt-in crosshair/wingman helpers, fixed steps and verified replay. Shared modes use a readable overhead canvas. |
| Drawing | Private themed English/Hindi/Hinglish words and bounded custom decks, normalized aliases/filtering, five guesses with penalty, free-draw voting without self/duplicate/spectator votes; usable text selection and input. |
| Server games | Star Catch and Bubble Burst optional exclusive pickups with order-independent arbitration; Neon Drift optional slipstream; separate mode leaderboards and verified input replay. |
| R4–R6 remote | Default-off opt-in, per-screen QR pairing, scoped one-view/one-round grants, offer/start gates, same-page recovery and no fresh reload restart, revocation/timeout forfeit, acknowledged replay retry, 20 Hz buffered snapshots, wake-lock reacquisition, capability hints and latency readout. |
| SDK | Actual fixed-step lifecycle used by GameLink adapters, immutable results/disposal, recursive bundle validation, version and content-hash checks, complete editable creator bundle, loopback-only sandboxed whole-bundle preview; first-party fixed-step callbacks use the runtime, including Kart/Golf. Operator-owned namespaces, immutable submissions, three-part review, trial gate, publication/withdrawal and read-only sandboxed community gallery are implemented. |
| Optional peer-lockstep research | Explicit math wrappers, 20-race Node/browser hash runner, isolated loopback sequencing lab, duplicate/reordered frame recovery and hash checkpoints. The lab is not connected to production room authority. |

The server and scoped remote-screen proposals were explicitly approved by the user and implemented. They are no longer awaiting access approval.

## UI review

The full player-facing flow was reviewed on 6 November: responsive host/phone forms, compact game menus and HUDs, split-view player labels, results, paired remote screens and utility pages. See [UI-REVIEW-2026-11-06.md](UI-REVIEW-2026-11-06.md) for fixes, representative screenshots, coverage and real-device limits. The current checklist is [plan.md](../plan.md); earlier scenario details are archived in [plan-history.md](../plan-history.md).

## Release gates and conditional follow-on work

- **Online architecture:** R7/R7b behavior is implemented using server simulation and snapshots instead of peer lockstep. Client browsers do not need to produce identical physics hashes. The optional lab still requires cross-engine acceptance before any future switch to peer simulation. The TV remains the room owner; automatic TV takeover is outside the approved ownership scope.
- **Hardware / R8:** real sensor permissions, calibration, landscape directions, multitouch, accessibility, mixed mobile networks and 300 ms remote Golf viewing; one-hour four-phone thermal soak and venue rehearsal. Do not tag a launch release before these pass.
- **Creator acceptance:** an outside creator must complete the bundle workflow before the operator records acceptance and publishes reviewed versions. The implemented gallery supports standalone keyboard/pointer bundles; it grants no party credentials. A public self-service upload portal and third-party phone/room integration are future extensions, not hidden behind the acceptance gate.
- **Stable HTTPS hosting — last, as requested:** choose an account/domain, provision and publish. Neither a stable deployment nor a tunnel was created by this implementation.

Later roadmap assets (the full commissioned 3D Mumbai prop pack, voice acting, per-game recorded music), eight active seats, optional AI drawing guesses, monetization and partner/Web3 integrations remain outside the launch gate. Code-native SVG/CSS/procedural art is the shipping choice rather than duplicating it into every proposed sprite-sheet format. Existing Nintendo-derived source archives are not served or packaged; the user's decision to revisit history cleanup before public submission is preserved.

See [release evidence](RELEASE-2026-11-06.md), [networking](NETWORKING.md) and [the lab instructions](LOCKSTEP-LAB.md). No hardware, cross-browser or creator acceptance is implied by implemented software.
