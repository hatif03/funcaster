# Startup plan 02: the business plan for Funcaster Studio, the indie growth layer (6 November 2026)

Part of the [startup plan](README.md). Status: business plan, working draft, 6 November 2026. It rests on the research in [01](01-research-microtransactions-and-loot-boxes.md) (tags **[P]**, **[S]**, **[U]** are defined there) and builds on [business-plan.md](../../../business-plan.md) and [guides 23 to 25](../web3/build-guide/23-creator-platform-and-economy.md). **Every revenue figure is illustrative arithmetic on stated assumptions. Nothing here is legal or tax advice.** "Funcaster Studio" is a working name for the creator-facing layer; the console keeps its name.

## 1. The business in one paragraph

Funcaster Studio helps hobbyist and indie game developers **find players** and **earn from them** without changing their game. We put their game on a shared-screen shelf that is played in cafés, colleges, events and living rooms with phones as controllers; we give them a **fair store** (tips, cosmetics, passes, and later optional randomised drops) that is priced in rupees, cannot affect gameplay and follows an explicit fairness standard; and we pay them **instantly and transparently**, with the settlement and the proof of fairness running on Arc and their identity on ENS, none of which a player ever has to know. We charge nothing on a creator's first $1,000, a small share after that, and make our real money from sponsors, events and venues, who are also the source of the audience.

**The promise to a developer, in four lines:** *Keep your art. Keep your game. We find the players. You choose what to sell, and we make it safe, fair and instant.*

## 2. What I took from the existing business plan, and what changes

### 2.1 Kept as is

| Existing decision | Source | Why it still holds after the research |
| --- | --- | --- |
| **Sponsors, events and venues are the engine; consumer commerce is the long tail** | [guide 24](../web3/build-guide/24-business-model-and-revenue.md) section 8 (about 80% of revenue sensitivity is sponsors and events; consumer commerce under 3%) | The new arithmetic ([01](01-research-microtransactions-and-loot-boxes.md) section 2.2) says the same: a store earns only in proportion to an audience |
| **Two rails that never mix** (commerce pays creators; play-money pots and markets never do) | [business-plan.md](../../../business-plan.md) section 14 | Becomes **three rails** (section 9) once randomised items exist |
| **Tiered fee, hard cap 15%, frozen per version; 0% on the first $1,000** | [guide 24](../web3/build-guide/24-business-model-and-revenue.md) section 4.3 | Competitive with every sell-direct provider; the free band is the trust signal |
| **No virtual coin economy; coins last, non-redeemable** | [business-plan.md](../../../business-plan.md) sections 6 and 8 | Strengthened: **no virtual currency at all** (principle 2 in [01](01-research-microtransactions-and-loot-boxes.md) section 11) |
| **Streaming is discovery, not a coin economy; YouTube first for India** | [guide 24](../web3/build-guide/24-business-model-and-revenue.md) section 7 | Supported by wishlist data: creators are the top source of players above 10,000 wishlists [S] |
| **Invite-only until an outside creator completes the trial** | [docs/CREATOR-PUBLISHING.md](../../CREATOR-PUBLISHING.md) | Still unrecorded; it is the first gate of the 16-week plan |
| **Pilot gates decide, not documents** | [guide 24](../web3/build-guide/24-business-model-and-revenue.md) section 9 | Reused in [03](03-sixteen-week-plan.md) |

### 2.2 Gaps this plan fills

| Gap in the existing plan | Why it matters now |
| --- | --- |
| **Nothing says how a random reward would be made safe.** Guides 23 and 24 sell passes, tips and cosmetics; randomness is not designed | The owner wants loot boxes; the research shows they are the legally heaviest feature ([01](01-research-microtransactions-and-loot-boxes.md) section 4). Needs a standard, a staging plan and a counsel gate (section 5) |
| **No India payment rail.** The plan assumes Arc payouts and defers an "INR gateway" to CP21 (20 hours, after the event) | UPI is the rail for ₹9 to ₹99 purchases and is cheap to collect (zero MDR to ₹2,000 [P]). Rupee collection moves from "after the event" to the **first month** |
| **Creator payouts in USDC were treated as an advantage everywhere.** Indian tax treatment (30% VDA tax on selling, 1% TDS, doubtful GST export status [S]) was not considered | Default Indian creators to rupee payouts; offer USDC claims to international creators and to Indians who ask, once an accountant has signed off |
| **No creator-acquisition engine** beyond "invite-only" and a Demo Day | Distribution is the thing the median indie lacks ([01](01-research-microtransactions-and-loot-boxes.md) section 2.1). Section 4.1 makes it the first product |
| **No minors strategy outside stakes** | A party console is played by families and teenagers. Brazil bans boxes for minors; India's parental-consent rule starts 13 May 2027 [P]. Section 5 sets defaults |
| **The plan is hackathon-shaped.** Gates run to 6 November | [03](03-sixteen-week-plan.md) is the first post-event plan |

### 2.3 Where this plan overrides, and where it does not

[business-plan.md](../../../business-plan.md) says it wins on business direction. This plan **adds** (a) the Fair Store and Fair Crate Standard to commerce engine E5, (b) a rupee payment rail ahead of CP21, (c) the third rail, and (d) the distribution programme. It **does not change** the fee schedule, the stakes rules (no rake, friend rooms, play money at events) or the Twitch rule. A pointer is added as section 16 of that file.

## 3. The customer and what they need

**Primary customer: the hobbyist or indie game maker.** Student teams and jam winners, solo developers with a web or Unity WebGL game, small studios in India first (GDAI's cohort programme, college game clubs, itch.io HTML5 developers, Tryb creators). They make games because they love them. Their problems, from the research:

| Problem | Evidence | What we do |
| --- | --- | --- |
| Nobody finds the game | 24,513 Steam releases in 2026 so far; median first-quarter release grosses about $290 [S] | A physical, social audience and a launch package (section 4.1) |
| Monetisation feels like selling out, and is legally risky | Loot box regulation across at least 10 jurisdictions; FTC and EU action [P/S] | A store that is cosmetic-only, game-blind, rupee-priced and compliant by default (sections 4.2 to 4.4) |
| Payment infrastructure is built for studios with traction | Fixed fees of $0.50 or more make ₹49 sales impossible [S] | UPI rails, 0% on the first $1,000, no fixed fee beyond gateway cost |
| Payouts are slow and have minimums | Steam $100 and about 30 days; Discord $100 and 45 days [S] | Instant, no-minimum payouts (section 4.5) |
| They lose the player relationship to stores | Bain: about half of gamers buy direct; three quarters of top mobile games have web stores [S] | Creators see their players and earnings; export is always available |

**Secondary customers** (they pay, and bring the audience): sponsors and brands, event organisers, venues, streamers ([guide 24](../web3/build-guide/24-business-model-and-revenue.md) section 4.1). **Players** are not charged for access.

### The Art-First Charter (published to creators)

1. Your game is never changed, reskinned or re-skinned by us. Items are layered on by a **skin layer the game's rules cannot read**.
2. You decide what is for sale, its art, its name and its price within the fairness bounds. You can turn any item or the whole store off.
3. Nothing sold can affect gameplay, progress or ranking.
4. Your fee schedule is public and frozen per published version; the first $1,000 of lifetime sales is fee-free.
5. You can leave with your player records and your studio name.
6. You will never be pushed toward randomised paid items; we earn the same on a direct sale as on a crate (principle 7, [01](01-research-microtransactions-and-loot-boxes.md) section 11).

## 4. The product: four parts

```
        AUDIENCE                 FAIR STORE                PAYOUTS               IDENTITY
  (Shelf, Rooms, Streams)   (tips, cosmetics, pass,   (INR by default,      (ENS names for
   what the median indie     optional Fair Drops/      USDC on Arc on        studio, game,
   cannot buy                 Fair Crates; ₹ prices)    request; instant)     referral codes)
            \                      |                       /                    /
             \---------- the game's rules never see any of it ------------------/
```

### 4.1 Audience: the distribution programme

| Channel | What it is | Existing building blocks | New work |
| --- | --- | --- | --- |
| **The Shelf** | The lobby and "play next" row show games ranked by **verified plays by distinct players**, with a boost for new creators (Fortnite's new-player logic, [guide 24](../web3/build-guide/24-business-model-and-revenue.md) section 2.1); no paid placement in year one | Catalogue, manifest, results records | Chart, new-creator boost, play-next row (CP20) |
| **Rooms: Console Nights** | A weekly spotlight night at cafés, college clubs and coworking spaces; each night features three games; venues earn a 10% slot on sales at their console | Venue plan thinking ([guide 24](../web3/build-guide/24-business-model-and-revenue.md) E3), console shell | A kit (setup card, staff script, QR posters), venue sign-up, per-venue analytics |
| **Streams** | YouTube-first small creators get a code and a stream mode; a stream-ready badge for games that join in under 20 seconds; **demo-as-creator-unlock** released to small creators first | Stream Mode (CP18), referral (CP16) | Outreach list, onboarding, 5 then 10 streamers |
| **Social loops** | Recap card with a QR after every match; "challenge a friend" links; WhatsApp-first sharing | Recap-card spec in [guide 20](../web3/build-guide/20-feature-expansion.md) | Build and measure join rate from cards |
| **Launch Week** | Per creator: a five-console, three-venue, two-evening run plus three streamer codes, a store set-up and a data report. Sponsor-funded for the first cohort | All of the above | The package, a checklist and a report template |
| **Events and jams** | College fests and hackathons run **sponsor-funded bounties** (guide 24 E1, E2); jams recruit creators and fund the shelf | Bounty design in [guide 23](../web3/build-guide/23-creator-platform-and-economy.md) | Two jams in the 16 weeks |
| **Graduation kit** (later) | Help a game that outgrows us to prepare a Steam, itch or mobile launch: demo as creator unlock, wishlist page, Next Fest checklist; apply to KIGI, LVL Zero, Lumikai | None | A checklist only, in this plan |

**Rule: nobody pays for placement and nobody pays to play.** Venue and streamer shares come only from sales.

### 4.2 The monetisation ladder (what a creator can switch on, and when)

| Tier | What | Randomness | Legal and reputational exposure | Available |
| --- | --- | --- | --- | --- |
| **0 Supporter** | Tip jar, "thank you" name on the credits, an ENS-backed supporter badge (non-transferable) | None | Lowest. Tips and access fees are the category the Indian Act expressly allows [P] | Weeks 3 to 6 |
| **1 Direct-buy cosmetics** | Skins, trails, avatars, themes, sound packs at ₹9 to ₹199, each with a preview and a rupee price | None | Low. Consumer-law basics (price, refund, tax) | Weeks 5 to 8 |
| **2 Pass or season** | A time-boxed pass: a track of cosmetics for ₹49 to ₹149; a room pass for hosts | None | Low to medium (subscription and renewal rules; no auto-renew in v1) | Weeks 9 to 12 |
| **3a Fair Drops** | **Free** randomised cosmetic rewards earned by playing, same odds engine, same receipts | Yes, but **no payment** | Low: no money is staked or spent | Weeks 6 to 10 (build early to test the engine) |
| **3b Fair Crates** | **Paid** randomised cosmetics under the Fair Crate Standard (section 5) | Yes, paid | **Highest.** Counsel opinion required; adults only; geo-gated | Weeks 11 to 14 **only if** counsel and data allow; otherwise stays at 3a |
| **Never** | Virtual currency; transferable or sellable items; items that affect play; randomised items for minors; crates for Bits or any stream surface; real-money prizes for performance; rake on stakes | | | Not built |

This staging **gives the owner the loot boxes, in the order that lets the business survive them**: the fairness engine is built and used in public (3a) for weeks before any rupee is risked on it (3b), and 3b ships only with an opinion in hand.

### 4.3 What the developer does, and what we do

A developer adds one file. The store, the safety layer, checkout, receipts and payouts are ours.

```json
{
  "store": "my-game/store.json",
  "currency": "INR",
  "items": [
    { "id": "gold-trail", "type": "cosmetic", "slot": "trail", "name": "Gold trail", "price": 29, "art": "art/gold-trail.png" },
    { "id": "night-skin", "type": "cosmetic", "slot": "skin", "name": "Night skin", "price": 49, "art": "art/night-skin.png" }
  ],
  "tips": { "enabled": true, "presets": [10, 25, 50] },
  "drops": { "enabled": true, "earnedAfterMatches": 5, "pool": ["gold-trail", "night-skin"] },
  "crates": { "enabled": false }
}
```

| The developer | Funcaster |
| --- | --- |
| Draws the art, names and prices the items, writes the manifest | Hosts the store UI on phone and TV, handles UPI checkout, refunds, receipts, tax invoices |
| Chooses which tiers to switch on | Enforces the ladder: crates cannot be enabled without the standard's checks passing |
| Keeps the game logic untouched | Applies items through a **skin layer**; the SDK gives the game rules no ownership information and no payment API (extends the rule in [guide 23](../web3/build-guide/23-creator-platform-and-economy.md) section 3, item 9) |
| Reads the dashboard | Shows plays, payers, earnings, **top-1% revenue share** and safety flags; pays out |

### 4.4 The compliance work we take off their hands

Odds panel, price in rupees, spend meter and limits, age gate and consent screen, undo and refund window, geo-flags, dated archive of every draw table, takedown and grievance contacts, DPDP-ready consent logging, and a page they can show a regulator or a platform reviewer. This is the part indie developers least want to do and most need; **it is the product that makes loot boxes possible for a hobbyist**.

### 4.5 Payouts

| Creator | Default | Option | Notes |
| --- | --- | --- | --- |
| **India** | Rupee payout by bank transfer or UPI, weekly in v1, no minimum after the first ₹500 hold [U] | USDC claim on Arc after an accountant has signed off the tax route | Avoids the VDA, TDS and GST-export problems of receiving USDC [S] |
| **International** | USDC on Arc, claim any amount at any time, gasless | Bank payout later | The "no minimum, no wait" claim is our differentiator against Steam, Discord, CrazyGames and Roblox minimums |
| **Collaborators, venues, streamers** | Split in the same payment through the frozen splitter (RevenueRouter, up to six payees) | | Already built and MOCK-verified on `web3/integrations` |

### 4.6 Identity

A **studio name** and a **game name** under the Funcaster parent, with records for the payout address, the store manifest hash and licence; **referral codes** as names whose address record is where a streamer's share goes; and a **non-transferable supporter badge**. Section 6 explains the ENS economics, including why per-fan names are not minted on L1 by default.

## 5. The Fair Crate Standard (the rules for any randomised item)

Applies to **3a Fair Drops** (free) and **3b Fair Crates** (paid). Each rule is a tested requirement, and the SDK refuses to enable crates if one fails.

| # | Rule | Why (from [01](01-research-microtransactions-and-loot-boxes.md)) |
| --- | --- | --- |
| F1 | **Cosmetic only.** No effect on stats, progress, ranking or access; never required to finish the game | Pay-to-win is among the most common harmful features; Indian "skill-development / recreation" framing |
| F2 | **Non-transferable, non-redeemable, no cash value, no market.** Funcaster never lists or brokers items | Convertibility is the line in India, France, Austria and New York v. Valve |
| F3 | **Rupee price shown**; **no virtual currency** | Indian "other stakes" definition; EU principle; FTC Genshin order |
| F4 | **A direct-buy price exists for every item** in a crate, always visible beside the crate | FTC Genshin order requires a direct real-money option; Rocket League's Blueprints |
| F5 | **Odds shown before the buy button**, as real numbers per item, from the same table the server draws from; a dated copy of every table is archived | Apple 3.1.1 and Google Play rules; honour-system compliance is about 10% in the Netherlands [P/S] |
| F6 | **Exhaustible pools.** Draws are without replacement from a finite series: buy N crates and you have everything; the screen states the **maximum total cost** | The academic proposal for a built-in cap [P abstract]; replaces hidden pity timers, which can prolong spending |
| F7 | **Equal odds within a tier, at most three tiers, tier odds disclosed** | Reduces reward complexity [P abstract] |
| F8 | **Default spend limits** (starting suggestion ₹300 a day and ₹1,500 a month [U]); a player can lower them freely and raise them only after an adult confirmation and a 24-hour delay | MediaNama's 2026 suggestions (cumulative spend display, limits) [S]; harm meta-analysis |
| F9 | **Undo and refund:** confirm step, 15-minute undo, 24-hour refund for accidental purchases, no purchase on wake or load | Epic's $520 million order was mainly about this [P] |
| F10 | **No urgency, no near-miss theatre:** no countdown timers or "last chance", calm reveal animation | FTC Genshin complaint named urgency and suspenseful animations [P] |
| F11 | **Adults only for paid crates (18+), off by default for anyone who has not confirmed**; **off in Brazil and Belgium**, and anywhere counsel says | Brazil Art. 20, Belgium; India DPDP Rule 10 from 13 May 2027 [P] |
| F12 | **Same take rate on a crate as on a direct sale** | No incentive for us to push randomness |
| F13 | **Never on a stream surface, never for Bits, never stakeable.** No item or drop can be wagered in a pot, market or cheer | Twitch policy; Indian Act; the stakes rules in [08](../web3/08-stakes-product-and-legal.md) |
| F14 | **Publish a fairness report:** payer count, share of revenue from the top 1% and top 5% of payers, refund rate; flag a creator above a threshold (starting at 40% from the top 1% [U]) | Turns the research finding into a dashboard |

### 5.1 Verifiable draws (the Arc-backed part)

1. **Before the series opens:** the draw table (items, odds, series size) is hashed; the hash and the series ID are written on Arc.
2. **At each purchase:** the server commits `hash(serverSeed)` and a future Arc block number; after that block, the draw seed is `hash(serverSeed ‖ block randomness ‖ draw ID)`; the item is the weighted pick without replacement; the receipt shows the commitment, table hash, block and outcome.
3. **Daily:** a Merkle root of all receipts is anchored on Arc through the Memo pattern already designed in [guide 16](../web3/build-guide/16-arc-native-features.md) section 5 (about $0.001 to $0.002 a transaction on testnet; confirm on mainnet).
4. **A "verify my draw" page** recomputes the draw in the player's browser.

**What this does and does not prove.** It proves the operator could not have chosen your item after seeing the randomness, nor changed the odds after sales opened. It does **not** make a random reward less compelling, and it does not replace F6 to F11. We say that on the page.

### 5.2 Worked example: what an exhaustible crate does to spend

Series of 10 cosmetics, crate price ₹29, drawn without replacement, direct-buy price ₹99 per item (illustrative [U]).

| Quantity | Value |
| --- | --- |
| Maximum a player can spend on the series | 10 crates × ₹29 = **₹290** (all ten items) |
| Expected spend to land one specific item by crates only | (10 + 1) ÷ 2 = 5.5 crates = about **₹160** |
| Cost to skip the lottery for that item | ₹99 (direct buy) |
| A classic crate with replacement and a 1% rare item | Expected 100 crates, **₹2,900**, with no ceiling |

The trade-off is plain: **the revenue ceiling per payer per series drops from unbounded to ₹290.** The research says high spenders are where the revenue is (top 5% of payers about 48% of revenue, above 70% in whale-driven games [S]) and Brawl Stars lost about 14% when it removed boxes entirely [S]. We accept a lower ceiling on purpose, and the plan's economics do not depend on whales (section 6).

## 6. Arc and ENS: how they are used, and the honest limits

### 6.1 Arc

| Use | What it does for the business | Honest limit | Milestone |
| --- | --- | --- | --- |
| **RevenueRouter payouts** | One payment is split among creator, collaborators, venue, referrer and platform; the creator claims any amount, any time, gasless | Needs deployment and public acceptance (pending); India defaults to rupees (section 4.5) | Mainnet capped test in month 1; first creator USDC claim in month 3 |
| **Odds anchoring** | A public, cheap, tamper-evident record of tables and receipts (section 5.1) | Proves non-tampering, not harm reduction; Arc is a permissioned-validator chain and its stablecoins are upgradeable and blocklist-capable ([guide 16](../web3/build-guide/16-arc-native-features.md)) | Earned-drop anchoring live in month 2 |
| **Sponsor escrow** (BountyEscrow, pay-per-verified-play) | Sponsors pay on verified plays by distinct humans, which is what makes sponsor budgets trustworthy | Review labour and an arbiter key | After the first paid commission (month 3 or later) |
| **Nanopayments** | Gasless sub-cent USDC through Gateway, x402 | Built for pay-per-request; not needed for UPI-priced items | Explore only after month 4 |
| **Funding** | Circle Developer Grants: milestone-based USDC, co-marketing, guidance, for products where Arc is core to value flow or settlement [P] | The criteria for a games product are untested | Apply in week 4 with the month-1 live evidence |

### 6.2 ENS

| Use | What it does for the business | Honest limit | Milestone |
| --- | --- | --- | --- |
| **Studio and game names** (`studio.funcaster.eth`, `game.studio.funcaster.eth`) | Portable identity with records for payout address, store manifest hash and licence; a creator can leave with the name | The parent must stay renewed; ENSv2 is 11 days old on mainnet and its contracts have changed repeatedly | Namespace live on mainnet in month 1 |
| **Referral codes as names** | A streamer's code resolves to the address that receives their share; verifiable and portable | Few streamers care about a name; keep the code a plain string in the UI | Month 2 |
| **Supporter badges** | A non-transferable, optionally expiring name for a ₹49 supporter | **Minting one per fan on L1 may cost more than the item sells for.** Test mainnet gas first; default to off-chain or L2 issuance (Namespace-style) for fans and keep L1 for studios, games and referrers (hundreds, not millions) | Gas test in month 1; decide in month 2 |
| **Player handles** (`asha.players.funcaster.eth`) | A portable name across consoles | Same gas question; local handle exists already | Month 3 |
| **Grants** | ENS Foundation grants expected to resume in Q1 2027 [S] | New framework, unknown criteria | Application in the first window |
| **Vendor risk** | NameStone's API was sunset and its subnames migrated [S] | A reminder to keep exports and not depend on one issuer | Keep a plain-file export of every name and record |

**No NFTs, no tokens, no wallet, no "own your item" in any player-facing screen.** The words *Arc*, *ENS*, *chain* and *USDC* appear only on the creator dashboard's "proof" tab and in the docs.

## 7. The business model

### 7.1 What the creator pays

| Case | Fee | Notes |
| --- | --- | --- |
| First $1,000 (about ₹95,000) of a creator's lifetime commerce revenue | **0%** | Per creator across games and versions [guide 24 §4.3] |
| After that, buyer came through the creator's own link or QR | **5%** | |
| After that, buyer came through the shelf, a venue or a campaign | **10%** | |
| Hard cap, frozen per published version | **15%** | |
| Venue slot | 10% to the venue | Taken from the sale, shown in the split |
| Referral slot (streamer, curator, friend) | 5% to 20%, set by the creator | |
| Payment gateway | **Passed through at cost** (UPI via Razorpay about 2.36% including GST [P]) | We add no fixed fee |
| Crates | **Same rates as direct sales** (F12) | |
| Sponsored commissions | Platform keeps 25% | [guide 24 E1] |

### 7.2 What a creator keeps from ₹100 of sales

| Platform | Creator keeps | Tag |
| --- | --- | --- |
| Funcaster, inside the free band | **₹97.64** (gateway only) | [P] gateway rate; our 0% |
| Funcaster, own link, after the band | **₹92.64** (5% + gateway) | |
| Funcaster, found on the shelf, after the band | **₹87.64** (10% + gateway) | |
| itch.io (default 10%, seller can change it) | ₹90 before processing; about ₹87 after a processor's roughly 3% | [P] [business-plan.md](../../../business-plan.md) section 7 |
| Appcharge-style sell-direct provider | about ₹95 to ₹96 before processing, if the provider will take a hobbyist at all | [S] "4 to 5%"; not published |
| Provider charging 5% + $0.50 | **less than nothing** on a ₹49 sale; about ₹47.50 on a ₹100 sale before processing | [S] arithmetic: $0.50 is about ₹47.5 |
| App stores | 70% to 85% | [S] |

### 7.3 What it is worth to a creator (illustrative)

From [01](01-research-microtransactions-and-loot-boxes.md) section 2.2: **5,000 monthly players at 2% paying ₹200 a month is about ₹20,000 a month gross.** The creator pays Funcaster nothing for the first ₹95,000 of lifetime sales, about five months at that rate. **Most indie creators will never pay us a rupee**, which is what makes the promise credible and is why section 7.4 matters.

### 7.4 What the company earns, in order of importance

| # | Revenue | Basis | In the first 16 weeks |
| --- | --- | --- | --- |
| 1 | **Sponsored commissions and bounties** (25% platform share) | $1,500 / $3,500 / $6,000 anchors [V], [guide 24](../web3/build-guide/24-business-model-and-revenue.md) | Target: 1 paid commission or 2 letters of intent |
| 2 | **Event packages** (₹1,50,000, 70% platform share) | College fest season, October to March | Target: 1 event |
| 3 | **Venue plans** (₹999 a month Starter, or a revenue share) | TouchTunes-style share removes risk | Target: 4 of 10 pilot venues agree to pay |
| 4 | **Funcaster Plus** (₹149 a month, one payer unlocks a room) | AirConsole-style | Pilot only if venues pass |
| 5 | **Creator commerce fee** (5% or 10% after the free band) | Section 7.1 | **About zero by design** |
| 6 | Later: shelf sponsorship, analytics, publisher services | | Not in scope |

**Scale check on the store.** If Funcaster reached 40 live games averaging 5,000 monthly players, that is 200,000 players, about 4,000 payers and about ₹8,00,000 a month of gross sales (about $8,400 [U]); at an average 7.5% fee after the free bands, the platform keeps about ₹60,000 a month (about $630). **The Fair Store is a trust and retention product long before it is an income line**, and the company's income comes from the demand side. That is the honest answer to "how do we make money from helping indies": we make it from the people who pay to reach the audience the indies build.

### 7.5 The ethics-versus-revenue trade-off, stated once

| Design choice | Effect on creator revenue | Why we choose it |
| --- | --- | --- |
| Exhaustible crates instead of replacement | Lower ceiling per payer (₹290 against unbounded) | Removes the unbounded tail where harm and regulatory risk sit |
| Default spend limits and 24-hour delay to raise | Fewer impulse purchases from the highest spenders | The top 5% of payers carry 48 to 81% of revenue [S]; this is where the harm and the headlines are |
| No virtual currency | Loses the "currency breakage" revenue and obfuscation | Required by the Indian definition, the EU and the FTC order |
| No urgency, no resale market | Lower conversion on limited-time offers | Epic, Genshin and Valve cases |
| **Net** | A lower revenue ceiling, and a product a hobbyist can ship and defend | The audience, not the whale, is the constraint for an indie ([01](01-research-microtransactions-and-loot-boxes.md) section 2.2) |

## 8. Market and competition

| Segment | Players | What they do | Our position |
| --- | --- | --- | --- |
| Sell-direct infrastructure | Appcharge, Stash, Aghanim, Xsolla, Tebex, Coda, Paddle | Web stores and merchant-of-record for mobile publishers; 4 to 7% plus fixed fees; Appcharge at $1 billion annualised volume [P] | We serve the creators they will not: tiny prices, UPI, India, no minimum traction; we add the audience |
| Audience portals | Steam, itch.io, Poki, CrazyGames, Epic | Distribution; monetisation is light or store-fee-heavy | We offer a **physical shared-screen audience** none of them has |
| Shared-screen platforms | AirConsole, Jackbox | Subscription pool; phones as controllers; living-room focus | We add venues, India, creators' own stores and instant payouts |
| Community arcades | Streamer Arcade (streamercade.live), Livecade, ChatArcade, Crowd Control | Services-led or free chat games | We compete on creators and money rails ([guide 25](../web3/build-guide/25-streamer-network-and-after-hours-economy.md)) |
| India creators | Tryb (student multiplayer mini-games; 43 participants in one challenge [S]) | Phone social feed | Direct rival for **student creators**; we offer a shared screen and a store |
| Platform threats | Discord Activities (15% fee), YouTube Playables (no purchases) | In-app games | Treat Discord as a channel, not an enemy |

**The defensible edge is not the store.** A store is easy to copy. The edge is the **combination**: a room full of people with phones, a catalogue that rewards new creators, rupee-priced micro-purchases that cost 2.36% to collect, instant payouts and an odds record anyone can audit.

## 9. The three rails (extends the "two rails" rule)

| Rail | What | Value | May pay creators? |
| --- | --- | --- | --- |
| **Commerce** | Tips, cosmetics, passes, sponsor commissions, venue plans | Real rupees; USDC on request | Yes |
| **Randomness** | Fair Drops (free) and Fair Crates (paid, later) | Cosmetic items with no cash value | Revenue from a crate is commerce revenue; the **item** is never value |
| **Play** | Pots, markets, cheers, the Cup | Testnet play money at events | **Never**; wagers never pay a creator |

No item can be staked, no stake can buy an item, and a crate never appears in a pot, market or cheer.

## 10. Risks, gates and kill criteria

| Risk | Likelihood and effect | Mitigation | Kill or pivot trigger |
| --- | --- | --- | --- |
| **India treats paid randomised cosmetics as an online money game** | Unknown; highest-impact (criminal exposure: up to 3 years and ₹1 crore for offering one [P]) | Counsel opinion before 3b; ladder stops at 3a; F2 and F3 | If counsel says no or "not sure", **3b is dropped** and the business is unchanged |
| No outside creator completes the trial | Medium | Recruit 10; run a jam; pay a first commission | Fewer than 5 of 10 invited publish within a month: fix SDK and templates before anything else |
| Creators publish but nobody plays | **High** (distribution is the hard part) | The audience engine is the first product; measure verified plays | Fewer than 100 distinct players per game per month after Launch Week for most games: pivot spend from store to events |
| Payers do not appear | Medium | Start with tips and ₹9 to ₹29 cosmetics; test pricing | Fewer than 1% of players buy anything after week 10: keep the store but stop building more of it |
| Payment collection and tax complexity (GST, TDS on e-commerce participants, seller-of-record) | Medium; delays | Engage a chartered accountant in week 1; use a licensed gateway; start with small volume | If seller-of-record duties are blocking, sell through creators' own gateway accounts first |
| Minors | Medium | Defaults in F8, F11; no crates unconfirmed; DPDP consent flow by April | Any complaint of a minor's purchase: pause crates, refund, review |
| Arc or ENS instability (young mainnets, changing contracts) | Medium | Config, not constants; keep plain-file exports; MOCK fallback for the UI | A security incident or paused token: payouts fall back to rupees |
| Reputation: "loot boxes" read as predatory | Medium | The Charter, the standard, the fairness report, plain wording | Public criticism from creators in the first cohort: slow down, publish the response |
| **Over-building** before audience | **High**, because the team can build quickly | The 16-week plan puts audience metrics first | If gate B ([03](03-sixteen-week-plan.md)) fails, build stops except for fixes |

**Two of three core tests must pass** (as in [guide 24](../web3/build-guide/24-business-model-and-revenue.md) section 9): venues (at least 4 of 10 pay), sponsors (2 paid or letters of intent) and creator earnings (5 earn ₹5,000 or more in 60 days [U], lowered from the guide's $100 to fit a first cohort in India). If two fail, pivot to events and commissions only.

## 11. Funding path

| Source | Amount | Fit | When | What to show |
| --- | --- | --- | --- | --- |
| **Circle Developer Grants** | Milestone USDC [P] | Payments, splits, escrow on Arc | Apply week 4 | A mainnet payout, the router, the odds anchor |
| **Lumikai Pixels** | Up to $500,000 day-zero; up to $2 million seed [P] | A platform company in an interactive-media thesis | Apply weeks 4 to 6 | Creator list, first Launch Week data, the fair-store product |
| **ENS Foundation grants** | Not yet defined; expected Q1 2027 [S] | Studio, game and referral names as an open-source pattern | First window | A live mainnet namespace and a public write-up |
| **Arc Microgrants (round two)** | 500 USDC each last time [P] | Small, a good milestone | Watch | A working mainnet project |
| **Tech Triumph (IEIC, Ministry of Information and Broadcasting, WinZO)** | Investment and mentorship [S] | Explicitly open to payments and monetisation startups | Watch for the next season | Traction numbers |
| **Studio programmes (Krafton KIGI, LVL Zero, GDAI Supernova)** | $50,000 to $150,000; $10,000; none [S/P] | **For our creators, not for us** (GDAI excludes tool startups [P]) | Ongoing | A "help your studio apply" service |
| **ETHGlobal prizes** | Per result | Already earned or not | After results | n/a |

The company should be able to run the 16 weeks on grants, prizes, sponsor and event revenue and founders' time, with a Lumikai conversation as the first outside-capital step.

## 12. Decisions needed from the owner (with the recommended answer)

| # | Decision | Recommendation | Why |
| --- | --- | --- | --- |
| D1 | **Scope fork:** (a) Funcaster-native games only, or (b) a platform-agnostic store for any web or mobile game | **(a) for the 16 weeks**, with the store built as an embeddable module so (b) is possible later | (b) competes head-on with companies that have raised $89 million; (a) is where our audience advantage exists |
| D2 | **Merge policy:** the creator commerce slice lives on `web3/integrations`; a real business needs the non-chain store and checkout on `main` | Build the **rupee store, odds engine and safety layer on `main` behind flags** (they need no chain); keep Arc and ENS code on `web3/integrations` until you approve a merge | Keeps the product shippable and honours the standing rule that web3 is never merged without you |
| D3 | **Who collects the money:** which entity, and seller of record or payment aggregator route | Register the entity (if not already), use a licensed gateway, let an accountant decide the seller-of-record structure in week 1 | Blocks real rupees in month 1 |
| D4 | **Loot boxes:** staged (3a then 3b behind counsel) or paid crates early | **Staged** | Section 4.2; 3a tests the engine with no money at risk |
| D5 | **Default payout currency for Indian creators** | **Rupees**, USDC on request after sign-off | VDA tax and GST export doubts [S] |
| D6 | **Legal and accounting budget** | Fund one counsel opinion on randomised cosmetics and one on marketplace and payout structure, plus an accountant | The only thing that unlocks 3b and rupees |
| D7 | **Capital route** | Grants and revenue first, Lumikai as the first outside conversation | Keeps options open |
| D8 | **Capacity:** the plan assumes you, one or two builders and Codex lanes, with part-time design | Confirm headcount and hours | The 16-week plan is sized to it |

## 13. What this changes in the earlier documents

| Document | Change |
| --- | --- |
| [business-plan.md](../../../business-plan.md) | New section 16 points here; sections 6, 8, 11 and 14 stand |
| [guide 23](../web3/build-guide/23-creator-platform-and-economy.md) | Engine E5 gains the Fair Store tiers and the standard; the SDK gains the skin-layer rule (cosmetic ownership never visible to rules) |
| [guide 24](../web3/build-guide/24-business-model-and-revenue.md) | CP21 (INR gateway) moves from "after the event" to month 1; creator-earning pass mark restated in rupees for a first cohort |
| [guide 25](../web3/build-guide/25-streamer-network-and-after-hours-economy.md) | Unchanged; the crate rule F13 adds "never on a stream surface" |
| [08 stakes](../web3/08-stakes-product-and-legal.md) | Unchanged; the third rail (section 9) states that items cannot be staked |
