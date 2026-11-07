# Build guide 22: whole-plan integration review (6 November 2026)

> **Owner-approved update, 6 November 2026:** Rabdi 7794095 / exact Arkiv SDK 1.0.1 replaces Tiramisu/0.8.1 and the old query/schema assumptions below. Follow [the migration and measured limits](../../../web3/rabdi-migration.md); all K0 gates still apply.

**Question asked by the owner:** go through the whole plan again; do any of the technologies fail to work together; does everything gel?

**Method.** Every guide (00 to 21) was read for contradictions with the others, for cross-technology assumptions (a record written by one technology that another technology reads), and for things that **cannot** work as written. Items that can only be settled by running code are given a verification item in [19](19-verification-and-fix-protocol.md). **Status** below is one of: **fixed in the docs** (the text now says the right thing), **verify** (a test in 19 decides it), **owner** (needs a decision, section 6).

**Short answer.** The three technologies fit together: nothing makes one of them unusable with another. But the review found **one hidden fourth dependency (World)**, **three places where two parts of the plan contradicted each other in a way that would have broken a feature or the integrity of the market**, a handful of **technology limits that the expansion features had ignored**, and one **real planning problem: the total work is larger than the time to 6 November 00:00 IST**, so a value-ordered gate plan is needed (section 5).

## 1. Pairwise compatibility matrix

| Pair | Verdict | The seam and what holds it together | Items |
| --- | --- | --- | --- |
| **ENS x Arc** | Works | Seat name `addr` record = the Arc seat address; the pot's terms hash and the `chonks.receipt` record carry the same result hash; the referee agent name links to its ERC-8004 identity (ENSIP-25). Sepolia (12 s blocks) and Arc (sub-second) are on different chains, so ENS is always **asynchronous** (the outbox): nothing on Arc ever waits for ENS. Cheers and cuts resolve names to addresses **at terms time** and fix the address in the hash. | VE-08, VA-01 |
| **ENS x Arkiv** | Works, one lifetime trap | The handle is the join key (the same string is the ENS label and `profile.handle`). **Trap (fixed):** a party name is **unregistered when the party ends**, so a `result.party` attribute is history text, not a live link; permanent pointers are the handle, the entity key and logs. | VE-11, VE-12 |
| **ENS x Swarm** | Works with a limit | `contenthash` for a Swarm manifest is settable and decodable. **Limit (fixed in text):** public ENS gateways resolve **mainnet** names, ours are on **Sepolia**, so a browser cannot open the Hall by typing the name; the Swarm address is the way in and the name is a verifiable pointer ("Resolve this name" button). | VE-07, VE-13 |
| **Arc x Arkiv** | Works | The one result hash binds both; Arkiv holds rows that anyone can re-hash; the Arc pot settles from the relay-verified result and the replay checker reads Arkiv + Swarm. Different chains, no shared transaction, so no atomicity is claimed: the outbox and idempotency keys give "eventually both", with the Ledger showing any gap. | VX-03, VX-05 |
| **Arc x Swarm** | Works | Only through the replay hash: the pot settles on the hash, the replay lives on Swarm. Encrypted references contain the key and are never written to an entity. | VK items |
| **Arkiv x Swarm** | Works | Unencrypted 32-byte references fit `bytes32`; the console keeper re-uploads by content; `result` carries `replay_hash` and `replay_ref`. | VK items |
| **Arkiv x relay/worker** | Works | Phone-created entities fail the createdBy allowlist, so the console creates and transfers ownership (profile, **follow** (fixed), badge, season). | VK-05, VK-12 |
| **World x everything** | Hidden fourth technology, now removed from the critical path | L2 feeds ranked eligibility, caps, recovery and the Cup, but nothing built World verification. **6 November:** L2 is a booth attestation; World is a later upgrade. See finding C1. | decided |
| **viem x everything** | Needs one pinned version | ENSv2 reads need viem 2.35+; the Arkiv SDK 0.8.1 pins its own viem peer; Arc writes use viem too. | VX-08 |
| **Arc contracts x Arc token** | Works, with documented limits | Circle FiatToken v2.2 proxies are upgradeable, pausable and have a blocklist (the "not trustless" statement); a blocklisted or drained account makes some transfers revert, hence pull claims and the drain floor. | VA-12 |

## 2. Findings

Severity: **S1** breaks a feature, the market's integrity or a track claim; **S2** misleading, fragile or inconsistent; **S3** hygiene.

### A. Technology limits the expansion had ignored

| ID | Sev | Finding | Resolution | Status |
| --- | --- | --- | --- | --- |
| A1 | S2 | **One `viem` for three SDKs.** ENSv2 resolution needs viem 2.35+, the Arkiv SDK 0.8.1 pins a peer, Arc and the Hall bundle share it. A mismatch breaks the build or doubles the browser bundle. | One pinned version; isolate a lane in its own worker if impossible. | verify VX-08 |
| A2 | S1 (for the claim) | **"The Hall is on Swarm under an ENS name" is not openable by name** on Sepolia: public gateways resolve mainnet. The claim as written would fail in front of a judge. | F-X1 rewritten: Swarm address is the way in; the name is a verifiable pointer; button; honest README line. | fixed, verify VE-13 |
| A3 | S2 | **Memo contract is EOA-only; Multicall3 is a contract.** A Memo-tagged payment cannot be wrapped in a Multicall3 batch. [16](16-arc-native-features.md) assumed both. | Rule decided by VA-11: tagged payments are separate EOA calls (a batch tag), untagged ones batch. | verify VA-11 |
| A4 | S1 | **Drain quirk.** A transfer that fully drains a brand-new sender account reverts. Autopilot, cheers and slips could all spend a balance to zero. | Every spending flow keeps a floor (balance minus 0.05); budgets are always under the balance. | fixed, verify VA-12 |
| A5 | S1 | **ENS text-role scope is per resolver, not per name.** A shared `agents` or `games` resolver would let one agent write every other agent's record. | One resolver per party, agent, creator and fan-group name (warm pool). | fixed, verify VE-06 |
| A6 | S1 | **`follow` created by the follower's key fails the Arkiv createdBy allowlist**, so follows would be invisible to every reader. | The phone signs; the console writes and transfers ownership. | fixed |
| A7 | S1 | **A mutable `game` entity breaks verification.** If a game entity can be re-pointed, an old result "verified against the exact code" proves nothing. | `game` is **per version and readonly**; a new version is a new entity with `previous`. | fixed |
| A8 | S2 | **Readonly `season` cannot be "opened then closed by patching".** | The `season` entity is created once, at close. | fixed |
| A9 | S2 | **Sepolia gas.** The warm pool, parties, seats, ends and records are many Sepolia writes per day, and Sepolia faucets are limited. | Budget dry run; alerts; batch; sponsor top-up path. | verify VX-09 |
| A10 | S2 | **Arc faucet is rate limited** (about 10 to 20 USDC per address per period, with a reCAPTCHA). Cheers, Autopilot, the Cup float and the bankroll all draw on it. | Already planned in [03](03-arc-guide.md) (bankroll from several browsers, tiny stakes); the new flows use the same float with the 0.05 floor and caps; [08](08-config-and-ops.md) holds the sizing. | documented |
| A11 | S2 | **Running a creator's game bundle from Swarm inside the Hall is running third-party code on a page that holds the visitor's key.** | Sandboxed worker in an opaque-origin iframe with no network, after the hash check. | fixed |
| A12 | S2 | **Private (encrypted) replay vs the market.** A stranger cannot re-check a sealed replay, so a market on it could not be publicly verified. | A sealed match cannot have a market (the switch disables with a reason), and is labelled `verif=sealed`, never "verified". | fixed |
| A13 | S2 | **Two things called "permit".** The relay-signed `BetPermit` of [10](10-prediction-market.md) (seat exclusion) and the EIP-2612 allowance of Autopilot would be confused in code and docs. | Names kept distinct; F-A5 states it. | fixed |

### B. Design contradictions between lanes

| ID | Sev | Finding | Resolution | Status |
| --- | --- | --- | --- | --- |
| B1 | S1 | **Cheers were a bribery channel.** A cheer to one player, next to a market, lets a bettor pay the player to throw a match; the market excludes seated players for exactly this reason. | **Table Cheers**: split equally among all seats, so no one player or outcome benefits; caps; no cheers once a market's match has started; detectors in [15](15-integrity-and-anti-cheat.md) section 12. | fixed |
| B2 | S2 | **Cheer escrow timing was wrong** (an authorization "escrowed" later is not escrow, and the balance could change). | The relayer submits the cheer at once, so it is escrowed from the tap. | fixed |
| B3 | S1 | **Season Vault root did not match the stats lane.** [20](20-feature-expansion.md) built the root from Arkiv `score` rows; [14](14-stats-and-leaderboards.md) says the board is a function of match log + flag log + ruleset (flags change it), and publishes daily checkpoints. Also nothing said when a season "closes" or how a wrong root is challenged. | Close protocol (drain the outbox, as-of block), root = the stats lane's board, challenge window and sponsor refund, eligibility rules. | fixed |
| B4 | S1 | **The Cup would have been farmable.** Prize ranks came from a board without the sybil rules of [14](14-stats-and-leaderboards.md) and with World absent. | Ranked eligibility rules on the Open board when no World; Verified board when World exists; bots, staff and flagged accounts excluded. | fixed (C1 decided) |
| B5 | S2 | **Bots entered predictor boards and statistics** (tipsters, Autopilot). | Bots excluded by rule; marked `bot` in the Ledger; minimum pool depth before a bot bets. | fixed |
| B6 | S2 | **Misleading "chance" label.** A pari-mutuel pool's share of money is not a probability. | **Backed X% / pays about Y x**, with the lock time. | fixed ([21](21-ux-laws-and-os-ux.md)) |
| B7 | S1 | **The TV cannot place a bet**: it has no session key and its pointer is a phone. The hub wireframe had `[Predict]` on the TV. | TV buttons are "open on your phone" actions; the slip lives on the phone. | fixed |
| B8 | S2 | **"Invisible when off" vs "five stable tabs".** | The hub and its icon exist only when a partner is on; when on, all five tabs always exist with empty states. | fixed |
| B9 | S2 | **Four name concepts for one player** (nickname, seat name, handle, hall-of-fame name). | One **handle** (checked against Arkiv and ENS), seat names are plumbing, the UI shows **name** and **table name**. | fixed |
| B10 | S2 | **A "forever" name owned by a disposable key.** The session key lives in `localStorage`. | A "Save your name" step (link a second phone or export) before minting; otherwise held by the console. | fixed |
| B11 | S2 | **Squatting.** A handle could be claimed by winning one match. | Champion and Legend names are earned, not typed; reserved list; confusables; suffix on a race. | fixed, verify VE-11 |
| B12 | S2 | **ENS jargon in a player-facing gallery.** | Plain nouns in the Gallery; jargon in Proof only. | fixed |
| B13 | S2 | **Cross-venue matches** were not labelled; a taken challenge from another venue is a remote-screen match. | Labelled on both sides before acceptance. | fixed |
| B14 | S2 | **The auto-host's `control` role** would have needed an extra grant transaction per party. | Pre-granted in the warm-pool resolver `initialize`. | fixed |

### C. Dependencies that exist but are not built

| ID | Sev | Finding | Resolution | Status |
| --- | --- | --- | --- | --- |
| C1 | **S1** | **World is a hidden fourth technology.** L2 "Verified human" in [13](13-users-scenarios-and-accounts.md) gates ranked eligibility, caps, recovery and the Verified board; the Cup and several anti-sybil rules assume it. No lane builds it, no partner track in the owner's three covers it, and Orb/Mini App verification is a booth action. | The docs now say what they do **without** World (L0 to L1, device linking, Open board with the ranked rules, no World-based recovery). The three choices are an owner decision, section 6. | decided (booth attestation, 6 November) |

### D. Planning

| ID | Sev | Finding | Resolution | Status |
| --- | --- | --- | --- | --- |
| D1 | **S1** | **The work is larger than the time.** Deadline: 6 November 00:00 IST. The earlier guides already summed to more than the days available (market about 190 h, Arkiv 49 h, stats 90 h, integrity 84 h, accounts 66 h, ledger 60 h, ENS 37 h core, Arc 29 to 37 h plus 17 h native, plus shared and UI); the expansion adds about **280 h** (my estimate: [20](20-feature-expansion.md) tasks FX1 to FX12 and K13 to K24, [21](21-ux-laws-and-os-ux.md) UX1 to UX12). The Arkiv lane is also written "from scratch in the event window". | A **gate plan** (section 5): value-ordered gates, a freeze order, and a rule that nothing in a later gate starts until the previous gate is green on the hosted instance. | gates confirmed (section 6) |

### E. Documentation hygiene

| ID | Sev | Finding | Resolution | Status |
| --- | --- | --- | --- | --- |
| E1 | S2 | **Task ID collisions**: `U#` (UI lane) vs `U#` (UX tasks), `X#` (accounts) vs `X#` (features), `S1` to `S3` (shared) vs stretch `S1` to `S3` (Arkiv). | Renamed to `UX1..12`, `FX1..12`, `KS1..3`; [06](06-tasks-and-codex-prompts.md) updated. | fixed |
| E2 | S3 | **Stale `M9`** (an `Arkiv: market and predictor` entity task). | Pointer to the folded types. | fixed |
| E3 | S2 | **Reserved labels and namespace** differed between [02](02-ens-guide.md), [13](13-users-scenarios-and-accounts.md) and [20](20-feature-expansion.md). | One list in 02 section 4. | fixed |
| E4 | S2 | **The Ledger and integrity lanes did not know about the new contracts and money paths.** | Addenda in [12](12-reality-and-ledger.md) section 10 and [15](15-integrity-and-anti-cheat.md) section 12. | fixed |
| E5 | S3 | [18](18-arkiv-submission-pack.md) still said "five types". | It now covers every **built** type; cut types are removed from `schema.md`. | fixed |
| E6 | S3 | [09](09-seamlessness-and-signing-budget.md) said the party name is an Arkiv attribute without the lifetime caveat. | Caveat added. | fixed |

## 3. What gels well (so nobody "fixes" it)

1. **One key, three identities** (ENS seat owner, Arc seat, Arkiv owner) is consistent in every guide and costs no wallet prompt.
2. **One result hash** is the spine: Arc settles on it, ENS records it, Arkiv stores it, Swarm holds the replay it hashes, and the Ledger decodes all four.
3. **The outbox and idempotency** make three chains with different speeds (12 s, sub-second, Arkiv's own) behave as one pipeline without a distributed transaction; failure of one never blocks play (`PARTNERS`, [17](17-situations-and-edge-cases.md)).
4. **Pull claims, no admin, no fee** are consistent across the pot, the market and the vault.
5. **The honesty rules** (labels, `PLAY MONEY`, provenance badges, "Saved locally") make a partial outage visible rather than a lie.

## 4. Verification items added to [19](19-verification-and-fix-protocol.md)

VE-11 (handle claim), VE-12 (name lifetimes), VE-13 (gateways on Sepolia), VA-11 (Memo and Multicall3), VA-12 (drain quirk in every flow), VX-08 (viem alignment), VX-09 (Sepolia gas), VX-10 (integrity of the new money flows). VA-04 was reworded to the stats lane's board.

## 5. The schedule problem and a gate plan

All hours below are **my estimates** from the lane documents (they were not measured), and they add across lanes only roughly because lanes share the foundation.

| Block | Estimate (hours) | Source |
| --- | --- | --- |
| Shared foundation, UI lane, QA (S, U, Q) | not re-estimated here; each is in [06](06-tasks-and-codex-prompts.md) | 06 |
| ENS core | 37 | 02 |
| Arc pot | 29 to 37 | 03 |
| Arc native (N1 to N5) | 17 | 16 |
| Arkiv and Swarm | 49 (Tier 1 about 36) | 04 |
| Prediction market | about 190 (Tier 1 about 125); UI part 84 | 10, 11 |
| Ledger | about 60 (Tier 1 about 35) | 12 |
| Accounts | about 66 | 13 |
| Stats | about 90 (Tier 1 about 40) | 14 |
| Integrity | about 84 (Tier 1 about 40) | 15 |
| Expansion features and UX | about 280 | 20, 21 |

**Gates (a gate starts only when the previous one is green on the hosted instance, and a later gate is cut before an earlier gate is touched):**

| Gate | What must be true | Contents |
| --- | --- | --- |
| **G0 verify** (day 0) | The P0 items pass or their fallbacks are recorded | VK P0, VE-01, VA-01, VA-12, VX-08 |
| **G1 one real match, three tracks** | A match on a phone creates real ENS names, a real Arc pot and receipts, and real Arkiv entities with a Swarm replay, with `PARTNERS=off` still byte-identical | S, E core, A pot, K Tier 1, the Ledger basics |
| **G2 the product people touch** | The Funcaster Live hub, the market Tier 1 (winner template, minimal phone page), challenges, Table Cheers, handles, **the creator commerce slice (a first-party game published through the creator path, a pass, a split payout on screen)** | M Tier 1, P Tier 1, UX1 to UX7, F-K1, F-A4, F-E2, **CP1 to CP5, CP15, CP16 ([23](23-creator-platform-and-economy.md), [24](24-business-model-and-revenue.md))** |
| **G3 trust and rankings** | Boards, hard integrity rules, device linking, the Open board with ranked rules | R and I Tier 1, X1 to X4 |
| **G4 depth for the judges** | Season Cup (booth-verified and Open boards), badges, agents, the Hall on Swarm, recap cards, Game Shelf, the creator pool, bounties, tiers and probation | F-A7, F-K4 to F-K9, F-E6, F-X1 to F-X3, **CP6 to CP10, CP12 to CP14, CP17 to CP20, and the streamer lane SL1, SL2, SL5 to SL9, SL11 ([25](25-streamer-network-and-after-hours-economy.md)); real Kick and YouTube adapters SL3 and SL4 are G5; SL10 and SL12 to SL14 are G5; SL15 and SL16 are after the event; SL17 approvals start now** (CP21, billing, is after the event; CP11, the creator-code sandbox, is the gate for outside Verified-tier creators and is after the event) |
| **G5 polish** | Everything else; World is a later upgrade, not planned | UX8 to UX12, stretch |

**Freeze order** (when time runs out, stop from the bottom): G5, then G4 from the bottom, then the market's Tier 2, then G3's stats and integrity Tier 2. **Never cut:** K0, K6, K7, the pot invariants, the exclusion of seated players, pull claims, the stop-the-relay proof, the failure drills.

## 6. Decisions (owner, 6 November 2026)

1. **World (C1): decided. Minimal implementation, not World.** L2 is built as a **booth attestation** signed by a staff key (task X2b in [13](13-users-scenarios-and-accounts.md)), labelled "Verified at the booth", with device linking as the only recovery. The World design stays in the repository as a later upgrade; **nothing in any lane waits for World**. The Season Cup and the ranked boards use the booth-verified board and, for everyone else, the Open board with the ranked rules.
2. **Arkiv start and eligibility: owner's decision, not a planning item.** The owner will handle the track's "built at the event" rule. The plan keeps K0 as the only pre-event Arkiv work and writes K1 onward in the build window, as already specified; no further action is requested.
3. **Gates and freeze order: confirmed as written in section 5** (G0 verify, G1 one real match on three tracks, G2 the product people touch, G3 trust and rankings, G4 depth, G5 polish; freeze from the bottom; never cut K0, K6, K7, the pot invariants, seat exclusion, pull claims, the stop-the-relay proof, the failure drills). One addition: **G2 now includes the creator commerce slice of [23](23-creator-platform-and-economy.md) (the Revenue Router, one pass purchase, one split payout on screen)**, because it is the strongest single Arc demonstration; the rest of the creator economy sits in G4.
4. **Prize wording: decided.** The Season Cup is described **only as a play-USDC prize on the Arc testnet**. No real-money claim, no cash-out copy, the PLAY MONEY label everywhere ([20](20-feature-expansion.md) F-A7).

Section 2, finding C1 is therefore **resolved by decision** (status: decided, minimal booth attestation).