# Build guide 24: business model, revenue and creator growth (researched 6 November 2026)

**Why this document exists.** The first creator-economy draft ([23](23-creator-platform-and-economy.md) section 4.3) showed that pass revenue alone needs about 13,000 rooms a day to reach $10,000 a month. That is not a pitch. This guide researches how Steam, Epic, Fortnite, Roblox, itch.io, Discord, Poki, AirConsole, Jackbox, Crowd Control and Twitch actually make money and pay creators, then rebuilds our revenue logic on what the evidence says works. It also covers how the platform helps indie creators grow and what Twitch (and, for India, YouTube) should do for us.

**How to read the tags.** Every figure carries a reliability tag. **[P]** = read in an official page (excerpt seen during research on 6 November 2026). **[S]** = secondary source (press, analyst, aggregator). **[V]** = vendor or marketing claim. **[U]** = my assumption, to be validated by the pilots in section 9. Figures from search extracts, not full-page reads, are marked as such in section 12. All rupee conversions use ₹95.12 per US dollar (6 November 2026 [S]). **Nothing here is legal advice.**

## 1. The verdict on the first draft

| Problem in the first draft | What the research says | Fix |
| --- | --- | --- |
| Consumer passes at $1 as the engine | Every large creator payout pool is funded by a big pool of **consumer spend the platform already has** (Fortnite's Item Shop, Roblox Robux, Steam sales). We do not have that spend yet. Small platforms pay creators from **B2B and sponsor money** | Make sponsors, events and venues the engine; passes are the long tail |
| One flat take rate for everything | Winners price the take by **who brought the player** (Poki 100% / 50%; Epic 0% on the first $1M; Discord 15% on the first $1M) | A tiered fee schedule (section 4.3) |
| Creators earn "royalties" only | The median creator earns about nothing everywhere (section 2.2). A platform that keeps creators needs **a floor and paid work** | Commissions, bounties and a long-tail floor in the pool |
| Twitch as a coin economy | Twitch's own numbers make Bits in Extensions tiny (20% of one cent per Bit), and policy forbids pay-to-play and wagering. The strong evidence is for **streaming as discovery** | Streamer-powered distribution with referral codes, not coins (section 7) |
| No revenue model per customer type | Competitors sell to **different customers on different price points** (Kahoot: $19 to $79 a month; AirConsole Hero: $7.99; TouchTunes: 18% of takings) | A price book (section 4.2) |

## 2. What the platforms do (researched)

### 2.1 Terms and what each pays

| Platform | Take or share | Fees, thresholds, timing | What it teaches | Tag |
| --- | --- | --- | --- | --- |
| **Steam** | 30% to $10M per game, 25% to $50M, 20% above; tiers reset per game | $100 per product, recouped after $1,000 gross; payment about 30 days after sale and by the end of the next month; $100 payout minimum | Most indie games never leave 30%; the real cost is **discovery**, not the fee | [P] fee, [S] tiers and timing |
| **Epic Games Store** | **0% on the first $1M per product per year**, then 12% (since June 2025) | Own payment processing; 295M+ users; Support-A-Creator affiliate pays streamers at least 5% of attributed sales (rate set by the developer), $100 minimum in 12 months | A **zero-fee band** is the cleanest "we are on your side" signal; affiliates (streamers) are a normal part of distribution | [P] |
| **Epic MegaGrants** | Grants of $5,000 to $75,000, up to $150,000; 2,000+ supported | Two cycles a year | **Funding the next game** keeps creators on the platform | [P] |
| **Fortnite (UEFN)** | **40% of net Item Shop and related spend goes into an engagement pool**, paid monthly by minutes played, new and lapsed players brought in, retention, and play around spending; only players who have made purchases count; creators who bring new or lapsed players get 75% of those players' contribution for six months; in-island item sales pay 100% of V-Bucks value to end 2026, then 50% | A paid **Sponsored Row** (creators pay for placement; the revenue goes 100% into the pool to end 2026, then 50%) | The best-documented creator pool. **Copy the design**: engagement-weighted, anti-farming (count payers), a bonus for **bringing new people**, and paid placement | [P] formula, [S] 74% estimate |
| **Roblox** | DevEx at $0.0038 per Earned Robux ($0.0054 for eligible US 18+ spend); 30,000 Earned Robux minimum (about $114) | About $1.7B paid in the 12 months to 6 November 2026; 42,000+ creators in DevEx; **median about $1,500**; top 10 average $65.7M, top 1,000 average $1.4M | **Power law**: the top 1,000 take about 82% of payouts; the rest average about $7,300 (my arithmetic) | [P] rate, [S] payouts |
| **itch.io** | Default 10%, seller sets 0 to 100%; processor about 2.9% + $0.30 | Minimum payout $5 and a 7-day hold (Payouts mode) | A creator-set fee and tiny thresholds win loyalty. But a 690-game sample found the **median game earns $0**, 45% earn nothing, 1 in 7 exceeds $100; web games convert 47 of 100 viewers to players against 16 of 100 for downloads | [P] fee, [S] sample (self-reported, biased) |
| **Discord Premium Apps / Activities** | 15% platform fee to $1M cumulative, then 30%; 6% processing; desktop and browser only | $100 first payout then more than $25 per cycle; paid within 45 days after month end | Same 15% band we considered credible; **payout friction** is a standard complaint | [P] |
| **Poki** | **100% for players the creator brings, 50/50 for players Poki brings** (web-exclusive deals) | No published minimum | **Pay the platform more only when the platform did the work** | [P] |
| **CrazyGames** | No fixed share; one 2026 jam gave 60% of ads and 70% of purchases | €100 minimum; paid on Net 60 but usually by the 10th | Ad revenue in tier-3 markets is thin (rewarded video about $1 to $3 per 1,000 views, against $15 to $28 in the US) | [S] |
| **AirConsole** (closest format) | Of each subscription, 30% store fees; of the remaining 70%, **70% to developers pro rata by play time** (about 49% of gross), 30% to AirConsole (about 21%) | Hero $7.99 a month in the US store, a 7-day pass about €1.99, lifetime $29.99; **one subscriber unlocks everything for everyone in the session** | The subscription-pool model works for living-room games; the "one payer per room" rule fits a party | [P] |
| **Jackbox** | Premium packs at $29.99; one purchase per group; bulk codes from 20; **no published venue licence price** | Estimated lifetime Steam gross about $26M; **sales of each year's new pack have fallen** (2020 release about $4.3M against 2024 about $0.25M, Steam estimates); 2026 pivot to third-party publishing, standalone titles, a Netflix partnership and a subscription service | Even the category leader is diversifying; **there is an unserved venue-licence gap** | [P] pricing, [S] estimates |
| **Kahoot 360 / Mentimeter** | Kahoot Pro $9 to $19 a month (50 players), $25 to $29 (200), **Pro Max $69 to $79 with commercial rights**; Mentimeter $11.99 to $24.99 per presenter a month | Annual billing | The **commercial-rights tier costs about three to eight times the consumer tier** | [P] |
| **TouchTunes** (venue digital entertainment) | UK: **18% of the cashbox instead of a fixed fee**; the box is supplied free; mobile credits $5 for 12 | Venue and operator split the rest | A **revenue share removes the venue's risk** and scales with use | [P] |
| **Crowd Control** (Twitch interactivity) | Streamer keeps 80% of coin revenue (85% for partners); 100 coins = $1; free tools for game developers; no developer share stated | $50 minimum, paid 30 days after month end | Streamers are paid; **developers get distribution, not revenue** | [P] |
| **Twitch Extensions** | Developer gets **20% of one cent per Bit**, streamer 80% | Over 64% of developers with Bits-in-Extensions enabled earned revenue in 2024 (amounts not published) | Real but small: $1,000 needs about 500,000 Bits (about $7,000 of viewer spend) | [P] |
| **YouTube Playables** | Revenue share only for a **pilot** of select creators; in-app purchases and off-platform monetisation prohibited | None published | **Not usable as our channel or revenue path** | [P] |
| **Tryb** (India, student platform) | Students make multiplayer mini-games in plain English; contests ranked by daily active users; Arcade '26 prize pool ₹2.25 lakh | The weekend challenge had 43 registered participants | A **direct India competitor for student creators**, but a phone social feed, not a shared screen with motion controllers | [P] / [S] |

### 2.2 The distribution of creator income is a power law everywhere

| Platform | Median creator or game | Concentration | Tag |
| --- | --- | --- | --- |
| Steam, 2025 releases | Median gross about **$318** (another estimator: $249); 65.9% under $1,000; about 40% did not recoup the $100 fee | About 300 of roughly 20,000 releases earned over $1M | [S] |
| itch.io (sample) | Median game **$0**; 45% earn nothing | Not measured in the sample | [S] weak |
| Roblox DevEx | Median **about $1,500 a year** | Top 1,000 about 82% of the $1.7B | [S] |
| Steam Next Fest, February 2026 | Median entrant gained **348 wishlists** | The top 1.8% of games took 52.5% of all wishlists | [S] |

**Consequence for us.** If Funcaster only "lets creators sell", the typical creator will earn about nothing, as everywhere else, and leave. The product has to give the long tail something the others do not: **paid commissions, a pool floor, instant micro-payouts and a physical audience** (section 5).

### 2.3 Discovery is the scarce resource

- Steam: roughly 20,000 releases in 2025; wishlists decide launch visibility; a game needs about **2,000 wishlists before Next Fest** to see a real lift (entrants under 1,000 gained a median of 462) [S].
- **Publisher-backed games had about six times the median wishlists** of self-published ones [S]. Creators want a publisher-like push, and the platform can supply it for a share.
- **Online co-op roughly doubled median wishlists** against single-player (660 against 336) [S]. Our whole catalogue is multiplayer, which is the favoured shape.
- Poki's deal and Fortnite's new-player bonus both **pay for audience**; Steam gives Next Fest, curators (Curator Connect) and Playtest as free tools [P].

### 2.4 Payout friction is a real, sourced pain (and an Arc advantage)

| Platform | Minimum and delay |
| --- | --- |
| Steam | $100 minimum; about 30 days after sale then paid by the end of the following month [S] |
| Discord | $100 first payout, then over $25 per cycle; within 45 days after month end [P] |
| CrazyGames | €100 minimum; Net 60 on paper, aiming for Net 10 [P] |
| Roblox | 30,000 Earned Robux (about $114) [P] |
| Twitch (streamers) | $50 minimum [P] |
| Crowd Control | $50 minimum; 30 days after month end [P] |
| itch.io | $5 minimum; 7-day hold [S] |
| **Funcaster** | **No minimum; claim any amount at any time; gasless; the pool pays in hours, not months** (section 6) |

## 3. Seven lessons that drive the design

1. **Fund the pool from real demand.** Creators are paid from a pool someone else fills. Ours is filled by **venues, events and sponsors first**, subscribers second. (Fortnite, AirConsole.)
2. **Give the long tail a floor.** Roblox's top 1,000 take 82%; a pool that is purely pro rata becomes a casino for the head. We reserve part of every pool for a **floor shared equally** among games that clear a quality bar (section 4.4).
3. **Sell audience, not just distribution.** Poki, Fortnite and Steam all charge or pay according to **audience they bring**. Venues, events and streamers are our audience supply.
4. **Charge by who did the work.** 0% on the first earnings, a low rate when the creator brought the buyer, a higher one when the platform did (Epic, Poki, Discord).
5. **Make the first payout fast and tiny.** Every competitor has a threshold and a delay (section 2.4).
6. **Design the pool against farming.** Fortnite counts only paying players and pays for new and lapsed ones; we weight by distinct humans at distinct venues ([23](23-creator-platform-and-economy.md) section 4.5).
7. **Streaming is discovery.** Surveys put streams at the top of game discovery (one cross-market study: 34% discover through streams, 77% have bought after seeing a stream [S, self-reported]; Twitch's own 2026 report: indie-tagged viewing up 51% to 348M+ hours [P]); a 2020 study found **39% skipped a purchase because watching was enough, mostly for narrative games**, while competitive, puzzle and creative games benefited [S]. A **join-from-your-phone party game** is the format where watching is not a substitute for playing.

## 4. The revised business model

### 4.1 One idea: Funcaster is a marketplace for shared-screen games with five buyers

| Buyer | Pays for | Why they pay | Our price anchor |
| --- | --- | --- | --- |
| **Brands and event sponsors** | A branded game or reskin that creators build, run at fests, cafés and booths, with plays, leaderboards and sign-ups reported | They pay agencies $1,500 to $45,000 for branded games [V]; college esports sponsorships run **$100,000 to $250,000** (second tier) and $500,000 to $1M (flagship) [S]; India hackathon sponsor tiers ₹10,000 to ₹50,000 [V] | Commission **$1,500 (reskin), $3,500 (campaign), $6,000 (custom)** [V anchors]; we keep 25% |
| **Event organisers** (fests, hackathons, corporate) | A branded shell, consoles on site, leaderboards, a showcase slot for creators | Fests already buy activations; jam prize pools run ₹22,500 to ₹3 lakh [P] | **₹1,50,000 per event package** (about $1,577) [U] |
| **Venues** (cafés, clubs, classrooms) | Every shelf game with commercial rights, staff tools, branding | Café revenue is thin (about ₹8,000 a month for a single-stream café [V]); Kahoot's commercial tier is $69 to $79 a month; TouchTunes takes 18% of takings | **₹999 a month Starter** (about $10.50; 12.5% of ₹8,000), **₹4,999 Pro** (branding and tournaments), or a **revenue-share plan** |
| **Hosts at home** | Unlocking everything for the room | AirConsole Hero is $7.99 a month and **one subscriber unlocks the whole session** | **Funcaster Plus ₹149 a month** (about $1.57) [U] |
| **Players and fans** | Tips, cosmetics, a single game's pass | Small, impulse spend | Presets of ₹25 to ₹100 [U] |

### 4.2 The price book and who gets what

| Revenue engine | Price | Platform share | Creator share | Notes |
| --- | --- | --- | --- | --- |
| **E1 Sponsored game commissions** | $1,500 / $3,500 / $6,000 [V anchors], average $2,500 [U] | **25%** (matching, hosting, verification, venue distribution, reporting) | **75% to the creator** (a commission, paid by milestone escrow) | Paid work for creators from day one |
| **E2 Event package** | ₹1,50,000 [U] | 70% (covers on-site staff, travel, hardware) | 30% to creators whose games are played (pool and bounties) | Seasonal (fests run roughly October to March) |
| **E3 Venue plans** | ₹999 Starter, ₹4,999 Pro; or **15% of the venue's console takings** (TouchTunes and Next Level, which charges a 7% royalty on gaming, are the reference points) | 60% | 40% to the pool | Venue also earns 10% of passes sold at its console |
| **E4 Funcaster Plus** | ₹149 a month; one payer unlocks the room | 40% after about 3% processing | 60% of net to the pool (AirConsole: about 49% of gross) | Subscription and one-time access fees are the permitted category under the Indian Act if no stake is involved [P], subject to counsel |
| **E5 Creator commerce** (passes, cosmetics, tips) | Creator sets the price | See the fee schedule below | The rest | The long tail, not the engine |
| **E6 Sponsored shelf slots** | Auction or fixed price [U] | 50% (rest into the pool, as Fortnite does) | 50% into the pool | After the shelf has traffic |
| **E7 Later: analytics and publisher services** | Tiered [U] | Fee | | A Poki-style publisher deal for games that need audience |

### 4.3 The commerce fee schedule (replaces the flat 10% in [23](23-creator-platform-and-economy.md))

| Case | Platform fee |
| --- | --- |
| A creator's **first $1,000** of lifetime commerce revenue | **0%** (Epic's zero band and Steam's $1,000 recoup point, reversed) |
| After that, buyer arrived through the **creator's own link or QR** | **5%** (Poki's 100% rule, softened) |
| After that, buyer found the game through the **shelf, a venue or a campaign** | **10%** |
| Hard cap in the contract | **15%**, frozen per published version |
| Venue slot (sale at a console) | 10% to the venue |
| Referral slot (streamer, curator, creator's friend) | **5% to 20%, set by the creator**, never less than 5% (Epic's floor) |

Worked example, a $1 pass after the free band, bought at a venue, referred by a streamer set at 10%, game found on the shelf: **platform 10%, venue 10%, streamer 10%, creator 70%**. The same pass from the creator's own QR at home: **platform 5%, creator 95%**.

### 4.4 The creator pool: an engagement pool with a floor

Modelled on Fortnite's pool and AirConsole's pro rata share, fixed against the power-law problem:

- **70% by weighted plays:** distinct humans at distinct venues, ranked-eligible plays only, pair weights and caps ([14](14-stats-and-leaderboards.md), [15](15-integrity-and-anti-cheat.md)); **a bonus (1.5 times) for players who are new to Funcaster or returning after 30 days** (Fortnite's new and lapsed rule, with the same anti-fraud logic: only players present in a **paying venue or Plus session** count).
- **30% as a floor,** divided equally among every game that cleared a quality bar in the period (at least N plays from at least M humans at K venues, no open takedown).
- **A per-game share cap of 25%** of the weighted part.
- A verified-play history is also the **eligibility test for paid placement**.

### 4.5 Why this is lawful in shape (counsel to confirm)

The Indian Act (in force 6 November 2026) bans **online money games**: paying or staking money or "other stakes" (including credits, coins and tokens bought with money) in expectation of winning more. It expressly lets **online social games** charge a **subscription or one-time access fee** if it is not a stake, and e-sports charge participation fees and pay performance prizes if recognised and registered [P]. Our commerce rails are **subscriptions, access fees, sponsor commissions and tips**, none of which is a stake. Two guard-rails follow: (1) **never pay cash prizes for in-game performance** (that is the money-game and e-sport territory); sponsor money pays for **building, delivering and curating**, not for winning; (2) play-USDC pots, cheers and markets stay a clearly separate, play-money, testnet feature ([23](23-creator-platform-and-economy.md) section 1).

## 5. How we help indie creators grow (the creator ladder)

Built from what creators say is missing elsewhere: discovery, money to make the next game, and fast payment.

| Stage | What Steam, Epic and others do | What Funcaster does | Cost to us |
| --- | --- | --- | --- |
| **1 Build** | Engines, SDKs, docs | SDK with a local preview, a conformance suite and templates; an **AI authoring assistant** for first prototypes (Tryb sells "make a game in plain English" to students, so the bar for starting is already low) | Low |
| **2 Test** | Steam Playtest, Next Fest demos | **Booth playtests:** a creator's game goes onto a handful of consoles for a weekend and receives **plays, drop-off and session length** back | Low (venue slots) |
| **3 Launch** | Next Fest, curators (Curator Connect), publisher marketing | **Demo Day** at fests and booths (a **Next Fest for the physical world**); **curator codes** for venue operators and streamers; featured slots **earned by verified plays**, not bought | Event cost covered by E2 |
| **4 Fund** | Epic MegaGrants, game-jam prizes, publisher advances | **Sponsor-funded commissions and bounties** (E1); small **creator grants** paid from sponsor budgets (benchmark: jam prizes ₹22,500 to ₹3 lakh [P]); incubation introductions through industry bodies such as GDAI [U] | Sponsor-funded |
| **5 Earn** | Slow monthly statements | **Instant, no-minimum, gasless payouts** from the router and the pool; the fee schedule of section 4.3 | Gas, sponsor-paid |
| **6 Grow** | Streamer affiliate codes, wishlists, Drops | **Referral codes** for streamers and fans; **seasons, boards and recap cards** with a QR that bring friends in; cross-venue charts | Low |
| **7 Own** | Platform-locked history | An **ENS name, an Arkiv portfolio and an ERC-8004 reputation** the creator keeps if they leave | Included |

**What good looks like (design rules from the data):** multiplayer and co-op first (the favoured shape in wishlist data); a free first two minutes; **rounds under ten minutes**; support for 8 or more languages including Hindi (games with 8 or more languages had about 2.5 times the median wishlists [S]); and Verified tier where the game can support it (ranked boards, replays and markets).

## 6. What Arc adds to the business (and what it does not)

| Business problem | Arc and on-chain answer | Honest limit |
| --- | --- | --- |
| Payout minimums and delays (section 2.4) | **Pull claims of any amount, gasless, at any time**; pool epochs and vesting in hours | Fiat off-ramp and tax are outside the chain; counsel |
| Team, venue, streamer and remix splits that platforms cannot do | **`RevenueRouter`** splits one payment among up to six parties in one transaction | Splits are frozen per version; changes need a new version |
| Sponsors will not pay for plays they cannot verify | **`BountyEscrow`** releases on **replay-verified plays by distinct humans**, with dispute and refund | The verifier and the arbiter are keys; stated plainly |
| "Is the pool fair?" | **Merkle root recomputable from public logs**, a challenge window and a sponsor refund | The platform proposes the root; the community checks |
| Creators locked in | **Portable names and reputation** | Needs adoption elsewhere to matter |
| Cost of micro-payments | Sub-cent fees on Arc ([09](09-seamlessness-and-signing-budget.md) shows about $0.001 per action) | USDC is upgradeable, pausable and blocklistable ([03](03-arc-guide.md)) |

**Not claimed:** that on-chain makes the business bigger; it makes the **payout experience and the sponsor trust** better, which are the two things the benchmarks say creators and brands care about.

## 7. Twitch (and YouTube) strategy: streamers as distribution

### 7.1 What the evidence supports

- **Streaming is discovery.** Twitch's 2026 report: 8.6B hours of gaming content watched 6 November 6 November; indie-tagged channels up 51% [P]. Survey evidence says streams top discovery (section 3) and that **competitive and party formats are helped, not hurt, by being watched** [S].
- **Interactivity moves viewers.** Dead Cells' Twitch integration roughly doubled its all-time minutes watched in a month [P]; Ubisoft's Twitch extension had viewers watch about 3.5 times longer, with 4,550 creators installing it [P]; Warframe's Drops campaign reached people who had never spent (41% of participants), and 20% spent about $10 [P].
- **Coins and Bits are a weak revenue line for developers**: 20% of one cent per Bit [P]. Crowd Control pays streamers 80% to 85% and developers nothing stated [P].
- **In India the audience is on YouTube, not Twitch.** More than 60% of YouTube Gaming's audience is Asia-Pacific and Twitch's audience is 28% US [S]; India has about 194M hours of YouTube Gaming live viewing in 2025, third in the world [S]; Twitch has under 2% of India's streaming hours [S, from [business-plan.md](../../../../business-plan.md)]. YouTube Playables cannot be a channel for us (no purchases, no off-platform monetisation, revenue share only a pilot) [P].
- **Twitch has opened monetisation tools to all streamers** (Bits, subs, Channel Points, from May 2026, payouts for Affiliates and Partners, $50 minimum) [P], so more small streamers can earn from a good interactive format.

### 7.2 The plan: Streamer Mode and the Referral Code (policy-safe, no coins)

> **Extended on 6 November 2026 by [25](25-streamer-network-and-after-hours-economy.md):** the streamercade.live-style after-hours arcade, the Twitch, YouTube and Kick gateway, direct triggers, new income streams and three more Arc contracts. Stream Mode (CP18) is now part of task SL6 there.

| Feature | What it is | Why | Policy fit |
| --- | --- | --- | --- |
| **Stream Mode** | A room that shows a join QR, a short link and the current game on a **stream overlay**; spectate and **play-along** for viewers; **no stakes, no markets, no cheers on screen** | The stream becomes a venue; viewers become players (not a substitute for playing) | Consistent with [business-plan.md](../../../../business-plan.md) section 6 (no pay-to-play, no wagering on stream) |
| **Streamer Referral Code** | Like Epic's Support-A-Creator: a code or link that attributes passes, Plus signups and tips to a streamer, who earns **5% to 20% set by the creator** through the router's referral slot | Aligns streamers with creators; costs us nothing unless it produces revenue | Real-money purchases on our own site, **not Bits**; counsel for payout rules |
| **Stream-ready badge** | Games that pass checks for readability, join time under 20 seconds, safe content, and a viewer-join mode | Gives streamers a short list and gives creators a goal | None |
| **Clips with QR** | Recap cards and highlights with a join QR | Shares do the marketing | None |
| **Drops-style cosmetic rewards** (later) | Account-linked skins or titles for watching a creator's launch stream | Drops reach non-spenders (Warframe) | Needs a Twitch category and written confirmation |
| **Twitch Extension with Bits** (last) | A viewer-effects extension (emotes, cheering) that is **not pay-to-play and not wagering**; developer gets 20% of one cent per Bit | Small but on-platform | **Written confirmation from Twitch first** ([business-plan.md](../../../../business-plan.md) section 6) |
| **YouTube first for India** | The same link and QR work on YouTube Live, Instagram and WhatsApp; **Discord** as an equal channel | That is where the audience is | None |

**Economics.** A streamer who sends 100 buyers of a $1 pass at 10% earns $10. This is small; the point is that **the streamer is paid for effort without us paying up front**, and the creator gets distribution without a marketing budget. The lesson from Stream Raiders ([business-plan.md](../../../../business-plan.md) section 4) holds: **do not make streamer payout the business.**

## 8. The revenue model (bottom up)

All inputs are **[U] assumptions** except the sourced price anchors; the model reports **our share of revenue (before costs)** and what creators receive. **Costs not modelled:** gas and sponsor float, Swarm and Arkiv leases, review labour, on-site event staff, travel, hardware, payment processing, support.

### 8.1 Inputs

| Input | Value | Basis |
| --- | --- | --- |
| Venue Starter | ₹999 a month = **$10.50** | 12.5% of an assumed ₹8,000 monthly café revenue [V]; under a quarter of Kahoot's commercial tier |
| Event package | ₹1,50,000 = **$1,577** | Mid-range of fest activations [U] |
| Funcaster Plus | ₹149 a month = **$1.57**; 3% of monthly active hosts subscribe ([business-plan.md](../../../../business-plan.md) assumption); 3% processing | AirConsole Hero $7.99 [P] scaled for India [U] |
| Sponsored commission, average | **$2,500** | Between reskin $1,500 and campaign $3,500 [V] |
| Creator commerce volume | Monthly gross from passes, tips, cosmetics | [U] |
| Splits | Venue plans 60 / 40; events 70 / 30; commissions 25 / 75; Plus 40 / 60; commerce 10 / 90 | Section 4.2 |

### 8.2 Scenarios (run rate in the stated month; USD a month)

| | Conservative, month 12 | **Base, month 12** | Ambitious, month 12 | Base, month 24 | Base, month 36 |
| --- | --- | --- | --- | --- | --- |
| Paying venues | 40 | **150** | 600 | 500 | 1,200 |
| Event packages a month | 1 | **3** | 8 | 6 | 10 |
| Sponsored commissions a month | 1 | **4** | 12 | 8 | 15 (at $3,000) |
| Monthly active hosts | 5,000 | **20,000** | 100,000 | 60,000 | 150,000 |
| Commerce volume | $500 | **$2,000** | $10,000 | $8,000 | $25,000 |
| **Gross billings** | $5,232 | **$19,246** | $63,616 | $45,533 | $105,422 |
| **Our share (revenue)** | $2,122 | **$7,322** | $22,935 | $16,668 | $35,086 |
| Our share a year (run rate) | $25,500 | **$87,900** | $275,200 | $200,000 | $421,000 |
| **Paid to creators** | $3,103 | **$11,896** | $40,540 | $28,780 | $70,125 |
| Share of billings to creators | 59% | **62%** | 64% | 63% | 67% |

### 8.3 What moves the number (base case, month 12, doubling one input)

| Lever (doubled) | Added monthly revenue (our share) |
| --- | --- |
| **Event packages** (3 to 6) | +$3,311 |
| **Sponsored commissions** (4 to 8) | +$2,500 |
| Paying venues (150 to 300) | +$945 |
| Average commission $2,500 to $3,500 | +$1,000 |
| Funcaster Plus hosts (20,000 to 40,000) | +$364 |
| Commerce volume ($2,000 to $4,000) | +$200 |

**Reading it honestly.**

- **The previous model made $75 a month from 100 rooms; this base case makes about $7,300 from the same company.** The difference is not optimism; it is where the money is: **sponsors and events are about 80% of the lever sensitivity, consumer commerce under 3%**.
- It is a **small business at month 12** (about $88,000 a year of our share at base, with creators receiving about $143,000 a year) and a **credible seed-stage one at month 36** (about $421,000 a year). That is the right size for a platform that has to earn trust from creators first, and it is **bigger than what the median Steam or itch.io game earns the creator**.
- The upside is **commissions**: the market for branded games is wide ($6,000 to $45,000 a campaign at agencies [V]); a creator network that delivers a $3,500 campaign game in one to two weeks at a quarter of agency price is a real offer. Ten more commissions a month is worth **+$6,250** of our share.
- The creator experience in the base case at month 12: **$11,896 a month reaches creators** (about $7,500 commissions, $2,600 pool, $1,800 commerce). With 25 active creators that is a **mean of about $476 a month**; the **median will be lower** (power law), which is why the pool has a floor and why commissions go to many creators, not few. **Targets:** at least 10 creators earn **$100 or more a month** by month 12; the median active creator earns more than the median Steam game's $318 first-year gross.

## 9. Validation plan (the pilots decide, not this document)

| Weeks | Do | Pass mark | If it fails |
| --- | --- | --- | --- |
| 1 to 4 | **10 venue pilots** (cafés, a campus club, a coworking space) on a free month | At least 4 of 10 agree to pay ₹999 or the revenue share after the month; median session at least 3 players | Reprice; try the revenue-share plan only |
| 1 to 6 | **5 sponsor conversations** (one fest, one hackathon, one local brand, one college club, one ed-tech) | **2 paid commissions** at $1,500 or more, or 2 signed letters of intent | Fall back to events only; lower the E1 target |
| 2 to 8 | **10 invited creators** publish through the operator-managed registry ([CREATOR-PUBLISHING.md](../../../CREATOR-PUBLISHING.md)) | 8 of 10 publish within two weeks of starting; **5 earn $100 or more** in the first 60 days (commissions count) | Fix the SDK, templates or commissions before opening submissions |
| 4 to 8 | **5 streamers** try Stream Mode with the referral code | At least 3 streams with 10 or more joined viewers; at least one attributed sale | Treat streamers as discovery only |
| 8 | Review | **Two of the three** (venues, commissions, creator earnings) pass | Pivot to **events and commissions only** and drop the consumer lines |

**Metrics to publish:** creator time to first payout; share of creators with a payout; median creator earnings; venue paid conversion and retention; commission win rate and cycle time; pool Gini (concentration); verified plays per venue per week; fraud flags.

## 10. What this changes in the build

### 10.1 Contract and product changes (tasks CP15 to CP21, added to [23](23-creator-platform-and-economy.md) section 10)

| ID | Task | Hours (my estimate) |
| --- | --- | --- |
| CP15 | **Router fee schedule:** a per-creator earnings counter (the free first $1,000 band), the creator-brought rate, the venue slot and the referral slot with a floor of 5% and a hard cap | 8 |
| CP16 | **Referral and attribution:** codes and links for streamers, curators and creators; attribution at the relay; the QR carries the code | 8 |
| CP17 | **Sponsored commission flow:** a brief, creator applications, milestone escrow ([23](23-creator-platform-and-economy.md) CP7), an accepted-delivery check and a plays report | 14 |
| CP18 | **Stream Mode:** overlay page with join QR and short link, spectate and play-along, stake-free by construction | 12 |
| CP19 | **Creator analytics:** plays, venues, retention, drop-off and earnings by source | 12 |
| CP20 | **Showcase and curation:** featured slots earned by verified plays, curator codes, a Demo Day page | 10 |
| CP21 | **Plans and billing (after the event):** INR gateway for the venue and Plus plans, invoices, tax fields | 20 |

CP15 and CP16 belong with the router slice (gate G2); CP17 to CP20 are in G4; CP21 is after the event. [22](22-integration-review.md) is updated to match.

### 10.2 Changes to [23](23-creator-platform-and-economy.md)

- Section 4.1 to 4.3 are replaced by the engines, fee schedule and scenarios here; the **pool gains a 30% floor and a new-player bonus** (CP6); the **router gains a referral slot and the free band** (CP1 plus CP15).
- The "creators never paid from a wager" rule and the "no cash prizes for in-game performance" rule are **explicit design constraints** (section 4.5).

## 11. How to pitch it (and the questions to expect)

**The 60-second version.** *"Steam's median game earns $318. itch.io's earns nothing. Roblox's median creator earns about $1,500 a year while the top 1,000 take 82% of the money. Funcaster is a marketplace for shared-screen games that gives creators three things the others cannot: paid commissions from brands and fests, a physical audience in cafés and campuses, and payouts that arrive in hours with no minimum, on Arc. Creators keep their first $1,000. We take 5 to 10% after that, 25% on sponsored work, and we fund a creator pool from venues and sponsors, with a floor so the long tail is not starved. Streamers get a referral code instead of a coin economy. Today's demo is play money on testnet; the business is venues, events and commissions."*

| Likely question | Answer |
| --- | --- |
| "Why would creators come?" | Paid commissions and bounties on day one, a physical audience, a zero fee on the first $1,000, no payout minimum; the data shows the median creator elsewhere earns about nothing |
| "How big is it?" | Base case about $88k a year of our share at month 12 and about $421k at month 36, with 62% to 67% of billings going to creators; the big lever is branded-game commissions; every assumption is labelled and the first eight weeks test the three that matter |
| "Why not Steam, Roblox or itch.io?" | They have the audience but not the **room**: none is a shared screen where a group plays together with phones; and none pays in hours or funds creators from sponsors |
| "AirConsole already exists." | Living-room only, a fixed subscription pool, store-fee payouts; we add venues, sponsors, verified results, instant payouts and creator ownership |
| "Why Arc and a chain at all?" | Instant micro-payouts with no minimum, frozen multi-party splits, sponsor escrow that releases on verified plays, a pool anyone can recompute; **not** because it makes revenue bigger |
| "Isn't this gambling?" | Creator revenue comes from subscriptions, access fees, sponsor commissions and tips; pots, markets and cheers are play-money on testnet and never pay a creator; no cash prizes for in-game performance |
| "What about Twitch?" | Streamers drive discovery through a referral code and a stream mode; Bits and pay-to-play are not used; India is YouTube-first |
| "What is real today?" | The rails on testnet with play money, the operator-managed registry and the first-party game published through it; commercial plans and billing come after pilots and counsel |

## 12. Sources and gaps

**Sources (seen on 6 November 2026 via search extracts; full-page reads not made):** Steamworks (Steam Direct fee, Next Fest, Curator Connect); Epic (Epic Games Store revenue programmes, MegaGrants, Support-A-Creator); Fortnite creator economy pages and news (engagement payouts, in-island sales, Sponsored Row); Roblox Creator Hub and newsroom, with IBTimes UK and a secondary analysis for the 2026 payout figures; itch.io creator docs; Discord developer docs and monetisation terms; Poki developer docs; CrazyGames payouts and terms; Portal Ready comparisons; AirConsole developer revenue pages and App Store listings; Jackbox events and Party Pack pages, with Steam estimate aggregators and GamesBeat; Kahoot and Mentimeter pricing pages; TouchTunes operator documents and UK trade press; Crowd Control guides; Twitch developer docs, State of Gaming 2026, game developer playbook and blog case studies; Streams Charts Q3 2026; YouTube Playables developer documentation; the Promotion and Regulation of Online Gaming Act and the 2026 Rules (PIB); India café and college esports business pages; Retry Arcade and Colombia Games price pages; Tryb and Unstop listings; ExchangeRates.

**Known gaps (verify before relying on them):** official Steam payout timing and minimum from Steamworks (taken from a third-party guide); the itch.io and Next Fest datasets are self-reported or analyst samples; vendor claims on café revenue, branded-game prices and Crowd Control's 1.8 times lift are **[V]**; no source for Indian price points per play or for fest sponsorship budgets at the tier we would sell; the Twitch rule on a viewer-effects extension in a party-game setting needs Twitch's written view; creator payout tax and the line between sponsor "bounty" and "prize" under the Indian Act need counsel; the Jackbox estimates are Steam-only and by release year, not company revenue.
