# Startup plan 03: the 16-week plan, 6 November 2026 to 26 February 2027

Part of the [startup plan](README.md). Status: plan, 6 November 2026. It turns [02](02-business-plan-indie-growth-platform.md) into weeks. Targets marked **[U]** are my planning assumptions, sized from the arithmetic in [01](01-research-microtransactions-and-loot-boxes.md) section 2.2; replace them with real numbers as soon as a week of data exists. **No legal or tax advice.**

## 1. Where we start (facts from the repository on 6 November 2026)

| Area | State | Source |
| --- | --- | --- |
| Games | 13 games on the console; original art; Funcaster shell | `games/`, [AGENTS.md](../../../AGENTS.md) |
| Creator publishing | Operator-managed registry with review and a sandboxed gallery for standalone keyboard and pointer games; **the outside-creator trial is not yet recorded**; no live party SDK grants | [docs/CREATOR-PUBLISHING.md](../../CREATOR-PUBLISHING.md) |
| Arc and ENS | Integrated on main: ConditionalPot, predictions, cheers and creator commerce; live Render/PostgreSQL wiring and pinned contracts. Public names, creator pass and refunded predictions verified; full successful hosted game/payout acceptance remains open. | `ARCHITECTURE.md`, `docs/web3/progress.md` |
| ENS | Real-champion adapter passes focused tests and a local fork; the **parent needs renewal** and the public `players` namespace does not exist | same |
| Tests | 874 repository tests pass (313 unit, 117 party, 168 OS, 276 Web3) and both partner-off parity gates are green | same |
| Payments | **None.** No rupee checkout, no entitlements, no store | n/a |
| Outside world | Arc mainnet live since 16 September; ENSv2 live on mainnet since 27 October; Arc Microgrants closed 14 October; ENS Foundation grants expected Q1 2027; EU Digital Fairness Act proposal expected Q4 2026; India's parental-consent rule from 13 May 2027 | [01](01-research-microtransactions-and-loot-boxes.md) |

**Implication.** The hardest engineering is partly done (splits, escrow patterns, the Live hub, local records). What is missing is everything that touches **real rupees, real players and real creators**. The plan front-loads those.

## 2. Assumptions about the team (decision D8)

One owner (product, business development, community), two builders, Codex lanes for implementation, part-time design, and external counsel and an accountant on retainer. **If there is only one builder**, drop FS9's streamer and recap work to a second phase and push the Fair Crate decision (gate C) by four weeks.

## 3. The scoreboard

**North-star metric:** *rupees earned by creators per week* (sales plus commissions and bounties, after fees).
**The five assumptions, tested in this order, each with a number:**

| # | Assumption | Measure | Pass by |
| --- | --- | --- | --- |
| A1 | Creators will publish | Outside creators who ship a game through the registry | Week 4: at least 1; week 8: at least 6 live |
| A2 | Players will come | Distinct players, cumulative; weekly return rate | Week 8: at least 400; week 12: at least 1,200; week 16: at least 3,000 [U] |
| A3 | Players will pay | Paying players who are not the team or friends; share of players who pay | Week 8: at least 15 payers; week 16: payers at 1% of monthly actives or better [U] |
| A4 | Creators earn enough to stay | Creators with at least ₹5,000 earned in 60 days, **commissions and bounties count** | Week 16: at least 5 |
| A5 | Randomised drops are wanted and lawful | Counsel opinion; drop engagement; fairness-engine integrity | Week 12 (gate C) |

**Also tracked weekly:** verified plays; session length; join time; D7 return; Console Night attendance; streamer-attributed joins; refund rate; top-1% share of revenue; creator time to first payout.

## 4. Calendar anchors

| Date | Event | Why it matters |
| --- | --- | --- |
| 6 November | ETHGlobal Mumbai ends | Start the plan on 6 November |
| Mid-December to early January | Holiday weeks; many colleges on break | Weeks 7 and 8 are deliberately light on launches |
| October to March | College fest season | Event package target in weeks 13 to 15 |
| Q4 2026 | EU Digital Fairness Act proposal expected | Watch; no EU crates regardless |
| Q1 2027 | ENS Foundation grants expected to resume | Application in week 13 if open |
| 13 May 2027 | India DPDP Rule 10 (verifiable parental consent) takes effect | Consent flow built by April; designed in week 11 |

## 5. The sixteen weeks

### Month 1: make it real for ten creators (weeks 1 to 4)

| Wk | Dates | Focus | Ship | Exit check |
| --- | --- | --- | --- | --- |
| 1 | 6 November | **Decide and engage** | Hackathon retro (what is real, what is MOCK); decisions D1 to D8; counsel and accountant engaged with the five questions in section 8; Art-First Charter v0 and a public fee page; scoreboard instrumented; creator long list of 40, ten 30-minute interviews booked; Razorpay account process started; ENS parent renewal and a **mainnet gas test** for subnames | D1 to D8 answered; counsel and accountant signed; 10 interviews booked |
| 2 | 6 November | **Rails: money in, names out** | FS1 manifest and skin-layer design; FS3 entitlement model; FS2 test-mode UPI checkout from the phone page with ledger rows; FS11 mainnet namespace stood up (studio, game, referral names; plain-file export); RevenueRouter on Arc **testnet** end to end; first 10 creator invites; 10 venues listed, 3 confirmed for Console Night trials | A test purchase completes on a phone and appears in a creator earnings row; a studio name resolves on mainnet |
| 3 | 6 November | **Tier 0 and the first creators** | Tips and a supporter name in test mode; creator onboarding guide (`game:create` plus `store.json`); **outside-creator trial begins with three creators** on real devices, evidence recorded; **Console Night #1** (dry run, no store) at venue A; Circle grant drafted | Three creators started; Console Night #1 data: join time, plays, drop-off |
| 4 | 6 November to 4 Dec | **Gate A** | Live rupee tips with a small real payment and a tested refund; Arc **mainnet capped payout test** with team funds (only if D2 and D3 allow, otherwise testnet); the first outside creator publishes through the registry; **submit Circle Developer Grant**; start Lumikai Pixels application | **Gate A** (section 6) |

### Month 2: first players, first rupees (weeks 5 to 8)

| Wk | Dates | Focus | Ship | Exit check |
| --- | --- | --- | --- | --- |
| 5 | 7 to 11 Dec | **Tier 1: direct-buy cosmetics** | Cosmetic store on phone and TV; skin layer in three first-party games as templates; live ₹9 to ₹199 items; receipts and invoices as the accountant specifies; basic spend meter; Console Nights at three venues; streamer trials 1 and 2 | A stranger can buy a ₹29 skin and see it applied in the next match |
| 6 | 14 to 18 Dec | **Fair Drops v0** | FS4 odds engine (server-side draw, table hash, commit-reveal, receipts, **verify-my-draw page**, dated table archive); free earned drops in two games; FS5 table-hash and daily-root anchoring on Arc testnet; **jam weekend with a sponsor-funded bounty** (supply and press); **Launch Week for creator 1**; streamers 3 to 5 | Every drop receipt verifies in the browser; jam produces at least 5 submissions |
| 7 | 21 to 25 Dec | **Light week** | Fixes only; FS7 creator dashboard v0 (plays, earnings); INR payout v0 (manual, weekly); a New Year's Console Night special at venues | Dashboard live for creator 1; first creator payout sent |
| 8 | 28 Dec to 1 Jan | **Slack and counsel** | Counsel opinion on randomised cosmetics due; Gate B data pulled; **Launch Week for creator 2** | **Gate B review on 6 November** |

### Month 3: scale the shelf, finish the safety layer (weeks 9 to 12)

| Wk | Dates | Focus | Ship | Exit check |
| --- | --- | --- | --- | --- |
| 9 | 4 to 8 Jan | **Gate B and Tier 2** | Season or room pass (₹49 to ₹149, no auto-renew); FS7 dashboard v1 with **top-1% concentration meter** and fairness report v0; invites open to 20 creators | Gate B decision recorded; pass purchasable |
| 10 | 11 to 15 Jan | **Scale the shelf** | 10 creators live; Launch Weeks 3 and 4; streamers to 10; payout automation (INR); referral names live on ENS; decide Funcaster Plus pilot | At least 10 games on the shelf, each with a store |
| 11 | 18 to 22 Jan | **Safety layer complete** | FS6: limits, 24-hour delay to raise, undo and refund, adult confirmation, geo flags, DPDP-ready consent log; **FS12 Fair Crate checker** (F1 to F14 as automated tests); counsel's opinion folded into the design | All F-rules have passing tests |
| 12 | 25 to 29 Jan | **Gate C** | **Go or no-go on paid crates (3b)**; if go, alpha with two creators, adults only, tightened caps; **Circle milestone 1**; Lumikai pitch if scheduled | **Gate C** (section 6) |

### Month 4: events, hardening and the decision (weeks 13 to 16)

| Wk | Dates | Focus | Ship | Exit check |
| --- | --- | --- | --- | --- |
| 13 | 1 to 5 Feb | **3b alpha or depth** | If go: crates alpha live for two creators (₹100 a day cap in alpha); if not: drops in every game, pass depth; weekly fairness report published; ENS Foundation application if the window is open; event package outreach | Fairness report published; at least 3 fests in conversation |
| 14 | 8 to 12 Feb | **Event** | One college fest or hackathon run with a sponsor bounty and **Demo Day #2** | Plays, joins and purchases from the event measured |
| 15 | 15 to 19 Feb | **Harden** | Independent security review of checkout, entitlements, odds and payouts; load rehearsal; USDC claim path for international creators on Arc; **publish the creator earnings transparency report** | No open high-severity finding |
| 16 | 22 to 26 Feb | **Gate D** | Scorecard review; Season 1 report; plan for months 5 to 8; fundraising materials | **Gate D** (section 6) |

## 6. The four gates

| Gate | When | Pass | If it fails |
| --- | --- | --- | --- |
| **A: the hands work** | End of week 4 | A real rupee purchase works end to end with a tested refund; at least 1 outside creator has published through the registry **with evidence recorded** (the existing `accept-trial` rule: no fixtures); at least 10 creators have said yes; counsel and accountant engaged; a studio name resolves on mainnet; Console Night #1 data in hand; **no hackathon MOCK is presented as live** | Do not start Tier 1; fix the rails and creator path first |
| **B: players and first rupees** | Monday 4 Jan (end of week 8) | At least 6 creators live; at least 400 distinct players; at least 15 paying players who are not the team; at least 3 venues running weekly; 5 streamer trials with at least 3 streams of 10 or more joined viewers | If players fail: stop building store features and spend all effort on distribution; if payers fail: keep tips and cosmetics, defer passes and crates |
| **C: randomness** | End of week 12 | **Counsel's written view that non-transferable, rupee-priced, cosmetic-only paid crates are not an online money game**; F1 to F14 pass automatically; at least 1,000 free drops issued with 100% of receipts verifying and zero mismatches; at least 2 creators asking for paid crates; payment and accountant structure clear | **3b is dropped** or deferred; the product stays at Fair Drops, cosmetics and passes; nothing in the business plan depends on 3b |
| **D: the pilot verdict** | End of week 16 | Two of three core tests pass (venues: at least 4 of 10 pay; sponsors: 2 paid or signed letters; creator earnings: at least 5 creators at ₹5,000 or more in 60 days, commissions count) **and** at least 3,000 distinct players cumulative | **Pivot to events and commissions only** (the existing fallback) and stop store work |

## 7. Engineering backlog

Sizes: **S** up to one engineer-week, **M** one to two, **L** three to four **[U]**. "Main" means the work lives on `main` behind flags (it needs no chain); "web3" means `web3/integrations` until the owner approves a merge (decision D2).

| ID | Task | Size | Lives on | Weeks | Existing work it uses |
| --- | --- | --- | --- | --- | --- |
| FS1 | Store manifest, SDK additions, **skin layer** (rules cannot read ownership), docs | M | main | 2 to 5 | Manifest v2 in `docs/SDK.md` |
| FS2 | Rupee checkout (UPI and card through a licensed gateway), webhook, refunds, ledger rows, invoices | L | main | 2 to 5 | Replaces CP21; Ledger rows from the Reality guide |
| FS3 | Entitlements per handle or seat, non-transferable, valid across consoles | M | main | 2 to 5 | Handles and `/me` |
| FS4 | Odds engine: draw table, hash, commit-reveal, receipts, **verify page**, dated archive | M | main | 5 to 6 | Replay and result-hash pattern |
| FS5 | Anchor table hashes and a daily receipt root on Arc through Memo | S | web3 | 6 to 7 | Memo tagging, N3 and N5 in guide 16 |
| FS6 | Safety layer: spend meter, limits, delay, undo, refund, adult confirmation, geo flags, consent log | L | main | 5 to 11 | New |
| FS7 | Creator dashboard: earnings, plays, payers, **concentration meter**, fairness report | M | main | 7 to 9 | CP4 and CP19 |
| FS8 | Payouts: rupee payout (manual then automated); USDC claim through RevenueRouter | M | main and web3 | 7 to 15 | CP1, CP2, CP15 |
| FS9 | Growth tools: referral codes, Stream Mode, recap-card QR, chart and play-next, Console Night kit | M | main | 3 to 10 | CP16, CP18, CP20 |
| FS10 | Compliance pack: terms, privacy notice (DPDP), grievance contact, creator agreement, takedown | S | docs | 1 to 8 | Review process in `docs/CREATOR-PUBLISHING.md` |
| FS11 | ENS: mainnet studio, game and referral names, records, plain-file export | M | web3 | 1 to 3, 10 | ENS guide 02 |
| FS12 | **Fair Crate checker:** F1 to F14 as CI tests that block enabling crates | M | main | 11 | New |
| FS13 | Scoreboard and event analytics | S | main | 1 to 2 | Party and results logs |

**Capacity check.** Roughly 21 engineer-weeks of new work plus about 8 for the live Arc wiring, bug fixing and support, against about 32 available with two builders: **tight but workable**; the first thing to cut is FS9's recap work, then FS11's referral names.

## 8. Legal, tax and finance checklist (start in week 1)

Questions for counsel and the accountant, in order of what they unlock:

1. **Are rupee-priced, non-transferable, cosmetic-only paid randomised items an "online money game" or "other stakes" under the Online Gaming Act 2025 and Rules 2026?** Does social-game status or any notification affect it? *(unlocks 3b)*
2. **Seller of record and tax:** if Funcaster collects and pays out, what are the GST, e-commerce operator and TDS-on-participants duties, and what invoices are needed? *(unlocks rupees)*
3. **Payouts:** the recommended route for rupee and USDC payouts to Indian and foreign creators; VDA tax, TDS and GST export treatment. *(unlocks USDC claims)*
4. **Minors:** age-gating approach now and consent design for 13 May 2027; what "likely to be accessed by minors" means for a party console. *(unlocks crates and any public launch)*
5. **Creator agreement:** licence grant, takedown, IP warranties, and the line between a sponsor bounty and a prize. *(unlocks commissions)*

Also: register or confirm the entity; open the gateway account; read Razorpay's current terms at source (a 0% promotion for new merchants is reported but unverified, see [01](01-research-microtransactions-and-loot-boxes.md) section 12).

## 9. Arc and ENS milestone track

| By | Arc | ENS |
| --- | --- | --- |
| Week 2 | RevenueRouter end to end on testnet | Mainnet namespace stood up; gas test result |
| Week 4 | **Mainnet capped payout test** (team funds), Circle grant submitted | Studio, game and referral names resolve on mainnet; plain-file export works |
| Week 6 | Odds table hash and daily root anchored (testnet) | Decide fan-name issuance route from the gas test |
| Week 8 | Anchoring on mainnet if capped; no stake or item ever on the same contract | Referral names live |
| Week 12 | Circle milestone 1 delivered; router handling real creator splits | Player handles decision |
| Week 15 | USDC claim path for international creators | Foundation application filed (if open) |
| Week 16 | Evidence pack: transaction hashes for payout, split and anchor; a short public write-up | Public write-up of the namespace pattern, open source |

Honest wording on every public surface: final in under a second on a permissioned validator set, "no admin in our contracts" (not about the token), the odds log proves non-tampering and not harm reduction, and no privacy is claimed ([guide 16](../web3/build-guide/16-arc-native-features.md) section 8).

## 10. The distribution plan in numbers (all **[U]**)

| Programme | Week 8 | Week 12 | Week 16 |
| --- | --- | --- | --- |
| Creators live | 6 | 10 | 15 |
| Venues running Console Nights weekly | 3 | 6 | 8 |
| Streamers with a code | 5 | 10 | 10 |
| Launch Weeks completed | 2 | 4 | 7 |
| Events or jams | 1 jam | 1 jam | 1 fest plus Demo Day #2 |
| Distinct players, cumulative | 400 | 1,200 | 3,000 |
| Paying players, non-team | 15 | 45 | 90 |
| Gross sales, cumulative | ₹5,000 | ₹12,000 | ₹25,000 (stretch ₹75,000) |

The sales row is small on purpose: 3,000 players at 2% paying ₹200 a month is about ₹12,000 a month. **The week-16 question is not "how much?" but "did strangers pay, and did they pay again?"**

## 11. Operating rhythm

- **Monday:** scoreboard review (10 minutes), blockers, this week's three outcomes.
- **Wednesday:** creator office hours (open to all invited creators); decide which games feature this week.
- **Friday:** demo of what shipped; update the evidence log; one written paragraph on what we learned.
- **Every Console Night:** a staffed script, a timing sheet (join time, first game) and five player interviews.
- **Every Launch Week:** the data report sent to the creator within three days.
- **Rule from the existing plan:** a MOCK flow is never described as live; every public claim has a transaction hash or a test log.

## 12. What we are not doing in these 16 weeks

Virtual currency, tradeable or sellable items, paid crates for anyone before gate C, crates for minors, crates in Brazil, Belgium or the EU, crates on streams or for Bits, real-money pots or markets, an app-store release, a platform-agnostic store for outside games (decision D1), advertising, or a paid placement. We also do not pursue Steam, mobile or console ports ourselves; the graduation kit is a checklist.

## 13. After week 16 (months 5 to 8, outline)

| If gate D passes | If it partly passes | If it fails |
| --- | --- | --- |
| Open creator submission publicly; the DPDP consent flow live before 13 May 2027; the graduation kit; shelf sponsorship; a seed round with Lumikai or others; evaluate the platform-agnostic store (D1b) | Keep the pilot cohort, double venues and events, hold crates at drops | Events and commissions only; shelve the store; reuse the console and the splitter for event work |

## 14. Risks to the plan itself

| Risk | Signal | Response |
| --- | --- | --- |
| Counsel is slow | No opinion by week 8 | Gate C fails safe: stay at drops; the business is unchanged |
| Gateway or entity delays block real money | No live checkout by week 4 | Use a creator's own gateway account for the first sales; keep building |
| Hackathon momentum fades | Interviews and invites slip in week 1 to 2 | Owner time is the scarce resource: block the first two weeks for outreach |
| One builder only | Capacity check in section 7 fails | Cut FS9 and push gate C four weeks |
| A Funcaster game or the console breaks at an event | Failed Console Night | Staff script, offline fallback, and a smoke test before each night ([docs/NETWORKING.md](../../NETWORKING.md)) |
| An outside creator ships a copyright-infringing game | Takedown request | Review checks, withdrawal process, and the creator agreement from FS10 |
