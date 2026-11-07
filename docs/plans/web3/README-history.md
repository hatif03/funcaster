# Web3 plan for ETHGlobal Mumbai: the candidate partners, and how to build each

> **6 November 2026 (owner). For anyone picking this up (including the teammate returning to the game):**
> 1. **6 November:** ENS and Arc are now being built **on the branch `web3/integrations`, never on `main`** (see item 5). On `main` the current work is still the games and the Funcaster UI: start at [plan.md](../../../plan.md) and [docs/plans/build/README.md](../build/README.md). Do not add partner code to `main`.
> 2. **The final partners are not chosen.** That decision waits until **every sponsor's problem statement is published**. This folder is a complete set of plans for every candidate track so the choice can be made quickly; "Arc, World and Arkiv" below is the **current leaning**, not a decision.
> 3. **Settled by the owner, not open items:** legal and eligibility questions, the pre-existing-work disclosure and the public submission repo are handled; the documents keep their background text but do not ask for action on them.
> 4. Reserve and alternate tracks all have a plan: ENS [03](03-ens-plan.md), Uniswap, EF CROPS App, Chainlink CRE and Hedera [11](11-reserve-track-playbooks.md).
5. **6 November 2026: the build guide is [build-guide/](build-guide/00-README.md)** (ENS, Arc, Arkiv; branch `web3/integrations`; the specification for Codex). It supersedes the build detail below; the documents in this folder remain background.
6. **6 November 2026: Arkiv's brief is published** and the Arkiv plan was reviewed against it: [05](05-arkiv-plan.md) is superseded by the rewritten [build-guide/04](build-guide/04-arkiv-guide.md) (with Swarm) and the judging pack [build-guide/18](build-guide/18-arkiv-submission-pack.md). Build on Arkiv (from scratch, $4,000) plus the Swarm bonus ($1,000) is the track; the lane is **about 49 hours, not 12 to 16** (the capacity table in section 4 is out of date for Arkiv).
7. **6 November 2026 (owner): maximise each track, verify first, and apply the UX laws.** Capacity and Swarm retention are no longer constraints. New: [build-guide/19](build-guide/19-verification-and-fix-protocol.md) (every unverified claim as a test with a fix and a fallback, run by the coding agent while building), [build-guide/20](build-guide/20-feature-expansion.md) (more ENS, Arc and Arkiv + Swarm features that make sense in the console, plus prediction-market friction reducers) and [build-guide/21](build-guide/21-ux-laws-and-os-ux.md) (the twenty UX laws applied to Funcaster and the phone, keeping the XP look).
8. **6 November 2026: whole-plan integration review.** [build-guide/22](build-guide/22-integration-review.md): the three technologies work together; the review found a hidden World dependency, several contradictions (now fixed, for example Table Cheers instead of player cheers), and that the work exceeds the time to 6 November, so it sets value-ordered gates and a freeze order. Four owner decisions are listed there.
9. **6 November 2026 (owner decisions and the creator platform).** World is not being built (L2 is a booth attestation; World stays as a later upgrade); the Season Cup is only ever a play-USDC testnet prize; the gates of [build-guide/22](build-guide/22-integration-review.md) are confirmed. New: [build-guide/23](build-guide/23-creator-platform-and-economy.md), the business model and Arc contracts for the creator platform (commerce rails pay creators; wagers never do). Revenue model researched and rebuilt in [build-guide/24](build-guide/24-business-model-and-revenue.md): sponsors, events and venues are the engine; passes are the long tail.
10. **6 November 2026 (the streamer network).** [build-guide/25](build-guide/25-streamer-network-and-after-hours-economy.md): the streamercade.live-style after-hours arcade on Twitch, YouTube and Kick through one gateway, direct triggers (Bits are never coins), new income streams for creators, streamers and sponsors, and three more Arc contracts (`ChannelRouter`, `UptimeStream`, `CommunityFund`).
11. **6 November 2026 (hand-off).** [build-guide/26](build-guide/26-codex-master-prompt-and-handoff.md): the one master prompt for Codex that runs every lane in gate order and resumes from a progress file, plus the teammate's setup and human-step checklist.

Status: plan, **reassessed 6 November 2026** (first 6 November). Nothing here is built. Prizes are as published on 6 November ([snapshot](01-prizes-snapshot-and-rules.md)); the page is unchanged 6 November: **World, Arkiv and Whitechain still say "Prize details coming soon"** ($42,500 of the $141,000), so the plan is built to be re-read the day they publish (section 7).

## 1. What changed on 6 November, and the answer

Two things changed since the first version:

1. **The owner decided the product gets real-life betting among friends** ([08](08-stakes-product-and-legal.md)). That makes *settlement* a first-class capability, and a pot contract has to be built anyway.
2. **The owner reports ETHGlobal told the team it qualifies for the fresh (unlabelled) tracks, not only the Continuity-labelled ones.** Recorded as working information; see the caveat in section 3.

**Current leaning (not a decision): Arc, World and Arkiv, with ENS the first reserve** (promoted if the team has a fifth engineer, or if the Arkiv or World brief disappoints). The decision is made when all problem statements are out.

| # | Partner | Why it fits now (in one line) | Brief | Marginal effort |
| --- | --- | --- | --- | --- |
| 1 | **Arc** | The pot contract is the betting feature; Arc's "Smart Contracts with Advanced Stablecoin Logic" bounty asks for conditional escrow with dispute resolution and payment splitting, and rewards reusable contracts ([09](09-arc-pot-and-settlement-plan.md)) | **Published** (5 x $3,000; winner counts not stated; must start in Arc Studio) | The pot is needed regardless: about 29 to 37 h |
| 2 | **World** | Real stakes make "one seat is one human" essential: it stops one person holding two seats and farming a friendly pot ([04](04-world-plan.md)) | **Unpublished** ($12,500); sibling events predict it | About 14 to 18 h for the stake gate and humans-only badge; 34 h with the full set |
| 3 | **Arkiv** | Pot terms, results, receipts, head-to-head records and live leaderboards as typed, expiring, wallet-owned records ([05](05-arkiv-plan.md)) | **Unpublished** ($15,000) | About 12 to 16 h, the cheapest per hour |

**The story:** *"Funcaster is a console where every seat is a verified human, every bet is held by a contract nobody controls, every match leaves a receipt you own, and the money comes back if anything goes wrong."* World proves the seats, Arc holds and pays the pot, Arkiv stores and serves the receipts, and the platform's replay-verified result decides the payout. All three share one **session key per phone** ([02](02-integration-architecture.md)).

**Why ENS moved from primary to first reserve.** ENS is still a strong fit and the only partner with a fully published structure and many places (Best Use of ENSv2: 4 places, $7,000). But it is **not needed for betting**, costs about 30 hours of optional work ([03](03-ens-plan.md)), and the pot, the human gate and the receipts already fill the three slots. **The closest call is Arkiv versus ENS for the third slot**; it is decided when Arkiv's brief is published, and a Sepolia ENSv2 spike in preparation keeps the option live ([07](07-schedule-prep-risks.md)).

**What 14 past winners say ([10](10-winner-patterns.md)):** the picks hold. Winners make the sponsor piece the product's rule engine, bind the human proof to the action, stack two or three sponsors that interlock, show a live on-chain demo, state test counts and limits, and (for Continuity) prove the old base is untouched with the flags off. Friends staking USDC on Arc is an established winning shape; a game is rare among winners (off-trend, so lead with the mechanism). ENS looks crowded with a high bar, which supports keeping it in reserve; there is **no winner data for Arkiv**, so its odds are the least calibrated.

**The principle behind the change:** *prefer partners whose integration the product needs anyway.* Arc's work is the pot, World's is the stake gate, Arkiv's is the receipt store. ENS adds a new surface purely for the prize.

## 2. Every sponsor, reassessed (fit with betting included)

Fit = does the sponsor's own description match something the product does; odds = prize places against likely competition and our edge. Judgements, not measurements. "Before" is 6 November score.

| Sponsor | Pool | Fit before | **Fit now** | Brief | Odds | Marginal effort (h) | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Arc** | $15k | 2 | **5** | Published (placeholders; Studio-first) | 3 | 29 to 37 (the pot) | **Primary** |
| **World** | $12.5k | 4 to 5 | **5** | No | 4 | 14 to 34 | **Primary** |
| **Arkiv** | $15k | 5 | **4** | No | 4 | 12 to 16 | **Primary** |
| **ENS** | $10k | 5 | 4 | Yes (6 places) | 4 | 30 | **Reserve 1** |
| Chainlink CRE | $1.5k | 3 | **5** (result oracle) | Yes | 3 | 6 to 8 | Build after the pot; apply only if it makes the three |
| Uniswap | $15k | 2 | **3** (pay in any token) | Yes | 3 | 10 to 12 | Reserve 2 (thin testnet liquidity, no sandbox) |
| EF Best CROPS App | $3.5k | 3 | **4** (non-custodial pot; "kill the relay, pull the refund") | Yes ("tbc") | 3 | 5 on top of the pot | Reserve 3 (EF allows one prize per project) |
| Hedera | $15k | 4 | 3 (a contract-less pot is custodial; x402 contrived) | Yes | 3 | 10 to 14 | Reserve 4 |
| Whitechain | $15k | ? | ? (the pot deploys on any EVM chain) | No | ? | 2 to 4 if it fits | Re-check |
| 0G | $15k | 2 | 2 | Yes | 2 | n/a | No |
| 1inch, Definitive | $12k | 1 | 1 | Yes | 1 | n/a | No |

## 3. Eligibility (settled by the owner on 6 November: confirmed with ETHGlobal, no action)

The owner confirmed that the team is eligible for the fresh partner tracks and that everything has been confirmed with ETHGlobal. For the record, **the public rules page reads stricter**: "Pre-existing project-specific code, designs, or assets are not allowed for Classic track submissions", and using pre-existing project-specific work outside an approved Continuity track "makes a submission ineligible for Partner prizes and the Finalist category"; for Continuity submissions, "eligibility for specific partner prizes may vary". The owner's confirmation settles it. Rules that apply either way: **written disclosure of the pre-existing work to the ETHGlobal team**, version control throughout, and the "all new parts remain open source" rule for Continuity. If the answer turns out to be "Continuity-labelled prizes only", the fallback is in [06](06-alternates.md) section 4.

## 4. How the work splits (the capacity plan)

| Owner | Scope | Hours |
| --- | --- | --- |
| **Pot owner** | Contract in Arc Studio, receipt web app, relay and phone wiring, oracle layer B ([09](09-arc-pot-and-settlement-plan.md)) | 29 to 37 |
| **World owner** | Verify gate, humans-only badge, stake eligibility, sybil-resistant boards ([04](04-world-plan.md)) | 14 to 34 |
| **Arkiv owner** | Entity model, outbox, receipts, live leaderboard ([05](05-arkiv-plan.md)) | 12 to 16 |
| **Lead** | Hosted relay, mock providers, S0 and S1 stakes (no chain), Chonk and the UI surfaces, demo, video, submission | 20 to 25 |
| **Optional fifth** | ENS ([03](03-ens-plan.md)) or Chainlink CRE layer | 30 or 8 |

Tiers 1 and 2 of the stakes work ([08](08-stakes-product-and-legal.md) section 7: dares, standing, the lock-before-start rule, the mock pot) need no chain and are built first.

## 5. The documents

| Document | Contents |
| --- | --- |
| [01 Prizes snapshot and rules](01-prizes-snapshot-and-rules.md) | Every sponsor and track as published, the rules, the re-check list |
| [02 Integration architecture](02-integration-architecture.md) | The capability seams, the `PARTNERS` switch, the sponsor wallet and hosted relay, degraded modes; Settlement is now active |
| [03 ENS plan](03-ens-plan.md) | ENSv2 design (reserve): party namespaces, delegation as roles, creator namespaces, agents |
| [04 World plan](04-world-plan.md) | IDKit, World ID, AgentKit; the stake gate, humans-only rooms, ghost agents, ranked boards |
| [05 Arkiv plan](05-arkiv-plan.md) | Entity model, outbox, receipts, live leaderboards, trophies |
| [06 Alternates](06-alternates.md) | The reserves, the swap triggers, the sponsors that are out |
| [07 Schedule, preparation and risks](07-schedule-prep-risks.md) | Calendar, preparation, the 36 hours, people, the public-repo problem, the demo |
| [**08 Stakes: product and legal**](08-stakes-product-and-legal.md) | Dare, standing and pot; the rules of a stake; the legal gate; business-plan alignment |
| [**09 Pot contract, oracle and the Arc track**](09-arc-pot-and-settlement-plan.md) | `ConditionalPot`, the three oracle layers, Arc Studio, optional extra prizes |
| [**10 Winner patterns**](10-winner-patterns.md) | What 14 past ETHGlobal winners (Tokyo and Lisbon 2026) and the Arc Cannes and HackMoney winners have in common, and the plan changes that follow |
| [**Build guide (6 November)**](build-guide/00-README.md) | The implementation specification for ENS, Arc and Arkiv: architecture, per-partner guides, UI integration, tasks and Codex prompts, tests and evidence, config and ops |
| [**11 Reserve track playbooks**](11-reserve-track-playbooks.md) | Build-ready outlines for Uniswap, EF CROPS App, Chainlink CRE and Hedera |

## 6. Decisions and questions

| # | Item | Status | Who |
| --- | --- | --- | --- |
| 1 | Legal position on real-value stakes | **Closed (owner, 6 November)**. The design default stays: stakes run on a testnet with no-value tokens, real value off by default ([08](08-stakes-product-and-legal.md)) | n/a |
| 2 | Public submission repository | **Closed (owner, 6 November)** | n/a |
| 3 | Eligibility and pre-existing-work disclosure | **Closed (owner, 6 November)** | n/a |
| 4 | Hacking start time on 6 November; team-size limit | Open, minor; see on arrival | Organiser |
| 5 | Booth crew versus hack crew (the Devcon booth and the hackathon overlap on 6 November: who staffs the booth and who builds, see [07](07-schedule-prep-risks.md) section 4) | Decide closer to the event | Owner |
| 6 | Is Orb or Selfie Check available to attendees in India? | Test on Indian phones when World publishes its track | World owner |
| 7 | Does Arc Studio export and deploy as expected, and does Chainlink CRE support Arc? | Scratch spike, only if Arc is chosen | Pot owner |
| 8 | A fifth engineer for ENS? | Deferred with the track choice; ENS is fully planned ([03](03-ens-plan.md)) | Owner |

## 7. The re-read checklist (when World, Arkiv and Whitechain publish, and the week of the event)

1. Re-run the snapshot in [01](01-prizes-snapshot-and-rules.md) and diff it against this plan.
2. For each new track: does it match a feature in [04](04-world-plan.md), [05](05-arkiv-plan.md) or the pot ([09](09-arc-pot-and-settlement-plan.md))? If it needs something we lack (a Mini App, Orb only, a different chain), use the swap table in [06](06-alternates.md).
3. **Whitechain:** a payments or consumer-app track could take the pot with a deployment change.
4. Re-check Arc's placeholders, EF's two "tbc" tracks, the rules page, and ENSv2 on Sepolia and mainnet.
5. Update the workstream in `plan.md` if the three change.

## 8. What happens now

**Only the game and the Funcaster UI** ([plan.md](../../../plan.md), [docs/plans/build/README.md](../build/README.md)). Nothing in this folder is a to-do until the track choice is made.

When the problem statements are all out and the tracks are chosen, the first steps are, in order: re-read section 7; for each chosen partner, open its plan ([03](03-ens-plan.md), [04](04-world-plan.md), [05](05-arkiv-plan.md), [09](09-arc-pot-and-settlement-plan.md), [11](11-reserve-track-playbooks.md)); optionally run scratch spikes in a separate repo (an Arc Studio project, an IDKit round trip on Sandbox, an Arkiv write and read, an ENSv2 name on Sepolia); and, if wanted, add the shared baseline (integration interfaces, mock providers, dares and standing, which need no chain: [02](02-integration-architecture.md) section 8, [08](08-stakes-product-and-legal.md) section 7).
