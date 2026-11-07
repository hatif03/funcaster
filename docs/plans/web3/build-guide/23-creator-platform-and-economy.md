# Build guide 23: the creator platform, its business model and what it changes across the product (6 November 2026)

The pitch: **Funcaster is a platform where anyone builds a game, submits it, and others discover and play it on any Funcaster console.** This guide answers four questions: how the business should work, what creators actually get, how the Arc contracts make that real (and fit the Arc bounty), and what the creator platform changes in every other part of the product.

Figures marked **[U]** are my illustrative assumptions, not data. Benchmarks come from [business-plan.md](../../../../business-plan.md) section 7 (sources and reliability tags are there). Hours are my estimates. **Nothing here is legal advice**; section 9 lists what needs counsel.

## 1. The thesis in five lines

1. A creator writes **rules**; Funcaster supplies everything else a multiplayer game needs: phones as motion controllers, rooms and seats, a TV shell, ratings and boards, replays, spectators, a prediction market, a name, a shelf, and **payments that split themselves**.
2. A creator is paid from **commerce** (passes, a shared play-time pool, tips, sponsor bounties, remix royalties), through contracts the creator can read and check, with no payment processor, no minimum payout and no waiting for a monthly statement.
3. **Verification is the economic gate.** A game whose rules are deterministic and replay-checkable (**Verified tier**) can have ranked boards, a Cup, a market and pots; a casual game can be listed and sold but not ranked or bet on. This gives creators a reason to build the harder, better kind of game.
4. **Two rails that never mix.** *Commerce rails* (real value is possible later, where lawful) pay creators. *Play rails* (pots, markets, cheers, the Cup: **play money on testnet**) never pay a creator from a wager. This keeps the creator business outside gambling law, which matters in India ([business-plan.md](../../../../business-plan.md) section 11).
5. The cold-start answer is **venues and events first** (they pay, so creators earn from day one) and **sponsor bounties** (they fund supply before an audience exists).

## 2. Who is on each side, and what each pays or gets

| Party | What they do | Pays | Gets |
| --- | --- | --- | --- |
| **Creator** | Builds a game with the SDK, submits it, maintains versions | Nothing to list (a small refundable review deposit is an option, section 4) | Distribution, infrastructure, a competitive layer, instant transparent payouts, an on-chain portfolio, sponsor access |
| **Host / room owner** (a friend with a TV, a cafe, a classroom) | Picks games and starts a room | A game pass (small, per room-night), or nothing for free games, or nothing at a subscribed venue | A shelf of games that work on phones with no install |
| **Venue / booth operator** (cafe, college fest, hackathon booth) | Runs a console for visitors | A monthly subscription (B2B) | All shelf games, staff tools, branding, a **referral share** of passes sold at its console |
| **Player / spectator** | Plays, predicts (play money), tips | Optional tips and cosmetics | Games, ranks, names, replays |
| **Sponsor / brand** | Funds bounties, events, a Cup prize pool | Bounty and event budgets | A game made to their brief, a booth presence, verifiable delivery |
| **Funcaster (the platform)** | Review, hosting, verification, rooms, the contracts | Gas, Swarm, review labour | A take rate, venue subscriptions, sponsor deals |

## 3. What a creator gets (the benefit ladder, in the order creators care)

| # | Benefit | What it is in Funcaster | Why a creator cannot easily get it elsewhere |
| --- | --- | --- | --- |
| 1 | **Distribution that is physical as well as online** | The Game Shelf on every console: booths, cafes, fests, living rooms; "Today at this booth" and global charts | A web portal gives traffic, not a room full of people holding phones |
| 2 | **Multiplayer for free** | Rooms, QR join, seats, stable controllers, reconnects, a 4 to 8 seat TV shell; the creator writes only the rules (SDK manifest v2, `GameSession`) | Real-time multiplayer plus a motion controller is the hard part; AirConsole is the nearest, living-room only |
| 3 | **A competitive scene with no work** (Verified tier) | Ratings (Weng-Lin), per-version boards, replays anyone can re-check, a season Cup, a prediction market, sealed or public replays, recap cards | Those need verified results, which the platform produces and publishes |
| 4 | **Instant, transparent, programmable payouts** | An Arc contract splits every payment to the creator, collaborators (artist, composer), the venue and the platform in one transaction; recipients claim gaslessly in USDC or EURC | No processor delay, no payout threshold, no opaque statement; the split is public and fixed per version |
| 5 | **Team splits and remix royalties** | Up to five payees per version (by ENS name); a fork lists its parent and pays it a fixed share, enforced by the contract | Most marketplaces cannot split a sale among collaborators or enforce a remix share |
| 6 | **An on-chain portfolio and reputation** | An ENS name `<game>.games.<parent>.eth` (bundle, entity, payout address), an Arkiv shelf entry, an ERC-8004 identity with the platform's verification attestations, badges | A portable record of "this game was played N times by M people and verified" that is not locked in a platform database |
| 7 | **Sponsor access** | A bounty board: brands fund games to a brief with milestone escrow | Creators otherwise sell to brands one at a time |
| 8 | **Fans keep your game alive** | The lease-based shelf: players extend a game's listing with a tap; unloved games expire from the shelf by themselves | It is curation by use, not by the platform's taste |
| 9 | **Safety and no custody** | The sandbox, review and takedown protect the creator's players; **creator code never touches money**: the SDK has no payment API and the sandbox has no network | Creators carry no payment liability |

## 4. The business model

### 4.1 Revenue engines (6 November 2026; the research and numbers are in [24](24-business-model-and-revenue.md))

The first draft treated $1 passes as the engine and showed they need about 13,000 rooms a day for $10,000 a month. **That conclusion stands, and it is why passes are now the long tail, not the engine.** Researching how Steam, Epic, Fortnite, Roblox, itch.io, Discord, Poki, AirConsole, Jackbox and Twitch earn and pay shows that creator pools are funded by **demand the platform already has**; for us that demand is **sponsors, events and venues** first, subscribers second.

| # | Engine | Price anchor | Platform share | Creator share |
| --- | --- | --- | --- | --- |
| E1 | **Sponsored game commissions** (brand briefs, milestone escrow) | $1,500 reskin, $3,500 campaign, $6,000 custom [V anchors] | 25% | 75%, paid by milestone |
| E2 | **Event packages** (fests, hackathons, corporate) | ₹1,50,000 (about $1,577) [U] | 70% | 30% (pool and bounties) |
| E3 | **Venue plans** | ₹999 Starter, ₹4,999 Pro, or a revenue share of takings | 60% | 40% to the pool |
| E4 | **Funcaster Plus** (one payer unlocks the room) | ₹149 a month [U] | 40% after processing | 60% of net to the pool |
| E5 | **Creator commerce** (passes, cosmetics, tips) | Creator's price | 0% to 10% by the schedule below | The rest |
| E6 | **Sponsored shelf slots** | Auction [U] | 50% | 50% into the pool |
| E7 | Later: analytics and publisher services | [U] | Fee |  |

**Not revenue, on purpose:** wagers (no rake, fee or house position, ever), ads between games, selling creators' data, **cash prizes for in-game performance**.

### 4.2 The commerce fee schedule and why it is credible

| Case | Platform fee |
| --- | --- |
| A creator's **first $1,000** of lifetime commerce revenue | **0%** |
| After that, buyer arrived through the creator's own link or QR | **5%** |
| After that, buyer found the game through the shelf, a venue or a campaign | **10%** |
| Hard cap, frozen per published version | **15%** |
| Venue slot (sale at a console) | 10% to the venue |
| Referral slot (streamer, curator, friend) | 5% to 20%, set by the creator, floor 5% |

A $1 pass at a venue, referred by a streamer at 10%, found on the shelf: **70% creator, 10% platform, 10% venue, 10% streamer**. The cap is still the trust feature: the contract enforces `platformBps <= 1500` and **freezes the split of a published version**. Benchmarks: Epic 0% to $1M then 12%, itch.io 10%, Discord 15% to $1M, Poki 100% / 50% by who brought the player, Steam 30%.

### 4.3 The arithmetic (superseded; see [24](24-business-model-and-revenue.md) section 8)

The first draft's $750 gross a month from 100 rooms (platform $75) is kept only as the **consumer-commerce line**. The researched bottom-up model gives, at **month 12 in the base case, about $19,200 gross billings, about $7,300 a month to the platform and about $11,900 a month to creators** (conservative about $2,100 and $3,100; ambitious about $22,900 and $40,500), with sponsors and events about 80% of the sensitivity and consumer commerce under 3%. All inputs are **[U]**; the pilots in [24](24-business-model-and-revenue.md) section 9 decide.

### 4.4 The cold start (supply and demand)

1. **Paid work first:** the first creators are offered **sponsor-funded commissions and bounties** (a prize for the best two-player game on a theme, a branded reskin for a fest), so supply arrives for money, not hope. First-party games are published **through the creator path** so the path is exercised.
2. **Audience through venues, events and streamers:** every venue console shows the whole shelf, a **Demo Day** puts creators in front of fest crowds, and **streamer referral codes** ([24](24-business-model-and-revenue.md) section 7) bring online players; the **Streamer Network** ([25](25-streamer-network-and-after-hours-economy.md)) adds community-funded custom games and sponsored after-hours seasons as further paid work for creators.
3. **Invite-only first** (the registry is operator-managed today, [CREATOR-PUBLISHING.md](../../../CREATOR-PUBLISHING.md)); **open submission only after** the outside-creator trial (`accept-trial`) is recorded with real evidence, and fixtures are never used as that evidence.
4. **Quality over volume:** a listing needs the three review checks (asset rights, sandbox, playability); the shelf expires unplayed games; charts rank by **verified plays by distinct players**.
5. **A floor for the long tail:** 30% of every pool is shared equally among games that clear a quality bar, because the data shows the top 1,000 Roblox creators take about 82% of payouts and the median Steam game grosses about $318.

### 4.5 Anti-farming (the risk that kills creator pools)

A pro-rata pool rewards fake plays, and every fake play steals from other creators. Controls (reusing [15](15-integrity-and-anti-cheat.md)):

- A game's pool weight counts **distinct humans at distinct venues**, not minutes: ranked-eligible plays only, with the pair weights, account age and per-human caps of [14](14-stats-and-leaderboards.md); booth-verified players weigh more than unverified guests.
- A per-game **share cap** (25% of a period's pool), so one game cannot take it all.
- Creators and their addresses (by cluster) are excluded from their own game's weight.
- The pool root uses the **same close protocol and challenge window** as the Season Vault ([20](20-feature-expansion.md) F-A7): publish, wait, contest, refund the sponsor if contested.
- Wash-purchasing a pass only recycles money minus the platform fee, so passes cannot be farmed for profit; the pool, not the pass, is the attack surface.

## 5. The Arc design: contracts that make it real

The Arc bounty asks for **advanced programmable stablecoin logic** built in Arc Studio, naming **payment splitting** and **conditional escrow with dispute resolution**. The creator economy is those two examples as a product, and the contracts are **reusable** (the bounty gives bonus consideration for that). The pieces share code with the pot, the cheers and the Cup, so this is mostly a generalisation, not new infrastructure.

| Contract (built in Studio) | What it does | Reuses | Advanced logic it shows |
| --- | --- | --- | --- |
| **`RevenueRouter`** | `register(gameId, payees[], bps[])` freezes a version's split (creator, up to four collaborators, a venue slot, a **referral slot (5% to 20%, set by the creator)**, a platform slot, an optional charity; a **per-creator earnings counter gives the 0% band on the first $1,000** and the platform rate is 5% for a creator-brought buyer and 10% otherwise; the platform slot and cap are read from one `Params` contract so a cap breach is impossible); `pay(gameId, venue, kind, authorization)` takes an **EIP-3009 authorization** and **credits** each payee in a pull ledger; `claim()` withdraws. Remix: `parent` and `parentBps` are part of the frozen split. | `SplitPayout` (F-A3, F-A4): **one contract, four uses** (pot cuts on testnet, table cheers, passes, tips) | Payment splitting; deterministic rounding (dust to the creator); pull credits that survive a blocklisted recipient and the drain quirk ([16](16-arc-native-features.md)); gasless claim |
| **`GamePass`** (inside the router) | `PassPaid(gameId, room, until)`; the relay and any console check entitlement by reading the chain, not a database | Start-gate pattern of the stake gate ([21](21-ux-laws-and-os-ux.md)) | Time-bound entitlements as events; free trial window handled off-chain |
| **`CreatorPool`** | A period's pool funded by venue subscriptions and sponsors; a **Merkle root of game weights** from the stats lane's published logs; **challenge window**; per-game cap; linear **vesting**; sponsor refund if contested; **a 30% floor shared equally among games that clear a quality bar, and a 1.5 times weight for new or returning players** ([24](24-business-model-and-revenue.md) section 4.4) | `SeasonVault` (F-A7): same code with shares instead of ranks | Merkle claims against a recomputable root, vesting, dispute window, conditional refund |
| **`BountyEscrow`** | A sponsor funds a bounty with **milestones**: M1 accepted by the review attestation, M2 N verified plays by distinct players within a window; auto-release per milestone; a dispute freezes the unreleased amount and resolves by a **two-of-three** vote (sponsor, creator, an arbiter key), with a timeout that refunds the sponsor | `ConditionalPot` oracle layers (the replay verifier as oracle) | **Conditional escrow with dispute resolution**, oracle-fed release, timeouts |
| **ERC-8004 identity and validation** | A creator and a game register an identity; the verifier agent posts a **validation response** per version ("Verified tier, N replays re-checked, probation passed"); ENSIP-25 links the ENS name | The referee agent ([16](16-arc-native-features.md)) | Agent-attested reputation that other apps can read |

**Bounded powers (a creator-trust rule).** The commerce contracts have **no admin that can move funds**. One **guardian** may **pause one game's payouts for at most 14 days** (an IP or safety dispute), after which the pause lapses on its own; it cannot redirect, withdraw or change a split. This is the minimum needed to respond to a takedown without making the platform a custodian.

**What is honest to say about trust.** The token layer is not trustless (USDC and EURC are upgradeable, pausable and have a blocklist, [03](03-arc-guide.md)); the root of the pool is proposed by the platform and checkable by anyone with the published logs; the arbiter in a bounty dispute is a key. The README states each.

**Gas.** Gas on Arc is paid in USDC; the platform sponsors creator claims (a creator needs no other token), and the cost per action is measured in VA-08 and added to the sponsor float.

## 6. The tiers (what a creator can be, and what each unlocks)

| Tier | What the game is | Sold (pass, tip, cosmetics) | Pool | Ranked boards and Cup | Pots and the market |
| --- | --- | --- | --- | --- | --- |
| **T0 Casual** | A standalone browser game in the sandbox gallery; results self-reported | Yes | No (plays are not observable) | No | No |
| **T1 Party** | SDK game with phones as controllers; the relay hosts the session and observes it | Yes | Yes (observed plays, with the anti-farm weights) | Open board only, labelled unverified | No |
| **T2 Verified** | Deterministic rules checkable by replay; the platform re-runs every match | Yes | Yes | Yes | **After probation** |

**Probation for a Verified game (a market and money safeguard).** A new version's pots and markets stay **off** until it has at least 20 replay-verified matches with at least 5 distinct humans and two independent checker runs agreeing, with the badge "On probation" shown until then. A bug in a creator's rules must not be able to mis-settle a pot or a market; a pot binds the exact `bundle_hash`, so a creator's later update never changes an open pot.

## 7. What the creator platform changes across the product

| Area | The change | Lane / guide | Risk to manage |
| --- | --- | --- | --- |
| **Launcher and Funcaster** | The launcher becomes a storefront: a game page (creator, version, tier, price, plays, verification badge, probation badge, a fork's parent), search, a **Shelf** tab already in Funcaster Live ([21](21-ux-laws-and-os-ux.md)); a **Creator Studio** window (Start menu) and a phone page | UX lane | Hick and Miller: the Shelf must stay five-ish choices per view; filters over a long list |
| **Host flow** | A **pass check in the start gate** next to the stake gate, with the reason shown and **Play the free demo** visible; a venue console never asks for payment from a visitor | 05, 21 | A paywall at the wrong moment kills a party; first two minutes free, never block a joined crowd |
| **SDK and compatibility** | Semver, a deprecation policy, a **conformance suite** (`game:conformance`), a deterministic-rules linter, a local mock of the router, docs per tier; a stable `GameSession` | `docs/SDK.md` | Breaking the SDK breaks every creator; version the SDK and keep two majors |
| **Relay and execution (the biggest engineering item)** | Creator rules for T1/T2 must run on the server and in the replay checker. Today no creator code runs in Node. Running third-party rules needs an **isolated runtime** (a worker or isolate with no I/O, a step and memory budget, a deadline) | server, `core/` | Remote code execution if done carelessly. **Until the sandbox is proven, creators ship T0 and browser-hosted T1; T2 is for first-party games and invited creators** |
| **Stats and ratings** | Boards and ratings are **per game version**; a major version resets ratings; the ruleset hash includes the bundle hash | 14 | Cross-version continuity and cheating by "fresh start" |
| **Market and pots** | Only Verified games after probation; creator opt-in; the verifier agent runs the creator's rules | 10, 11, 03 | A buggy or malicious ruleset mis-settles a pot; the probation, the bundle-hash binding and agree-or-void guard it |
| **Integrity** | New attacks: fake plays for the pool, self-purchase, review bombing, creators boosting their own game, a malicious bundle | 15 | Detectors in [15](15-integrity-and-anti-cheat.md) section 12 extended in VX-12 |
| **Ledger and reality gate** | New categories: pass, pool, tip, bounty; creators see **their own earnings in the Ledger** with the provenance badges; the reality gate gets one real pass and one real claim | 12 | A mock must never pass as real money |
| **ENS** | A creator name per game, a record set, the same resolver-per-name rule; a name for the creator's studio | 02, F-E7 | Squatting, look-alike names; reserved list |
| **Arkiv** | `game` per version, `creator` profile, `bounty` and `review` entities; reviews only from a player with a verified play ("verified play" in place of "verified purchase") | 04, 20 | Review bombing; spam; lease costs |
| **Swarm** | Bundles, covers, patch notes; the platform pays the postage and keeps the bundle alive; a creator may pin their own | 04 | Retention: owner has said it is not a constraint; keeper still required |
| **Security and moderation** | Review checks, sandbox, takedown (`withdraw`), report buttons, age rules, a creator code of conduct, the guardian pause | docs | Review is the **human bottleneck**: automate the checks, publish a review time, never promise instant |
| **Legal and tax** | Creators are sellers: marketplace-facilitator duties, taxes on stablecoin payouts and on the platform fee, creator KYC at a real-value payout, IP and takedown, minors, **no creator-defined stakes** | counsel | Section 9 |
| **Cost and operations** | Sponsor gas, Swarm and Arkiv leases extend with plays, review labour, support; a creator support channel | 08 | Costs scale with creators before revenue does; the venue subscription must fund them |
| **Brand and pitch** | From "a console" to "a platform with a creator economy"; the retro Mumbai identity stays | business plan | Overclaim: only claim what the demo shows |

## 8. The demo and the claims (what to show, what not to say)

**Show (about 90 seconds):** a creator publishes a game (ENS name, Swarm bundle, Arkiv shelf entry, a frozen split on Arc); a host starts a room at a venue console and **pays a $1 play-USDC pass**; a match is played and verified; the same pass appears in the Ledger as **one transaction that credited creator, venue and platform**; the creator taps **Claim** (gasless); a sponsor's bounty releases a milestone on a verified result; the creator pool's Merkle claim pays. Each step has a transaction hash.

**Say honestly:** the money is **play USDC on the Arc testnet**; the creator in the demo is **a first-party game published through the creator path** (the outside-creator trial is a separate, real step that must not be faked); T2 creator games need the sandbox that is not built yet; real-money commerce needs counsel and an audit.

**Do not say:** that creators earn from bets; that the platform is trustless end to end; "verified human" for a booth attestation.

## 9. What needs counsel before any real value

1. Whether passes, tips and pools paid in a stablecoin to creators are treated as ordinary commerce, and the tax and invoicing duties (GST on the platform fee, creator income tax, any withholding on virtual digital assets) for creators in India and abroad.
2. Marketplace-facilitator and consumer rules for a platform that sells others' games.
3. The **online money games** ban ([business-plan.md](../../../../business-plan.md) section 11): the design keeps creator revenue strictly off wagers, forbids creator-defined stakes in the SDK, and keeps the Cup and markets play-money; counsel confirms the line.
4. IP and takedown procedure; minors; content rules.
5. Whether a bounty with a prize is a promotional contest.

## 10. Tasks (lane CP; estimates are mine, for one engineer; they sit in G2 (CP1 to CP5, CP15, CP16) and G4 (the rest except CP21) of the gate plan in [22](22-integration-review.md))

| ID | Task | Depends on | Hours |
| --- | --- | --- | --- |
| CP1 | `RevenueRouter` in Arc Studio (split registry, EIP-3009 `pay`, pull credits, claim, frozen splits, fee cap) and its tests (rounding, dust, blocklisted recipient, drain floor) | A lane, the `SplitPayout` work (FX3) | 14 |
| CP2 | Router wiring: game registration at publish (from the registry's `publish`), `PassPaid` read by the start gate, the venue slot from the console config | CP1, S, registry | 10 |
| CP3 | Pass UX: game page, the start-gate pass row with free demo, the venue-console flow, Ledger rows | CP2, UX lane | 12 |
| CP4 | Creator Studio window and phone page (versions, earnings from chain, gasless claim, review status) | CP1, UX lane | 16 |
| CP5 | One end-to-end first-party publish through the creator path with a frozen split and an on-screen split payout (the demo slice) | CP1 to CP3 | 6 |
| CP6 | `CreatorPool` (from `SeasonVault`): weights from the stats lane, close protocol, challenge window, per-game cap | F-A7, R lane | 16 |
| CP7 | `BountyEscrow` with milestones and two-of-three dispute, bounty board UI | A lane, CP1 | 22 |
| CP8 | ERC-8004 identity and validation attestations per version; ENSIP-25 link | referee agent | 10 |
| CP9 | Tiers and probation logic in the relay and the market gate; badges | K, R, M lanes | 12 |
| CP10 | SDK conformance suite, deterministic-rules linter, local router mock, docs per tier | SDK | 20 |
| CP11 | The isolated runtime for creator rules (worker or isolate, budgets, no I/O) and its adversarial tests | server | 40 |
| CP12 | Anti-farm detectors and tests for the pool, the shelf and reviews (VX-12) | I lane | 12 |
| CP13 | Remix lineage (`parent`, `parentBps`) in the router and the shelf | CP1, K | 8 |
| CP14 | Tip button and cosmetics on the router | CP1 | 6 |
| CP15 | Router fee schedule: the free first-$1,000 band, creator-brought rate, venue and referral slots with floor and cap ([24](24-business-model-and-revenue.md) section 4.3) | CP1 | 8 |
| CP16 | Referral and attribution: codes and links for streamers, curators and creators; the QR carries the code | CP15, S | 8 |
| CP17 | Sponsored commission flow: brief, applications, milestone escrow, delivery check, plays report | CP7 | 14 |
| CP18 | Stream Mode: overlay page, join QR and link, spectate and play-along, stake-free | UX lane | 12 |
| CP19 | Creator analytics: plays, venues, retention, drop-off, earnings by source | CP4 | 12 |
| CP20 | Showcase and curation: featured slots earned by verified plays, curator codes, Demo Day page | CP6 | 10 |
| CP21 | Plans and billing after the event: INR gateway for venue and Plus plans, invoices, tax fields | none | 20 |

About **268 hours** in all before the event (CP1 to CP20) plus **20 hours of billing after it** (CP21); **CP1 to CP5 plus CP15 and CP16 (about 74 hours) is the creator commerce slice** that earns the Arc bounty's payment-splitting example and is the G2 addition; CP17 to CP20 are in G4. CP11 is the largest and is the real gate for opening Verified-tier submission to outsiders; it is not needed for the demo.

## 11. Verification items (added to [19](19-verification-and-fix-protocol.md))

VA-13 (router: rounding, dust, blocklisted payee, drain floor, frozen split, fee cap), VA-14 (pool: root reproducible from the logs, challenge window, per-game cap, vesting), VA-15 (bounty: milestone release, dispute freeze, two-of-three, timeout refund), VX-11 (the creator end-to-end: publish, pass, play, split, claim, with zero extra signatures for the host and none for the creator beyond the claim tap), VX-12 (fraud: fake plays for the pool, self-purchase, review bombing, a malicious bundle in the sandbox).

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| No supply, or supply with no audience | Sponsor bounties and a jam for supply; venues and events for demand; invite-only first |
| Pool gaming | Section 4.5; the challenge window; the share cap; booth-verified weights |
| Running creator code on the server | Section 7 (the isolated runtime); T0 and browser-hosted T1 until proven |
| Platform cut resented | 0% on the first $1,000, 5% or 10% after, 15% hard cap, frozen per version, public |
| Creator revenue mistaken for gambling revenue | The two-rails rule; no stake share to creators; no creator-defined stakes; counsel |
| Review bottleneck | Automated checks first, published review times, a deposit refundable on pass to deter spam |
| Over-building before the demo | Only CP1 to CP5, CP15 and CP16 are in the event gate; the rest is G4 or after |
| A thin economy at small scale (section 4.3) | Say so; lead with sponsors, events and venues; test the three assumptions that matter in the eight-week pilots ([24](24-business-model-and-revenue.md) section 9); measure creator earnings before promising anything |
