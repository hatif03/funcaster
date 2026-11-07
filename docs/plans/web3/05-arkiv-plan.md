# Web3 plan 05: Arkiv (results, leaderboards, public rooms, game listings)

> **Superseded on 6 November 2026.** Arkiv published its Mumbai prizes (Build on Arkiv from scratch, plus an Arkiv + Swarm bonus, judged on feedback, reach, why Arkiv and how you use Arkiv). This document is kept as background. The current design (five entity types with owners, flags and leases, Swarm, the judged `/arkiv/` documents) is [build-guide/04](build-guide/04-arkiv-guide.md) and [build-guide/18](build-guide/18-arkiv-submission-pack.md). Known errors here: no `readonly` flag (a trophy owner could rewrite a result), reads trusted one wallet, the schema files were planned at the wrong path, and the hours (12 to 16) are about 49.

Part of the [web3 plan](README.md). Status: plan, 6 November 2026. **Arkiv has not published its Mumbai tracks** ($15,000 pool, "Prize details coming soon"), so this plan is built from the product fit, the SDK and network facts retrieved from the Arkiv knowledge tools on 6 November, and the scoring rubric Arkiv published for a **different** event (Arkiv: Global Tour Stop, scored on how and why features are used). Treat the rubric as a hint about their judging style, not as the Mumbai criteria. Re-read the Mumbai brief when it appears.

> **6 November update:** with friend stakes ([08](08-stakes-product-and-legal.md)) Arkiv also stores the **pot terms, settlement and refund receipts** (entities keyed by the pot id, written from the contract's events by the outbox) and the **head-to-head and streak records** (S1). Arkiv never holds money; the Arc contract does ([09](09-arc-pot-and-settlement-plan.md)).

## 1. Why Arkiv fits this product

Arkiv stores **entities**: a payload (up to 128 KiB) plus **typed, queryable attributes**, owned by a wallet, with an **expiry**. Our product already produces exactly that kind of data and needs exactly those properties:

| Our data | Arkiv property it uses |
| --- | --- |
| Match results (`ResultV1` with a canonical hash) and replays | Payload plus typed attributes; verifiable authorship (`$creator`); long or short expiry per type |
| Per-game, per-mode leaderboards and event records | Numeric attributes with range queries (`gt`); cursor pagination; live events for a TV window that updates itself |
| Rooms (a lobby that exists for a couple of hours) | **Expiry** that matches the product's own lifetime; `extendEntity` as a **lease renewed by activity** |
| The creator platform's published games | An entity per game whose owner is the creator; ownership transfer on publish; lease renewed by plays; permissionless extension so the community can keep a game alive |
| A player's trophy (a winning result) | `changeOwnership` to the winner |

It also fits the product's own rule that web3 is additive: the relay keeps its local `event-store`; Arkiv is an extra sink and source.

## 2. Network and SDK facts (from the Arkiv knowledge tools, 6 November 2026; re-check `network_status` at the event because the testnet name or chain can change)

| Item | Value |
| --- | --- |
| Network | **Tiramisu** testnet, chain id **7738577** |
| SDK | `@arkiv-network/sdk@0.8.1` with `viem` (`npm install @arkiv-network/sdk@0.8.1 viem`). **Do not install `latest`**: the registry's `latest` tag is an older generation that installs cleanly and cannot talk to the current network |
| RPC | `https://rpc.tiramisu.db-chain.testnet.arkiv.network`, WebSocket `wss://rpc.tiramisu.db-chain.testnet.arkiv.network`; anonymous use works (published as 600 requests per minute, unverified); optional access keys raise limits and must stay on the backend |
| Faucet | `hub.arkiv.network/faucet` (test GLM; **wallet sign-in and CAPTCHA are a human step**) |
| Explorer | `tiramisu.explorer.arkiv.network` (entity history at `/entity/{key}`); the public Data Explorer did not list Tiramisu when checked |
| Limits | payload 131,072 bytes; **32 attribute cells per operation** (payload and content type count, so a create has room for about 30 custom attributes); **attribute names up to 32 ASCII bytes and lowercase** (the node rejected uppercase user names even though the SDK accepts them); string values up to 128 UTF-8 bytes; query pages up to 200; block time about 2 s |
| Writes | Do **not** loop `createEntity`: parallel writes from one wallet collide on the nonce. Use `executeBatch` for several entities |
| Queries | Equality, ordered comparisons on numeric types, prefix match, `AND`, `OR`, `NOT`. **`ne`, `exists` and `hasType` are rejected by the node.** **No server-side sort**: results come newest first; rank in code, following `next()` across pages. Bare numbers infer `i32`; use `u64(...)` for timestamps (`Date.now()` does not fit `i32`) |
| Expiry | Block-based (nominally 2 s per block, not a wall-clock guarantee); `extendEntity` **sets** a new expiry (it does not add); an expired entity cannot be recovered; **no expiry event is emitted** (re-query or compare expiry to the current block) |
| Events | `watchEntityEvents` uses a **WebSocket subscription only when the transport is a WebSocket and `fromBlock` is absent**; otherwise it polls (default 1 s). Events carry the entity key, owner, expiry and log position but **not attributes or payload**: follow up with a read |
| Trust | Arkiv is a shared public database: **anyone can write entities carrying your attributes** (including a fake winning score). Filter every read with `createdBy(<our backend wallet>)`; `$creator` is set at creation and cannot be forged. Treat payloads as untrusted (validate shape; never `innerHTML`) |

## 3. The entity model

All attribute names are lowercase and at most 32 bytes. `app` is a globally unique string for this event (for example `chonks-mumbai-2026`). The backend wallet that signs everything is **`SPONSOR`** (a dedicated key in an environment variable; a separate process from the room relay).

| Entity (`type`) | Attributes (typed) | Payload | Expiry | Owner and lifecycle |
| --- | --- | --- | --- | --- |
| **`room`** | `app`, `type`, `room` (code), `game`, `mode`, `status` (open, playing, closed), `seats` (i32), `host` (str), `started` (u64) | Join URL (hosted), seat shapes and colours (no names), setup summary | **2 hours**, **extended on every round** (a lease renewed by activity); a closed room is left to lapse | Created only when the host taps **Make this room public**; `SPONSOR` owns it; a "find a free room" list for remote friends and the kiosk's "next up" |
| **`result`** | `app`, `type`, `match` (matchId, str), `game` (the `chonks.<slug>` id, str), `mode` (str), `board` (hash of the scoreboard key, str), `verif` (str: verified, attested, failed, unverified), `players` (i32), `top` (i32), `at` (u64), `season` (str) | The full `ResultV1` JSON (under 8 KiB) including its canonical `hash` and `replayHash` | Long (for example 365 days; not `permanent()`) | `SPONSOR` creates; **`changeOwnership` to the winner's address** when the winner has one (the trophy) |
| **`score`** | `app`, `type`, `board` (str), `game` (str), `score` (**i32**), `player` (handle or address, str), `verif` (str), `at` (u64), `season` (str), `match` (str) | `{ name, stats }` (validated on read) | One **season** (for example 30 days); a separate **`record`** entity (best per board, patched only when beaten, single writer) is long-lived | `SPONSOR` creates after a **verified or attested** result; the board is ranked client-side |
| **`replay`** | `app`, `type`, `match`, `seq` (i32), `of` (i32) | A compressed `ReplayV1` chunk (under 128 KiB each) | 30 days | `SPONSOR`; only when the players opted in (consent switch) |
| **`game`** | `app`, `type`, `gameid` (str), `ns` (str, the creator namespace), `ver` (str), `bundle` (bytes32, the bundle hash), `status` (published, withdrawn) | The manifest | A **lease renewed by plays** (`extendEntity` on each play); created with **permissionless extension** so anyone can keep a game alive | Created by `SPONSOR` at publish, then `changeOwnership` to the creator's address |
| **`profile`** | `app`, `type`, `handle` (str), `addr` (str) | Consent flags and personal bests | Long | Owned by the player after a transfer from `SPONSOR` |

**Board key.** The existing `scoreboardKey(game, setup)` (in `core/scoreboard-key.js`) is `id|JSON(...)` and can exceed 128 bytes: store its **SHA-256 hex truncated to 32 characters** in the `board` attribute and keep the readable form in the payload.

## 4. Where it plugs into the code (the seams that already exist)

| Existing code | Role |
| --- | --- |
| `server/records.cjs` `makeResult(...)` returns `{ result (with `hash`), replay }`; `hash` and `canonical` are exported | The record Arkiv stores; the idempotency key is `result.matchId` |
| `server/party.cjs` `finish()` after `makeResult` and the event-store write | The single call site: `integrations.records.put(result, replay)` (non-blocking) |
| `server/event-store.cjs` (leaderboards today, `scoreboardKey`) | Stays; Arkiv becomes a second sink and a read source for the TV window |
| `server/creator-registry.cjs` (namespaces, publish, withdraw) | `game` entities on publish and withdraw |
| `server/arcade.cjs` (Kiosk leaderboard in `state.leaderboard`) | The TV leaderboard window reads Arkiv live when available, falls back to `state.leaderboard` |
| `plan-history.md` section 5f.2 integration contracts | The `Records` capability: `putResult`, `putReplay`, `query` with a local default |

New code lives under **`integrations/arkiv/`** (one folder, so the diff against the baseline answers "what is new"): `client.js` (clients and the wallet), `schema.js` (the model above and its validators), `outbox.js`, `sink.js` (the `Records` provider), `reader.js` (queries), `watch.js` (live events), and `tests/`.

## 5. How it works

1. **Outbox.** `finish()` pushes the result onto a local queue (a file under `.local/`). A worker batches pending items every 5 s into one **`executeBatch`** (results plus scores plus an optional record patch), with backoff on failure. **A dead RPC never touches a room**: the result shows "saved locally" until it lands.
2. **Idempotency.** Before creating, the worker queries `eq('match', matchId)` with `createdBy(SPONSOR)`; a duplicate submit is a no-op. (Reads then writes are not atomic: a single worker serialises writes.)
3. **Eligibility.** Only `completed` matches with verification `verified` or `attested` write a `score`; `failed`, `no-contest` and forfeit outcomes do not rank (the forfeit rule in plan.md applies); `abandoned` writes nothing.
4. **Reading the board.** `select({ attributes: true, payload: true }).where(eq('app', APP), eq('type','score'), eq('board', b), gt('score', i32(floor))).createdBy(SPONSOR).fetch()`, then follow `next()` until done and sort in code. `floor` comes from a cached "tenth best" to avoid fetching everything; never use `.limit(10)` before sorting.
5. **Live window.** The shell's Leaderboard window opens a public client over the **WebSocket** transport and calls `watchEntityEvents` **without `fromBlock`**; each event for an entity created by `SPONSOR` triggers one follow-up read and a re-rank. The window shows a "live" indicator only while events have recently arrived (a quiet stream is not proof of a healthy connection).
6. **Rooms.** On "Make this room public" the sink creates a `room` entity and renews it with `extendEntity` (a strictly later target) at each round; closing the room leaves it to expire. The public list is a query on `status = open` with `createdBy(SPONSOR)`.
7. **Trophy.** When a winner has an address (from the identity track, [04](04-world-plan.md), or an ENS name, [03](03-ens-plan.md)), the sink calls the ownership transfer for their `result`.
8. **Consent.** Scores and the result hash are published by default **only with the nickname** (no personal data); replays are published only if the seat's consent switch is on (default off). Nothing leaves the room when `PARTNERS=off`.

## 6. Tests

| Test | What it proves |
| --- | --- |
| Schema validators | Every attribute name is lowercase and at most 32 bytes; values fit their type; a create stays under 32 cells |
| Fake-client unit tests | Outbox batching, backoff, idempotency, eligibility rules, board-key hashing, ranking across more than 200 results |
| **Forgery test** | An entity with our attributes from another wallet is ignored by every read (`createdBy`) |
| Fault injection | A dead or slow RPC never delays `finish()` or the next round; the outbox drains after recovery |
| Integration (manual, on Tiramisu with faucet funds) | A real result round-trips; the TV window updates over the WebSocket; the lease extends a room; ownership transfer succeeds |
| Contract test for the `Records` capability | The Arkiv provider and the local provider pass the same suite |

## 7. Demo moments (for the 3:30 video)

1. A match ends on the big screen; the result appears; the **Leaderboard window updates by itself** (live events).
2. Open the entity in the explorer: the payload, the typed attributes, **`$creator` shown as authorship**, then the trophy owned by the winner.
3. Show the **public rooms** list expiring: a room entity with its lease being extended each round and lapsing when the party ends.
4. One sentence on why: **queries over typed attributes, expiry that follows product logic, verifiable authorship**.

## 8. Effort, risks and what to prepare

**Estimate (one strong engineer): 12 to 16 hours:** client and schema 3, outbox and sink 4, reader and ranking 3, live window 2, rooms and lease 2, ownership transfer and tests 2.

| Risk | Mitigation |
| --- | --- |
| The Mumbai brief differs from this plan | Re-read when published; the model is small and modular; the core (results and leaderboards) will fit most briefs |
| Testnet or SDK changes before November | Pin the exact version from `network_status` at the event; keep the integration behind the `Records` interface |
| Faucet needs a human and a CAPTCHA | Fund the sponsor wallet **before** the event and keep a second funded key |
| Node quirks (no `ne` or `exists`, lowercase names, no sort) | The model avoids them by design (positive predicates, lowercase, client-side ranking) |
| Public data and forged entries | `createdBy` on every read; payload validation; no `innerHTML` |
| Anonymous rate limit with many TVs | Reads go through the relay's cached reader; an access key (backend only) if needed |
| Continuity rules | The records pipeline is the documented base; **the Arkiv sink, reader, window and entities are new work, committed 6 November** |

**Before the event:** a funded sponsor wallet; the SDK pinned; a scratch-repo spike that writes and reads one entity; the schema reviewed; consent copy; `docs/` stubs for **`/arkiv/schema.md`** and **`/arkiv/friction.md`** (Arkiv's sibling event required a schema file and a friction report; cheap to produce and likely welcome).
