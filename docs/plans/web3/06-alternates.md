# Web3 plan 06: the alternates, the cheap spare options, and why the rest are out

Part of the [web3 plan](README.md). Status: plan, 6 November, **6 November 2026** after the owner added real-life betting ([08](08-stakes-product-and-legal.md)). The three chosen partners are now **Arc, World and Arkiv, with ENS the first reserve** ([README](README.md)); ENS ([03](03-ens-plan.md)) is therefore the first alternate and is not repeated here. Two of the three have unpublished briefs, so this document says what to swap in if a brief turns out to be unsuitable, which sponsors can be added cheaply, and why the others are not recommended. Scores are **fit** (does the sponsor's own description match something the product already does, 1 to 5) and **odds** (prize slots against likely competition and our edge, 1 to 5); they are judgements, not measurements. Facts are from the prize pages and a research pass on 6 November 2026; **inference** is labelled.

## 1. Because a team applies to three but may build more

The rule: "Teams can select up to 3 Partner Prizes to apply for", and several tracks of one partner count as one. Selection happens **at submission**. So the sound strategy is **build the three primary integrations and, only if capacity remains, one cheap spare** that can replace a primary whose brief disappoints. A spare must cost at most about 8 to 12 hours and must not threaten the primaries.

## 2. The spares, ranked

**Order 6 November:** ENS (reserve 1, [03](03-ens-plan.md)), Uniswap, EF Best CROPS App, Chainlink CRE (built after the pot, [09](09-arc-pot-and-settlement-plan.md) section 4), Hedera. Stakes raise the fit of Uniswap (pay in any token), the EF CROPS App (a non-custodial pot) and Chainlink (the result oracle); [09](09-arc-pot-and-settlement-plan.md) section 5 gives their marginal hours on top of the pot. The sections below were written on 6 November; where they say "held stakes decision" read "decided, [08](08-stakes-product-and-legal.md)".

### 2.1 Hedera: "No Solidity Allowed" ($2,000, up to two teams of $1,000) (fit 4, odds 3, about 10 to 14 hours)

- **The fit.** Hedera Consensus Service (HCS) is an append-only, consensus-timestamped log: a natural **tamper-evident match ledger**. Post a hash of the canonical result (matchId, gameId, per-seat integer scores, replay hash; under 1,024 bytes, so one message) to a topic; the leaderboard verifies by replaying the topic through a Mirror Node; Hedera Token Service (HTS) NFTs serve as **winner badges or trophies**. That is HCS plus HTS plus the Mirror Node REST API, **no contract and no wallet for players** (the host account submits). The page rewards "creative HCS use for integrity, logging, or messaging" and a Mirror Node integration. Fee is roughly $0.0001 a message (a documentation figure: verify against the current fee table).
- **Requirements.** JavaScript/TypeScript or Python SDK, **no Solidity**, at least two native services, a public repo, a demo of five minutes or less (ETHGlobal's own limit is four).
- **Why it is only a spare.** It overlaps with Arkiv's role (a record sink); doing both is redundant unless Arkiv's brief disappoints. It would plug into the same `Records` capability ([02](02-integration-architecture.md)), so the swap is cheap.
- **The Continuity prize ("Built on Hedera", $1,500, up to two of $750): probably not available.** Its wording is "The project was built for a previous hackathon or already exists on Hedera". Unless our project was previously built for a hackathon or lives on Hedera, it does not qualify (inference; confirm with Hedera). 
- **The x402 track ($6,500, three places)** needs an x402-protected endpoint settled on Hedera and an agent paying with no human approving; a paid replay-verification API or metered creator API would be **contrived** for this product (about 12 to 16 hours, `@x402/hedera` not yet on npm). Not recommended.

### 2.2 Ethereum Foundation: Best CROPS Upgrade to an Existing Project ($1,500, Continuity only) (fit 3, odds 3, about 8 to 20 hours; the track is marked "tbc: final review pending")

- **The idea.** CROPS = censorship resistant, open source, private, secure; one property must be central and structural, with a **before and after** demo of three minutes or less, a README **CROPS section** (what the user depends on and what happens if it goes away; the license and whether it builds from the repo alone; what third parties learn; how keys and data are protected), **no third-party trackers**, and only the new work is judged.
- **Candidate lead property.** *Censorship resistance:* **remove the dependency on a relay server** (phone and TV connect peer to peer over WebRTC, with the QR carrying the offer), so the console works with no server and no internet. That is **a real engineering story** (it also lowers latency) of about 12 to 20 hours. A cheaper variant is *privacy*: sensor data never leaves the phone and the LAN, there are no accounts, and a tracker-free audit (about 6 to 8 hours); but this is already true today, so it is weaker as "new work".
- **Anon-RPC ($5,000)** is not recommended: it is judged on the **share of app traffic routed through Anon-RPC**, our app reads nothing from a chain unless the ENS or Arkiv integrations add reads, and the real Tor path was not verified end to end in the one integration I found. If the ENS integration is built, its client-side name reads could be routed through Anon-RPC as a small add-on, but only one EF prize per project is allowed.
- **Why it is only a spare.** Small prize, a major side project (P2P), and "tbc".

### 2.3 Uniswap: Build with Uniswap, Continuity ($5,000, four places of $1,250; Continuity only) and the open track ($10,000, four places) (fit 2, odds 3 on Continuity and 2 on the open track, about 10 hours)

- **The credible, non-gimmicky use.** **Creator payout in any token**: platform revenue or a tip in token X is swapped through the Uniswap Trading API and paid out in the creator's chosen token, with a payout-settings screen in the creator platform and a real transaction id. (**A pot settlement in any token** is the more natural fit but depends on the held stakes decision.) A custom v4 hook would be gimmicky for this product (20 or more hours): skip.
- **Facts.** A free API key from the Developer Platform; about 6 requests per second per key; quotes should be under 30 seconds old; **no sandbox** (production endpoints); testnets: Ethereum Sepolia, Base Sepolia, Unichain Sepolia; `integratorFees` splits only on exact-input swaps. Requirements: a public repo, a `FEEDBACK.md`, and a completed Developer Feedback Form linking it; the README must point to the contracts and lines.
- **Odds.** The Continuity pool of four places is the best prize-to-eligible-team ratio on the page, **but** the integration reads as tacked on unless creator payouts are real, the open track is dominated by v4 hooks, and testnet liquidity is thin (inference).
- **Why it is only a spare.** It needs a payments feature the product does not have and it touches the held stakes decision.

### 2.4 Chainlink: Best workflow with CRE ($1,500: up to two teams of $750) (fit 3, odds 3, about 6 to 8 hours)

- **The idea.** A **Chainlink Runtime Environment workflow** that calls our own API (the replay-verification endpoint), checks the result's canonical hash, and writes the verified result to a small contract: "an oracle for game results". A **simulation with the CRE CLI is enough** ("deployment is optional"); the workflow must be meaningfully used in the project. It plugs into the `Records` or `Settlement` capability. The earlier plan's VRF seed idea (a verifiable room seed) is the other fit.
- **Why it is only a spare.** The prize is tiny, but the effort is also tiny and the chance of a niche win is real; it is the cheapest possible third slot.

## 3. Not recommended, and why

| Sponsor and track | Fit / odds | Reason |
| --- | --- | --- |
| **Arc** (five $3,000 bounties; **Continuity: Bring Your Project to Arc**) | **now a primary (6 November): see [09](09-arc-pot-and-settlement-plan.md)** | 6 November reasoning, kept for the record, was fit 2 / odds 2: every Arc prize **requires starting in Arc Studio**, an AI app generator that exports to GitHub and **does not import an existing project** (workaround: generate a new Arc module, such as a creator-payout dashboard, in Studio and merge it); payments need funded EOA wallets, which conflicts with "works without a wallet"; the prize page has unresolved placeholders ("[Add API docs link.]", "[confirm reachable from Studio]"); agent-pays-API entries are crowded; one Continuity prize. Nanopayments for per-play creator payments is the best idea (about 10 to 14 hours) but a game console is off-theme |
| **0G** (iAI, Physical AI, Wildcard; **Keep Building: Continuity only for teams with a prior 0G project**) | 2 / 2 | We are **not eligible** for Keep Building; iAI is unavailable in the US, UK, Canada, China and the EU and wants apps that spend holders' compute credits; Physical AI wants a 0G call in a robot or device decision loop with a safe-stop fallback (a phone running a motion classifier could be argued as a "personal device", but it is a stretch); the Wildcard ($2,000, "weirdest thing") could fit an AI voice commentator for Chonk and replays, but it is a novelty prize on a stack we do not use |
| **1inch** (Aqua app; Continuity $2,000) | 1 / 1 | A DeFi position product has no hook in a game |
| **Definitive** (Flash advanced orders in a social app; Continuity "creative use") | 1 / 1 | Trading orders have no natural place here |
| **EF: Frame Transaction Alternative Mempool** ($5,000) | 1 / 1 | A protocol-research track |
| **Whitechain** ($15,000, "coming soon") | ? | An OP Stack L2 described as "The Onchain Economy Layer"; **re-read when tracks appear**: a creator-economy angle (creators earning from plays) might fit |

## 4. Triggers for swapping a primary

| If this happens | Do this |
| --- | --- |
| World's brief requires a Mini App or Orb-only verification | Swap World for **ENS** (if built) or the **EF CROPS App** (the pot's non-custodial story); stakes then lose the humans-only rule's partner credit but not the rule itself |
| Arkiv's brief asks for something unrelated to results and leaderboards | Swap Arkiv for **ENS** (if built), else **Chainlink CRE** or **EF CROPS App** |
| Arc Studio cannot produce or deploy the contract, or the Studio-first rule blocks us | Rebuild the contract by hand (the spec is self-contained), drop Arc, and apply with **Uniswap** (pay-in swap) or **EF CROPS App** for the pot; the pot is still built |
| A fifth engineer is available | Build **ENS** and choose the best three at submission |
| ENS mainnet is not live by 6 November | Stay on Sepolia and enter **Best Use** only; skip the mainnet-only Continuity prize |
| Whitechain publishes a creator-economy or payments track | Evaluate it as a replacement for the weakest primary |
| An organiser says Continuity teams cannot enter the unlabelled tracks | Enter only the Continuity-labelled prizes of the partners we chose (ENS Integration; any World or Arkiv Continuity track) and re-plan around Hedera Continuity, EF CROPS Upgrade and Uniswap Continuity |
