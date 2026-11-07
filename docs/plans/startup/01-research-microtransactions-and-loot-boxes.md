# Startup plan 01: research on microtransactions, loot boxes and what indie developers actually need (6 November 2026)

Part of the [startup plan](README.md). Status: research, 6 November 2026. **Nothing here is built and none of it is legal advice.** It was written to answer one question: *can Funcaster help indie developers add the monetisation that AAA and mobile studios use (microtransactions and loot boxes) without costing them their art, and help them find players?* The business plan that follows from it is [02](02-business-plan-indie-growth-platform.md); the 16-week plan is [03](03-sixteen-week-plan.md).

**How to read the tags.** **[P]** = read in an official page, statute, court filing or press release (seen as a search extract on 6 November 2026, not always a full-page read). **[S]** = secondary: press, analyst blog, trade-body summary, academic abstract. **[U]** = my assumption or arithmetic, to be replaced by a measurement. All rupee conversions use about ₹95 per US dollar (the rate used in [guide 24](../web3/build-guide/24-business-model-and-revenue.md)). Several aggregator sources are run by vendors; those are named where it matters.

## 0. The answer in ten lines

1. **Microtransactions are the main way games earn, but only a small share of players pay**: about 3 to 5% of installs convert in 30 days and about 2% of monthly actives pay [S]. The top 5% of payers bring in about 48% of in-app revenue on average and more than 70% in whale-driven games [S, Moloco].
2. **For an indie, monetisation is a multiplier on an audience, not a source of one.** A game with 5,000 monthly players earns on the order of ₹20,000 a month gross even if everything goes well ([section 2](#2-why-this-does-not-transfer-to-indies-by-default)). Cosmetic-only models need very large scale to work [S]. **Distribution is the binding constraint**, and it is what the median indie lacks (Steam's 2026 median release grosses about $290 in Q1 [S]).
3. **Loot boxes are the most profitable and the most dangerous mechanic.** They are popular (about a quarter of free-to-play developers use crates or gacha; GDC 2026 [P]) but removing them cost Brawl Stars about 14% of revenue over five months [S]. They also carry the heaviest legal, store and reputational load: a Belgian ban, a Brazilian ban for minors 6 November 2026, New York v. Valve (6 November 2026), a $20 million FTC settlement with the Genshin Impact publisher, an EU enforcement push on 6 November 2026 and a Digital Fairness Act proposal expected in Q4 2026 [P/S].
4. **India does not ban loot boxes, but it does not clear them.** The Online Gaming Act 2025 bans "online money games" and defines "other stakes" as anything equivalent or convertible to money, including credits, coins and tokens bought with money. Lawyers read non-cashable cosmetics as probably outside the ban and anything convertible to value as inside it [S]. It is a grey zone that needs counsel before any paid randomised item ships [P statute text; S commentary].
5. **The honest research finding on harm** is a small-to-moderate, replicable link between loot box spending and problem-gambling symptoms (r = 0.26 across 15 studies); causation is not proven; youth studies point the same way [P abstracts]. Disclosing odds is necessary but not enough; caps and simpler reward structures work better [P abstract].
6. **There is a real, funded market for "sell direct, skip the store fee" tooling**: Appcharge raised $89 million in total and reached $1 billion of annualised direct-to-consumer volume in March 2026; three quarters of top-grossing mobile games run their own web store [P/S]. Almost none of it is built for hobbyist indies, for ₹9 to ₹99 purchases or for India.
7. **Fixed per-transaction fees destroy micro-prices.** A "5% plus $0.50" fee is about 55% of a $0.99 sale [S]. In India, UPI payments up to ₹2,000 carry **no merchant discount rate** (government framework, 6 November 2026 [P]) and a gateway such as Razorpay charges 2% plus 18% GST on that fee, about 2.36% all in [P]. India is the one large market where ₹9 to ₹99 purchases are cheap to collect.
8. **Web3 in games is toxic as a label and useful as plumbing.** GDC 2026 had no blockchain talks and 0.4% of surveyed developers used blockchain monetisation [P]. What is genuinely useful is invisible: instant payouts with no minimum, splits among collaborators, and **an auditable record that the published odds were the odds used**.
9. **Arc and ENS both became real in the last eight weeks**: Arc mainnet launched on 6 November 2026 with USDC as the gas token; ENSv2 went live on Ethereum mainnet on 6 November 2026 [P]. That makes this the right moment to build on them, and also means both are very young.
10. **Recommendation, argued in [02](02-business-plan-indie-growth-platform.md):** build the **distribution** first, a **fair store** second (tips, direct-buy cosmetics, passes, priced in rupees, no virtual currency), and treat loot boxes as a **last, opt-in, capped, cosmetic-only, non-transferable and verifiably fair** feature behind counsel's opinion, starting with free earned drops that use the same fairness engine.

---

## 1. How the AAA and mobile model actually makes money

### 1.1 The numbers

| Fact | Value | Tag |
| --- | --- | --- |
| Install-to-first-purchase conversion, mobile free-to-play, within 30 days | 3 to 5% median; under 1.5% bottom third; 6 to 9% top third | [S] Operator Atlas, citing AppsFlyer and Mistplay definitions |
| Share of monthly actives who pay | about 1.5 to 2.5% median | [S] same |
| Top 5% of payers' share of in-app revenue | about 48% median; **over 70%** in whale-driven games; 81% by month 10 in whale-driven games | [S] Moloco, 100 top-grossing advertisers (scaled titles, not the long tail) |
| Whale-driven games: average revenue per paying user | usually above $100 | [S] Moloco |
| Volume-driven games: top 5% of payers' share; average revenue per paying user | 40 to 65%; $35 to $165 | [S] Moloco |
| Share of payers who buy only once | 37% in whale-driven games | [S] Moloco |
| Older, widely quoted figures (0.15% of players producing half of revenue; top 10% of payers at 64%) | 2014 and 2016 data; **do not use as current** | [S] flagged by Operator Atlas |
| Estimated global microtransaction market 2025 | about $143 billion (vendor estimate); free-to-play about 75 to 85% of digital game revenue | [S] weak, vendor (Virtwave citing The Business Research Company) |
| Loot box spending | Juniper Research projected over $20 billion by 2025; about 230 million buyers | [S] projection, treat as order of magnitude |
| What free-to-play developers monetise with (GDC 2026 survey, 2,300 respondents) | paid in-game currency **68%**, paid cosmetics **62%**, season or battle passes **46%**, **item crates or gacha 25%**; for premium games: DLC 40%, paid cosmetics 18% | [P] GDC State of the Industry 2026 |
| Developers using blockchain-driven monetisation | **0.4%** (5 respondents) | [P] same |

**What these say together.** The model is real and huge, but it is built on a small paying minority and a very concentrated spend. "Whale-driven" is not a failure mode; it is how the profitable titles in midcore, RPG and social casino work [S]. That concentration is exactly where the harm and the regulation concentrate too (section 3).

### 1.2 What sells, and what players say

- **India, what payers buy** (Rooter survey, n = 462, young and male-skewed, so directional only): battle passes and subscriptions **40%** of purchases, cosmetics **37%**, level or feature unlocks 23%; among payers, the most common monthly outlay is ₹0 to ₹100 (36.4%) [S, Lightbox report, September 2025].
- **India, how payers start**: Hitwicket's CEO says users "start at Rs 9 and go on to spend upwards of Rs 10,000", and credits the sub-dollar price points Apple and Google introduced for unlocking microtransactions [S, Economic Times].
- **India, scale of spend**: 515 to 525 million gamers; in-app purchases 40.45% of a roughly ₹49,500 crore market in 2025 [S, Vrkaa summary of a March 2026 report]. Average revenue per paying user rose from about $2 to $5 five years ago to about $25 to $30 [S, Bitkraft-Redseer via Economic Times]; average revenue per user across all players is only about $3.03 (US: $215) [S, same].
- **Premium and indie-style cosmetics are small but real.** Curve Studios sold 4.5 times as many 29p avatars as copies of its £7.99 game, a 16% revenue lift for about a day of work (2011, one game, one platform) [S, Gamesbrief]. Among Us earns from cosmetics priced at about $2 to $5 plus a skill-tree "Cosmicube" system whose launch was received well because it was honest, previewable and shipped alongside a big free gameplay update [S, Innersloth's Victoria Tran].

### 1.3 The rule of thumb that matters for indies

**Cosmetic-only monetisation works only at very large scale.** Ben Cousins (former EA and Square Enix monetisation lead): games that make billions on cosmetics succeed "because of the sheer numbers of players"; per player they monetise poorly, because only a minority wants self-expression [S, Game Economist Consulting]. Knockout City's team said the same after shutting its cosmetics-only live service: "a cosmetics-based, free-to-play game ... requires massive scale to be economically sustainable" [S, FamousAspect]. Cosmetic inflation also depresses demand, because each new item has to beat the one already equipped [S, same source].

## 2. Why this does not transfer to indies by default

### 2.1 The audience is the constraint

| Fact | Value | Tag |
| --- | --- | --- |
| Steam releases in 2026 by 6 November | 24,513 (about 237 a day), already above 2025's record of 21,204 | [S] Inven Global citing SteamDB |
| Steam median release revenue | about $290 for Q1 2026 releases; average about $120,000 (a few hits skew it) | [S] Games-Stats, 6,169 games |
| Median wishlists | 500 for solo developers, 2,250 for teams; about 0.35 launch sales per wishlist | [S] Kasspian, self-reported survey of 602 developers |
| What produced wishlists | Above 10,000: YouTubers and streamers, festivals, Steam itself. Under 1,000: Next Fest, Reddit and press | [S] same |
| The demo's real job | Not conversion: it lets streamers and festival curators play the game so it gets covered | [S] Immutable guide (a web3 games company, so treat as a vendor view) |
| Earlier numbers in this repo | Steam 2025 median about $318; itch.io median game $0; Roblox top 1,000 creators take about 82% of payouts | [S] [guide 24](../web3/build-guide/24-business-model-and-revenue.md) section 2.2 |

### 2.2 The arithmetic for one indie game (illustrative, all inputs [U])

Assumptions: 2% of monthly active players pay (the published median is 1.5 to 2.5% [S]); revenue per paying user of ₹200 a month, derived from the $27 a year Bitkraft-Redseer figure for 2024 (about ₹2,565 a year) [S]; gross, before gateway cost and platform fee.

| Monthly active players | Payers at 2% | Gross a month | About (USD) |
| --- | --- | --- | --- |
| 1,000 | 20 | ₹4,000 | $42 |
| 5,000 | 100 | ₹20,000 | $210 |
| 20,000 | 400 | ₹80,000 | $842 |
| 100,000 | 2,000 | ₹4,00,000 | $4,211 |
| 500,000 | 10,000 | ₹20,00,000 | $21,053 |

**Reading it.** A hobbyist with a few thousand players earns pocket money, which is fine and is exactly the point: "without worrying about compromising their art and hobby" means the store must cost almost nothing to add and must not change the game. A part-time income needs about 100,000 monthly players. **Nothing about adding crates changes that order of magnitude; getting players does.** That is why the first thing Funcaster sells to an indie is distribution, and the store is the second.

### 2.3 What happens when a studio removes random boxes

| Case | What happened | Tag |
| --- | --- | --- |
| **Brawl Stars** (Supercell, 6 November 2022) | Removed all random unlocks for a direct-purchase system. Revenue over the following five months (excluding December) fell about **14%** (iOS 18%, Android 11%); downloads rose, spending did not. Analyst's explanation: lost "vertical spend depth" from high spenders | [S] Deconstructor of Fun. A separate podcast summary calls revenue "roughly the same" and downloads higher; the two disagree, so treat the direction as uncertain and the 14% as one analyst's estimate |
| **Rocket League** (Epic, 6 November 2019) | Replaced paid crates with Blueprints that show the item before you pay; keys became credits at 100 per key. Players complained that items got more expensive | [P] game's own notice; [S] GameSpot |
| **Overwatch 2** (Blizzard, 2022) | Dropped loot boxes for a battle pass, shop and seasons | [S] The Verge |

**Lesson.** Transparent alternatives are possible and are what big studios moved to under pressure, but the revenue cost of removing randomness is real and falls on the high spenders. Our design choice (section 11) is to accept a lower ceiling in exchange for a defensible product, and to say so.

## 3. Loot boxes: popularity, harm and what the research supports

### 3.1 Popularity

- About **25%** of free-to-play developers use item crates or gacha (GDC 2026 [P]); about **80%** of the most popular mobile games in Western countries sell loot boxes, and over 90% of iPhone and Android games with loot boxes were rated suitable for ages 12 and up, because the box is generally not part of age ratings (Germany and Australia excepted) [S, Oxford IJLIT paper, 2025].
- Counter-Strike's skin market had passed **$4.3 billion** by March 2025 [P, New York Attorney General's own press release]. That is the extreme case: boxes plus a secondary market.

### 3.2 Harm: what is actually established

| Finding | Detail | Tag |
| --- | --- | --- |
| Association with problem gambling | Meta-analysis, 15 studies: r = 0.26 (0.37 after trim-and-fill) between loot box spending and gambling symptoms; r = 0.25 with excessive gaming | [P] abstract, International Gambling Studies 2021 |
| Youth | A systematic review of four studies on under-18s found a consistent positive association with gambling tendencies and describes boxes as a possible "gateway"; it recommends caps, odds disclosure, age checks and refunds | [P] abstract, Trends in Psychiatry and Psychotherapy 2025 |
| Longitudinal | Six-month studies: young people who bought boxes were more likely to gamble and to spend more when old enough | [S] cited in the Oxford IJLIT paper |
| **Causation** | Not proven, and hard to prove | [S] same paper |
| Design features | A 2026 scoping review of 72 studies found 136 design features in six groups (obfuscation, psychological manipulation, social pressure, data and engagement manipulation, obstacles to self-control, gambling resemblance). Most common: cosmetic rewards, in-game currency, pay-to-win, cash-out options, rarity | [P] abstract, Current Addiction Reports 2026 |
| Pity timers | Players read them as better value; they can also keep players spending as they approach a guaranteed reward | [P] same review |
| Disclosure is not enough | Reward structures are too complex for odds tables alone to protect people. Proposed fixes: cap the number of boxes and rewards per box, **equalise odds across rewards**, and **"exhaustible" boxes** that give every possible reward after a set spend, which is a built-in spending cap | [P] abstract, "Probability disclosures are not enough" (doi 10.4309/ldom8890) |
| Compliance in practice | Dutch regulator's guidelines (euro price, per-item odds, store disclosure, no direct exhortation of children) were followed about **10% of the time or almost never**, apart from disclosing that purchases exist | [P] abstract, Oxford IJLIT 2025 |

### 3.3 What a fair, honest design looks like (from the research)

Disclose exact odds before the buy button; show the price in real money; use finite, exhaustible pools or at least a disclosed maximum cost; equalise odds within a tier; cap spend by default; no urgency timers; keep the draw table the server actually uses and archive dated copies; make sure the same numbers appear everywhere [S, PowerUp and Apparently Law compliance guides; P, Apple and Google rules]. These are the ingredients of the **Fair Crate Standard** in [02](02-business-plan-indie-growth-platform.md) section 5.

## 4. The law and platform-rule map

| Where | Rule or event | Status on 6 November 2026 | What it means for us | Tag |
| --- | --- | --- | --- | --- |
| **India** | Promotion and Regulation of Online Gaming Act 2025 bans online money games ("fees, money or other stakes in expectation of winning ... monetary and other enrichment"); "other stakes" = credits, coins, tokens or objects "real or virtual" **purchased by paying money**; "online social game" may charge a subscription or one-time access fee if not a stake; up to 3 years and ₹1 crore for offering an online money game | In force with the 2026 Rules from **6 November 2026** | A virtual currency bought with money sits close to "other stakes". **So no virtual currency; price every item in rupees.** Randomised paid items are a grey zone: lawyers say non-cashable cosmetics are probably fine, anything convertible is not | [P] statute text, PIB; [S] commentary |
| India | Rules 2026: registration only for categories the government notifies (by risk to users including children, scale, transactions, origin) and for e-sports; "user safety features" are defined to include age gating, time limits, parental controls, reporting, counselling and fair-play monitoring | In force | Build the safety features anyway; they are also the product | [P] PIB release |
| India | Digital Personal Data Protection Rules 2025, Rule 10: **verifiable parental consent** for anyone under 18 | In force from **13 May 2027** | Design the store for it now; no purchase flows aimed at minors | [P] rules; India Data Law |
| India | MediaNama (June 2026): children making unauthorised UPI payments in games with loot boxes; participants suggested odds disclosure, cumulative spend display, parental controls and spend limits | Reporting, not law | Likely direction of any future rule: the same controls as our standard | [S] |
| **Brazil** | ECA Digital (Law 15.211/2025), Article 20: loot boxes banned in games aimed at or likely accessed by minors; Decree 12.880 (6 November 2026) lets a publisher skip age verification by shipping without boxes or restricting them by default | In force **6 November 2026** | Off in Brazil by default | [S] |
| **Belgium** | Gambling law read broadly: paid randomised items are illegal gambling (Gaming Commission, 2018); research finds boxes still in most top iPhone games there | In force, weakly enforced | Off in Belgium | [S] |
| **Netherlands** | 2022 Council of State ruling that FIFA packs were not a stand-alone game of chance (product-specific); regulator guidelines on pricing and odds | Mixed | Treat the guidelines as a design checklist | [S] |
| **Austria / France** | Austrian Supreme Court (December 2025): FIFA packs not gambling; France treats boxes as gambling only if items convert to money | Unsettled | Same lesson as India: **convertibility is the line** | [S] |
| **UK** | Government chose industry principles, not regulation (July 2022, July 2023) | Voluntary | Parental controls and odds are the baseline | [S] |
| **Australia** | Games with paid chance-based purchases must be rated at least M (15+) 6 November 2024; simulated gambling R18+ | In force | Expect a rating bump | [S] |
| **EU** | Consumer authorities' principles on in-game currencies (March 2025: show real-money price); **coordinated action against nine game companies on 6 November 2026**; Digital Fairness Act proposal expected Q4 2026, would not apply before about 2029; Parliament asked (Nov 2025) for a ban on loot boxes in games likely to be accessed by minors | Pending | No EU crates until the DFA text is known | [S] |
| **US** | **FTC v. Cognosphere (Genshin Impact), January 2025**: $20 million; no loot boxes for under-16s without parental consent; no loot boxes sold only for virtual currency without a direct real-money option; urgency, suspenseful animations and unclear odds called out. **FTC v. Epic (2022)**: $520 million total; **$126 million** refunded to 969,173 players in a later round, over "dark patterns" (accidental charges, no undo, refund limits). **New York v. Valve (6 November 2026)**: paid keys that open boxes of items with real market value are alleged illegal gambling; Valve is fighting it | Settled, settled, in court | Provide a direct real-money option; no dark patterns; **never create secondary-market value** | [P] FTC docket, NY AG press release and complaint; [S] Reuters, BleepingComputer |
| **Apple** | Guideline 3.1.1: apps selling loot boxes "must disclose the odds of receiving each type of item ... prior to purchase" | In force (store policy) | Needed only if we ship in an app store | [P] |
| **Google Play** | Odds disclosed "in advance of, and in close and timely proximity to" the purchase | In force | Same | [P] |
| **Steam** | No platform-wide odds-disclosure requirement; not part of the IARC "includes random items" label | Gap | Do not treat "Steam allows it" as safety | [S] |
| **Twitch** | Extensions policy bars randomised loot boxes, wagering and pay-to-play with Bits | In force | Crates never touch stream surfaces or Bits | [P] [business-plan.md](../../../business-plan.md) section 6 |

**Takeaway.** The law is converging on four things: **no randomised paid items for minors, no cash-out value, honest odds and prices, and no dark patterns.** A product that is built to those four from the start is not exposed to most of the active cases, and has a compliance story to sell.

## 5. Enforcement lessons, in plain terms

1. **Dark patterns cost more than boxes.** Epic's $520 million settlement was mainly about charging without clear consent and making refunds hard [P]. Build undo, confirm and refund first.
2. **The currency layer is a target.** The FTC's Genshin order requires a direct real-money option when boxes are sold for virtual currency; the EU wants the real-money price shown [P/S]. Rupee prices and no virtual currency remove the issue.
3. **Value is what turns a box into gambling.** New York's case rests on the items being "worth thousands of dollars" through Valve's own market and third-party sites [P]. A non-transferable, non-redeemable cosmetic has no such argument.
4. **Honour-system disclosure fails.** About 10% Dutch compliance, and Apple and Google have no published way of checking that the odds shown match the code [S]. **A verifiable record that the shown odds were the used odds is therefore a genuine gap**, not a gimmick (section 8).

## 6. The "sell direct" infrastructure market (our nearest commercial neighbours)

| Provider | Published price | Notes | Tag |
| --- | --- | --- | --- |
| **Appcharge** | Not published; partners "typically 4 to 5%" | $26 million Series A (November 2024, $100 million valuation); $58 million Series B (August 2025, IVP); **$89 million total**; annualised direct volume $500 million (July 2025), $700 million (January 2026), **$1 billion (6 November 2026)**; 141 employees | [P] company blog and GamesBeat |
| **Aghanim** | 5% + $0.50; 1.5% cross-border; 1% conversion; $1,000 minimum payout; 5% rolling reserve | The only one that publishes its terms in full | [S] d2c.guide |
| **Xsolla** | 5% + payment-system fee (PSP mode); merchant-of-record quote-based | Site builder 5% + channel cost | [P/S] |
| **Stash** | 5% of net revenue after channel fees (a 2024 example); now volume-based; not self-serve | Backed by a16z, Paradigm, Multicoin; $35 million total | [S] |
| **Tebex** | 7% to $250,000, 6% to $5 million, 5% above, plus $0.20 per order | **Tebex operates d2c.guide, the comparison site cited here**; treat its comparisons as a competitor's | [S] |
| **Coda** | 5% (Webstore) | Singapore, strong in Asian local payments | [S] |
| **Paddle** | 5% + $0.50 | **Its acceptable-use policy lists virtual currency as prohibited** | [S] d2c.guide |
| **Stripe Managed Payments** | 3.5% on top of 2.9% + $0.30 | Merchant of record, hosted checkout only | [S] |

**Market context.** Bain's 2026 report: nearly half of surveyed gamers bought directly from a developer's web store in the past year (27% repeatedly); three quarters of top-grossing mobile games run their own web stores (12% in 2019); app stores are cutting base fees for the first time (Google agreed to take 20% instead of 30%, and as little as 15% under conditions, in its Epic settlement) [S]. Direct-to-consumer is about $17 billion, roughly 15% of in-app revenue [S].

**The gap.** These companies sell to publishers with traction who want to save 15 to 30%. A hobbyist with 3,000 players, a ₹29 skin and a UPI-only audience is not their customer, and a fixed $0.50 fee makes the maths impossible at that price:

| Sale | Fee | Share of price |
| --- | --- | --- |
| $0.99 with a 5% + $0.50 provider | $0.55 | 55.5% |
| ₹49 (about $0.52) with the same provider | $0.53 | more than 100% |
| ₹49 by UPI through a gateway at 2% + 18% GST | about ₹1.16 | about 2.4% |

(The first row is from d2c.guide's published table; the second and third are my arithmetic on the published rates. UPI: no merchant discount rate up to ₹2,000 per transaction [P]; Razorpay's standard rate card is 2% + 18% GST on that fee [P].)

## 7. India: payments, tax and people

| Topic | Fact | Tag |
| --- | --- | --- |
| UPI merchant charges | **Zero MDR for payments up to ₹2,000**; **0.4% above ₹2,000** (capped at ₹300 above ₹75,000), per the government's 6 November 2026 framework; small merchants (P2PM) up to ₹1 lakh a month by QR stay at zero | [P] PIB and Department of Financial Services FAQ |
| Gateway | Razorpay standard: 2% platform fee plus 18% GST, no setup or annual fee; a 90-day 0% promotion for new merchants activated 6 November 2026 (verify) | [P] pricing page; [S] search summary |
| UPI Lite | Payments under ₹1,000 without a PIN from a stored balance up to ₹5,000 | [P] NPCI booklet |
| Selling digital goods on stores | Google Play games normally use Play Billing; India has a regulated alternative-billing programme; iOS uses Apple IAP with UPI inside it; own UPI checkout is for web or independent distribution | [S] guide; **verify with Google's current terms** |
| Receiving USDC | Indian recipient: INR value on receipt is ordinary income; **selling later is a virtual digital asset transfer taxed at 30% plus 4% cess, with 1% TDS** on qualifying exchange sales; GST export zero-rating (LUT) is doubtful for crypto receipts, so 18% GST may apply; an invoice-backed business route that converts offshore is argued to avoid the VDA event | [S] several tax guides; **needs a chartered accountant** |
| Children | Verifiable parental consent from 13 May 2027 (above); Genshin and Fortnite orders show the US view | [P] |
| Funding available | Lumikai **Pixels**: up to $500,000 day-zero, up to $2 million seed, invests in "digital platforms" among five layers [P]. Krafton **KIGI**: $50,000 to $150,000 milestone funding for studios, Mumbai included [S]. **LVL Zero**: $10,000 equity-free grant, 100-day sprint, studios [S]. **GDAI Supernova**: free, three months, no funding, **original-IP studios only, tools and services startups not eligible** [P]. **Tech Triumph** (IEIC, Ministry of Information and Broadcasting, WinZO): open to payments and monetisation startups; the 2025 season 6 November 2025, so watch for the next [S] | as shown |

## 8. Web3 in games: what is toxic, what is useful

**Sentiment.** GDC 2026 had no blockchain sessions for the first time in years [S, PC Gamer]; 0.4% of surveyed developers used blockchain monetisation [P]. A 2026 CHI paper reviewing 20 cryptogames found "a dangerous amount of dark design patterns" and gambling-like behaviour, and survey respondents hesitant to try them (n = 84, small) [P abstract]. The older Coda Labs study (7,000 gamers, 2022) found people rate crypto 4.5 out of 10 and NFTs 4.3, but players who tried web3 games rated them 7.1, so the objection is to the *framing*, not necessarily the experience [S, older].
**So:** no tokens, no NFTs, no "own your assets" in the player-facing product. Players pay rupees by UPI and never see a wallet.

**What is genuinely useful (the invisible layer):**

| Need | On-chain answer | Honest limit |
| --- | --- | --- |
| Creators hate payout minimums and delays (Steam $100 and about 30 days; Discord $100 then $25 per cycle and 45 days; CrazyGames €100 and Net 60; Roblox about $114 [S, [guide 24](../web3/build-guide/24-business-model-and-revenue.md) section 2.4]) | Pull claims of any amount, gasless, any time, from a splitter contract on Arc | USDC to rupees has tax friction in India (section 7); default Indian creators to rupee payouts |
| Teams, venues, streamers and remix parents need a share | One payment split among up to six parties in one transaction, frozen per published version | Splits cannot change without a new version |
| "Were the odds the odds?" | Publish the table's hash **before** sales; commit a seed before each draw; anchor a daily Merkle root of draw receipts on-chain; any player can recompute a draw offline | Proves the operator did not cheat the published table; it does **not** reduce the psychological pull of a random reward |
| A creator's identity and reputation should survive the platform | An ENS name per studio and game with records for payout address and store manifest hash | Only matters if others read it; keep the exports plain files too |

**On-chain randomness patterns that exist:** Chainlink VRF (a random value plus a proof verified on-chain), or a commit-reveal scheme in which a server-seed hash is published, mixed with a future block's randomness and revealed later so anyone can recompute the weighted draw [S, ChainSafe, Chainlink, Superstake docs]. A caution from the same sources: on-chain boxes whose rewards have **instant cash value** sit "far closer to the legal and psychological definition of gambling" [S]. We use the pattern for **non-transferable cosmetics only**.

## 9. Arc and ENS today (facts, 6 November 2026)

### Arc

- **Mainnet 6 November 2026**: an open Layer 1 from Circle with institutional validators (a permissioned validator model), USDC as the native gas token, sub-second deterministic finality, 100+ launch builders including banks, payment networks, exchanges and wallets; interoperability with 20+ chains through CCTP and Gateway; Circle Agent Stack and **Nanopayments** (gasless sub-cent USDC through Gateway batching and x402) [P, Circle press release and Arc blog].
- **Funding:** Arc Microgrants (20 grants of 500 USDC for working mainnet projects) **6 November 2026**, so watch for another round [P]. **Circle Developer Grants** are milestone-based USDC funding with co-marketing and technical guidance, for teams where "Arc is core to your flow of value, liquidity, or settlement" [P]. A payouts-and-splits product fits that sentence.
- **Honest wording (from [guide 16](../web3/build-guide/16-arc-native-features.md) section 8):** say "final in under a second on a permissioned validator set", not "decentralised"; the stablecoins are Circle's upgradeable, pausable, blocklist-capable tokens; "no admin in our contracts" is true only of our contracts.
- **State of our code:** the `web3/integrations` branch has MOCK-verified creator publishing, passes, frozen splits, claims and referrals and a RevenueRouter artifact; **live deployment of the new contracts and public acceptance are still pending**, and `COMMERCE=on` stays unavailable until then [docs/web3/arc-ens-basic-scope.md, 6 November 2026].

### ENS

- **ENSv2 went live on Ethereum mainnet on 6 November 2026**: hierarchical registries, per-name permissions, linked records, a new App and Explorer; 36 million names across `.eth` and ecosystem namespaces [P, ENS blog].
- **Subnames:** each activated name gets its own subregistry; issuance can be on-chain with USD pricing, stablecoin payment, expiring or permanent names, split payments, token-gated minting of up to five token conditions, and owner-chosen permissions and resolver (Namespace's ENSv2 design, still before audit) [S, ENS forum]. **NameStone sunset its API and Caldera's 9 million subnames migrated to Namespace** [S, ENS DAO newsletter 122]: a live lesson about depending on one off-chain subname vendor.
- **Funding:** the ENS DAO approved an ENS Foundation to handle grants; **grants are expected to resume under a new framework in Q1 2027** [S, ENS DAO newsletter 123]. Plan an application for then.
- **Risks from our own docs:** ENSv2 addresses changed about three times in six weeks before launch ([guide 02](../web3/build-guide/02-ens-guide.md)); the parent name needs renewal; the public `players` namespace is not yet created [arc-ens-basic-scope.md].

## 10. Distribution: what actually brings players

| Lever | Evidence | Fit for Funcaster |
| --- | --- | --- |
| **Streamers and YouTubers** | The top source of wishlists past 10,000; demos work as "creator unlocks", released in tiers (small creators first) [S] | High. India is YouTube-first ([business-plan.md](../../../business-plan.md) section 4.3). Join-from-phone party games are one of the formats where watching is not a substitute for playing [S, guide 24] |
| **Festivals and events** | Next Fest helps about 60% of those who tried it (51 of 86) [S, self-reported] | High, as a physical version: college fests, hackathons, venue nights |
| **Reddit, press and curators** | Top source under 1,000 wishlists [S] | Medium; cheap |
| **Short video** | Works for "clippable" co-op mechanics [S]; one survey puts it among channels that did not work for many [S] | Medium; recap cards with a QR are our version |
| **Publishers** | Publisher-backed games had about six times the median wishlists of self-published ones (guide 24) | A curated shelf with a launch package is a cheap partial substitute |
| **Platform discovery** | Steam's algorithm rewards wishlist *velocity* (about 8,000 to 10,000 a day triggers Discovery Queue traffic in one publisher's experience) [S] | Not our lever; our lever is a **physical, social** audience |
| **Co-op and multiplayer** | Online co-op roughly doubled median wishlists against single-player (guide 24) | Our whole catalogue is multiplayer |

## 11. What the research means for design: ten principles

1. **Audience first, store second, randomness last.** The arithmetic in section 2 says so.
2. **No virtual currency. Every item has a rupee price.** Removes the Indian "other stakes" definition, the FTC and EU currency complaints and a whole class of dark patterns.
3. **Cosmetic only, and the game cannot see it.** The game's rules never read ownership. This is what "no compromise to the art" means technically, and it matches the existing rule that creator code never touches money.
4. **Non-transferable, non-redeemable, no market.** Convertibility is the line in India, France, Austria and New York.
5. **Randomness is a staged, opt-in, capped, verifiable feature**, free earned drops first, paid crates only after counsel and only for adults.
6. **Fair by construction, not by disclosure alone:** exhaustible pools or disclosed maximum cost, equalised odds within a tier, default spend limits, undo and refund, no urgency.
7. **Same take rate on a crate as on a direct purchase**, so we never profit from pushing randomness.
8. **Price for UPI.** Items from ₹9, no fixed per-transaction fee, 0% platform fee on a creator's first $1,000.
9. **Web3 is plumbing.** Instant, no-minimum payouts and splits; a verifiable odds log; ENS names for studios and referral codes; nothing the player must understand.
10. **Measure concentration.** Show every creator the share of revenue from their top 1% of payers; flag it above a threshold. This is the research finding turned into a dashboard.

## 12. Gaps and things to verify before relying on this

- All figures were read as **search extracts**, not full pages; the Moloco, Operator Atlas, Kasspian, Games-Stats and Bain items are analyst or vendor material.
- **Razorpay's 0% promotion for new merchants** and Google's India alternative-billing terms need a read at source.
- **India's legal treatment of paid randomised cosmetics is unresolved**; no court or regulator has ruled on it. The Online Gaming Authority's directions (Rule 6(4)) could change it.
- The **Digital Fairness Act text** is not published; New York v. Valve is undecided.
- **Creator payout tax** (TDS on e-commerce participants, GST on the platform fee, VDA tax on USDC) needs a chartered accountant; the research found only general guides.
- Whether Funcaster needs to be a **payment aggregator or merchant of record** in India depends on the structure; Razorpay-style collection with Funcaster as seller of record is the assumption, not a conclusion.
- Circle's grant criteria were read from the programme page only; the criteria for a games-and-payouts product are untested.
