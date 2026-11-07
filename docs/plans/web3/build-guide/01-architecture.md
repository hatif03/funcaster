# Build guide 01: architecture

Part of the [build guide](00-README.md). Status: plan, 6 November 2026. Nothing here is built. Facts about the current code come from a code read of `main` at `4a182fe` (Funcaster merged); facts about Arc, ENS and the winning projects come from the research recorded in [the winner patterns](../10-winner-patterns.md), the [Arc guide](03-arc-guide.md) and the [ENS guide](02-ens-guide.md). **Do not write code from this document alone**: it says what the pieces are, how they connect and what must hold; the task documents say what to build and in what order.

## 1. What we are building, in one paragraph

Funcaster is a console: a TV shows a Windows-XP-style desktop, phones are controllers. The web3 layer adds three things without changing how any game plays: **(ENS)** every party is a name with an expiry, every seat is a name owned by the phone, and the chain, not the server, says who may command the party; **(Arc)** friends can put USDC into a non-custodial pot before a match, funded by one tap with no gas and no wallet app, paid out from the replay-verified result, refunded by default; **(Arkiv and Swarm)** every result, score and pot receipt is a typed, readonly, expiring record that **anyone can query without our server** and that points to a replay and a recap card on Swarm, so a result can be re-verified by a stranger; the winner owns the trophy; a live directory of matches clears itself by lease ([04](04-arkiv-guide.md)). The relay stays the real-time authority for gameplay; the chains are the authority for **names, permissions and money**; Arkiv is the **public layer** for what outsiders read.

## 2. Principles that bind every task

1. **Additive and flag-gated.** `PARTNERS=off` (the default) must leave behaviour byte-identical: same `view()` shape, same results and hashes, same socket events. A test enforces it ([07](07-tests-evidence-demo.md)).
2. **Isolated on a branch.** All web3 work lives on `web3/integrations` (section 4). `main` keeps working and keeps shipping game and UI fixes.
3. **Never block play.** Chain, RPC and Studio failures change a label, never a round. No network I/O inside `view()`, `finish()` or the 30 Hz tick: they enqueue and return.
4. **Deep, not cosmetic.** Each partner must be load-bearing: the thing that breaks without it is named in the task and tested ([00](00-README.md) section 5).
5. **Seamless.** A player types a nickname and taps. No wallet app, no seed phrase, no gas, no chain names on a phone. Everything chain-shaped is behind the scenes or in the Chain window for judges.
6. **Evidence by default.** Every claim in the demo has a transaction hash in the repository's evidence file.
7. **Config, not constants.** Chain ids, RPC and explorer URLs, token and contract addresses, the ENS parent and the Arkiv schema version are configuration. **ENSv2 addresses changed about three times in six weeks**; discover them at runtime where the protocol allows, and pin the contracts commit next to any address that cannot be discovered.
8. **Play money at events.** Testnets and no-value tokens only ([08](08-config-and-ops.md) section 8).

## 3. Context diagram

```text
 Phones (browser, no app)                     TV / laptop (Funcaster shell)
   controller.html + phone.js                   public/os  (windows, tray, balloons)
   session key (browser keypair)                       |
          |  Socket.IO (token-authenticated)           |  Socket.IO (host/display role)
          v                                            v
  +--------------------------------------------------------------+
  |  Relay  (server.js, party.cjs)                               |
  |   existing: rooms, seats, host.cmd, finish(), makeResult     |
  |   NEW  server/web3/  (in-process module, same pattern as     |
  |        arcade.cjs and remote.cjs)                            |
  |         - roster + permission cache (ENS reads)              |
  |         - stakes state machine (room.stakes)                 |
  |         - outbox writer, receipts reader                     |
  |         - HTTP router  /api/web3/*   and static /pot/        |
  +----------------------------+---------------------------------+
                               | file outbox / receipts  (.local/web3/)
                               v
  +--------------------------------------------------------------+
  |  Web3 worker  (separate process: scripts/web3-worker.mjs)    |
  |   holds ALL signing keys, sends transactions, retries        |
  |   - ENS registrar jobs      -> Ethereum Sepolia              |
  |   - Arc relayer jobs        -> Arc testnet                   |
  |   - Arkiv sink jobs         -> Arkiv Tiramisu                |
  +----------------------------------------------------------------+
        ^ reads (viem public clients, cached)        ^ built once
        |                                            |
  Sepolia (ENSv2)   Arc testnet (ConditionalPot)   Arkiv   Arc Studio -> contracts + pot-console (Vite app)
```

## 4. Branching, folders and what changes in shared files

**Branch rule (owner decision, 6 November 2026).** All web3 work happens on **`web3/integrations`**, created from `main`. Sub-branches per lane (`web3/ens`, `web3/arc`, `web3/arkiv`, `web3/ui`) are allowed and merge into `web3/integrations`. **Nothing from these branches is merged into `main` without the owner's say.** `main` is merged **into** `web3/integrations` regularly (at least daily while both move) so conflicts are small. This overrides the "commit directly to main" line in `CLAUDE.md` and `AGENTS.md` for web3 work only; those files carry the exception.

**New folders and files** (all outside `core/`, `sdk/`, `games/`, so `bundleHash` is untouched; `server/` still changes `buildId`, which is normal):

| Path | Purpose |
| --- | --- |
| `server/web3/index.cjs` | The module factory `createWeb3(opts)`; the only file `party.cjs` and `server.js` import |
| `server/web3/` (other files) | Stakes state machine, roster, outbox, receipts reader, validators, HTTP router, mock providers |
| `integrations/shared/` | Chain config loader, viem client factories, outbox file format, logger, EIP-712 type definitions |
| `integrations/ens/` | ENS ABIs, hierarchy walker, reads, registrar jobs, bootstrap script, optional `contracts/` (Foundry) |
| `integrations/arc/` | Arc config, relayer, EIP-3009 helpers, oracle (layers B and C), `studio/` (prompt and spec), `onchain/` (pulled from Studio), `pot-console/` (pulled Vite app) |
| `integrations/arkiv/` | Schema, client, sink, reader, watcher, entity validators |
| `integrations/swarm/` | Gateway client, recap-card SVG, keeper, mock ([04](04-arkiv-guide.md) section 6) |
| `arkiv/` (repo root) | The five documents the Arkiv judges read: `schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md` ([18](18-arkiv-submission-pack.md)) |
| `scripts/web3-worker.mjs`, `scripts/web3-*.mjs` | The worker, bootstrap, preflight and evidence scripts |
| `public/web3/` | Generated phone signer bundle (a small esbuild bundle of the viem pieces the phone needs; section 5.4) |
| `tests/web3/`, `tests/party/web3-*.test.cjs`, `tests/os/web3-*.test.mjs` | Tests ([07](07-tests-evidence-demo.md)) |
| `.env.example`, `docs/web3/` | Config template; evidence, feedback and AI-use records |

**Minimal edits to existing files (the complete list; anything else needs a note in the task):**

| File | Edit |
| --- | --- |
| `server.js` | Create the module when `PARTNERS` is not `off`; mount its router before `express.static` with its own `express.json`; pass it to `attachParty`; `process.once("exit", close)` |
| `server/party.cjs` | New option `web3`; four wiring points (`view()` spread, `ns.on("connection")` bind, tick, `finish()`); the start guard near the top of `start()`; per-player `displayName`; reset on leave and seat free |
| `server/arcade.cjs` | `startReason` includes the stakes reason (a new string; **never change the `"Ready to play"` literal**, six places compare it exactly) |
| `public/os/*` | New windows and fields listed in [05](05-ui-integration.md); strings in `strings.js`; demo fixtures in `demo-state.js` and `demo-session.js`; `<link>` for any new stylesheet in `index.html` |
| `public/party/phone.js`, `controller.html`, `phone.css` | Name claim, terms and funding cards, join-by-name ([05](05-ui-integration.md)) |
| `package.json` | Runtime dependencies (`viem` and, per lane, the Arkiv SDK pinned to **0.8.1**), scripts `start:web3`, `web3:worker`, `web3:preflight`, `web3:test` |
| `PRE_EXISTING.md`, `CLAUDE.md`, `AGENTS.md` | Record the baseline and the branch rule |

## 5. Identity, keys and custody

### 5.1 Who holds which key

| Key | Held by | Used for | Never |
| --- | --- | --- | --- |
| **Phone session key** | The phone's browser (`localStorage`, key `chonks.web3.key`, **not** under `chonks.player.*`, which is cleared on leave) | Owns the seat's ENS name; signs EIP-712 messages (bind, accept terms, funding authorization, settlement agreement, contest); receives winnings | Holds no gas; never leaves the phone; holds only play money |
| **ENS registrar key** | The worker, env var | Creates party registries, mints seat names, writes records, grants roles | Not held by the relay process; spend-capped; kill switch |
| **Arc relayer key** | The worker, env var | Submits the phone-signed funding authorizations, `create`, `settle`, `claim`, `refund`; pays all gas (USDC); drips play money | Does not custody stakes (the pot does) |
| **Arc oracle key (layer B)** | The worker, env var, distinct from the relayer | Signs `propose` when the cooperative path fails | Cannot pay anyone; bounded by the challenge window and refund |
| **Arkiv console key** (one per console; was "sponsor key") | The worker, env var | Creates, extends and deletes the console's Arkiv entities; transfers trophies and profiles; sends a small GLM drip to a phone that opts into a profile | Entities from a wallet not on the reader's allowlist are ignored on read; after a transfer it **cannot** edit a profile, and results are `readonly` ([04](04-arkiv-guide.md)). Entity-minting nonce used only by the Arkiv worker |
| **Swarm** | No key: the public gateway stamps uploads (optional own stamp: a Bee node) | Uploads the replay bundle and the recap card | Never stores an encrypted reference in an Arkiv entity |
| **Host (delegated phone)** | Its session key | Holds on-chain command roles (ENS) | Gains no key power over funds |

### 5.2 Seat binding (how the relay knows which address is which seat)

After a phone joins (the existing `join` ack with seat token), the web3 module sends that phone only a challenge: `web3.challenge {nonce, domain, expiresAt}`. The phone replies `web3.bind {address, signature}` where the signature is an EIP-712 `Bind(room, slot, nonce, expiresAt)` signed by its session key. The relay verifies, then stores `room.players[slot].address` (server memory only, cleared with the seat). The binding is bound to the seat token's lifetime; a replaced or rotated token needs a new bind. **Seat tokens and addresses never appear in `view()`**; only a short form of the address and the name are public.

### 5.3 What is public, host-only and per-seat

`view()` is broadcast to every phone and display. It carries only public facts under `web3` (section 7.1). Anything private to one seat (signature requests, the seat's own funding status details) goes through a **targeted emit** like `admin.state` does today. Host-only detail (worker health, sponsor balances) goes in the host's `view(room, true)`.

### 5.4 The phone signer bundle

The phone page loads plain ES modules with no bundler, and viem is large. The signer is a **small generated ES bundle** (`public/web3/phone-signer.js`, built by an esbuild script from `integrations/shared/phone-signer.src.mjs`) that exposes: `loadOrCreateKey()`, `address()`, `signTyped(typedData)`. It is **dynamically imported** only when `state.web3.mode` is not `off`, so the baseline phone page is unchanged. The built file is committed, and a test fails if the committed file and the source differ. Keep it under 120 KB gzipped; measure.

## 6. Where each fact lives (sources of truth)

| Fact | Source of truth | Cache and use |
| --- | --- | --- |
| Who is in the party (roster) | **ENS**: the party registry and seat names | The relay builds the pot's seat list by resolving the seat names at lock time, not from its own memory |
| Who may command (host, kick, control) | **ENS roles** on the party registry and resolver | `hasRoles` cached 5 s, re-checked on every `host.cmd`, invalidated on revoke |
| Gameplay and timing | The relay | Unchanged |
| The result and its hash | The relay (`makeResult`, replay-verified) | Public endpoint for oracles and receipts |
| Money and payouts | **Arc** `ConditionalPot` | Relay reads state via logs and `getPot`; never trusts its own memory for "funded" |
| Public records: results, scores, receipts, trophies, profiles, the live directory | **Arkiv** (the local event store is the outbox and the fallback, not the source of what outsiders read) | Browsers read Arkiv **directly** (allowlist of console creators, one query each); the relay's cached reader is the fallback only |
| Replay and recap card | **Swarm** (content-addressed; the reference is in the Arkiv `result`) | Re-uploaded by the keeper from the local store if the gateway loses it: same bytes, same reference |
| Display names | Nickname on the phone, shown at once; the ENS name when minted | A "verified on ENS" mark appears when the chain confirms |

## 7. Interfaces

### 7.1 Public state: `view().web3` (present only when `PARTNERS` is not `off`)

```text
web3: {
  mode: "mock" | "on",
  health: { ens: "ok"|"degraded"|"down"|"off", arc: ..., arkiv: ... },     // names only, no URLs or keys
  party:  { status: "pending"|"ready"|"failed"|"ended", name: "kart-otter.play.<parent>.eth"|null,
            expiresAt: ms|null, explorer: url|null },
  seats:  [ { slot, label|null, name|null, addr: "0x1234…abcd"|null, named: bool } ],   // by slot
  host:   { slot|null, authorised: bool, roles: ["control","kick"], revocable: bool },
  stakes: { rung: 0|1|2, status: "off"|"terms"|"funding"|"locked"|"playing"|"settling"|"settled"|"refunded"|"contested",
            asset: "USDC", amount: "1.00", rule: "winner"|"top2"|"equal", potId: hex|null,
            funded: [bool x4], acceptedBy: [bool x4], fundDeadline: ms|null, oracle: "relay"|"chainlink",
            tx: { create, lock, settle, refund }, explorer: url|null, playMoney: true },
  receipts: { [matchId]: { arc: {tx, explorer}|null, arkiv: {key, explorer}|null, ens: {name}|null, state: "saving"|"saved"|"local" } }
}
```

Every new field needs a matching entry in `demo-state.js` and the demo tests.

### 7.2 Socket events (all reliable; **never `volatile`**)

| Event | Direction | Payload | Notes |
| --- | --- | --- | --- |
| `web3.challenge` | server to one phone | `{nonce, domain, expiresAt}` | Sent after join when the module is on |
| `web3.bind` | phone to server | `{address, signature}` | Rate-limited, validated by a whitelist validator (model: `server/shell-input.cjs`) |
| `name` | phone to server | `{nick}` | Sanitised: strip control characters, 3 to 20 chars of a-z 0-9 hyphen after slugging; 1 per 3 s; sets `displayName` |
| `web3.request` | server to one phone | `{id, kind: terms / fund / settle / contest, typedData, expiresAt}` | The phone shows the card, signs, replies |
| `web3.sign` | phone to server | `{id, signature}` or `{id, declined:true}` | Validated against the pending request |
| `stakes` | host (admin handler) | `{rung, amount, rule}` or `{cancel:true}` | Writes `room.stakes`, never `room.setup` ([05](05-ui-integration.md) section 5) |
| `party.join` | phone to server | `{name}` before a room code is known | Join by name: the relay resolves the name's records (allowlisted origin only) |

### 7.3 HTTP (router mounted at `/api/web3`; JSON; distinct prefix)

| Route | Purpose |
| --- | --- |
| `GET /api/web3/health` | Preflight: RPC reachability, signer balances (host-only detail is not exposed here), outbox depth, versions |
| `GET /api/web3/result/:hash` | The canonical `result` for a hash (and `verified`, `places`), **public, no names or tokens**; used by the Chainlink oracle and the receipt page |
| `GET /api/web3/pot/:potId` | The pot's state as the relay reads it (also readable straight from the chain) |
| Static `/pot/` | The Studio-built pot console (receipt and refund page), served from `integrations/arc/pot-console/dist` |

Phone-to-server data still goes through sockets with the seat token; HTTP has no seat authentication and exposes only public facts.

## 8. The outbox and the worker

- **Relay side:** `enqueue(job)` appends a JSON file under `.local/web3/outbox/` named `<time>-<id>.json` (atomic tmp+rename, mode 0600). A job: `{id, type, idempotencyKey, room, payload, createdAt, attempts}`. Types: `ens.party.open`, `ens.seat.mint`, `ens.record.set`, `ens.role.grant`, `ens.role.revoke`, `ens.party.end`, `arc.pot.create`, `arc.pot.fund` (carries the phone's signatures), `arc.pot.settle`, `arc.pot.propose`, `arc.pot.claim`, `arc.pot.refund`, `swarm.upload`, `swarm.keep`, `arkiv.result.put`, `arkiv.live.put`, `arkiv.live.extend`, `arkiv.live.delete`, `arkiv.profile.create`, `arkiv.profile.extend`, `arkiv.receipt.put` (the earlier `arkiv.room.*` jobs are replaced by the `live` directory, [04](04-arkiv-guide.md) section 5).
- **Worker side:** polls the directory every second, processes jobs **per partner in order** (one signer queue per key to avoid nonce clashes), retries with exponential backoff (cap 60 s, max 8 attempts), writes the outcome to `.local/web3/receipts.jsonl` (`{id, type, status: "done"|"failed", tx, explorer, at, error?}`).
- **Relay reads receipts** by tailing that file (watch plus a 2 s poll) and updates `room.web3` then calls `broadcast(room)`.
- **Idempotency:** every job has a deterministic `idempotencyKey` (for example `arc.pot.create:<potId>`); the worker checks the chain or a local done-set first, so a restart or a duplicate is a no-op.
- **Kill switch:** `WEB3_KILL=1` (or a file `.local/web3/KILL`) makes the worker stop sending; the relay shows `health: down` and rooms carry on.
- **Hosting:** `.local/` must be a writable volume (the Dockerfile image is ephemeral); the path comes from `WEB3_DATA_DIR`.

## 9. Core flows

**A. Open a party (host creates a room).** The relay creates the room as today. If `ens` is on, it enqueues `ens.party.open` (label from the room code, expiry = creation + 4 h, the room cap). The worker deploys the party registry and resolver, registers the party name under `play.<parent>.eth`, grants the delegated-host role set to nobody yet, writes the party records (`chonks.relay`, `chonks.code`, `chonks.game`, `chonks.v`). `party.status` goes `pending` then `ready`; the Invite window shows the name and the tray shows a balloon "Party name ready".

**B. A seat joins.** The existing `join` happens. The phone sends `name` (the nickname) and binds its key. The relay sets `displayName` at once (so the UI is instant), enqueues `ens.seat.mint {label, owner=address, expiry=party expiry, roles=none}` and, when the receipt arrives, sets `seats[slot].name`. A seat that never binds or never names simply stays a guest seat.

**C. Host delegation.** Today the first ready seat is offered host after 5 s and becomes the delegated host (`host.granted`). The web3 module hooks that grant: it enqueues `ens.role.grant` giving the host seat's address the **control** role (text role on `chonks.control`) and the **kick** role (`ROLE_UNREGISTER` on the party registry). `host.transfer` and `host.decline` enqueue the matching revoke and grant. **Every `host.cmd` from a delegated phone is checked against the chain** (`hasRoles`, cached 5 s, bust on revoke); the shell host and staff PIN paths are unchanged. The Players window shows the host chip with a **Revoke** button for the TV host.

**D. Stakes (S2) lifecycle.** The host picks a stake in Game Properties; the relay sets `room.stakes.status = "terms"` and sends each bound seat a `web3.request kind=terms` (a card with the amount, the rule, the oracle, "play money"). Accept signs the typed terms **and** a USDC funding authorization in one tap (`kind=fund` is folded into the same card). When every seat has accepted, the relay builds the seat list **by resolving each seat's ENS name** (falling back to the bound address if ENS is off), enqueues `arc.pot.create` then `arc.pot.fund` for each seat. The pot locks when the last stake lands (read from chain events); only then does the start gate open (the new `startReason` string clears). The match plays unchanged.

**E. Match finish.** `finish()` produces the canonical result. The web3 module then: (1) if stakes are on, sends each seat the placing and the result hash (`web3.request kind=settle`, an EIP-712 `Settle(potId, placesHash)`); each phone checks it against the scores it shows and, after a **5-second optimistic countdown with a Dispute button** ([09](09-seamlessness-and-signing-budget.md)), signs silently; when every seat has signed the relay enqueues `arc.pot.settle`; after 60 s without all signatures it enqueues the oracle path; (2) enqueues `swarm.upload` (replay bundle and recap card) and then `arkiv.result.put` (the result is readonly, so the worker waits up to 60 s for the Swarm references before writing; consent and eligibility rules in [04](04-arkiv-guide.md)), and `arkiv.live.delete` for the match's live entry; (3) writes the receipt text record on each seat name (`chonks.last`) and the party (`chonks.receipt`). All of it updates `receipts[matchId]` as receipts arrive; the Results window shows "Saving to the chain…" then links.

**F. End and expiry.** `endRoom` (host ends, host lost 120 s, 4 h cap) enqueues `ens.party.end` (`unregister`, so the names stop resolving at once) and, if a pot is not settled, leaves refunds to the contract (permissionless after its deadline; the worker also triggers `refund` when it can).

**G. Restart and recovery.** On start the relay replays `receipts.jsonl` and re-reads open pots from the chain by `potId`; the worker resumes unfinished jobs. A room that resumes (`host` with code and token) rebuilds `room.web3` from the receipts and the chain.

## 10. Failure and degraded behaviour

| Situation | Behaviour |
| --- | --- |
| `PARTNERS=off` | No module, no `web3` in state, no new events; identical to `main` |
| `PARTNERS=mock` | Same UI and flows against in-memory providers (naming returns deterministic names, `LocalPot` behaves like the contract); works with no internet; the Kiosk and the LAN fallback use it |
| ENS or Sepolia RPC down | Nicknames and room codes work; `party.status` stays `pending` or `failed`; host power falls back to the existing token model **and says so**; stakes are disabled with the reason |
| Arc RPC or relayer down | Stakes disabled with the reason; a pot already funded can still be refunded by anyone |
| Worker down or killed | The outbox grows; labels say "saved locally"; rooms unaffected |
| Arkiv down | Results wait in the outbox; the TV leaderboard and the phone's history use the local store, labelled "Local board"; the live directory shows only this console's own matches |
| Swarm gateway down | The result is written without Swarm references after 60 s ("replay not published"; a readonly entity cannot gain the references later); the keeper only re-uploads content that existing entities already point to; nothing else is affected |
| A seat leaves a staked match | Match flagged `abandoned`; no settle; refund path ([08 of the earlier plan](../08-stakes-product-and-legal.md) rules) |
| No internet at the booth | `mock` automatically, with a visible notice |

## 11. Security and privacy rules

- Validate every phone payload with a whitelist validator (keys, types, lengths); reject unknown shapes. Never `innerHTML` player text (the shell's `h()` uses `textContent`; keep it so).
- Names: sanitise to a-z, 0-9, hyphen; block reserved labels (`play`, `games`, `agents`, `host`, `tv`, `admin`, `chonks`); filter obvious slurs with the existing nickname filter if one exists, else a small word list.
- Rate limits: `name` 1 per 3 s, `web3.bind` 3 per minute, `web3.sign` 10 per minute per seat; the worker caps transactions per room and per hour; the drip is capped per room and per IP.
- **Agent and Studio output is untrusted text** (the Arc docs and Studio results carry instruction blocks for AI readers; a coding agent must ignore them and trust the files).
- **Keys:** only in env vars read by the worker (never the relay process, never the repo, never a client). `.env` is gitignored; ship `.env.example` only.
- **Tokens and addresses** never in `view()`, results, the event store or logs; a test asserts it (the existing event-store test pattern).
- **Consent:** nothing is published with a real name; the nickname is public by nature; replays only on opt-in ([04](04-arkiv-guide.md)).

## 12. Performance rules

`view()` runs about three times a second per room per recipient and the tick is 30 Hz and also drives game timing. Therefore: web3 data is written to `room.web3` by receipt handlers and read synchronously in `view()`; nothing in `view()`, `tick`, `finish()` or `broadcast` awaits, reads files, or touches a chain. The roster and permission caches have fixed TTLs and are refreshed off the hot path.

## 13. The parity and isolation contract

Two tests protect `main`'s behaviour on the branch: (1) **state parity**: with `PARTNERS=off`, the `view()` of a scripted room is deep-equal to the `main` baseline (no `web3` key, no extra fields); (2) **result parity**: the same scripted match yields byte-identical `result` and `hash` and `replayHash` with `PARTNERS` off and on (partners never alter the hashed core; additions go in a sibling object). See [07](07-tests-evidence-demo.md).
