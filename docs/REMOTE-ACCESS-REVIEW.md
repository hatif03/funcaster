# Remote screen access review

The user explicitly approved this scoped access on 6 November 2026. It is implemented on `codex/arcade-launch-plan` and draft PR #2, default-off and without a merge or deployment.

## Exact access scope

- The TV owner may enable remote play in a room, using `CHONKS_REMOTE_VIEWS=1` plus a per-room switch. Both gates default off. Kiosk keeps it off.
- A laptop/TV holding that room's existing display invitation may register a screen record. Its QR contains only the public room code and public screen reference.
- A normal player phone scanning that QR binds its seat to that screen. One invited screen serves one phone seat. Screen references are validated within the room.
- The paired screen must tap Ready. For independent-view games (Time Trial, Cloud Cruise, Shooting Range, Alien Attack, Slice Dojo Race), the server issues an opaque token to that screen only. It can register and receive input for only that seat in that round, and report that seat's scores, bounded replay chunks, feedback and snapshots.
- Server-simulated games receive their existing server frames, emphasizing the paired seat. Golf/Sketch/shared Slice remain snapshot viewers. Kart Rush, Tennis and Fencing remain same-room playing until their separate deterministic-math and hardware gates pass.
- Remote screens never receive the TV owner credential. They cannot select games, alter setup, start/pause rooms, kick players, unlock staff access or read other rooms.
- The TV can revoke/reassign between rounds. Revocation in a running round ends that remote view; it never restarts a scored run. Disconnect recovery retains the same live simulation for ten seconds; after that the seat forfeits. Room/round termination invalidates tokens.
- Results explicitly identify remotely reported views. Score replay proves agreement with inputs, not that a human produced them.

## Risks and validation

An invited participant can falsify inputs or client-attested scores for their own seat. A leaked invitation permits watching that room; a leaked view token permits that one active view while valid. Tokens stay off public state, URLs, QRs and persistent event records. Tests will cover forged views, wrong room/round/build, revocation, token exposure, duplicate chunks, reconnect without restart, loading gates and final score merge. Browser tests will cover host plus invited display plus paired phone.

Delivery is feature-branch code and an update to draft PR #2 only. This does not authorize deployment, public exposure of a running server, a main-branch push or any merge.
