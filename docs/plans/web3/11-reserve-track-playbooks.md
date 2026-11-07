# Web3 plan 11: playbooks for the reserve tracks (Uniswap, EF CROPS App, Chainlink CRE, Hedera)

Part of the [web3 plan](README.md). Status: plan, 6 November 2026. **Nothing here is being built.** The final partners are chosen only after every sponsor's problem statement is published; the lead candidates have their own plans ([03 ENS](03-ens-plan.md), [04 World](04-world-plan.md), [05 Arkiv](05-arkiv-plan.md), [09 Arc and the pot](09-arc-pot-and-settlement-plan.md)). This document makes each reserve **build-ready**: what to build, the order, the facts to verify, the submission checklist, the tests, and the marginal hours on top of the shared pieces. All four plug into the capability seams in [02](02-integration-architecture.md) and reuse the pot from [08](08-stakes-product-and-legal.md) and [09](09-arc-pot-and-settlement-plan.md) where it exists. Prize amounts are from 6 November prizes page. Facts marked *verify* come from earlier research and must be re-read before building.

## 1. Uniswap: "Build with Uniswap" ($10,000 open, 4 places: $4,000, $3,000, $2,000, $1,000; plus the $5,000 Continuity-labelled pool)

**Idea (pay in any token).** A friend funds the pot with whatever token they hold; the **Uniswap Trading API** swaps it to the pot's token when they fund, and a winner can be paid out in a token of their choice. Alternative for the creator platform: a creator is paid in the token they choose, swapped from platform revenue. **No custom v4 hook** (20 or more hours, gimmicky here).

**Order of work**
1. Get a free API key from the Uniswap Developer Platform.
2. A `swap` helper in the wallet service: quote (check the quote is under 30 seconds old), build the transaction, submit, record the transaction id.
3. Deploy the pot contract on a chain with Uniswap testnet liquidity (Base Sepolia, Unichain Sepolia or Ethereum Sepolia), same source as the Arc deployment ([09](09-arc-pot-and-settlement-plan.md)); the terms card shows "fund in any token".
4. The phone's funding step: choose token, show the quote and the minimum received, confirm.
5. Payout in a chosen token: a swap from the pot token on `finalize`/`settle` (a separate transaction after payout, so a swap failure never traps funds).

**Facts to verify:** about 6 requests per second per key; there is **no sandbox** (production endpoints; testnets are Ethereum Sepolia, Base Sepolia, Unichain Sepolia and liquidity there is thin); `integratorFees` split only exact-input swaps.

**Submission checklist (page):** public open-source repository; a **`FEEDBACK.md`**; a completed **Uniswap Developer Feedback Form** linking it ("submissions without it will be reviewed and audited"); the README points to the relevant contracts and lines.

**Tests:** quote expiry; a failing swap leaves funds in the original token; slippage bound respected; the pot accounting equals the swapped amount; swaps never run for an unverified seat.

**Risks:** thin testnet liquidity (demo a pair with seeded liquidity); integration reads as tacked on unless the funding flow genuinely needs it. **Marginal hours: 10 to 12** on top of the pot.

## 2. Ethereum Foundation: Best CROPS App ($3,500, 3 places: $2,000, $1,000, $500; "tbc: final review pending")

**Idea.** An open-source app with one CROPS property made structural and demonstrable. The lead property for the pot is **control (censorship resistance)**: nobody, including the developers, can hold, freeze or redirect the funds, and **if the platform disappears every stake is still refundable**. The three-minute demo is the "kill the relay, pull the refund" moment ([09](09-arc-pot-and-settlement-plan.md) section 6). A cheaper alternative lead is **privacy**: sensor data never leaves the phone and the LAN, no accounts, no trackers.

**What the page requires:** an open-source licence (approved list: check), and a README **CROPS section** with four parts: **C** what the user depends on that we control and what happens if it goes away; **O** the licence and whether the user can build and run it from the repository alone; **P** what each third party learns about the user; **S** how keys and user data are protected. A demo of **3 minutes or less** showing the lead property working; **no third-party trackers or analytics in the client**. **EF allows one prize per project.** (The CROPS Upgrade track, $1,500, is Continuity-labelled and judges only new work with a before-and-after statement; its idea is a relay-free peer-to-peer mode over WebRTC with the QR carrying the offer, about 12 to 20 hours.)

**Order of work:** (1) a third-party-request audit of the client (a test that fails if any request leaves to a non-listed origin); (2) the permissionless refund and cooperative settlement already in the contract; (3) a "run it yourself" script and README proving the stack builds from the repository alone; (4) the CROPS README section; (5) record the 3-minute demo.

**Tests:** the no-third-party-request test; refund works with the relay process stopped; the privacy claims (what the relay and chain learn) are listed and match the traffic. **Marginal hours: about 5** on top of the pot (the P2P upgrade variant 12 to 20).

## 3. Chainlink: "Best workflow with CRE" ($1,500, up to two teams of $750)

**Idea.** A **Chainlink Runtime Environment** workflow that turns a platform result into an on-chain settlement: trigger, fetch the canonical result from the relay's public endpoint, reach consensus across nodes, write a signed report to a receiver contract. This is **oracle layer C** of the pot ([09](09-arc-pot-and-settlement-plan.md) section 4). Without a pot it can also write a verifiable room seed or a verified-result record.

**Order of work**
1. `GET /api/result/<hash>` on the relay returns `{ verified, places, hash }` deterministically (identical bytes for identical input, so node consensus works).
2. The workflow (TypeScript SDK): trigger (an EVM log such as `SettlementRequested`, or an HTTP trigger) → HTTP fetch → build a report → EVM write to the receiver's `onReport`.
3. The receiver: the pot's `propose` path or a small standalone consumer contract.
4. Simulate with `cre workflow simulate` (a dry run unless `--broadcast` is passed). **Simulation is enough for the prize**; deployment is optional.

**Facts to verify:** the CRE **supported-networks list** (Arc may not be supported; if not, deploy the receiver on a supported testnet and keep the relay oracle as the Arc path); workflows compile to WebAssembly, so Node-only libraries (`fs`, native bindings) do not work; the SDK is available in Go and TypeScript.

**Submission checklist (page):** a workflow that integrates at least one blockchain with an external API, system, data source, LLM or agent; a successful simulation or deployment; "meaningfully used in your project" (state what breaks without it: the settlement falls back to the relay oracle).

**Tests:** the endpoint is byte-stable; the receiver rejects a report from anyone but the configured forwarder; a replayed report does nothing; a mismatched result hash is refused. **Marginal hours: 6 to 8.**

## 4. Hedera ($15,000 across four tracks)

| Track | Prize | Fit | Plan |
| --- | --- | --- | --- |
| **"No Solidity Allowed": build with Hedera SDKs** | $2,000 (up to 2 x $1,000) | Medium | A **tamper-evident match ledger**: post a hash of the canonical result (match id, game id, per-seat integer scores, replay hash; under 1,024 bytes, so one HCS message) to a Hedera Consensus Service topic; the leaderboard verifies by reading the topic through the Mirror Node REST API; **HTS NFTs** as winner trophies. JavaScript/TypeScript or Python SDK, **no Solidity**, at least two native services, a public repository, a demo of 5 minutes or less (ETHGlobal's own limit is 4) |
| **Tokenize Anything with Hedera Studios** | $5,000 (3 places) | Low | Use Asset Tokenization Studio or Stablecoin Studio to issue a tokenized asset or stablecoin; nothing natural in this product (a non-redeemable "chonk" token would contradict the business plan) |
| **AI Agents That Pay: x402** | $6,500 (3 places) | Low | Needs an x402-protected endpoint settling on Hedera and an agent paying with no human approving; a paid replay-verification API is contrived. `@x402/hedera` was not yet on npm when checked |
| **Built on Hedera (Continuity)** | $1,500 (up to 2 x $750) | Low | The page says "built for a previous hackathon or already exists on Hedera"; likely excluded |

**Order of work (No Solidity):** (1) a testnet operator account and a topic; (2) a `Records` provider that submits the result hash ([02](02-integration-architecture.md)); (3) a Mirror Node reader and a verification page; (4) an HTS NFT collection and a mint on a win; (5) HashScan links in the Results window. A Hedera-native pot without Solidity (HTS plus scheduled transactions and threshold keys) is custodial in practice and contradicts rule 8 of [08](08-stakes-product-and-legal.md); not recommended. **Facts to verify:** current HCS message fee (about $0.0001 in documentation), SDK versions, Mirror Node rate limits. **Tests:** message size under the limit; ledger replay reproduces the leaderboard; a missing Mirror Node read degrades to the local board. **Marginal hours: 10 to 14.**

## 5. How to use these playbooks

1. When all problem statements are published, compare each against the matching plan in this folder ([README](README.md) section 7).
2. Pick up to three partners (several tracks of one partner count as one). If a chosen partner's brief matches a reserve's feature better than expected, swap using the table in [06](06-alternates.md) section 4.
3. Each plan lists its own marginal hours, tests and submission checklist; reuse the shared pieces (capability registry, outbox, sponsor wallet, mock providers) rather than rebuilding them.
