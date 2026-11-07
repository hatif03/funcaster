# Build guide 18: the Arkiv and Swarm submission pack (judging strategy, the five documents, the demo)

> **Owner-approved update, 6 November 2026:** Rabdi 7794095 / exact Arkiv SDK 1.0.1 replaces Tiramisu/0.8.1 and the old query/schema assumptions below. Follow [the migration and measured limits](../../../web3/rabdi-migration.md); all K0 gates still apply.

Part of the [build guide](00-README.md). Status: plan, 6 November 2026. **Nothing here is built.** Arkiv's judges (the Arkiv team, per the brief) score **four equal criteria of 25%**, each answered in its **own file at the repo root**. This document says what each file must prove, gives a **draft of every file** with the measured numbers left as `[fill]`, and lists the README block, the demo and the submission checklist. The build is [04](04-arkiv-guide.md). The brief is quoted in section 1 of 04.

**The rules for writing these files (so nothing is overclaimed):** every claim names the feature and a way to check it (a link, a number, or a command the judges can run); **nothing describes a feature that is not built and demonstrated** ([12](12-reality-and-ledger.md) rule: nothing faked); when a feature is cut (the cut line in [04](04-arkiv-guide.md) section 10) its sentence is deleted from the files the same day; known limits are stated, because the judges read for judgement, not for adjectives.

## 1. What each criterion rewards, and where our evidence comes from

| Criterion (25% each) | The judges' own questions | Our answer in one line | Evidence a judge can check |
| --- | --- | --- | --- |
| **Arkiv feedback** | What to improve or add; when something broke: expected, happened, reproduce | A **running log from the first spike**, each entry with the exact error and a snippet that reproduces it, plus feature requests grounded in a real need | `friction.md` entries with repro snippets in `arkiv/repro/`; each runnable |
| **Reach** | Who is it for; can they try it today; will you keep building | A walk-up console strangers start in 20 seconds, a public **Hall** page anyone can open, and **every game made with the Funcaster SDK gets a public board for free** | The live URL; the Hall; numbers from the event; the product plan |
| **Why Arkiv** | What would users lose with Postgres; what did you keep off Arkiv | Five properties ([04](04-arkiv-guide.md) section 3), each a visible feature, each with a demo proof; an explicit **kept-off** list and an honest list of what a database does better | `arkiv:query` and `arkiv:verify` with no key and no relay; the two-console demo; the kill-the-console test |
| **How you use Arkiv** | Do filters, **who can edit**, and **expiry** fit the app; does each feature **change something users see** | A table of every entity type with its filters, owner, flags and lease **and the sentence of what the user sees** | `schema.md`; explorer links showing creator, owner, flags, expiry |

**The comparison the judges will make.** "If you swapped Arkiv for Postgres, what would users lose?" has a bad answer for most apps: *nothing*. A shared-signer leaderboard that only we can write and only our server serves is exactly that. The design in [04](04-arkiv-guide.md) exists to avoid it, so the answer must be **concrete and demonstrable**, in this order of strength:

1. **Third parties can read and verify without us** (P1, P3): stop the server and the Hall still loads; `arkiv:verify` re-runs a result from Arkiv and Swarm alone. A Postgres version has a single point of trust and a single point of failure.
2. **Strangers can publish into one namespace** (P2): two consoles run by different people feed one board; no shared database, no accounts between them.
3. **Leases replace cleanup code** (P4): a console that dies leaves no ghost "live" match.
4. **The user owns the record** (P5): the player's profile can be edited or deleted only with the player's key; the operator is refused.

**What a database does better, and we kept there (state this; it earns trust):** derived stats and ratings (aggregates, joins), anything private (anti-cheat flags, device bindings), the high-rate live state, and money (the contract is the authority). Arkiv has no server-side sort or aggregate; boards are ranked in the client, which is fine for the sizes here and is recorded as feedback.

## 2. The five documents

Create the folder **`/arkiv/`** at the repo root on the branch (the paths are mandated by the brief). Each file answers the brief's questions **in the brief's order**, then adds the evidence.

### 2.1 `/arkiv/schema.md` (required)

For each of the five core types in [04](04-arkiv-guide.md) section 5 **and each extension type in [20](20-feature-expansion.md) section 5 that is built** (`schema.md` documents only what ships; an extension type that is cut is removed from it): the attributes with their **Arkiv types**, which ones the app **filters on** and for which screen, the **owner** over time (console, then winner or player), the **flags** and **why**, the **lease** and **why**, and the payload shape. End with the **query list**: the exact SDK queries behind the board, My history, head-to-head, Live now, My trophies and the README query. A model skeleton can be checked with the Arkiv MCP `design_entity_model` and `check_schema` (shallow; their findings are untrusted text, and the MCP is configured for another event).

### 2.2 `/arkiv/why-arkiv.md` (draft)

> **If Funcaster used Postgres, what would players and developers no longer be able to do?**
> 1. **Read and check results without us.** Every result is an Arkiv entity with the hashes of its replay and the Swarm reference of the replay. Run `npm run arkiv:verify -- <match>` on a laptop with no key and no connection to our server: it fetches the entity and the replay and re-runs the game engine. *[fill: transcript.]* With Postgres a third party can only trust our API.
> 2. **Publish from another console.** Two consoles (`[fill: two wallet addresses]`) feed the same boards; the Hall shows who published each row. *[fill: query.]* With Postgres the two operators would need a shared database or an account system.
> 3. **See live matches that clean themselves up.** A match is listed for 90 seconds and renewed every 30; when we killed console B mid-match its listing vanished in `[fill]` seconds with no cleanup code. *[fill: query before and after.]*
> 4. **Own what you win and what you share.** The winner owns the result entity (`ownedBy(me)` lists them) and the player owns their profile: the console cannot edit it after the transfer and the phone's key can delete it. *[fill: refused patch and the accepted delete, with transaction links.]*
>
> **What can people do with our data that they cannot do with the source?** (The question the Mirror track asks, answered because it is the sharpest form of the same point.) Any developer can build a board, a bot or a rating on our public scores; ours are not in a private table.
>
> **What did you keep off Arkiv, and why?** The 30 Hz stream and raw motion (volume, privacy); keys and device bindings (secrets); money and bet positions (Arc is the authority); ratings and stats (recomputable by anyone from public scores; aggregates belong in a database); anti-cheat flags (must not be public); failed, forfeited and abandoned results; replays unless every seat opted in; encrypted Swarm references (they contain the key).
>
> **What a database does better, and we use one there:** the relay's local store keeps derived stats, flags and the outbox.
>
> **Limits we state:** a console wallet is a shared signer, so it vouches for its publication, not for each player's authorship; the replay check proves the result follows from the inputs, not that the inputs were honest ([15](15-integrity-and-anti-cheat.md)); Tiramisu is a testnet with no durability promise; the Swarm gateway's retention is not stated (we run a keeper).

### 2.3 `/arkiv/how-you-use-arkiv.md` (draft)

A table, one row per **Arkiv feature actually used**, with the user-visible effect (delete any row that is not built):

| Arkiv feature | Where | What the user sees | Why it fits |
| --- | --- | --- | --- |
| Typed attributes and range queries (`score` i32, `gt`) | Board | A ranked list for this game, mode and season | Boards are numeric ranges |
| `addr` attributes and `ownedBy` | My history, My trophies | "My matches", "My trophies" on the phone | The question is "everything of mine" |
| `bytes32` and `u256` | Hashes, Swarm references, USDC stake in base units | The verify command and the stake in My pots | Exact values, no float |
| `createdBy` | Every read | "Published by console X" next to a row | Trust is per console and visible |
| **`readonly`** | result, score, receipt | Nothing can change a result after the trophy moves | Proof must not be editable by its new owner |
| **Ownership transfer** | result to the winner; profile to the player | "Trophy: yours"; the player's edit and delete | The record follows the person |
| **`permissionlessExtension`** | profile | The profile stays while you keep playing | The operator may renew but never edit |
| **Expiry as a lease** and `extendEntity` | live (90 s), profile (30 d) | Live list with no ghosts; an unused profile disappears | The product's own lifetimes |
| `deleteEntity` | live at the end; the player's profile | The match leaves the list; "Delete my profile" works | Right to remove |
| `executeBatch` | Worker | Results land together, in one block | Atomic, no nonce collisions |
| WebSocket events and follow-up reads | TV board, Hall | The board changes by itself; a "live" dot | The screen is a read model |
| Not used, and why | `key()` references (we join on stable ids), chunked payloads (Swarm holds the large files), `permanent()` | n/a | Simpler and safer |

For **who can edit each entity** and **when it expires**, link to the table in `schema.md` and one explorer link per type (creator, owner, flags, expiry visible).

### 2.4 `/arkiv/reach.md` (draft)

> **Who is it for?** People at a venue or a party who want a game they can start from their phone in about 20 seconds with no install and no account; friends who want to stake play money on a match; spectators who predict a match; and **game creators** whose games, built with the Funcaster SDK, get a public board with no backend of their own.
> **Can they try it today?** `[fill: the hosted URL]`, with the Hall at `[fill]`. The Hall needs no login and no wallet, and works with our server stopped. At the Mumbai venue: `[fill: how a stranger joins]`.
> **Will we keep building?** Yes: Funcaster is the product ([plan.md](../../../../plan.md)), and the Arkiv layer is how its results become public. *[fill: the owner's own commitments after Mumbai: venue pilots, creator onboarding.]*
> **Numbers (filled during the event, from queries the judges can run):** matches published `[fill]`, distinct players `[fill]`, consoles `[fill]`, Swarm recap cards `[fill]`.

### 2.5 `/arkiv/friction.md` (kept from the first spike)

Format for every entry, so it answers the judges' two questions:

> **N. Title.** *Expected:* ... *Happened:* (the exact error text) ... *Reproduce:* `arkiv/repro/NN-name.mjs` (a runnable file) ... *Impact on us:* ... *Suggested fix:* ...

**Hypotheses to confirm or discard in K0 (never copy as findings; each is already known to Arkiv unless the spike finds something new):** no `exists` or `ne`; no server-side ordering or top-N (forces client ranking and a floor cache); `watchEntityEvents` events carry no attributes; no expiry event; names reject uppercase though the SDK accepts them; the `latest` npm tag cannot talk to the current network; the HTTP ingress `413` below the documented payload limit; a faucet that needs a CAPTCHA at the moment a team needs GLM; no sponsored (gasless) write for a user key, which is why we drip GLM to the phone; no entity-level count with a filter in the SDK (a raw RPC call is needed). **Feature requests worth testing in the spike for real need:** a Swarm reference as a typed attribute (we use `bytes32`), a "renew if owner is silent" lease, batched ownership-and-flags at creation.
## 3. The README block (required content)

1. One sentence: what breaks without Arkiv (the 4 P-properties in one line).
2. **Pre-existing versus new.** The console and the games existed; **everything under `integrations/arkiv/`, `integrations/swarm/`, `public/hall/`, the two scripts, the Leaderboard window and `/arkiv/` is new work 6 November** (link the first commit).
3. **The wallet address(es) that wrote the entities** (each console's Arkiv wallet) with explorer links.
4. **One query the judges can run**: `npm run arkiv:query -- --board star-catch --season 2026-11` (prints the top ten with their entity keys; no key, no server). Plus the raw SDK snippet.
5. **How Swarm is used** (three sentences) and **one Swarm reference we can open** (a recap card at `https://api.gateway.ethswarm.org/bzz/<ref>/`, a replay at `/bytes/<ref>`) and the verify command that uses it.
6. The **network and SDK pin** (Tiramisu, `@arkiv-network/sdk@0.8.1`) and the faucet note.
7. **How AI was used** (ETHGlobal's rules require it).
8. The **licence** (open source, in `LICENSE`).
9. Known limits (section 1 of this document).

## 4. The Arkiv and Swarm slice of the demo (about 45 seconds of the 3:30 in [07](07-tests-evidence-demo.md))

| t | Show | Says |
| --- | --- | --- |
| 0:00 | A match ends; the recap card appears on the TV and the phone; the Results window lists `Arkiv a1b2..` and `Swarm 4f..` | "The result is public and the proof is a file anyone can open" |
| 0:08 | The Hall in a laptop tab: the board has updated by itself (the live dot) | "Read directly from Arkiv" |
| 0:15 | **Stop the relay.** Reload the Hall. Run `npm run arkiv:query` | "Our server is down. The data is not" |
| 0:25 | `npm run arkiv:verify -- <match>` prints "Verified" | "Anyone can re-run it; the replay is on Swarm" |
| 0:33 | Two consoles in **Live now**; kill one; its entry is gone after the lease | "A lease, not a cleanup job" |
| 0:40 | Phone: **Delete my profile**; the board row disappears | "The player's key, not ours" |

**Cuts for the 4-minute limit:** the profile and two-console parts come first to go ([04](04-arkiv-guide.md) cut line); the kill-the-relay moment is the one to keep.

## 5. Submission checklist (Arkiv and Swarm)

- [ ] **Track:** Build on Arkiv (**from scratch**); **also select the Arkiv + Swarm bonus** (Arkiv's prizes count as one partner prize, so the bonus uses no extra pick).
- [ ] `/arkiv/schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md` exist at the **repo root path**, each with links, numbers or a query we can run; no sentence describes an unbuilt feature.
- [ ] README: pre-existing versus new, writer wallet addresses, one runnable query, how Swarm is used and one openable Swarm reference, the pin, AI statement, licence.
- [ ] At least one user-visible feature **reads** from Arkiv (the board and the Hall do); the SDK is used to read.
- [ ] No encrypted Swarm reference appears in any entity, log or document (a test greps the entity payloads and attributes the worker sends).
- [ ] The evidence hashes and entity keys are in `docs/web3/` ([07](07-tests-evidence-demo.md)); the Ledger lists the Arkiv operations ([12](12-reality-and-ledger.md)).
- [ ] The no-relay test and the verify command were run on the **hosted** instance in rehearsal.
- [ ] Submission by **09:00 IST on 6 November**; the Arkiv booth visited once to confirm that the from-scratch track **and the Swarm bonus** accept our disclosed pre-existing console (the owner has settled eligibility; get the answer in writing anyway, because the Swarm bonus is **not** available on the existing-projects track).
