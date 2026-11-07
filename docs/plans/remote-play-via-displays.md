# Remote play via display-hosted views: execution plan

Status: plan, 6 November 2026. **Approved by the owner on 6 November** ("Sure, add detailed plans on how this will be achieved"). Read-only analysis; nothing was run in a browser. Latency and asset figures marked "estimate" are unmeasured.

**Update (6 November, later):** the default way to bind a seat to a remote screen is now **pairing by QR on the remote screen** ([plan.md §5h.5](../../plan-history.md#5h5-pairing-how-a-remote-friend-joins)): the friend opens the display link, scans the QR that page shows, and the phone's join carries `screen=<ref>`. The host's `assign-seat` dropdown in section 4.2 stays as the reassign fallback. The integrated plan for all engines is [plan.md §5h](../../plan-history.md#5h-how-multiplayer-and-remote-play-get-built-6-november-2026).

**Goal.** A friend on another screen (a laptop elsewhere) opens the room's display link, is offered a seat, and plays that seat's game **on their own screen**, while the host's TV keeps full control of the room. Today displays are read-only watchers.

Abbreviations: `P` = `server/party.cjs`; `H` = `public/party/host.js`; `D` = `public/party/display.js`.

## 1. Findings that change the brief

1. **Kart Rush is not an independent-view game.** It runs one sim for all humans and CPUs in one iframe and renders split-screen itself (`multiview.js`, `game.js:1580-1595`); tests treat it as one shared screen. A remote seat would require splitting the shared race sim: a rewrite. **Recommendation: exclude it from v1**; it already has spectate-only via `watch-game` snapshots (see Q1).
2. **In scope: five games**: Time Trial (`kart`), Cloud Cruise (`island-flyover`), Alien Attack, Shooting Range, and Slice Dojo with `variant === "race"`. These run one single-player iframe per seat.
3. The independent-game list is **hard-coded in three places** (P:16-24, H:217-221, D:44-48).
4. **Round start is not synchronised today.** Each iframe starts when its first `presence` arrives, while the server timer starts at `start()` (P:331-343), so slow loaders lose time. Remote seats make this worse and need a start gate.
5. **Input routing needs no change.** `relayClassic`/`classicEmit` send to `room.screens.get(view)` (P:132-166): whichever socket registers for a view receives that phone's input. The work is registration, authorisation and host-page behaviour.

## 2. Current flow of an independent-view round

| # | Actor | Event | Effect |
| --- | --- | --- | --- |
| 1 | Host tab | `host` | `buildId` check, mints `hostToken` and `displayToken`; stored in `sessionStorage chonks.host` |
| 2 | Phones | `join`, `ready` | Per-phone token |
| 3 | Host | `start` | `closeScreen` kicks every screen and viewer; `roundId++`; `active` set; phase `classic`, `endsAt` = now + 120 s |
| 4 | Host page | on `state` | One iframe per active seat: `/games/<g>/?party=<code>&round=<id>&view=<i>` (no token in URL) |
| 5 | Each iframe (own socket) | `screen` | Reads the host token from shared tab storage; server checks buildId, `hostToken`, phase, game, roundId, view in range; sets `room.screens[view]`; acks setup |
| 6 | Iframe | starts on first `presence` | Seed from `setup.seed` |
| 7-8 | Phone → server → view | `input` → `orientation {slot:0}` | 30 Hz relay |
| 9-12 | Iframe → server | `score`, `replay-chunk` (Slice), `snapshot`, `feedback` | Bound to the view's own slot |
| 13 | Iframe | `match.finish` | `finishedViews[view]`; when all are in, `finish()` builds the result |
| 14 | Server | timeout at `endsAt` | `finishedViews ?? progress ?? 0` |

Tokens today: `hostToken` (room owner, also held by host iframes), `displayToken` (read-only, in the invite link), per-phone token.

## 3. Assumptions that the host page owns the views

Host.js creates and owns every iframe, once per round, with no per-view lifecycle (H:213-250). Iframes authenticate with the host token from shared tab storage (`net.js:119-127`). Only host frames are trusted for `chonks:home`/`chonks:error` (H:450-464). `screen` accepts only `hostToken`, and a later registrant **displaces** the earlier (P:500-501): a reconnecting host iframe would kick a remote screen. `start()` and `enterLobby` call `closeScreen`. View indexes are `room.active.indexOf(slot)` and change between rounds. `display` has no `buildId` check or identity, and the 8-display cap counts sockets (P:410-422). The display page makes read-only iframes (`authority = !params.has("display")`).

## 4. Design

### 4.1 The view token (server-side, opaque; not a JWT)

Stored at `room.views[view] = { id, secret, slot, roundId, game, ref, exp, state }`, minted in `start()` after `active` is computed. The token string is `id.secret` (192-bit random), compared with the existing `equal()` (P:29-33).

| Claim | Value |
| --- | --- |
| Room | implicit (looked up by room code) |
| `view`, `slot` | fixed at mint; a client-supplied `view` is ignored |
| `roundId`, `game` | must equal the room's current values |
| `ref` | opaque id of the display the host chose |
| `exp` | min(round end, mint + 12 min) |
| `state` | `offered`, `accepted`, `registered`, `lost`, `revoked` |

The token is **never** in `state`, a URL or a QR. It travels only over the chosen display's socket as `view-offer`; `display.js` stores it in `sessionStorage "chonks.view."+code`, which the same-tab iframe shares.

### 4.2 Socket events (all behind `remoteViews` flag, default off)

| Event | Direction | Payload |
| --- | --- | --- |
| `display` (changed) | display → server | `{code, token, buildId, resumeKey?, label?}`; ack adds `{ref, resumeKey}` (server-generated); label sliced to 16 chars |
| `displays` | server → **host only** | `[{ref, label, stale, busy}]` (not in `state`, which phones see) |
| `assign-seat` | host → server | `{slot, ref\|null}`; allowed only in `lobby` or `results`, only for independent games, occupied slots, non-stale displays; stored in `room.seatAssign[slot]` |
| `view-offer` | server → that display | `{roundId, game, view, slot, name, color, token, acceptBy}` |
| `view-accept` / `view-decline` | display → server | `{roundId}`; server checks `role==="display"` and `ref` equality |
| `screen` (changed) | iframe → server | adds `viewToken`; server takes `view` from the token. A view with a live token refuses `hostToken`; a view without one refuses `viewToken` |
| `revoke-view` | host → server | `{slot}`: server disconnects the remote screen, emits `view-revoked`, seat flips to host |
| `state` (changed) | server → all | adds `seatViews:[{view, slot, where:"host"\|"pending"\|"remote", label}]` only when a seat is assigned; otherwise `view()` is unchanged |
| `replay-chunk` (changed) | iframe → server | optional ack; server acks even if `sequence < expected` (idempotent); client retransmits until acked |

### 4.3 Server functions to touch (`party.cjs`)

| Function | Change |
| --- | --- |
| `INDEPENDENT`/`independent()` (16-24) | Source from a catalog field (M0) |
| `view()` (45-85) | Add `seatViews`, `remoteViews` |
| `start()` (256-348) | Clear `room.views`; mint offers after `active`; set `room.gate` when any seat is remote |
| `ns.on("display")` (410-422) | `buildId`, `ref`, `resumeKey`, label; push `displays` to host |
| `ns.on("screen")` (478-508) | viewToken branch, host-token refusal for remote views, failed-attempt counter |
| `disconnect` (916-936) | Role `screen` with a token marks `lost`, `lostAt=now()`; role `display` clears its offer and supports resume |
| `replay-chunk` (542-566) | Ack, and `sliceReplays.delete(view)` on takeover |
| `finish`/`makeResult` | Add `result.views=[{slot,source}]` only when a remote view exists (a hashed field, so existing records are unchanged) |
| Timer (940-1066) | Gate deadline, offer timeout, lost-view grace |
| `closeScreen`/`enterLobby` | Invalidate tokens |

### 4.4 Routing and start synchronisation, without game changes

- **Routing:** once the remote iframe registers as `room.screens[view]`, `classicEmit` already targets it; `action`, `feedback` and `pause` work because the socket is in the room.
- **Start gate:** while any seat is remote the server withholds `presence` from screens (P:507, 117-118) and sets `endsAt = 0`. Games only start on `presence`, so withholding it delays them with no game edits. When every active view has registered (registration happens after module load, since `new GameLink` runs after the `import`s) the server emits `presence` to all screens **in one tick** and sets `endsAt = now() + secs`. Deadline 20 s: a view still missing falls back to the host. Local-only rounds never set `room.gate`, so nothing changes for them.
- **Merge:** unchanged. `finishedViews[view]` is keyed by view whichever socket sent it, and `finish()` fires when all are present.

### 4.5 Host page

- `index.html` (inside `.party-extras`): a "Remote screens" list and a per-seat dropdown ("This screen / Screen A / ..."), shown only when `state.remoteViews` and the game is independent.
- `host.js`: refactor 213-250 so each view has its own lifecycle keyed `${game}:${round}:${view}:${where}`; spawn an iframe only for `where==="host"`; placeholder card "Peach is playing on Screen A" with **Bring back here** (`revoke-view`); `wrap.dataset.views` set to the local view count; `chonks:home`/`chonks:error` only from host-owned iframes.

### 4.6 Display page

- On `view-offer`, show a card: "You're Peach: play Slice Dojo on this screen" with **Play on this screen** / **Not now**.
- Accept (the click is the user gesture): store the token, `view-accept`, request fullscreen and `wakeLock.request("screen")` (the display page has none today), and create `<iframe src="/games/<g>/?party=<code>&round=<id>&view=<v>&play=1">` in a fixed 16:9 letterbox. Hide the "Show" selector while playing. **Ignore `chonks:home`** so a remote can never send the host to the lobby. Handle `view-revoked`.
- `core/net.js` (the only shared change, about 4 lines): when `params.has("play")`, send `viewToken` from `sessionStorage` and keep `authority = true`; add the optional `replay-chunk` ack/retransmit. Game folders need no change.
- Use `transports: ["websocket","polling"]` on the display socket, as `net.js` does.

## 5. Security model

| Case | Defence |
| --- | --- |
| Display claims another view | View derived from the token; a forged `view` is ignored |
| Display reports another seat's score | `membership.view` bounds `match.finish`, `score`, `replay-chunk`, `feedback`, `snapshot` to its own view (already enforced today) |
| Leaked or guessed token | 192-bit random; per-socket failed-attempt cap (disconnect after 5); 1 event/s limit on `view-*` events (both new) |
| Another display accepts the offer | `view-accept` checks the server-generated `ref`, which clients cannot choose |
| Token reuse | Valid only while `phase==="classic"` and `roundId` matches; revoked at `start`, `enterLobby`, `remove`, `revoke-view` and on finish |
| Authority | The host stays owner; `hostToken`, `setup`, `select`, `start`, `lobby`, `pause`, `remove` stay host-only. The view token grants only the `screen` role for one view |
| Malicious remote | Can lie about its own seat's score; cannot touch other seats or the room |
| Slice race | Score re-derived server-side from the cursor log; physics tampering is caught, a fabricated perfect cursor log is not |
| Other games | Scores are client-attested today, with no server re-verification |

**Labels.** Attested games stay attested, but trust now includes a friend's machine: rounds with `result.views` should say "N screen(s) reported remotely". `verified` for Slice still means "replay consistent with score", not "human". Slice replays require 16:9 and 1/120 s steps; a remote must not alter either, and the replay check enforces it.

## 6. Failure modes

| Failure | Behaviour |
| --- | --- |
| Transient drop | The iframe keeps simulating; `net.js` re-emits `screen` on reconnect; the server accepts the same token again within a **10 s grace**, replacing the old socket |
| Tab closed mid-round | State `lost` after grace. **v1: DNF**; score is `progress` at `endsAt`, other views finish normally. Takeover resume is not recommended: snapshots exclude `rng` so resume is not deterministic |
| Host revokes mid-round | Host iframe restarts that seat from scratch; for Slice, `sliceReplays.delete(view)` and `progress[slot]=0` are required or the board is invalid |
| Decline or 15 s offer timeout | Seat falls back to a host iframe |
| Wrong build | Add `buildId` to the `display` handshake; mark the display `stale` and exclude it; `screen` build mismatch returns `update:true` and the display shows Reload and asks the server to fall back |
| Fullscreen, audio, wake lock | Need the accept click. Whether same-origin iframe audio inherits that activation is **unverified**. Wake lock needs a secure context (the tunnel is HTTPS; plain-HTTP LAN is not) |
| Background tab | Timers throttle to about 1 Hz and rAF stops; add visibility telemetry to the host and a toast |
| Weak GPU or retina | Games use `min(dpr, 2)`; only that seat suffers; consider `&dpr=1` |
| Replay gap (Slice) | A drop can lose an in-flight chunk and invalidate the board ("failed" falsely). Fix: chunk acks and retransmit |
| Late `match.finish` after reconnect | A buffered finish may hit a not-yet-registered socket and be rejected; verify, and re-send finish after the `screen` ack if needed |
| CORS | Same-origin iframes already; `postMessage` origin checks already in place |

**Asset weight** (measured on disk; gzip via node zlib): three.js module pair 2,044 KB raw / 405 KB gzip; core 104 / 38 KB; socket.io client 46 / 14 KB; Time Trial 27 / 9; Cloud Cruise 21 / 7; Alien Attack 42 / 14; Shooting Range 33 / 11; Slice Dojo 72 / 23. Heaviest first load about **480 KB gzip** (Slice). `Cache-Control: no-cache` on `/games`, `/core`, `/sdk` forces revalidation of every module: over a tunnel expect 1-2 s extra on first load (unmeasured). Slice pulls Google Fonts (a third-party fetch). Kart Rush (about 5 MB) is out of scope.

**Fairness.** Shooting Range crops its 1.6:1 field to cover the window; Alien Attack changes visible width with aspect; Slice forces 16:9. The letterbox removes the remote-versus-host difference but not existing differences between local panes.

## 7. Latency (estimates, unmeasured)

Today: phone → server (half RTT) + tick wait (0-33 ms, average 16) + server → host (loopback if the server runs on the host PC). Remote adds the remote's one-way latency to the host PC behind the tunnel: about 25-100 ms same continent, 100-150+ ms intercontinental. **Phone to remote view is likely 80-200 ms against about 50-80 ms for the host iframe.** This is acceptable for Slice and Shooting Range with the existing visual smoothing, tighter for Alien Attack; the remote player's own game is simulated locally, so it only delays input, not rendering. Remote screens also upload 10 Hz snapshots, unneeded without viewers: add `wantSnapshots` in the `screen` ack later.

**Measure:** full loop RTT (phone → server → view → server → phone) with a debug echo; `orientation` inter-arrival jitter at the view; remote frame time; time from `start` to gate open; reconnect counts.

## 8. Tests (`tests/party/session.test.cjs` style; `fixture(t, {remoteViews:true, buildId})`)

1. **Flag off:** `assign-seat` ignored, no `seatViews`, existing tests pass unmodified.
2. **Authorisation:** only the host can `assign-seat`/`revoke-view`; rejected for Golf, Slice co-op, an empty slot, an unknown ref, a stale display.
3. **Offer leak:** the token reaches only the target display socket (scan every socket's events for the token substring).
4. **`screen` via viewToken:** accepted for the right view; forged `view` ignored; wrong round, wrong game, expired token and previous-round token rejected; no registration on an unassigned view; `hostToken` refused for a remote view.
5. **Spoofing:** a remote view-1 screen sending `match.finish`/`score`/`replay-chunk` with `slot:0` only affects seat 1; `feedback` with `slot:3` reaches only its own phone; a 6th bad-token attempt disconnects; `view-*` flood is rate-limited.
6. **Revoke:** the remote socket is disconnected, `view-revoked` arrives, a later `match.finish` is rejected, the seat returns to host, Slice replay state is reset.
7. **Disconnect:** re-register within grace works; after grace `lost`; at `endsAt` the seat scores its last `progress`; host disconnect freezes relay and clock, reclaim resumes.
8. **Mixed merge:** 3 seats with views 0 and 2 on the host and view 1 remote, any finish order, one correct result with `result.views`; Slice race with a remote board stays `verified`; a dropped chunk is retransmitted and stays `verified` (without acks it fails).
9. **Build mismatch:** a stale display is excluded; a stale `screen` returns `update:true`; the seat falls back to host.
10. **Decline and timeout:** after the offer timeout the seat is `where:"host"`.
11. **Gate:** no `presence` until all views registered, then all in one tick with `endsAt` set at open; on deadline the missing view falls back.
12. **Core unit:** extract a pure `registrationPayload(params, storage)` from `net.js` and test it.
13. **Browser e2e:** host context, display context and a mock phone: offer card, accept, fullscreen, play-through.

## 9. Milestones (flag `remoteViews`, env `CHONKS_REMOTE_VIEWS=1`, default off)

| M | Content | Size |
| --- | --- | --- |
| M0 | Catalog field (e.g. `seatView:"independent"`) replaces the three list copies; behaviour identical; assert it equals the old four plus the Slice race rule | 0.5 d, ~40 LOC |
| M1 | `display` metadata (`ref`, `resumeKey`, `buildId`, label), host-only `displays`, `assign-seat`, `seatViews`; tests 1-2 | 1 d, ~100 LOC |
| M2 | Token minting, `view-offer/accept/decline`, `screen` viewToken branch, host-token refusal, offer-timeout fallback; server only; tests 3-6, 9-10 | 1.5 d, ~150 LOC |
| M3 | Host per-view lifecycle, display play mode, wake lock, fullscreen, letterbox, the `net.js` change | 1.5 d, ~250 LOC UI |
| M4 | Start gate and `endsAt` handling; test 11 | 1 d, ~60 LOC |
| M5 | Replay chunk acks and retransmit, disconnect grace and DNF, revoke, `result.views`, `wantSnapshots`; tests 7-8 | 1.5 d, ~120 LOC |
| M6 | Latency probe, real-tunnel QA, docs | 1 d |

Total about 8 working days, about 700 LOC plus 350 LOC of tests. M0 is shared with [seats-4-to-8.md](seats-4-to-8.md) Stage 0 (the `view:"independent"` catalog flag): do it once.

**Do-not-break checklist (verify at every milestone).** With the flag off or no `seatAssign`: `view(room)` output, the `screen` path, the host frame-spawn loop and DOM, presence timing, `endsAt` and `result` hashes are all unchanged; `npm run test:party` passes unmodified; Kart Rush and shared-board games are untouched; phone code is unchanged.

**Rollback:** unset the flag. Server paths are guarded by `room.remoteViews` and `room.views`; host and display UI hide behind `state.remoteViews`, so reverting M3 and M0 is a plain revert.

## 10. Relation to the hackathon

Not hackathon-critical: Kiosk mode (host plan K1-K3) and room hardening (H5a) come first. If built, the natural hackathon use is a **remote friend or judge joining a room from their own laptop** through the hosted URL, which pairs with the "link works after the event" goal in [hackathon-floor-plan.md](hackathon-floor-plan.md). It needs the hosted instance, because a tunnel to the host PC adds latency for the remote player.

## 11. Open questions for the owner

1. ~~**Kart Rush**~~ **6 November:** excluded from *this* design (view tokens). Remote Kart Rush uses server-sequenced lockstep instead, in [plan.md §5h.6a](../../plan-history.md#5h6a-kart-rush-remote-server-sequenced-lockstep-decided-6-november-2026).
2. ~~**Mid-round disconnect**~~ **6 November:** a forfeit with a penalty after the grace period (last place, or a loss in a two-seat match), per [plan.md §5h.7a](../../plan-history.md#5h7a-leaving-a-match-the-standard-rule-decided-6-november-2026). Restart on the host screen is not offered.
3. A declined or revoked seat: fall back to a host iframe automatically (recommended), or ask the host?
4. Is a fixed 16:9 letterbox on the remote acceptable?
5. Label rounds that include remote seats in the results UI and records (`result.views`)?
6. Is the intended deployment always "server on the host PC behind a tunnel", or a hosted instance? Latency estimates assume the tunnel.
7. Keep the 15 s offer and 20 s gate timeouts and the 8-display cap?

## 12. Could not verify

Any browser behaviour (iframe audio activation, wake lock, autoplay, fullscreen); real latency and tunnel throughput; snapshot sizes per game; whether a buffered `match.finish` flushes before the reconnect `screen` re-emit; module counts and request waterfalls; that no game other than Kart Rush reads `link.localSeats`; that `require()` of the ESM `core/catalog.js` keeps working as at P:12. Nothing here was run or tested.
