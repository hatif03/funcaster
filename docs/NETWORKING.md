# Multiplayer and synchronization

The TV retains room ownership. Four phones play, with further visitors waiting in a bounded queue. Host-phone delegation uses the phone's own identity and a revocable server grant, never the TV credential. Kiosk administration requires a separate staff PIN.

## Screens and authority

Displays initially receive read-only invites. With `CHONKS_REMOTE_VIEWS=1`, the TV can opt a Party room into remote play (off by default; unavailable in Kiosk). Each display shows its own phone QR. Ready phones pair to a screen. Independent games offer a random grant valid for exactly that room, seat, view and round; the TV cannot also report that view. Expired, revoked and wrong-seat grants are rejected. Reloading an independent run cannot restart it; the original JavaScript instance can reconnect for ten seconds, then that view forfeits.

Online **Kart Rush, Table Tennis and Foam Fencers** use one server-owned rules instance whenever an active seat is paired to a remote screen. Phones send calibrated inputs and bounded actions. The server samples at 60 Hz and advances physics twice at 120 Hz per sample. Screens only render snapshots: neither the TV game iframe nor a remote viewer may upload state, score, feedback or a replay for these rounds. The TV still selects, starts, pauses and administers the room. This implements online play without requiring client engines to agree on physics calculations.

The shared start barrier waits for the main game frame and paired viewers. Initial readiness has a twenty-second bound. After starting, loss of a paired frame pauses simulation for up to ten seconds; a reload with its saved screen identity receives the current snapshot of the same run. Expiry forfeits that seat. Loss of the main game frame has a ten-second recovery window and then produces no-contest. Explicit pause and owner disconnection freeze recovery clocks. There is no automatic TV-ownership migration. The existing thirty-second phone reconnect/duel policy still applies.

Full shared snapshots are sent at 20 Hz using replaceable transport messages. Viewers use the existing 100 ms spatial interpolation buffer and freeze on stale data. Orientation/input messages remain reliable, including polling. Shared events drive renderer/audio cues; Kart feedback includes each phone's driver readiness, three remaining boosts and cooldown. Own-seat cameras and opponent mirroring keep remote controls consistent.

Golf and other shared browser games retain TV simulation. Golf sends bounded public stroke events so a viewer can simulate flight and reconcile resting snapshots. Time Trial, Cloud Cruise and Alien Attack exchange lightweight non-colliding rival poses; Time Trial can show the previous verified winner. The three lightweight party games run on the server in every room.

## Verification

Online Kart/Tennis/Fencing record compact, bounded server input/action journals (`sharedFrames`) and independently replay the same rules to check final scores. Results identify `simulation: "server"`. The three lightweight server games replay their input frames; Slice verifies its cursor log. Other supported browser games replay whitelisted fixed-step logic calls. Chunks are sequenced, acknowledged and retried. Results carry integer scores/stats, verification tier, rules version, content hash and replay hash. The CLI requires the matching archived build. Verification proves the recorded inputs reproduce scores, not that a physical human generated those inputs.

## Optional peer-lockstep research

`npm run test:determinism`, `/determinism` and the loopback-only `npm run lab:lockstep` remain research tools. They are not the online game runtime or a dependency for enabling it. A future peer-simulation switch would still require real cross-engine matching hashes and latency evidence; see [LOCKSTEP-LAB.md](LOCKSTEP-LAB.md).

## Operational limits

Room creation/join/access/PIN/admin/input rates are bounded; the relay limits payloads and checks Origin against its host or configured `PUBLIC_ORIGIN`. Only loopback proxies are trusted for forwarded addresses. Event records are bounded and written atomically to `EVENT_STORE` (default `.local/events.json`), excluding credentials and raw controller data. Display latency is relay round-trip time, not measured sensor-to-photon latency.

All approved server and remote-view work is on the PR branch. Stable hosting stays last. Physical permissions, audio/fullscreen behavior, mobile network latency and the hour-long thermal/remote soak remain acceptance work, not code prerequisites.
