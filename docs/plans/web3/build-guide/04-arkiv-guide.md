# Build guide 04: Arkiv and Swarm (the public layer: results, trophies, live directory)

> **Owner-approved update, 6 November 2026:** Rabdi 7794095 / exact Arkiv SDK 1.0.1 replaces Tiramisu/0.8.1 and the old query/schema assumptions below. Follow [the migration and measured limits](../../../web3/rabdi-migration.md); all K0 gates still apply.

Part of the [build guide](00-README.md). Status: plan, **6 November 2026** after Arkiv published its Mumbai prizes (read from [ethglobal.com/events/mumbai/prizes](https://ethglobal.com/events/mumbai/prizes) the same day; the page text is quoted in section 1). **No code is written.** This replaces 6 November version, which was built before the brief existed. The judging strategy, the five documents the judges read and the demo are in [18](18-arkiv-submission-pack.md); this document is the build.

Evidence marks: **[P]** the prizes page, 6 November; **[K]** Arkiv's knowledge tools and skills (SDK 0.8.1, `network_status` 6 November; link checks 6 November); **[S]** Swarm documentation and the Swarm ID gateway notes, 6 November; **[inf]** inference. The Arkiv MCP is configured for a different Arkiv event; it is used here only for SDK and network facts, never for Mumbai rules.

## 1. What the brief says, and what it changes

**Prize pool $15,000 [P].** One Arkiv track per team; the Swarm bonus comes on top. Arkiv and Swarm together count as **one** of ETHGlobal's three partner picks.

| Track | Prize | Fit |
| --- | --- | --- |
| **Build on Arkiv (from scratch)** | $3,000 + $1,000 | **Ours.** "Build a new app whose data lives in Arkiv." The brief's own directions include **markets** (listings that expire at their deadline), **names and identity** (profiles keyed by ENS names) and **agents** (ephemeral coordination state) |
| Build on Arkiv (existing projects) | $3,000 + $1,000 | **Continuity Track only**, and **cannot take the Swarm bonus** |
| Mirror something Ethereum depends on | $3,000 + $1,000 | No: we have no public Ethereum dataset |
| Node tooling | $2,000 | No |
| **Arkiv + Swarm bonus** | $1,000 | **Ours**: "select this bonus when you submit a from-scratch project to Mirror, Build on Arkiv or Node tooling" |

**How Build on Arkiv is judged [P], four equal criteria of 25%, each answered in its own file at the repo root:**

| Criterion | File | The questions the judges ask |
| --- | --- | --- |
| Arkiv feedback | `/arkiv/friction.md` | What should Arkiv improve, or add? When something broke: what did you expect, what happened, how do we reproduce it? |
| Reach | `/arkiv/reach.md` | Who is it for and would they use it? Can they try it today? Will you keep building after Mumbai? |
| Why Arkiv | `/arkiv/why-arkiv.md` | If you swapped Arkiv for Postgres or any other database, what would your users lose? What did you keep off Arkiv, and why? |
| How you use Arkiv | `/arkiv/how-you-use-arkiv.md` | Do the things you filter on, **who can edit each entity**, and **when it expires** fit what the app does? Does each Arkiv feature you use **change something your users see**? |

**Qualification [P]:** built from scratch at the event; writes to Arkiv's testnet with `@arkiv-network/sdk` (or JSON-RPC) and **at least one feature users see reads its data from Arkiv**; the README lists **the wallet address(es) that wrote the entities and one query the judges can run**; `/arkiv/schema.md` (entities, fields queried, owners, expiry) and the four files above; a public repo with an open-source licence; **a statement of how AI was used**. **Explicitly not counted: "the SDK installed but never used to read, or Arkiv used only as a log that nothing reads."** Swarm bonus: the project uses both; the README says **how Swarm is used and gives one Swarm reference the judges can open**; **an encrypted Swarm reference contains its key and Arkiv entities are public, so never store one in an entity as it is.**

### What 6 November plan missed (the findings of this review)

| # | Gap | Consequence if left | Fix (section) |
| --- | --- | --- | --- |
| G1 | The plan wrote the files to `docs/web3/arkiv-schema.md` and `arkiv-friction.md` and had **no** `reach`, `why-arkiv` or `how-you-use-arkiv` | Three of four criteria had no document; the paths were wrong | Files at **`/arkiv/`** ([18](18-arkiv-submission-pack.md)) |
| G2 | Arkiv was a "second sink" behind the local event store, read through the relay's cache | "Used only as a log" risk; and "swap for Postgres" had an easy answer: *nothing* | Arkiv is the **public layer**; browsers read it **directly**; a **no-relay demo** (section 4) |
| G3 | One sponsor wallet wrote and owned everything and the readers trusted `createdBy(SPONSOR)`: that is a **central database with a public read** | The strongest judge question ("why not Postgres?") is answered by the criticism itself | **Self-verifying results** (replay on Swarm, verifier script), **several consoles**, flags and ownership used on purpose (sections 3 and 5) |
| G4 | No `readonly` flag: after the trophy transfer **the winner could rewrite their own result** [K] | A forged trophy is a one-line patch | Results, scores and receipts are **readonly**; only transfer and delete remain with the owner (section 5) |
| G5 | **Who can edit each entity** and **expiry** were not designed per type | Directly judged | The table in section 5 gives owner, flags and lease with the reason for each |
| G6 | Replays were "stretch, chunked under 128 KiB" | A whole match can exceed the limit; and the verifier needs it | **Swarm** holds the replay and the recap card; Arkiv holds the typed index and the hashes (section 6) |
| G7 | Eleven entity types across the build guides (`rating`, `matchrecord`, `flag`, `checkpoint`, `predictor`, `game`, `room`, ...) | Every type must "change something the user sees"; most do not | **Five types** (section 5); the rest are cut (section 9) |
| G8 | No Swarm | $1,000 on top of a track, for work the product already needs | Section 6 |
| G9 | Used the SDK's untyped attribute habits (`app`, `type`, only `i32` and `u64`) | Misses `addr`, `bytes32`, `u256`; names differ from Arkiv's own conventions | Typed model, `project` and `entity_type` (section 5) [K] |
| G10 | Hours: 12 to 16 | A realistic lane is **about 49 hours** (about 36 for the part that qualifies and earns most points) | Tiers and cut line (section 10); capacity decision for the owner |
| G11 | The lane was scheduled **after** ENS and Arc "when the brief is read" | The four documents and the friction log need the whole event to be honest | Spike first, friction log from the first hour (section 10) |

## 2. The idea in one paragraph

Funcaster has three layers. The **relay** is the **live layer**: 30 Hz motion, rooms, physics; nobody but the players needs it, and it stays a normal server. **Arc** holds **money**. **Arkiv** is the **public layer**: everything an outsider (a spectator's phone, another console, a developer, a judge) may want to read, **without asking our server**: the match results, the boards, the trophies, who is playing right now. **Swarm** holds the **big files** those records point to: the full replay and the recap card. The point of the split is a sentence the demo can prove: **"stop our server and the boards, the trophies and the proof of every result are still there, queryable by anyone, and anyone can re-check a result without trusting us."** A result in Funcaster is **self-verifying** (`scripts/replay-check.cjs` re-runs the replay and checks the scores), so a public database that anyone can write to is exactly right for it: we do not need to trust the writer.

| Layer | Holds | Why there |
| --- | --- | --- |
| Relay (+ local event store) | 30 Hz state, phone input, rooms, session keys' bindings, derived stats and ratings ([14](14-stats-and-leaderboards.md)), anti-cheat flags ([15](15-integrity-and-anti-cheat.md)), the outbox | Real time, private, derived or operational |
| Arc | Money: stakes, pots, pools, payouts, refunds | The contract is the authority |
| ENS | Names, host roles, party lifetimes | Names and permissions |
| **Arkiv** | **Public, queryable, expiring, owned records**: results, scores, receipts, profiles, live directory | Open reads, typed queries, leases, ownership |
| **Swarm** | **Large content-addressed files**: replay, recap card | Bigger than an entity; content address = proof of bytes |

**Kept off Arkiv, on purpose (this list is a judged answer):** the 30 Hz stream and raw phone motion (volume and privacy); session keys and device bindings (secrets); money state and bet positions (Arc is the authority, and each bet is a transaction); derived stats and ratings (recomputable by anyone from the public scores, and a SQL aggregate belongs in a database); anti-cheat flags (investigative, must not be public); results that are `failed`, `no-contest`, forfeited or abandoned; a replay unless every seat opted in; **any encrypted Swarm reference** (it carries its key).

## 3. Why Arkiv and not Postgres: five properties, each a feature

Each row is a feature the user can see. The honest limit is stated in [18](18-arkiv-submission-pack.md); this is the build-side checklist.

| # | Property Postgres would not give | Funcaster feature | What a Postgres version would need | Proof the demo shows |
| --- | --- | --- | --- | --- |
| P1 | **Anyone can read and query without our server or permission** | The **Hall** page (`/hall`, also buildable as static files) and the TV board read Arkiv directly | A public API we host, keep up and keep open | Stop the relay; reload the Hall: boards, trophies and the live list still load |
| P2 | **Several operators publish into one namespace without sharing a database** | Two consoles (two relays, two sponsor wallets) feed the same boards; the Hall shows "published by console X" | A shared database and an account system between strangers | Two consoles, one Hall page |
| P3 | **A result proves itself**: the entity carries the hashes and the Swarm reference of the replay; anyone re-runs it | `npm run arkiv:verify -- <match>` fetches the entity and the replay and re-runs the engine; the Hall shows **"check hashes"** | Trust our database; no way for a third party to check | The verify command printing "Verified" with no key and no relay |
| P4 | **Expiry is product logic**: a lease the writer must keep renewing | The **live directory**: a match is listed for 90 seconds and the console renews it every 30; if the console dies the listing vanishes by itself. **Profiles** lapse after 30 days without play | A heartbeat table plus a reaper job, and the stale rows when the reaper dies | Kill a console mid-match: its listing disappears within two minutes |
| P5 | **The user owns the record, and the operator cannot edit it after handing it over** | **Trophy** (the winner owns the result), **profile** (the player owns it and can edit or delete it from the phone) | A `user_id` column the operator can change; deletion is the operator's decision | "Delete my profile" signed by the phone's own key; the operator's key is then refused |

Two further uses are typed queries the user sees: **"My history"** (`player = me`), **head-to-head** (intersection of two players' matches), and the **market listing** that expires at its close.

## 4. Network and SDK facts [K], re-6 November

| Item | Value |
| --- | --- |
| Network | **Tiramisu** testnet, chain id **7738577**; `network_status` verified the RPC chain id on 6 November (this verifies only the chain id) |
| SDK | **`@arkiv-network/sdk@0.8.1`** with `viem`, `npm install --save-exact @arkiv-network/sdk@0.8.1 viem`. Never `latest`. Never write "0.8.x is compatible" |
| RPC / WS | `https://rpc.tiramisu.db-chain.testnet.arkiv.network` and `wss://...`; anonymous use published as 600 requests a minute (**unverified**); optional access keys stay on the backend only |
| Faucet | `hub.arkiv.network/faucet` (test GLM; wallet sign-in and CAPTCHA are a human step). Fund the sponsor and a spare **before the event** |
| Explorer | `https://tiramisu.explorer.arkiv.network` (entity history at `/entity/{key}`). The public Data Explorer did not list Tiramisu when checked: **do not link it in the README** |
| Limits | payload 128 KiB but **prefer at most 128,000 bytes** (the HTTP ingress rejected 131,072 with `413` and retried by default: disable viem retries on oversize); **32 attribute cells per operation** (payload and content type use two, so **30 user attributes on create**; **32 after a patch**); names **lowercase `snake_case`, at most 32 bytes**, starting with a letter, not a reserved word (`and or not true false startswith exists typeof bool i32 u64 u256 dec bytes32 bytes str addr key`); string values at most **128 UTF-8 bytes**; pages up to 200; about 2 s blocks |
| Types | `str`, `i32`, `u64`, `u256`, `dec`, `bool`, `bytes32`, `addr`, `key`. Bare number is `i32`; **timestamps need `u64(...)`** |
| Writes | `executeBatch` is **atomic** and ordered creates, patches, deletes, extensions, ownership changes. **Never loop `createEntity`** from one wallet. One worker serialises writes and journals each step |
| Queries | equality, ordered comparison on numeric types, prefix, AND/OR/NOT. **No `ne`, no `exists`, no server-side sort, no top-N**: pages come newest first, rank in code, follow `next()` to the end, keep a cached floor. `.fetch()` needs a `where`, `ownedBy` or `createdBy`. **`createdBy` filters the immutable creator; `ownedBy` the current owner**; a repeated `createdBy` replaces the previous one, so query once per trusted console |
| Flags | `readonly` and `permissionlessExtension`, set at creation, **immutable**. Readonly blocks patch for everyone; owner can still transfer, extend and delete. Permissionless extension lets **anyone** extend (and nothing else) |
| Expiry | block deadline; `extendEntity` **sets** a new deadline (it does not add); no expiry event; expired entities cannot be revived |
| Events | `watchEntityEvents` uses a WebSocket **only** when the client transport is WebSocket and `fromBlock` is absent; events carry key, owner, expiry and position, **not attributes**: follow with a read. An idle stream is not proof of health |
| Trust | The database is shared and public: **anyone can write entities with our `project` and `entity_type`**. `$creator` cannot be forged. Payloads are untrusted data: validate shape, never `innerHTML` |

## 5. Entity model (five core types, plus the extension types of [20](20-feature-expansion.md))

**Update, 6 November (owner):** capacity and Swarm retention are no longer constraints, and new features are welcome when they make sense in the console. The five **core** types below are unchanged and remain the qualifying build (Tier 1 and 2). The **extension** types `challenge`, `claim`, `agent`, `game`, `season`, `badge` and `follow` are specified in [20](20-feature-expansion.md) section 5 with the same rules (typed lowercase attributes, `project` and `schema_version`, createdBy allowlist on read, a visible surface for each, a measured lease). Every claim below that depends on a platform behaviour is tested first by the matching item in [19](19-verification-and-fix-protocol.md) (`VK-xx`), and the schema here changes if a test says it must.

`project` is the constant `chonks_mumbai_2026`; `schema_version` is `i32(1)`. **Creator** is a console's Arkiv wallet (the `SPONSOR` of the earlier plan, now **one per console**). Hashes and Swarm references are `bytes32`; wallet addresses are `addr`; stake amounts are `u256` in USDC base units (6 decimals). **No `key()` references**: entities join on stable application ids (`match`), as Arkiv's data-modelling guidance advises, so no cross-entity key prediction is needed.

| `entity_type` | Queryable attributes (typed) | Payload | Owner | Flags | Lease | Why these |
| --- | --- | --- | --- | --- | --- | --- |
| **`result`** | `match` (str), `game`, `mode`, `season` (str), `board` (bytes32), `verif` (str), `players` (i32), `winner` (addr, omitted if none), `at` (u64), `party` (str, ENS name), `result_hash` (bytes32), `replay_hash` (bytes32), `replay_ref` (bytes32, Swarm), `card_ref` (bytes32, Swarm) | The canonical `ResultV1` JSON (under 8 KiB) | Created by the console; **`changeOwnership` to the winner's seat address** (the trophy) | **`readonly: true`**, permissionless: false | **180 days** | Readonly so the new owner cannot edit the proof (G4); long enough for a season plus a month; the owner may still delete their trophy |
| **`score`** (one per seat per match) | `match`, `game`, `mode`, `board` (bytes32), `season`, `player` (addr), `place` (i32), `score` (i32), `verif`, `at` (u64) | `{ name, stats }` | The console | **`readonly: true`** | **90 days** | Boards rank `score`; **My history** filters `player`; head-to-head intersects two players' `match` values. Written only for `verified` or `attested` completed matches |
| **`receipt`** (staked matches only) | `match`, `player` (addr), `pot` (str), `chain` (str), `outcome` (str: paid, refunded, void), `stake` (u256), `payout` (u256), `tx` (bytes32, the settle or refund transaction), `at` (u64) | Transaction list, ENS names | The console | **`readonly: true`** | **180 days** | "My pots" on the phone and the Results window; written from the Arc contract's events by the worker; the **money state stays on Arc** |
| **`profile`** (opt-in) | `handle` (str), `player` (addr), `avatar` (str preset id), `board_public` (bool), `created` (u64) | none or personal bests | **The player**: created by the console, then `changeOwnership` to the phone's key | **`readonly: false`, `permissionlessExtension: true`** | **30 days, renewed by the console on each match the player plays** | Only the player can edit or delete it; anyone (the console) can keep it alive; an inactive player's public profile **lapses by itself** (data minimisation) |
| **`live`** | `kind` (str: match, market), `game`, `status` (str), `seats` (i32), `party` (str, ENS name), `closes` (u64, markets), `at` (u64) | Join and spectate URLs, the Arc market address, a setup summary | The console | `readonly: false` | **match: 90 s, renewed every 30 s, deleted at the end. market: until its close plus 10 minutes** | The "Live now" list for spectators, **join by name**, and the prediction-market discovery list; **a dead console disappears on its own** |

**Board key.** `scoreboardKey(game, setup)` can exceed 128 bytes: `board = bytes32(sha256(scoreboardKey))`; the readable form is in the payload and in `game` and `mode`.

**Count** per finished four-seat staked match: 1 result, 4 scores, 4 receipts, 1 delete of the live entry, plus the renewals during play, in **one `executeBatch` per 5 seconds**. Gas per create is measured in K0 (an observed plain transaction used about 100,000 gas [K]); budget the sponsor's GLM from the measurement, not from this document.

### Trust model, stated plainly

1. A reader accepts an entity only if it passes the **shape validator**, is created by a **trusted console** (`createdBy`, one query per console, an allowlist in configuration) **and**, for results, its hashes are consistent.
2. Because a console wallet is a shared signer, it authenticates the **console's publication, not each player's authorship** [K]. So a staked result's payload carries the seats' **`Settle` signatures** (already collected by the Arc flow) and every result carries the seats' **`Bind` proofs**; [stretch] all matches carry a silent per-seat `Result(hash)` acknowledgement.
3. **Anyone can verify a result without trusting any console**: the entity names the replay on Swarm and its hash; `arkiv:verify` re-runs the engine. A forged entity from a stranger fails the `createdBy` allowlist; a forged entity from a trusted console fails verification.
4. The residual trust is stated in the README: a console operator who controls the game host could feed inputs ([15](15-integrity-and-anti-cheat.md)); verification proves the result follows from the inputs.

## 6. Swarm (the bonus, and a real need)

**Update, 6 November (owner):** retention cost and effort are not constraints. The posture changes from "do not depend on the gateway beyond the demo" to **"make retention real and prove it"**: VK-15 and VK-16 in [19](19-verification-and-fix-protocol.md) measure the gateway's real retention and decide whether to buy an own postage batch (a Bee node or a stamp service); the **keeper** stays either way (content-addressed re-upload), and more of the product lives on Swarm: bundles of creator games, recap cards, private replays and the Hall itself ([20](20-feature-expansion.md) F-K4, F-K7, F-K8, F-X1). The honest limits (what the keeper does, what a stamp does) stay in the README.

**Why Swarm is not decoration.** A replay is the proof of a result and can exceed the 128 KiB payload; it must not be public by default; it must be content-addressed so that "this is the exact replay" is checkable. Swarm provides that, and **the Swarm reference is 32 bytes, so it fits a `bytes32` attribute**: the entity is the typed index, Swarm is the file, and the brief's own example ("keep the files your users see on Swarm and point to them from your Arkiv entities") is the design.

| Item | Design |
| --- | --- |
| What is uploaded | (1) **Replay bundle**: `{ result, replay }` as one JSON blob (the exact input of `scripts/replay-check.cjs`), gzip optional. (2) **Recap card**: a deterministic **SVG** built from the result by string templates (game, scores, winner, the result hash, a QR to the Hall page), uploaded as a file with content type `image/svg+xml` so `/bzz/<ref>/` serves it as an image |
| Who sees them | **Recap card**: the phone's "Share my win" (Web Share with the link) and the Results window; **replay**: the Hall's "Watch or verify" and the verify command. Both are things users see |
| When | In the worker, after `finish()` (never in `view()`, `finish()` or the tick). The `result` is **readonly**, so its Swarm references cannot be patched in later: the worker **holds the result job until the uploads land (up to 60 s)** and writes the entity with the references. If Swarm is still down at 60 s it writes the result **without** them (the board and trophy still work; the replay stays in the local store and the Results window says "replay not published") |
| Gateway | **`https://api.gateway.ethswarm.org`**, which accepts uploads **without a postage stamp** and stamps them itself (measured by Swarm ID on 6 November) [S]. It is shared, rate limited, and its retention is **not stated**; the gateway-funded content lives as long as the operator's batch. Nothing in the product may depend on it for more than the demo |
| Read | `GET {gateway}/bytes/<ref>` for raw bytes, `GET {gateway}/bzz/<ref>/` for the card. Programs read the **API** host, never `gateway.ethswarm.org` (the web host answers 200 with an HTML shell for any address) [S] |
| **Keeper** | A worker job re-checks the last N references every hour (`GET` or `HEAD` on the API host); if one is gone it **re-uploads the bytes from the local event store**. Swarm is content-addressed, so the **same bytes give the same reference**: the Arkiv entity never needs to change. This is the honest answer to "retention is not stated" |
| Own stamp [optional, owner's choice] | A Bee node and a postage batch (xBZZ on Gnosis, real but small cost) make the demo's references durable; the gateway only accepts the user's stamp as an envelope-stamped chunk [S]. **Default: no cost, gateway plus keeper** |
| Client | Plain `fetch` (`POST /bytes`, `POST /bzz?name=card.svg`); `@ethersphere/bee-js` only if the spike shows the gateway needs its null-stamp header. **Verify in K0** |
| **Encrypted references** | **Never an entity attribute** (an encrypted reference is 128 hex characters and contains the key). [stretch KS2] A **private match** uploads its replay encrypted; the 128-hex reference goes **only to the seat phones** (relay to phone, kept in My Funcaster) and the entity carries only `replay_hash`; a seat can later reveal it in a dispute. Never put an encrypted reference in a gateway URL (it reaches a third party's logs): fetch it through `downloadData` in the browser [S] |
| README evidence | "How Swarm is used" (three sentences) and **one openable reference**: a recap card at `https://api.gateway.ethswarm.org/bzz/<ref>/` and a replay at `/bytes/<ref>` |

## 7. How it works (the flows)

1. **Write (worker).** `finish()` enqueues `arkiv.result.put` (a file outbox, section 5.3 of [01](01-architecture.md)). The worker (a) builds the recap card and uploads the replay bundle and the card to Swarm, (b) checks idempotency (`eq(match)` with `createdBy(me)`), (c) sends **one `executeBatch`** every 5 s: the result, the scores, the receipts (from Arc events), the ownership transfer of the result to the winner, the deletion of the live entry, the extension of any renewed profile, (d) backs off on failure. A dead RPC never touches a room; the Results window says "Saving..." then "Saved" with the entity link.
2. **Read (browsers, directly).** The TV **Leaderboard window**, the phone's **My history** and the **Hall** page use a **public client in the browser** (a small esbuild bundle of the reader, like the phone signer in section 5.4 of [01](01-architecture.md)). Boards: `eq(project)`, `eq(entity_type,'score')`, `eq(board, ...)`, `eq(season, ...)`, `gt(score, i32(floor))`, **one query per trusted console**, follow `next()`, rank in code, never `limit(10)` before sorting. Live: a WebSocket client calls `watchEntityEvents` without `fromBlock`, and each event triggers one follow-up read; the "live" dot shows only while events recently arrived. **The relay's cached reader is the fallback**, not the path (so the no-relay demo is true).
3. **Live directory.** At party start the console creates a `live` entity (lease 90 s) and extends it every 30 s in the same batch as other work; at the end it deletes it. The spectator page and the attract window list `live` entries from every trusted console; tapping one opens its spectate URL; **typing a party name finds it by `party`**.
4. **Trophy.** The result is created by the console, then transferred to the winner's seat address (the key bound at `Bind`). **Because the entity is readonly, the transfer carries the proof unchanged.** The phone's My Funcaster lists `ownedBy(me)`.
5. **Profile (opt-in).** A tap on **Keep my profile** makes the console create the `profile`, transfer it to the phone's key and send a small amount of GLM (a worker transaction; the user pays nothing). "Edit" and "Delete my profile" sign an Arkiv transaction **with the phone's own key** in a lazily loaded bundle (`public/web3/arkiv-owner.js`, only on that screen). The console renews the lease with `extendEntity` (permissionless) each time the player plays and can do nothing else to it. If the GLM drip or the owner bundle slips, **ship the profile as console-owned and do not claim player ownership anywhere** (the trophy transfer still shows ownership).
6. **Receipts.** The Arc event indexer (Ledger lane) feeds the worker; the `receipt` is written when the pot settles or refunds. It never gates the payout.
7. **Consent.** Nickname and score are public by default (the join screen says so in one line); the replay is public only if every seat opted in (default off; the card and the hashes are public); nothing leaves the room when `PARTNERS=off`.

## 8. How Arkiv interlocks with ENS and Arc (genuine, not a log)

| Link | How | What breaks without it | Extra user step |
| --- | --- | --- | --- |
| ENS name to Arkiv | The party's ENS name is the `party` attribute of `live` and `result`; typing it on a phone finds the live match; the result hash in the ENS `chonks.receipt` record is the Arkiv `result_hash`, so each side finds the other **without an extra transaction** | Join by name would need a server directory; a name could not be followed to its record | none |
| Arc to Arkiv | `receipt` entities from the contract's events; the result carries the same `result_hash` as the Arc `resultHash` and the ENS record | "My pots" and the history would be the relay's say-so | none |
| Market listing | `live` with `kind=market` and `closes`: **a listing that expires at its deadline**, one of Arkiv's named directions; **positions stay on Arc** | Spectators would find markets only through one relay | none |
| One key | The seat's session key is the ENS owner, the Arc seat and the Arkiv trophy and profile owner ([09](09-seamlessness-and-signing-budget.md)) | Three identities to reconcile | none |

## 9. Scope control: what the other guides said about Arkiv and what happens to it

| Where | It said | Now |
| --- | --- | --- |
| [10](10-prediction-market.md) | `market` and `predictor` entities; replay published to Arkiv | `market` is a `live` entity; the predictor board is a `score` board (`board` = predictors); bet positions stay on Arc; the replay goes to **Swarm** |
| [12](12-reality-and-ledger.md) | Ledger kinds `arkiv.result`, `arkiv.market`, `arkiv.trophy`; the head hash written to an Arkiv entity every 10 minutes | Kinds become `arkiv.result`, `arkiv.live`, `arkiv.profile`, `arkiv.trophy`. The head-hash checkpoint is **kept only if the Ledger page reads it back** (a "verify history" button); otherwise it is "a log nothing reads" and is dropped |
| [14](14-stats-and-leaderboards.md) | Arkiv `rating`, `matchrecord`, `checkpoint`, `flag` | **Dropped.** Ratings are computed from the public `score` entities (anyone can recompute them); flags are never public |
| [15](15-integrity-and-anti-cheat.md) | Reads filter `createdBy(SPONSOR)` | Reads filter by the console allowlist; results are readonly; replays verifiable |
| [05](05-ui-integration.md) | Leaderboard window, Records receipts, attract feed | Adds the **Hall** page, the **Live now** list, **My history**, **Keep my profile**, the recap card and the share button |
| [01](01-architecture.md) | Sources of truth: "Arkiv plus the local event store"; job types `arkiv.room.put`, `arkiv.room.extend` | Public data: **Arkiv** (local store is the outbox and fallback); job types become `arkiv.result.put`, `arkiv.live.put`, `arkiv.live.extend`, `arkiv.live.delete`, `arkiv.profile.create`, `arkiv.profile.extend`, `arkiv.receipt.put`, `swarm.upload`, `swarm.keep` |

## 10. Code layout, tasks and the cut line

**Layout:** `integrations/arkiv/` (`client.mjs`, `schema.mjs`, `sink.mjs`, `reader.mjs`, `watch.mjs`, `mock.mjs`, `tests/`), `integrations/swarm/` (`client.mjs`, `card.mjs`, `keeper.mjs`, `mock.mjs`), `public/hall/` and `public/web3/arkiv-reader.js`, `public/web3/arkiv-owner.js`, `scripts/arkiv-query.mjs`, `scripts/arkiv-verify.mjs`, and at the repo root **`arkiv/`**: `schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md` ([18](18-arkiv-submission-pack.md)).

| ID | Task | Hours | Tier |
| --- | --- | --- | --- |
| K0 | **Spike** (first thing, in a scratch repo): fund the sponsor and a spare; write, read, patch-refuse a readonly entity, transfer, extend, delete; open the WebSocket watch; measure gas per create and the anonymous rate; upload a replay and an SVG to the Swarm gateway and read them back; measure a real replay's size; **start `friction.md` with exact repro snippets** | 4 | 1 |
| K1 | `schema.mjs`: the five types, validators (name length, lowercase, 30 attributes, 128-byte strings, types), `board` hash, per-type flags and leases; unit tests | 3 | 1 |
| K2 | `sink.mjs` (worker): outbox jobs, `executeBatch`, idempotency, eligibility, trophy transfer, deletion of `live`; mock provider; fault injection | 5 | 1 |
| K3 | `reader.mjs` and the browser bundle: ranked boards across more than 200 results, floor, one query per console, shape validation, `ownedBy` history; **forgery test** | 4 | 1 |
| K4 | Swarm: `client.mjs`, `card.mjs` (deterministic SVG), upload in the worker, `keeper.mjs`, mock; references in the `result` | 5 | 1 |
| K5 | **Hall** page and the TV **Leaderboard window** with the live watcher; the relay-down fallback label; the static build of the Hall | 5 | 1 |
| K6 | `scripts/arkiv-query.mjs` (prints a board with no key, the README's query) and `scripts/arkiv-verify.mjs` (entity, replay from Swarm, hashes, the engine) | 3 | 1 |
| K7 | The five `/arkiv/` documents and the README block, kept live from the first hour ([18](18-arkiv-submission-pack.md)) | 4 | 1 |
| K8 | `live` directory (match and market), join by `party`, lease renewal, deletion; the spectator and attract lists | 4 | 2 |
| K9 | Profile: create, transfer, GLM drip, phone owner bundle (edit, delete), lease renewal | 5 | 2 |
| K10 | `receipt` entities from Arc events; My pots | 2 | 2 |
| K11 | Two-console rehearsal for the demo (second relay, second wallet, same Hall) | 2 | 2 |
| K12 | Tests ([07](07-tests-evidence-demo.md)), evidence hashes, `docs/web3/` receipts | 3 | 1 |
| KS1 | [stretch] Silent per-seat `Result(hash)` acknowledgements bound into every result | 2 | 3 |
| KS2 | [stretch] Encrypted private-match replay (references to phones only) | 2 | 3 |
| KS3 | [stretch] "Check hashes" in the browser (a browser build of the canonical `hash`, with a parity test) | 2 | 3 |
| K13 | **Verification protocol, Arkiv and Swarm half**: implement `scripts/spikes/` for VK-01 to VK-25 and run them before the tasks they gate ([19](19-verification-and-fix-protocol.md)) | 8 | 0 |
| K14 | `agent` entities and the bulletin lease (F-K2); the Agents tab | 3 | 4 |
| K15 | `challenge` and `claim` with signed offers, the Board, Take it, party creation on acceptance (F-K1) | 8 | 4 |
| K16 | `season`, `badge` and the Cup read model; Merkle root and proof script (F-K5, F-A7 input) | 8 | 4 |
| K17 | `game` entities, bundle upload to Swarm, shelf and keep-alive (F-K4) | 6 | 4 |
| K18 | `follow`, Friends feed, Rivals; `arkiv-graph` viewer if VK-21 passes (F-K3) | 5 | 4 |
| K19 | `venue` attribute, Today and venue boards (F-K6) | 2 | 4 |
| K20 | Recap cards on Swarm with the verification tick printed (F-K7), the Highlights gallery | 4 | 4 |
| K21 | Private (encrypted) replays and the share link with the key in the fragment (F-K8) | 4 | 4 |
| K22 | Verify in your browser (F-K9); Replay Theatre if VK-23 passes | 6 | 4 |
| K23 | The Hall as a static build on Swarm, the `contenthash` on its ENS name, the server copy (F-X1) | 5 | 4 |
| K24 | Two-console rehearsal extended to challenges and the shared Cup (VK-24) | 3 | 4 |

Tier 4 (K14 to K24) is the extension tier of [20](20-feature-expansion.md): about 54 hours, plus 8 for K13 (tier 0, which gates the others); all optional for qualification, each gated by its spike and its feature flag.

**Capacity (6 November): the owner will dedicate whatever time is needed, so nothing is cut for capacity; the cut line below now applies only to a feature whose spike in [19](19-verification-and-fix-protocol.md) failed and whose fallback is not acceptable.** Build order is still by dependency: Tier 1, then Tier 2, then Tier 4, with the stretch items last.

**Tier 1 is about 36 hours, Tier 2 about 13 (49 in all), and the stretch tier adds 6.** This is **not** the 12 to 16 hours of the earlier plan. It is two people, or one person plus the lead's UI time. Reaching the Tier 1 line earns the qualification and most of the points; Tier 2 is what makes *How you use Arkiv* (owner, lease) and *Reach* strong. **The cut line if time runs short:** drop KS1 to KS3, then K11, then K10, then K9 (and remove every claim of player ownership), then K8's market half. **Never cut K0, K6 or K7.** An owner decision is needed on capacity (README section 4): the Ledger indexers (about 14 hours) and the stats lane ([14](14-stats-and-leaderboards.md), [15](15-integrity-and-anti-cheat.md)) are the largest blocks that earn no prize points of their own.

**Schedule, and the constraint that drives it.** The track is "built from scratch at ETHGlobal Mumbai", so **only K0 (a learning spike in a scratch repo) may happen 6 November; K1 onward is written inside the event window**, which is about 36 working hours from Thursday afternoon to the 09:00 IST submission on Saturday. Tier 1 alone is about 36 hours, so it needs **two people (or two Codex lanes) on Arkiv for the whole window** while ENS and Arc are also finishing. This is the real cost of the track and the owner should decide it knowingly: either staff it, or take the cut line early (drop Tier 2 and the stretch, keep K0, K1 to K3, K5 to K7, K12 and a thin K4). The friction log starts at K0 so it is written as things break. K1 to K3 and K6 first (the shared foundation S0 to S6 and the mock provider must exist), then K4 and K5, K7 continuously, K8 to K11 only when Tier 1 is green on the hosted instance.

**Review addendum (6 November, [22](22-integration-review.md) finding D1).** The owner has since said time and capacity are not a concern, and the extension features (K13 to K24, [20](20-feature-expansion.md)) make Arkiv the largest lane. The "from scratch in the event window" rule still stands as written by the organisers, so the value-ordered **gates** of [22](22-integration-review.md) section 5 decide what is **inside the window** and what is a **stretch that is shown only if finished**; Tier 1 stays the unconditional core. The owner must confirm the start rule (22 section 6, decision 2) before K1 is written.

## 11. Tests and risks

**Tests:** schema validators (lowercase, byte lengths, cell budget, types); fake-client unit tests (batching, backoff, idempotency, eligibility, readonly refusal, board hashing, ranking across more than 200 results); **forgery tests** (a stranger's entity with our attributes is ignored; a trusted console's entity with a wrong hash fails verification); **ownership tests** (after the trophy transfer the console cannot patch, and the owner cannot patch a readonly result; after the profile transfer only the owner can edit or delete); **lease tests** (a live entry vanishes when renewals stop); a **Swarm round trip** (upload, read, hash match, keeper re-upload yields the same reference); **no-relay test** (the Hall and `arkiv:query` work with the relay stopped); fault injection (dead RPC or gateway never delays `finish()` or the next round; the outbox drains); the capability contract test shared with the mock; a funded manual integration on Tiramisu.

| Risk | Mitigation |
| --- | --- |
| The from-scratch track is judged on "built at the event"; the console is pre-existing ([README](../README.md) section 3, settled by the owner) | All Arkiv and Swarm code is new, in its own folders, committed 6 November with small commits; the README says what existed before and what was added; if ETHGlobal rules the team Continuity-only, the existing-projects Arkiv prize applies and **the Swarm bonus is lost** (section 1) |
| Faucet needs a human and a CAPTCHA; GLM runs out (the profile drip and renewals use it) | Fund two keys early; profiles are opt-in; measure gas in K0; budget renewals per match |
| Anonymous RPC limit with many screens | Browsers read directly; the cached relay reader is the fallback; an access key stays on the backend |
| The Swarm gateway is rate limited and its retention is unstated | The keeper; the local store is the source; an optional own stamp; **nothing outside the demo depends on the gateway** |
| Player-owned edit needs GLM on the phone key | Opt-in profile; drip; the documented fallback in section 7 |
| Testnet or SDK change | Pin the version from `network_status` on the day; everything behind the `Records` interface |
| Node quirks (no `ne`, `exists`, sort) | Positive predicates, client-side ranking, the floor |
| Public data | Shape validation; no `innerHTML`; no personal data beyond the nickname; encrypted references never stored |
