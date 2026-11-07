# Build guide 20: feature expansion (more of ENS, Arc, and Arkiv + Swarm, each one something a game console would really have)

Part of the [build guide](00-README.md). Status: plan, **6 November 2026**. **Nothing is built.** On 6 November the owner lifted the capacity and Swarm-retention limits ("dedicate all the time we need") and asked to use each partner technology through as many genuine features as possible, new features allowed, provided they make sense in the app and **the prediction market and everything else work with as little friction as possible**.

This document adds those features. It does not replace the base design in [02](02-ens-guide.md), [03](03-arc-guide.md), [04](04-arkiv-guide.md), [10](10-prediction-market.md); every feature here names the base it extends. Every feature has a **spike** in [19](19-verification-and-fix-protocol.md) that runs first; if the spike fails, the feature shrinks or goes off as that document says, and the claims shrink with it.

## 1. The test every feature passes (or it is not added)

1. **It belongs in a game console.** A stranger at a booth would expect it ("challenge a friend", "tip a player", "the season cup", "my trophies"), not a feature that exists to show a technology.
2. **The technology is load-bearing.** Remove the partner and the feature breaks, or becomes something the relay merely says. If the feature still works unchanged on Postgres, it does not count (the five reasons are in [04](04-arkiv-guide.md) section 3).
3. **Zero new things for the player to learn.** No wallet, no seed, no gas, no jargon. A new feature adds at most **one tap and no signature** to a journey the player already makes ([09](09-seamlessness-and-signing-budget.md); updated table in section 8 below).
4. **It does not block play.** Same failure rules as the base: a provider outage changes a label, never stops a match.
5. **It is honest.** Provenance badges ([12](12-reality-and-ledger.md)) say what was verified, what was attested and what was only reported. Play money only.
6. **It has a visible moment for a judge** that fits in 15 seconds of the 3:30 demo.

## 2. The catalogue

| ID | Feature | Track(s) | Extends | The player sees | Spike |
| --- | --- | --- | --- | --- | --- |
| **F-E2** | **Name Gallery: four kinds of name** (party, seat, champion, legend) | ENS | 02 | Win a Cup and claim a name that you can keep, give away or that nobody can ever take back | VE-05 |
| **F-E3** | **Fans namespace by wildcard records** | ENS | 02, 10 | Predictors and cheerers get a readable name with no mint | VE-02 |
| **F-E4** | **Stable booth name** (namespace aliasing) | ENS | 02 | The booth QR never changes; it always opens the current party | VE-03 |
| **F-E5** | **Record aliasing for receipts** | ENS | 02 | Every seat's name shows the latest match with one write | VE-03 |
| **F-E6** | **Agents as namespaces** (referee, auto-host, tipsters) | ENS, Arc, Arkiv | 02, 03, 16 | "Meet the agents": names, powers, online dots, track records | VE-06, VE-08 |
| **F-E7** | **Creator namespaces** (`<game>.games.<parent>.eth`) | ENS, Swarm, Arc | 02, build/creator platform | A creator's game has a name, a bundle on Swarm, and a payout address | VE-05, VK-15 |
| **F-E8** | **ENS avatar from Swarm** and names everywhere | ENS, Swarm | 02, 04 | Chonk-style avatar and recap on your name; names (not hex) in every list | VE-09 |
| **F-A3** | **Splits: creator, venue and charity cuts** in a pot's terms | Arc, ENS | 03 | "Give 5% to the game's creator" as one line on the terms card | VA-06 |
| **F-A4** | **Table Cheers** (spectator tips, split equally among the seats, refunded if the match fails) | Arc, ENS | 03, 10 | A Cheer button for the table; the seats get it after the verified result | VA-06, VA-07 |
| **F-A5** | **Autopilot** (spending allowance with hard limits) | Arc, ENS | 10 | "Predict for me": rules and a cap that the chain enforces | VA-02 |
| **F-A6** | **Verifier fees** (software pays software) | Arc, ENS | 03, 16 | The referee agent earns a visible, tiny fee per checked result | VA-10 |
| **F-A7** | **Season Vault** (the Chai Cup prize with vesting) | Arc, Arkiv, ENS | 14 | A weekly Cup with a prize pool that unlocks to the top players | VA-04, VA-05 |
| **F-K1** | **Open Challenge Board** | Arkiv, Arc, ENS | 04, 03 | "Challenge anyone": an offer that expires and can be taken from any venue | VK-09, VK-10 |
| **F-K2** | **Agent bulletin** (liveness by lease) | Arkiv, ENS | 04 | Green dots that go dark by themselves when an agent stops | VK-09 |
| **F-K3** | **Follows and Rivals** (a social graph) | Arkiv | 04 | Follow a player; a friends' feed; "rivals" you can challenge | VK-21 |
| **F-K4** | **Game Shelf** (creator games as entities, bundles on Swarm) | Arkiv, Swarm, ENS | 04 | A shelf of community games; fans keep a game alive with one tap | VK-04, VK-15 |
| **F-K5** | **Seasons and Badges** | Arkiv, Arc, ENS | 04, 14 | Badges you own; the season's winner; "the Cup so far" | VK-04, VK-05 |
| **F-K6** | **Venue boards and Today views** | Arkiv | 04 | "Today at this booth" and "all venues" | VK-24 |
| **F-K7** | **Recap cards and the Highlights gallery** | Arkiv, Swarm, ENS | 04 | A shareable card per match, in the Hall | VK-17 |
| **F-K8** | **Private matches** (sealed replays) | Swarm, Arkiv | 04 | A "Private replay" switch; share one link to open it | VK-17 |
| **F-K9** | **Verify in your browser** and **Replay Theatre** | Arkiv, Swarm | 04, 15 | A button that re-checks a result on your own phone; (stretch) watch it again | VK-11, VK-23, VK-25 |
| **F-X1** | **The Hall on Swarm under an ENS name** | ENS, Swarm, Arkiv | 04 | Stop our servers and the Hall still opens from a Swarm address that its ENS name points to (verifiable with one button) | VK-19, VE-07 |
| **F-X2** | **My Funcaster passport** (one key, everything you own) | all | 13 | Name, pots, trophies, badges, follows on one page | VX-01 |
| **F-X3** | **The Season Cup lifecycle** (the flagship flow) | all | all | One weekly loop: play, rank, pay, name, recap | VX-03 |
| **F-M1 to M9** | **Prediction friction reducers** | Arc, Arkiv | 10, 11 | Predict in two taps; no re-login; auto-paid | VX-02 |

Cut line: none for capacity (owner decision). The order is by dependency, not by size: the Tier 1 and Tier 2 core in [04](04-arkiv-guide.md) section 10 and the base pots and names come first; each feature then starts with its spike.

## 3. ENS features

### F-E2 Name Gallery: four kinds of name

ENSv2 lets one parent define different rules per subname. Funcaster uses **all four**, each for a thing a player already understands.

| Kind | Where | Owner | Transfer | Expiry | Parent can revoke | Product meaning |
| --- | --- | --- | --- | --- | --- | --- |
| **Party** | `<adjective-noun-nn>.play.<parent>.eth` | the registrar | no | party length (hours) | yes (host ends party) | The room; join by name |
| **Seat** | `<nick>.<party>.play.<parent>.eth` | the phone key | **no** (soulbound, `roleBitmap = 0`) | the party's | yes | "This phone, in this party" |
| **Champion** (the player's persistent **handle**) | `<handle>.players.<parent>.eth` (the `players` registry of [02](02-ens-guide.md) section 4) | the winner's key | **yes** (you may gift or sell it) | 1 year, renewable by the owner | no (after mint, the parent keeps no unregister role on that label) | The Cup winner's name; a collectible |
| **Legend** | `<nick>.legends.<parent>.eth` | the winner's key | yes | **none** | **no, and the parent has given up its admin role** | The season's overall winner: the one name nobody can take away |

The Champion and Legend are the "hall of fame names" the Cup pays out ([F-X3](#f-x3-the-season-cup-lifecycle-the-flagship-flow)). The Name Gallery (a tab of the Funcaster Live hub, [21](21-ux-laws-and-os-ux.md) section 5) lists the four kinds with one real example each and a link to the explorer; the can and cannot evidence is part of the evidence book ([07](07-tests-evidence-demo.md)): a seat cannot be transferred, a champion can, nobody can unregister a legend.

Records on every kind: `addr`, `avatar` (F-E8), `chonks.receipt` (the last result hash), `chonks.kind`, and for Champion and Legend `chonks.season` and `chonks.proof` (the Arkiv `season` entity key).

**Review fixes (6 November, [22](22-integration-review.md)):**

1. **One name for the player (Occam, Jakob).** The plans already hold four name ideas: the **nickname** typed on the phone, the **seat name** (plumbing, per party), the Arkiv **profile `handle`** ([04](04-arkiv-guide.md)) and the ENS hall-of-fame name of [13](13-users-scenarios-and-accounts.md) (L3 "Named"). They are **one thing**: the **handle**. A player sees only two names: the **nickname** (shown for a match) and the **handle** (kept; the label under `players.<parent>.eth`). The Arkiv `profile.handle`, the Champion name and the boards all use the handle string, and **choosing a handle checks the existing Arkiv profiles and the `players` registry first** (first come; the check is one Arkiv query by `handle` plus one ENS read), so the two can only disagree in a race, which the ENS mint resolves by the suffix rule below. Seat names stay plumbing and are never offered to the player as something to remember.
2. **Squatting and look-alikes.** A handle is checked against the reserved list (`play`, `players`, `legends`, `fans`, `booth`, `games`, `agents`, `host`, `tv`, `admin`, `chonks`, `www`) and a confusables table (VE-10), and a free handle that is **not** earned (no Cup placing and no verified match) is not minted at all: the **Champion/Legend names are earned, not typed**, so nobody can claim a famous name by winning one match under it. If the wanted label is taken the claim offers `<handle>-<4 characters of the address>`.
3. **Key custody before anything permanent.** A Champion or Legend name is owned by the **phone's session key**, which lives in `localStorage` and is lost with the browser's storage ([09](09-seamlessness-and-signing-budget.md) F5). A "forever" name on a disposable key is a contradiction. Claiming therefore starts with a one-tap **"Save your name"** step: **Use on another phone** (the device-link flow of [13](13-users-scenarios-and-accounts.md) section 2, which needs no World) and an exported key as the fallback. The name is minted only after the player links or exports; if they skip, the claim stays open for the season's grace period and then the name is **held for them by the console** (a "held" mark; released to any key they later link). Account recovery via World ([13](13-users-scenarios-and-accounts.md) L2) is **not** assumed to exist ([22](22-integration-review.md) finding C1).
4. **ENS namespace.** The names above add the labels `legends` (no-expiry, parent-less), `fans` (F-E3), `booth` (F-E4) and `hall` (F-X1) to the `play`, `players`, `agents`, `games` set of [02](02-ens-guide.md) section 4; [02](02-ens-guide.md) lists them.
5. **Party names are short-lived by design.** `ens.party.end` unregisters the party name ([02](02-ens-guide.md) section 7), so a **result's `party` attribute becomes plain history text**: it is **not** a live pointer after the party ends. The permanent pointers are the **handle**, the Arkiv entity key and the transaction logs; the Hall shows an ended party's name with "(expired by design)".

### F-E3 Fans namespace by wildcard records

Spectators who predict or cheer need a name that appears in boards and the Ledger, but a mint per spectator is a transaction per person who did nothing but watch. ENSv2's resolver can hold records for a name that has **no registry entry** under the parent's resolver (names without a resolver inherit the closest ancestor's, [02](02-ens-guide.md) section 3). So a spectator's name `ravi.fans.<parent>.eth` is **a few `setText` calls and an `addr` record inside one `multicall`** on the `fans` resolver, written by the registrar once the spectator has done something (first prediction), and read by the Predictions boards. The spectator never knows. If VE-02 fails, the name is minted lazily instead and the claim "no registry entry" leaves the README.

### F-E4 Stable booth name

A venue gets `mumbai.booth.<parent>.eth` once. Its records `chonks.party` (the current party's name) and `url` are updated by the worker whenever the booth starts a new party (one write). The kiosk's QR and the Invite window carry **the stable name**, and the phone's "join by name" resolves it to the current party. Printed posters and the ENS entry therefore never go stale. If VE-03 offers real aliasing (the booth name's subregistry aliasing to the party's), use that and keep zero writes per party; otherwise the one write is cheap. A visible benefit: the demo QR code on the slide, the README and the table card are the same forever.

### F-E5 Record aliasing for receipts

Each seat name's `chonks.last` should show the latest match. Without aliasing that is one write per seat per match. With a resolver link it is **zero**: the seat's record reads through to the party's `chonks.receipt`, written once. VE-03 decides; the fallback is one `multicall` of N writes (already costed).

### F-E6 Agents as namespaces

Three real agents already exist in the plan; this gives them names, powers and records, so **ENS is the agent control plane** (the ENS brief's emphasis on AI agents, [02](02-ens-guide.md) section 1).

| Agent | Name | What it does | Power on ENS | Power on Arc | Shown on Arkiv |
| --- | --- | --- | --- | --- | --- |
| **Referee** | `referee.agents.<parent>.eth` | Re-runs the replay and signs the **second report** for markets | text key `chonks.status` only | none (signs reports; paid by F-A6) | `agent` entity with a 60 s lease |
| **Auto-host** | `autohost.agents.<parent>.eth` | Runs a Kiosk booth: starts matches, advances players, opens the next market | the **control** role on the booth's party resolver, **not** the kick role | none | `agent` entity |
| **Tipsters** (two or three, labelled bots) | `oracle-otter.agents.<parent>.eth`, `dhaba-dan...` | Place small, public predictions with their own play-coin wallets and publish a rationale | `chonks.status` only | a wallet with a fixed budget | `agent` entity + their bets are public on Arc |

Rules: every agent record includes an ENSIP-26-style description (what it is, what it can do, what it cannot) and, when the deployment supports it, a two-way link to its ERC-8004 identity on Arc (VE-08). **Agents are labelled "bot" in every list; a tipster never places a bet that a human could mistake for a person's.** The TV's **Revoke** button works on agents exactly as on the host phone: one on-chain revoke and the auto-host stops accepting commands (shown by the live check). Tipsters give spectators something to follow, a reason for Autopilot (F-A5) and a genuine "agents with ENS" story. The owner's guardrail "humans-only by default" is untouched: bots are never seats in a match.

**Review fixes:** (a) **One resolver per agent** (as for parties): [02](02-ens-guide.md) records that text-role scope is per resolver, not per name, so a shared `agents` resolver would let the referee's `chonks.status` role write every other agent's record; VE-06 proves it and per-agent resolvers (made from the warm pool) are the default. (b) **Bots are excluded from every ranking and prize**: tipsters and Autopilot bets are marked `bot` in the Ledger, never enter the predictor boards of [14](14-stats-and-leaderboards.md), the Season Vault or the humans' pools' statistics, and never bet on a match with fewer than a set pool depth (they would be the pool). (c) The auto-host's `control` role is **pre-granted in the warm pool's resolver `initialize`**, so a new party costs no extra grant transaction.

### F-E7 Creator namespaces

The creator platform lets outsiders add games ([build/creator docs](../../build/README.md)). When the console approves a game, the registrar mints `<slug>.games.<parent>.eth` **to the creator's key**, with these records: `chonks.bundle` (the Swarm reference of the bundle), `chonks.entity` (the Arkiv `game` key), `payout` (the address for royalties, F-A3), `avatar`, `description`. The creator owns the name and may update **their own** keys (per-key text roles on their own name, the Radius pattern; **one resolver per creator name**, because role scope is per resolver), so shipping a new version is a record change by the creator, not a request to us. Name, bundle and entity are three views of one game, and anyone can check that they agree.

### F-E8 Avatars from Swarm and names everywhere

A player's `avatar` record points at the recap card or their Chonk portrait on Swarm (an `https://api.gateway.ethswarm.org/bzz/<ref>` URL; unencrypted only). Boards, the Hall, the Ledger and the Predictions window show the **ENS name** (reverse-checked, VE-09) instead of a hex address or a nickname alone, with the provenance mark "on ENS".

## 4. Arc features

All new contracts are built **in Arc Studio** (the brief requires it), one Studio turn per contract, with the session ids recorded (VA-03). They are packaged together as the **Funcaster Stablecoin Kit** (`ConditionalPot`, `MatchMarkets`, `SplitPayout`, `SeasonVault`), documented for reuse by other builders; the Arc brief names reusable contracts as a bonus.

### F-A3 Splits in a pot's terms

The pot's EIP-712 `Terms` ([03](03-arc-guide.md) section 5.3) gain an optional `cuts[]` of at most three `(recipient, bps)` entries with a total of at most 1,000 bps (10%). Every player signs the same terms hash, so every cut is **agreed in advance and visible**. Recipients are resolved from **ENS** at terms time (the game creator's `payout` record, the venue's name, a charity name), shown by name on the terms card, and fixed in the hash. **Scope limit (6 November, [23](23-creator-platform-and-economy.md)):** pot `cuts` are a **play-money, testnet demonstration** of payment splitting. In any real-value mode the default stays **no cuts**, and a creator is **never** paid from a wager: a share of a stake is gambling revenue and would make the platform and the creator operators ([business-plan](../../../../business-plan.md) section 11). Real creator income comes from the **commerce rails** of [23](23-creator-platform-and-economy.md). Default: no cuts. Example: *"Golf, 1.00 each, winner takes 95%; 5% to starcatch.games.<parent>.eth."* This is "payment splitting" and conditional release in one: the cuts move only when the replay-checked result settles the pot, and refund with it when the pot refunds. **Contract change:** `Terms.cuts`, paid before the payout rule, rounding dust to the winner, covered by the rounding test list in Appendix B of [03](03-arc-guide.md); `SplitPayout` is also built as a standalone contract for F-A4 and published in the Kit.

### F-A4 Table Cheers (revised after the review, [22](22-integration-review.md) finding B1)

A spectator taps **Cheer the table** in the Predictions window or the spectator page: a preset **0.05 play-USDC** (three presets, remembered). It is a signed EIP-3009 authorization (silent with the session key) that the relayer **submits at once**, so the money is escrowed in `SplitPayout` (keyed by the match) from the moment of the tap; the phone's balance drops immediately and honestly. When the result is **verified** (the same oracle layers as the market), the escrow **splits equally among all the human seats** (no fee); if the match is voided or abandoned, **every cheer refunds** by default. The seats see "Ravi cheered the table (+0.01 each)" on the TV and their phones.

**Why the table and not a player.** A cheer paid to one named player, in the same room as a prediction market, is a **bribery channel**: a friend bets against a player, cheers that player enough to cover the loss, and the player throws the match. The market already bars the seated players from their own match ([10](10-prediction-market.md), [15](15-integrity-and-anti-cheat.md) T4) precisely because the players control the result. A cheer split **equally among every seat** does not depend on the outcome or on any one player, so it cannot be used to fix a match. The personal flavour survives as a **free reaction** ("Ravi is cheering for asha": a visible, unpaid emote that is also an Arkiv-free relay event). Anti-abuse: a per-spectator cap per match, a cap per match in total, no cheers once the match has started when a market is open on it (so cheering cannot be used to move the market's perception), and cheers are Memo-tagged `cheer:<match>` so the Ledger shows them; integrity detectors for cheers are in [15](15-integrity-and-anti-cheat.md) (addendum).

### F-A5 Autopilot

A spectator chooses **Autopilot** once: three controls only (budget for tonight: 0.50 / 1.00 / 2.00; max per match: preset; **style**: *favourites*, *underdogs*, *follow Oracle Otter*). **Terminology:** this is an **EIP-2612 allowance permit** (the token's `permit`), not the relay-signed `BetPermit` of [10](10-prediction-market.md) that enforces seat exclusion; both are checked, and the strings and code names keep them distinct. **The budget is always below the balance** (at least 0.05 under it): the Arc drain quirk ([16](16-arc-native-features.md) and [03](03-arc-guide.md)) makes a transfer that fully drains a brand-new sender account revert, so neither Autopilot nor any stake, bet or cheer may be allowed to spend a balance to exactly zero (the slips cap at balance minus the floor; VA-12). The phone signs **one** `permit` (EIP-2612) for the budget to the `MatchMarkets` contract plus one typed `AgentRule`. The **allowance is the spending limit and the chain enforces it**; revoking is `permit(0)` from a "Stop" button. A relay-side agent (`autopilot.agents.<parent>.eth`, ENS-scoped, labelled bot) then places bets within the rule through the normal `betFor` path (the contract checks the permit's owner and the rule hash and decrements a per-owner spent counter); every action shows in the spectator's history with the reason ("favourite, 0.10"). If VA-02 fails the permit becomes a one-time relayed `approve` and, failing that, Autopilot becomes relay-enforced and the interface says "limits enforced by the console, not the chain". Autopilot respects the market's rules in [10](10-prediction-market.md) (no double-or-nothing, no streak bonuses, caps).

### F-A6 Verifier fees

The platform pays the independent referee agent a **tiny fee** (0.001 play-USDC) per checked result, an on-chain payment from the sponsor to the agent's address, Memo-tagged `verify:<match>`. That is the "software pays software" micro-payment. It also gives the referee a visible balance and an incentive story in the Agents tab. 100 verified results = 100 receipts.

### F-A7 Season Vault (the Chai Cup)

**Wording rule (6 November, owner):** the Season Cup is **always described as a play-USDC prize on the Arc testnet** (no real-money claim, no cash-out, no "win money" copy anywhere; the Ledger and the Hall carry the PLAY MONEY label). A real-value prize would be a separate decision with counsel ([08](../08-stakes-product-and-legal.md) section 6).

A **vault** (`SeasonVault`, built in Studio) holds a sponsor's play-USDC prize pool (the venue, a sponsor, or the sponsor float). At season end:

1. **Close protocol** (review fix, [22](22-integration-review.md) finding B3). A season ends at `ends`. The console then **waits for the outbox to drain** (a grace period, default 10 minutes, and until every `result` with `at <= ends` is on Arkiv or marked failed), computes the board **as of a recorded Arkiv block** N, and commits one Merkle root (`commitRoot(season, root, asOfBlock, rulesetHash)`). Results that land after block N are not in this season (they are shown in the next); this is what makes the board a function anyone can reproduce.
2. **The board is the stats lane's board** ([14](14-stats-and-leaderboards.md) section 6): a pure function of the match log, the **published** flag log and the ruleset, whose daily checkpoint is already published through Memo and mirrored in Arkiv. The Season root is the checkpoint of the last day plus the season's board hash; it is **not** recomputed from `score` rows alone (anti-cheat flags change the board, so `score` rows alone would give a different answer). `scripts/season-proof.cjs` downloads the match log, the flag log and the Arkiv rows and reproduces the root.
3. **Not a trust-me root.** The pot's oracle pattern is reused: `commitRoot` is proposed by the vault's `oracle` (the console key), opens a **challenge window**, and any claimant or sponsor may submit a **contest** (signed, relayed) that freezes the vault; a contested or never-finalised season **refunds the sponsor** (permissionless after the deadline). A root nobody can check is the weakest point of the whole feature, so the README states the residual trust: the console proposes, the window and the recompute script are the check.
4. **Eligibility** (sybil, [15](15-integrity-and-anti-cheat.md)): the vault's prize ranks come from the **booth-verified board** (L2 as a booth attestation, [13](13-users-scenarios-and-accounts.md); a World-verified board is a later upgrade) when the player is attested, and from the **Open board with the ranked rules** (at least 10 rated matches, 5 distinct opponents, pair weights, gain caps, account age) when it does not ([22](22-integration-review.md) finding C1). Bots, staff and the operator are excluded by address.
5. Winners are the top N ranks. Each claims with a **Merkle proof anyone can rebuild** (`scripts/season-proof.cjs`).
6. The prize **vests** linearly over a short window (for the demo, 10 minutes; for a real season, days), so the pool pays out like programmable payroll, in USDC or EURC.
7. A winner's claim is **relayed with the sponsor paying gas**; the winner taps "Claim" once (or Auto-claim as in the market).

The point for the Arc brief is advanced stablecoin logic (conditions, time, splits, vesting); for Arkiv it is **P3, self-verifying data deciding who is paid**; for ENS it ends in a champion name (F-E2).

## 5. Arkiv and Swarm features

The five core types of [04](04-arkiv-guide.md) section 5 stay as they are (`result`, `score`, `receipt`, `profile`, `live`). These **extension types** add the rest. Each follows the same rules: typed lowercase attributes, `project` and `schema_version`, createdBy allowlist on read, every entity has a visible UI surface, and **no type exists only to be counted**.

| Type | createdBy | Owner | Flags | Lease | Attributes (typed) | Surface |
| --- | --- | --- | --- | --- | --- | --- |
| `challenge` | console | console (so it can extend or delete) | readonly | until `deadline`, at most 24 h | `game` str, `mode` str, `venue` str, `deadline` u64, `challenger` addr, `target` str (ENS name, optional), `stake` dec, `asset` str; **payload: the offer signed by the challenger's session key (EIP-712)** | Challenge Board |
| `claim` | claimant's console or an agent | that console | readonly | 10 min | `challenge` key, `claimant` addr, `venue` str; payload signed by the claimant | Challenge Board |
| `agent` | console | console | none | 60 s, extended every 20 s | `agent_name` str, `role` str, `venue` str, `since` u64 | Agents tab |
| `game` (one entity **per version**) | console | creator (transferred at publish) | **`readonly`** and `permissionlessExtension` | 30 d, extended by plays and by fans | `slug` str, `version` str, `previous` key (the older version, optional), `creator_name` str, `bundle_hash` bytes32, `bundle_ref` bytes32, `manifest_hash` bytes32 | Game Shelf |
| `season` (**created once, at close**) | console | winner (transferred at creation) | readonly | 365 d | `season` str, `starts` u64, `ends` u64, `board_root` bytes32, `as_of_block` u64, `winner` addr, `vault` addr | Seasons, the Cup |
| `badge` | console | player | readonly | 365 d | `badge` str, `season` str, `evidence` key (the `result` or `score` it comes from), `at` u64 | My Funcaster, Hall |
| `follow` | **console** (the allowlist reads only console-created entities; a follower's own key is not on it), then `changeOwnership` to the follower | follower | none | 180 d | `follower` addr, `target` addr, `source_key` key, `target_key` key; **payload: the follow signed by the follower's session key (EIP-712)** | Friends, Rivals |

Attribute counts stay far below the 30 limit; leases use the measured margins from VK-09; costs come from VK-07 and are re-budgeted in [08](08-config-and-ops.md).

### F-K1 Open Challenge Board

**What it is.** "Challenge anyone": a player picks a game, optionally a stake and optionally a named opponent, taps **Challenge**, and an offer appears on every board that reads our namespace: the TV's Funcaster Live window, the Hall, other venues. Anyone can **Take it**; the match then happens as a normal party (a remote screen if the taker is elsewhere), with the pot if a stake was offered.

**Why Arkiv (and why it is the feature that fits the brief).** The brief's emphasis on agents and markets with **ephemeral coordination state: tasks, bids, claims** is exactly this. The offer **expires by itself** at the deadline (P4: no cleanup job), the offer is **signed by the challenger** so any console or agent can verify it without trusting the console that posted it (P3), and a second console at another venue can see and **claim** it (P2), neither of which a private table does. Claims are separate entities with a short lease, so a stale claim never blocks an offer. **Why ENS:** a direct challenge targets a name (`challenge asha.players...`), and the claimant resolves it. **Why Arc:** the stake is not escrowed on the offer; a pot is created only on acceptance, so a challenge has no funds at risk until both seats are known (the normal funding flow and refund-by-default).

**Flow.** Phone: Challenge (game, stake chips, optional name) → signs silently → console writes `challenge` with `deadline` = now + 10 min (default) → boards show it → another phone taps **Take it** → console writes `claim` → the challenger's console creates a party and pushes "Challenge taken: join" to both → normal start gate → results → `result` entity points to the challenge key (`challenge` attribute added to `result`) so the Hall can show "Won a challenge".

**Anti-abuse.** One open challenge per phone, a cap per venue, signature check, and the claimant cannot be the challenger. Offers whose signers fail verification are dropped by readers and counted.

### F-K2 Agent bulletin

Agents (F-E6) hold an `agent` entity with a **60-second lease renewed every 20 seconds**. The Agents tab shows only live ones, and **a dead agent disappears on its own**, which is the whole point of lease-based liveness: the directory cannot lie about an agent that is down, and no sweeper exists. The demo moment: kill the tipster process and watch its dot vanish within a minute.

### F-K3 Follows and Rivals

A phone can **Follow** a player (from the Hall, the Results card, or a name in a list). The phone signs the follow; the console writes the `follow` edge, transfers it to the follower (so only they can delete it) and it carries a 180-day lease. (A phone-created entity would fail the createdBy allowlist of [04](04-arkiv-guide.md), the same reason `profile` is console-created and then transferred.) The use is concrete: **Friends' feed** on My Funcaster (recent results and badges of people you follow), **Rivals** (people you often play or beat, with a one-tap Challenge, F-K1), and the Hall's "followers" count. The graph view uses `arkiv-graph` if VK-21 passes; the entity model is the feature either way. Follows are public; the interface says so at the first follow ("Follows are public").

### F-K4 Game Shelf

Each approved creator game **version** is an Arkiv `game` entity: owner = the creator, **readonly** (so a published version can never be re-pointed at different code: a new version is a new entity whose `previous` names the old one, and a result always points at the exact version that ran), with `permissionlessExtension` so **fans can keep a game alive** with one tap ("Keep this game alive": the phone asks the console to extend its lease, or extends it directly when VK-12 passes); a game nobody plays or extends **expires from the shelf by itself** (P4 as a curation rule, not a cleanup job). The bundle is on **Swarm** (`bundle_ref`), the `bundle_hash` is the hash that already binds result verification to the exact game code, and the creator's ENS name (F-E7) carries the same reference. Consequence: **a result entity → its game entity → its bundle on Swarm** is a chain anybody can follow to **re-run the match with the exact code that produced it**. The Game Shelf is a section of Funcaster Live and of the Hall.

### F-K5 Seasons and Badges

A **season** is a week (configurable; the periods of [14](14-stats-and-leaderboards.md)). The `season` entity is **created once, at close**, by the console with the Merkle board root, the as-of block and the winner (ownership transfers to the winner: they own the season record); it is readonly, so it is never "opened" and patched. The running season is only a configuration value and the live board. **Badges** are readonly entities owned by the player and derived only from public data (`evidence` points at the `result` or `score` that earned it): First Win, Perfect Round, Rival Beaten, Cup Top Ten, Keeper (kept a game alive). Anyone can recompute every badge from Arkiv; the Hall verifies a badge by walking to its evidence. Badges are for **play** progress, not for prediction streaks ([21](21-ux-laws-and-os-ux.md) section 8 explains why).

### F-K6 Venue boards and Today views

`venue` (a typed string, configured per console) is added to `result` and `score`. The Hall and the TV show **Today at this booth**, **This week, all venues** and **Global**, which is the visible form of multiple consoles sharing one namespace.

### F-K7 Recap cards and the Highlights gallery

After a match the worker renders a **recap card** (SVG then PNG, XP-window styled) and uploads it to **Swarm**; the `result` entity's `card_ref` carries the reference; the champion's `avatar` can point at it (F-E8). The Hall shows a gallery of recent cards; the phone's Share button hands the OS share sheet the Hall page of that match. The card carries **the verification tick and the replay hash printed on it**, so a screenshot is itself checkable.

### F-K8 Private matches

A **Private replay** switch in Game Properties (default off) uploads the replay **encrypted** to Swarm. The encrypted reference **contains the key** (128 hex), so it is **never** written to an entity, a log or a gateway path; the `result` carries only the `replay_hash`. The seats' phones receive the reference over the existing socket and a **"Share replay" QR** (the reference in the URL fragment, which browsers never send to a server) opens it in the browser. Hall shows "Sealed replay (hash checked, contents private)". **Review fixes:** a **private match cannot be listed for predictions** (the verifier agent and a stranger need a replay they can read; [10](10-prediction-market.md) layer B uses the relay's verifier endpoint, but the public re-check on Swarm would be impossible), so the switch is disabled with a plain reason when a market is open and vice versa; and a sealed match is labelled `verif=sealed` (checked by the console, **not** re-checkable by a stranger), never "verified" in the public sense ([12](12-reality-and-ledger.md) provenance rule). This is the honest middle: results stay public and verifiable by hash while the replay's contents are the players' to reveal.

### F-K9 Verify in your browser and Replay Theatre

**Verify in your browser** (VK-25): on the Hall's match page a button fetches the replay from Swarm, the bundle (F-K4), runs the pure-logic check in the browser for the games that support it, and shows "Hash matches (checked on this device)". **Security (review fix):** the bundle on Swarm is **third-party code** (a creator's game), so it runs only inside a **sandboxed worker in an opaque-origin iframe** with no network, no storage and no access to the Hall's key or page, and only after its bytes are hashed and compared with the entity's `bundle_hash`. It is the strongest form of P3 because the visitor, not our server, does the check. **Replay Theatre** (VK-23, stretch) plays the replay in the game window from Swarm.

## 6. Cross-technology features

### F-X1 The Hall on Swarm under an ENS name

The Hall (`public/hall/`) is a static build that reads Arkiv from the browser. Upload it to **Swarm as a manifest**, and set the **`contenthash`** on `hall.<parent>.eth` to the manifest reference (VE-07). Visitors open `https://api.gateway.ethswarm.org/bzz/<ref>/` (or any Swarm gateway) and the data comes from Arkiv. **Honest limit (review fix, [22](22-integration-review.md) finding A2):** the public ENS gateways (the `.limo` family) serve **mainnet** names, and our names are on **Sepolia**, so a browser cannot type `hall.<parent>.eth` and arrive. What the name gives is a **verifiable pointer**: the Hall page ships a "Resolve this name" button (a small script that reads the `contenthash` from Sepolia and compares it with the address in the bar), and the README says exactly that. If ENSv2 resolution flips to mainnet before the event ([02](02-ens-guide.md) section 12) the same record is reachable by the ENS-aware gateways. We keep a server-hosted copy as the primary for speed and mark the Swarm copy "the same build, byte for byte, addressed by a name". **Stop-the-relay and stop-our-web-host proof:** the whole public layer (front end, data, verification) keeps working with none of our servers. The story is one sentence: *the front end is on Swarm, the name is on ENS, the data is on Arkiv, the money is on Arc.*

### F-X2 My Funcaster passport

One page on the phone (`/me`, [13](13-users-scenarios-and-accounts.md)): the player's **ENS name(s)**, **pots** (Arc, with receipts), **trophies** and **badges** (Arkiv, owned), **follows**, **Autopilot** state, **recap cards** (Swarm). It is the "one key, three identities" made visible, with the provenance badges on each section and a **Sign out of this phone** at the bottom (the one place the key can be reset).

### F-X3 The Season Cup lifecycle (the flagship flow)

One weekly loop that uses every technology for one reason each, and is the 45-second demo slice:

1. **Play** (Funcaster games; relay).
2. **Publish** (Arkiv: `result`, `score`, `badge`, `season`).
3. **Rank** (the stats lane's board, [14](14-stats-and-leaderboards.md), recomputable from the logs and Arkiv rows; board root committed after the close protocol of F-A7).
4. **Pay** (Arc: `SeasonVault` vests the prize to the top ranks with proofs anyone rebuilds).
5. **Name** (ENS: the winner claims a **Champion** name; the overall winner gets a **Legend** name).
6. **Recap** (Swarm: the season card; the Hall page lives on Swarm under an ENS name).

If any one provider is down, the Cup still plays and shows what could not complete ("Prize will vest when the chain is back"), and the claim, the proofs and the names are idempotent jobs in the outbox.

## 7. Prediction market: friction reducers (F-M1 to F-M9)

The market is the part spectators touch with the least patience. The base design in [10](10-prediction-market.md) and [11](11-prediction-market-ui.md) is three taps; these changes make the **second** and later predictions two taps and remove every wait, with no new signature.

| ID | Change | Effect |
| --- | --- | --- |
| **F-M1** | **Quick predict**: the amount defaults to the player's last stake (first time: the middle preset); the side defaults to the pool leader or their **favourite** (the last side they backed for that seat); the primary button reads "Predict 0.25 on Asha" | Two taps: pick the side (or accept the default), tap the button |
| **F-M2** | **Deep link and QR into the live market**: the Kiosk board and the TV QR open `/p/<market>` **already on the right match**, no home page, no search | Zero navigation taps |
| **F-M3** | **No re-login**: the session key is restored silently on every visit; a visit after the page was killed opens the same market with the state intact | No friction after backgrounding |
| **F-M4** | **Predict again**: after a result, "Next match: Golf, 0:42" is one tap from the result card | One tap to the next market |
| **F-M5** | **Auto-claim** and an **optimistic balance**: the balance shows the win as soon as the settlement is signed by both reports and the transaction is relayed; claim is never a button the player must remember | Zero claim taps |
| **F-M6** | **Closing time as a ring**: a visible countdown (goal-gradient) and a "market closes in 10 s" haptic; late tap shows the honest reason | No surprise rejections |
| **F-M7** | **Autopilot** (F-A5) for people who do not want to tap at all | Zero taps per match |
| **F-M8** | **Pre-funded play coins**: the first visit drips play coins automatically ([09](09-seamlessness-and-signing-budget.md)); a **"Top up"** is never needed in a session | No empty-wallet dead end |
| **F-M9** | **Honest state words**: the eight states of [11](11-prediction-market-ui.md) with the same chips, colours and wording everywhere; one line says what happens next ("Paid automatically when two checks agree") | No questions |

## 8. The signing and tap budget after these features

The base table is in [09](09-seamlessness-and-signing-budget.md); the new journeys **extend** it. Each tap is one finger touch; "signature" is a silent session-key signature, never a prompt.

| Journey | Taps | User signatures (silent) | Sponsor-paid transactions | Notes |
| --- | --- | --- | --- | --- |
| First time: scan, nickname, Start | 2 | 1 (session key creation, no prompt) | 0 | Unchanged |
| Predict (first time) | 3 | 1 | 1 (relayed funding + bet) | Unchanged |
| Predict (next times, F-M1) | **2** | 1 | 1 | Default side and amount |
| Predict with Autopilot (F-A5) | 3 once (set up) then **0** | 2 once (permit + rule) | 1 per bet | Cap on-chain |
| Cheer the table (F-A4) | **1** | 1 | 1 per cheer, relayed at once (batched in Multicall3 every few seconds) | Escrowed in `SplitPayout` immediately; refunds if the match voids |
| Challenge (F-K1) | 3 (game, stake, send) | 1 | 0 | Pot only on acceptance |
| Take a challenge | 1 | 1 | 0 | |
| Claim a Champion name (F-E2) | 1 | 0 | 1 (mint) | The name is minted to the key |
| Season Vault claim (F-A7) | 1 (or 0 with auto-claim) | 0 | 1 | Proof built by the console or by anyone |
| Follow (F-K3) | 1 | 1 | 0 or 1 | Arkiv write; drip-funded or console-created and transferred |
| Keep a game alive (F-K4) | 1 | 0 or 1 | 0 or 1 | |
| Share a private replay (F-K8) | 1 | 0 | 0 | The reference never leaves the phone and the seats |

Invariant, tested (VX-01): **no journey asks the player to approve a transaction, hold gas, install anything or read a hex string.**

## 9. What this changes in the other documents

| Document | Change (6 November, or to do when building) |
| --- | --- |
| [00](00-README.md) | Reading order rows 19 to 21; section 6 capacity note |
| [04](04-arkiv-guide.md) | Section 5 now points to the extension types here; section 10 gains tasks K13 to K24 |
| [05](05-ui-integration.md) | The window inventory is **superseded** by [21](21-ux-laws-and-os-ux.md) section 5 (one **Funcaster Live** hub instead of separate Chain, Leaderboard and Predictions icons) |
| [06](06-tasks-and-codex-prompts.md) | Feature tasks and prompts, listed in section 10 below, are added when the owner approves the build order |
| [08](08-config-and-ops.md) | New flags: `FEATURE_CHALLENGES`, `FEATURE_CHEERS`, `FEATURE_AUTOPILOT`, `FEATURE_SEASON`, `FEATURE_FOLLOWS`, `FEATURE_SHELF`, `FEATURE_SWARM_HALL`, `FEATURE_AGENTS`; each default off until its spike passes |
| [18](18-arkiv-submission-pack.md) | The criteria drafts quote these features once they have evidence; until then they stay out of the README |

## 10. Build tasks (order is by dependency)

| ID | Task | Needs | Spike first |
| --- | --- | --- | --- |
| FX1 | Agents lane: referee, auto-host, tipsters with names, roles, bulletin (F-E6, F-K2, F-A6) | base ENS lane, base Arc lane, K core | VE-06, VE-08, VK-09 |
| FX2 | Challenge Board (F-K1) | K core, base pot | VK-09, VK-10 |
| FX3 | Cheers and `SplitPayout` (F-A4) and pot cuts (F-A3) | Arc lane | VA-06, VA-07 |
| FX4 | Seasons, badges, Season Vault, Name Gallery (F-K5, F-A7, F-E2) | K core, A lane, E lane | VA-04, VA-05, VE-05 |
| FX5 | Game Shelf and creator names (F-K4, F-E7) | creator platform, K core | VK-04, VK-15 |
| FX6 | Follows and Rivals (F-K3) | K core | VK-21 |
| FX7 | Autopilot (F-A5) | market | VA-02 |
| FX8 | Booth name, aliasing, fans namespace (F-E3 to F-E5) | E lane | VE-02, VE-03 |
| FX9 | Recap cards, private replays, browser verify (F-K7 to F-K9) | K core, Swarm | VK-17, VK-25 |
| FX10 | Hall on Swarm under an ENS name (F-X1) | Hall, E lane | VK-19, VE-07 |
| FX11 | Passport page and the Funcaster Live hub (F-X2) | [21](21-ux-laws-and-os-ux.md) | VX-06 |
| FX12 | Prediction friction (F-M1 to F-M9) | market | VX-02 |

## 11. Risks of adding this much

| Risk | Control |
| --- | --- |
| **Scope sprawl makes the demo noisy** | The demo uses the Season Cup flow (F-X3) and the stop-the-relay proof; every other feature is reachable but not in the 3:30 script ([07](07-tests-evidence-demo.md)) |
| **Judges read depth as padding** | Each feature in the README carries one line: "what breaks without this partner" and a link to its evidence; features whose evidence is missing are not mentioned |
| **More entity types means more cost and more forged-data surface** | Same createdBy allowlist and payload validation for all; the VK-10 test covers every type |
| **Real-money drift** | Cheers, Autopilot, vault and cuts are play money; guardrails in [09](09-seamlessness-and-signing-budget.md) and the owner's legal note are unchanged |
| **Autopilot looks like gambling automation** | Labelled bot, hard cap, play money, no streak or double-or-nothing, stop button always visible |
| **The three-partner count** | The owner picks three partners at submission; every feature above lives in one of ENS, Arc or Arkiv (+ Swarm) and none requires a fourth |
