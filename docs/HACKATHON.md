# Running the walk-up party

## Before visitors arrive

1. Install with Node 22.12+ and `npm ci`.
2. Run `npm run share`, then open the printed HTTPS link on the big screen. Phones may use any network. The process and main host tab must stay open.
3. Visit `/self-test` on the host and a real phone. Enable motion from its button and check that a small tilt is detected. A desktop with no motion signal should use touch.
4. Choose a game and its options. Automatic mode uses Solo for one ready phone and Multiplayer for two or more. Explicit Multiplayer waits for two humans.
5. Open Kart Rush once before the demonstration to warm the local module/shader cache. Turn on sound with a click. Choose fullscreen if desired.

Stable account/domain deployment is **pending until last at the user’s request**. The Dockerfile is prepared for one Node instance behind trusted HTTPS with WebSocket upgrades. Set `PUBLIC_ORIGIN` to the public origin. A server restart loses rooms and recent records; download useful results first. A quick tunnel receives a new address after restarting, so use the current on-screen QR.

## What a visitor sees

The QR opens the correct party directly. The phone assigns a name, number and color, then offers **Let’s play** or **Play with touch instead**. Motion permission requires a browser-approved tap. Calibration learns the visitor’s comfortable grip. Recenter and Adjust feel remain available.

The phone shows the current action while attention stays on the shared screen. Star Catch, Neon Drift and Bubble Burst have six seconds of practice, a countdown, and a 60-second round. The ten original games have their own starts and rules, bounded by an overall round timer. Results last 12 seconds before the next round; Choose a game keeps every phone paired.

## Racing

Use landscape, both hands, with a comfortable neutral grip. Small wheel-like left/right tilts steer; no full rotation or forward/back braking is required. Defaults: 2° dead zone, progressive curve, about 32° for full steering, and roughly 63 ms smoothing. Racing sensitivity has its own saved 70–130% range and reset. Touch uses a spring-centered steering slider.

Pedals are **Brake / Boost / Accelerate**, left to right. Hold Accelerate; Brake takes priority. Boost requires acceleration, lasts 1.5 seconds, has an eight-second cooldown and **three successful uses per race/round**. Invalid presses consume nothing. Reconnecting cannot refill the supply. Cancellation, focus loss, hiding a phone and game changes release held pedals.

Kart Rush lets every phone choose and confirm an original driver; the host picks one or three laps and optional CPU racers. Two to four human karts race in the same world, with individual cameras and named HUDs. Pickups activate automatically in party mode. A dropped phone’s existing kart is auto-driven during recovery.

## The rest of the arcade

- Pocket Greens takes turns, follows the active ball, and shows inactive phones whose shot it is. Hold the shot button to build power, then release. Choose 1, 3 or 6 tee variations and optional seeded computer golfers. Stroke caps and out-of-bounds recovery prevent a stalled round.
- Slice Dojo offers shared-score co-op, individual scores on a shared board, and separate same-seed Race boards. Its two-minute party format uses score penalties instead of elimination. Cursor logs are independently checked before results receive the replay-checked label.
- Table Tennis and Foam Fencers support two humans or the original solo AI. With three or four visitors, choose two explicitly, use Winner stays, or play a mini bracket. Extra phones wait with their identity intact.
- Time Trial, Cloud Cruise, Shooting Range and Alien Attack each give every active phone its own view. The common results screen ranks the crew.
- Drawing defaults to draw-and-guess for a group. Only the artist sees the secret word; everyone else types guesses on their phone. Faster correct guesses score more, the artist also earns points, and the role rotates. Solo and the Free draw option keep the shared canvas; every phone has a colored pen.

## Host controls and extra screens

Make it your party contains three playlists, volume, gentle effects, the self-test link and a **private display invite**. Displays can follow one player, two players or everyone. They receive snapshots and cannot inject scores, input or feedback. Keep the main host open. Revocable host-phone controls and PIN-protected Kiosk administration are implemented. Normal visitors have no match-level powers. The TV remains the room owner; automatic TV replacement is not enabled. Remote play is available with `CHONKS_REMOTE_VIEWS=1` and TV room opt-in; see [NETWORKING.md](NETWORKING.md).

The host can pause/resume, return to the lobby, remove a player, replay, choose another game and download a round record. Completed rounds also remain in Make it your party → Recent rounds, so exporting is not limited to the 12-second results screen. Setup is frozen during play. Series standings award 4/3/2/1 points by rank, including tied ranks; free drawing does not add competitive points. Device nicknames and personal bests stay on that phone.

## Recovery

A per-tab token preserves a controller’s seat and score through a refresh or short disconnect. Opening a new tab is a new player. Fresh inputs expire after 500 ms. Disconnected active seats remain reserved until the round ends; inactive slots free after 20 seconds. Golf waits 30 seconds before taking a bounded automatic shot for a missing player. A fifth visitor waits and retries; this is not a FIFO queue.

Host disconnection freezes play for up to two minutes. Server restarts end in-memory rooms. Rooms expire after four hours. Touch is available if motion permission is declined, hardware is missing, or calibration cannot stabilize. Wake locks and vibration are optional and browser dependent.

## Rehearsal still required

Use physical iOS Safari, Android Chrome and a low-end phone on mixed Wi-Fi/mobile networks. Check QR scan distance, first permission prompts, both landscape orientations, steering at the default sensitivity, reconnect after sleep, and a full hour with four phones. Measure perceived latency and sustained frame rate on the actual host. Automated/browser checks cannot establish sensor feel, venue connectivity or thermal behavior.

Run `npm run check` for regression tests and `PARTY_URL=https://your-current-demo node tests/party/network-smoke.cjs` for the four-controller protocol check. The smoke test creates its own room. See [RELEASE.md](RELEASE.md) for evidence and limitations.
