# Web3 plan 02: the shared integration architecture (one seam per capability)

Part of the [web3 plan](README.md). Status: plan, 6 November 2026. This updates the design note in `plan-history.md` section 5f (written before the party engine, the records pipeline and Funcaster existed) to the code as it is now. **Nothing here is built.** The partner choice ([README](README.md)) changes which providers are plugged in, not this architecture. **6 November:** Settlement is now an active capability (friend stakes, [08](08-stakes-product-and-legal.md)); a staked room additionally refuses `start` until the pot is locked, and the sponsor wallet also drips play-money funds to phone session keys.

## 1. Principles (unchanged, and still binding)

1. **Web3 is additive and optional.** Every game works from start to finish with no wallet, no chain and no internet beyond the relay. A match with no partner enabled is a complete product, and the Kiosk at the booth must run exactly the same with the integrations switched off.
2. **Never block play on a partner.** Chain calls are asynchronous, queued and retried; a slow or dead provider changes a label on the Results window, never a game or a round.
3. **Design for capabilities, not partners.** The hooks are *identity, naming, records, signing, randomness, settlement, consent*; a sponsor that fits one costs hours.
4. **The result is the product; the chain is a sink and a source.** Results and replays are defined and verified by the platform (they already are); partners only store and read them.
5. **Consent first.** Nothing leaves the room without the players' say-so; nicknames only; replays only on opt-in.
6. **One folder for event work.** Everything written at the event lands under `integrations/<partner>/` so the diff against the baseline answers "what is new" (Continuity). No partner dependency in the baseline `package.json`; adding it is the event's first commit.
7. **Ranked and Dare options stay visible and disabled with a reason** when no provider is on (a standing owner decision).

## 2. What exists now that the integrations hang on (verified in code on 6 November)

| Existing piece | Where | Used for |
| --- | --- | --- |
| `makeResult(...)` returns `{ result, replay }`; `result` has `schemaVersion`, `matchId`, `gameId` (`chonks.<slug>`), `version`, `bundleHash`, `setup`, `seed`, `seedSource`, `startedAt`, `endedAt`, `status`, `verification`, `scores[]` (`slot`, `score`, `rank`, `outcome`, `stats`), `replayHash`, and a canonical `hash`; `canonical`, `hash` exported | `server/records.cjs` | The record every sink stores |
| Result finalisation (`finish()`) | `server/party.cjs` | The single call site for the `Records` capability |
| Event store (bounded, persistent leaderboards and counters) | `server/event-store.cjs` | Stays; partners are extra sinks and sources |
| Creator registry (namespaces, review, publish, withdraw) | `server/creator-registry.cjs` | The `game` listing hook (Arkiv) and the namespace hook (ENS) |
| Operating modes, host delegation, `host.cmd`, `state.leaderboard`, `state.operatingMode` | `server/arcade.cjs`, `server/party.cjs` | Where consent, identity and the Kiosk view attach |
| Phone `device` and `join` payloads, seat token, nickname | `public/party/phone.js`, `core/device-session.js` | Where identity attaches to a seat |
| Funcaster windows: Players, Invite, Results, Records, Leaderboard (attract), Settings | `docs/plans/build/03-shell-architecture.md` | Where partner state is shown |

## 3. The capability contracts (the registry)

A small registry (`core/integrations.js`, outside the bundle-hash-sensitive games) holds the active provider per capability; a default (a no-op or local provider) is registered for every one. `PARTNERS=off | mock | on` selects the mode.

| Capability | Contract | Default | Candidate providers (see the partner plans) |
| --- | --- | --- | --- |
| **Identity** | `verify(seat, ctx) -> { level, subject, nullifier? }`; `sessionKey(seat) -> address` | `GuestIdentity` (`level: guest`, a random per-phone key) | World ID ([04](04-world-plan.md)) |
| **Naming** | `roomName(roomId)`, `displayName(seat)`, `claim(seat, handle)`, `resolve(name)` | The 6-character room code and the nickname | ENS ([03](03-ens-plan.md)) |
| **Records** | `putResult(result)`, `putReplay(replay)`, `query(filter)`, `watch(filter)` | `LocalRecords` (the event store) | Arkiv ([05](05-arkiv-plan.md)); Hedera HCS if chosen as an option ([06](06-alternates.md)) |
| **Signing** | `request(seat, typedData) -> signature` | `NoSigner` (results are `unsigned`) | Session-key EIP-712 signatures |
| **Randomness** | `seed(roomId, ctx) -> { value, source, proof? }` | `LocalSeed` (`source: server-crypto`, as today) | Chainlink VRF or a CRE workflow ([06](06-alternates.md)) |
| **Settlement** | `open(terms)`, `fund(seat)`, `lockStatus()`, `settle(result)`, `refund()` | `LocalPot` (a mock that behaves like the contract; **play money only**) | The Arc pot contract ([09](09-arc-pot-and-settlement-plan.md)); 6 November ([08](08-stakes-product-and-legal.md)), no longer held |
| **Consent** | `get(seat) -> { publishScore, publishReplay }` | Both off | The phone's consent switches, stored with the seat token |

Hook points: **join** (identity, naming), **match start** (randomness), **match end** (build result, consent, sign, `putResult`), **Records and Leaderboard windows** (query, watch), **Players and Invite windows** (verified badge, names).

## 4. Result additions (additive, versioned)

`ResultV1` already exists and is hashed canonically. Partners need a few **additive, optional** fields; to keep old records valid, they go in a sibling object that is **not part of the hashed core** until a version bump is decided:

```json
{
  "identity": [ { "slot": 0, "level": "guest" | "device" | "orb", "nullifier": "0x..", "name": "asha.funcaster.eth", "address": "0x.." } ],
  "receipts": [ { "provider": "arkiv", "key": "0x..", "tx": "0x..", "at": 1760000000000 } ]
}
```

- `identity` is filled by the Identity and Naming providers at join time and copied into the result at finish; it never contains anything a guest did not choose to share.
- `receipts` records where the result was stored so the Results window can show "Saved to Arkiv", "Saved locally" or "Saving...".
- Because `bundleHash` covers `core/`, `sdk/` and `games/`, **put the registry and every provider outside those trees** or accept that old records need the archived build. The registry file is therefore `server/integrations.cjs` (server side) with a thin browser shim in `public/os/integrations.js`, and the providers live in `integrations/`.

## 5. Where partner state shows up (UI, in the Funcaster shell and the phone)

| Surface | What appears when a provider is on | When off |
| --- | --- | --- |
| **Phone gate** | A "Verify" step (identity) and a "claim your name" field (naming), both skippable; a consent card at match end | Nothing; guests play |
| **Players window** | Verified badge, the ENS name next to the seat shape and colour | The seat name |
| **Invite window** | The room name (an ENS name) beside the code; the "Make this room public" switch (Arkiv rooms) | The code |
| **Game Properties** | **Ranked** and **Dare terms** options (always visible; enabled only with the needed providers) | Visible and disabled with a plain reason |
| **Results window** | A receipt line and QR (the stored record), per-seat verified tick, "saved locally / saving / saved" state | "Saved locally" |
| **Leaderboard window (attract)** | Live board from Arkiv, a verified-human count | The local board |
| **Settings** | A Partners switch (`off`, `mock`, `on`), a "Publish my score" consent default | Hidden |

## 6. The sponsor wallet and the hosted relay

- A **separate process or module** (`integrations/wallet-service`) from the room relay reads an outbox queue and signs every chain write with a **dedicated testnet key** held only in an environment variable (never in the repo or the client), with: a kill switch that disables all writes, per-room and per-IP write caps, a low-balance alert, and bounded retries. Chain latency or failure cannot touch a room.
- **World verification, ENS name issuance and Arkiv writes all need the relay to reach the internet and expose server endpoints** (signing `rp_context`, verifying proofs, issuing names). Phones on cellular and sponsor callbacks cannot reach a laptop on a LAN. **Therefore the hosted relay (tier 1 of the hosting plan) is a prerequisite for the three integrations**, and the booth's LAN fallback runs with `PARTNERS=mock`.
- The booth runs `PARTNERS=on` against the hosted instance; the LAN fallback and any Wi-Fi failure fall back to `mock` automatically and say so.

## 7. Degraded modes

| Situation | Behaviour |
| --- | --- |
| `PARTNERS=off` | No partner surfaces; Ranked and Dare visible but disabled; the product is exactly what ships today |
| `PARTNERS=mock` | The UI is visible and local providers answer (a practice receipt, a local "verified" for the demo); works with no internet |
| Identity provider down | Everyone plays as a guest; Ranked is disabled with the reason |
| Naming provider down | The room code and nicknames show |
| Records provider down | The result waits in the outbox (retried with backoff) and the Results window says "Saved locally" |
| No internet at all | `mock`, automatically, with a visible notice |

## 8. Repository and Continuity hygiene

- Baseline additions (pre-existing work, documented in `PRE_EXISTING.md`): `server/integrations.cjs`, the browser shim, the mock providers, `docs/integrations.md` (these contracts), an empty `integrations/` with a README. **No chain, ENS, World or Arkiv package in the baseline.**
- At the event: provider code under `integrations/<partner>/`; **small commits 6 November onward** (a single large commit can disqualify); a `.env.example`; the AI-use record (where and how AI assisted, with the spec and prompt files committed), required by the event rules.
- **Prototype in a scratch repo before the event**, never in the game repo, so the event's commits are visibly the new work.

## 9. Tests

One **contract test suite per capability**, run against the default provider now and the real one later (a provider passes or it does not); canonical-encoding vectors that hash identically in Node and the browser; the consent defaults; idempotent resubmission; **fault injection** proving a dead provider never stalls a round; offline fallback; Ranked eligibility (every human seat verified, minimum humans met, status completed); **parity with partners off: the same match produces byte-identical results and hashes with `PARTNERS=off`** (the Continuity proof that past winners such as Novi Corpus publish).
