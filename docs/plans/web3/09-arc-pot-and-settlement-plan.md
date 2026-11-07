# Web3 plan 09: the pot contract, the result oracle, and the Arc track

Part of the [web3 plan](README.md). Status: plan, 6 November 2026. This is the money side of [08](08-stakes-product-and-legal.md): a non-custodial escrow that holds friends' stakes, pays from the platform's replay-verified result, and refunds when anything goes wrong. It is also the **Arc** integration, because the contract has to be built anyway and Arc's published bounty describes it almost word for word. **Nothing here is built; all of it is play-money (testnet) at the event** ([08](08-stakes-product-and-legal.md) section 6).

## 1. Why Arc, and what the bounty actually asks

The Arc page (6 November) lists five $3,000 bounties; **winner counts are not stated**. Two apply to a friends' pot:

| Bounty | What it asks (page, paraphrased) | Fit |
| --- | --- | --- |
| **Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio** (primary) | "Write, test, and deploy smart contracts in Arc Studio that demonstrate advanced programmable logic using USDC or EURC", then connect them to a web or mobile app without leaving Studio. Looking for **conditional escrow with dispute resolution**, **payment splitting**, programmable payroll or vesting, treasury logic; **reusable contracts get bonus consideration** | A match on three counts: conditional escrow, a dispute path, a payout split. Make the contract generic and reusable on purpose |
| **Best DeFi / Onchain Finance App Built End to End in Arc Studio** (secondary) | An onchain finance app using USDC or EURC for settlement, started from a prompt to Arc Studio; payments and consumer apps are in the list | Arguable for a payments app; **enter only if the submission rules let one project name two bounties** (the page says "each submission must state which bounty it targets") |

Not pursued: the Mobile Web Consumer Agent bounty (its API docs link is still a placeholder), Bridge Kit, and the Continuity bounty (the page marks it Continuity-only).

**Judging inputs (all five bounties, from the page):** built in **Arc Studio**, with the **Studio project URL** in the submission and Studio **shown in the demo**; a working MVP with **frontend and backend**; an **architecture diagram**; a video demo covering core functions and "effective use of Arc Studio and Circle's developer tools"; a GitHub or Replit link; the bounty named.

### Arc facts (docs.arc.io, 6 November; re-read before the event)

| Fact | Value | Note |
| --- | --- | --- |
| Testnet | chain id **5042002**; RPC `https://rpc.testnet.arc.io` (also Blockdaemon, dRPC, QuickNode); explorer `explorer.testnet.arc.io`; faucet `faucet.circle.com` | Faucet limits and any human step unknown: test 6 November |
| Mainnet | chain id **5042**; RPC `https://rpc.mainnet.arc.io`; explorer `explorer.arc.io` | **Never used for the event** (no-value rule) |
| Gas token | **USDC**, native, **18 decimals** | The ERC-20 interface of USDC uses its own decimals (commonly 6): **read `decimals()`, never assume**, and never mix the native and ERC-20 units |
| Finality | under 1 second | "Settled" is instant in the demo |
| Contract addresses | in the docs' contract-addresses reference | **Config, never hard-coded** |
| Arc Studio | An AI workspace from Circle (reported as launched shortly after mainnet): describe an app, it generates frontend, backend and smart contracts, can test across nine chains (Arc, Arbitrum, Avalanche, Base, Ethereum, Monad, OP Mainnet, Polygon, Unichain), runs in the browser and **can connect to Claude Code, Codex and Cursor** | From one news report (Circle's claims). **Unconfirmed:** deploy, GitHub export and whether an existing project can be imported; the page says prizes need Studio "as the starting point" |

**Studio-first rule.** The pot app is started **in Studio at kick-off** (6 November) from a written prompt (`integrations/arc-pot/PROMPT.md`, committed as the AI-use record); it is not imported later. The rest of Funcaster (relay, shell, phone) stays a separate codebase that talks to the pot over its public interface, which is also what makes the contract reusable. A scratch Studio project in preparation ([07](07-schedule-prep-risks.md)) answers the unconfirmed items.

## 2. The contract: `ConditionalPot` (generic, no admin, no fee)

One contract holds many pots (a mapping from `potId`), so a room is one `create` call. Deliberately small; the prompt to Studio carries this spec.

```
Pot { token, stake, seats[], funded[], payoutRule, oracle, fundDeadline, settleDeadline,
      challengeWindow, state, proposal{ places[], resultHash, at } }
state: Funding -> Locked -> Proposed -> Settled | Refunded      (Contested -> Refunded)
```

| Function | Who | What it does |
| --- | --- | --- |
| `create(token, stake, seats[], payoutRule, oracle, fundDeadline, settleDeadline, challengeWindow)` | anyone (the relay, in practice) | Records the terms; seats are fixed addresses; `payoutRule` is `WINNER_TAKES_ALL`, `TOP2_70_30` or `EQUAL_AMONG_TOP` |
| `fund(potId)` | a listed seat | Pulls exactly `stake`; when the last seat funds the pot is **Locked** (this is the signal the relay waits for before starting the match) |
| `settleCooperative(potId, places[], sigs[])` | anyone | Valid only with an **EIP-712 signature from every seat** over `(potId, places[])`; pays at once. Contract signatures (ERC-1271) are accepted so smart wallets work |
| `propose(potId, places[], resultHash)` | the pot's `oracle` only | Starts the **challenge window** (the oracle path, section 4) |
| `contest(potId)` | a listed seat, inside the window | Moves the pot to Contested; everything refunds |
| `finalize(potId)` | anyone, after the window | Pays from the proposal |
| `refund(potId)` | **anyone** | Allowed when: funding passed `fundDeadline` unfilled; Locked and `settleDeadline` passed with no proposal; or Contested. Returns each funded stake |

Rules baked into the code: the oracle supplies only the **places** (1 = best; equal = tie) and a `resultHash`, never amounts, so the payout rule limits what a report can do; **integer payouts with floor division and the remainder to the lowest-index winning seat** (a documented rule, tested); **no owner, no upgrade path, no fee, no pause key**; reentrancy-safe pull or guarded push with the checks-effects-interactions order; events for every transition (the receipt page and the Arkiv record index them).

**What the oracle can and cannot do.** In a winner-takes-all pot the oracle effectively picks the winner, so the safeguards are: the report must carry the `resultHash` that anyone can recompute from the public replay; a **challenge window** in which any seat can freeze and refund; and the cooperative path, which needs no oracle at all when the phones agree (the normal case). The terms card tells players which oracle address the pot trusts.

## 3. Funding at the event (play money) and later (real value)

- **Event:** each phone's session key (a browser keypair, [02](02-integration-architecture.md)) is the seat's address. On joining a staked room the **sponsor wallet drips** the stake **plus enough USDC for gas** (gas is USDC on Arc) from a faucet-funded wallet; the phone approves and funds. No wallet app, no seed phrase, about two taps. Drip is capped per room and per IP and has the kill switch from [02](02-integration-architecture.md) section 6.
- **Real value (not at the event):** the player connects their own wallet; the seat address is that wallet; the same contract. This path stays disabled by the region gate ([08](08-stakes-product-and-legal.md) section 6).

## 4. The result oracle: three layers, only the first is required

| Layer | Trust | Build |
| --- | --- | --- |
| **A. Cooperative.** Every phone signs the same payout message; no oracle | The players themselves | In the baseline of the pot: signature collection in the relay and the phone, `settleCooperative` | 
| **B. Relay oracle (fallback).** The relay signs a proposal with a dedicated key set as the pot's `oracle`; challenge window | The platform (visible, bounded by the window and the refund) | About 3 hours: `propose` caller in the wallet service |
| **C. Chainlink CRE oracle.** A Chainlink Runtime Environment workflow fetches the canonical result from the relay's public endpoint (`GET /api/result/<hash>` returning `verified`, `places`, `hash`), the nodes reach consensus on the response, and a signed report is written on-chain to the receiver | A decentralised network checking a public, replayable result | About 6 to 8 hours; **simulation with the CRE CLI is enough** for the Chainlink prize |

**Chain support is unverified.** CRE writes need the target chain to be supported; Arc may not be. At kick-off, check the CRE supported-networks list. If Arc is missing, deploy the same receiver on a supported testnet for the Chainlink demonstration and keep layer B as the Arc oracle (both are the same `propose` interface). Chainlink is **not** a required part of the Arc entry, and it is a spare partner ([06](06-alternates.md)): build it only after the pot works, and apply with it only if it ends up among the three.

## 5. Where the same pot earns other prizes (optional, only if staffed)

| Partner | The extra work on top of the pot | Marginal hours | Prize at stake (page) |
| --- | --- | --- | --- |
| **Chainlink CRE** | Layer C above | 6 to 8 | $1,500 (2 x $750) |
| **Ethereum Foundation, Best CROPS App** | The CROPS README section (the lead property is **control**: the pot is non-custodial, nobody, including us, can hold or freeze the funds, and **if Funcaster disappears every stake is still refundable**), no third-party trackers audit, a licence, and a demo of 3 minutes or less in which **we kill the relay and pull the refund**. The track is marked "tbc: final review pending", and EF allows one prize per project | 5 | $3,500 (3 places) |
| **Uniswap (open track)** | A pay-in swap: a player who holds another token funds the pot in it and the Trading API swaps to the pot token on a chain with Uniswap testnet liquidity (Base Sepolia, Unichain Sepolia or Ethereum Sepolia), which means a second deployment of the same contract there; payout in the token of choice. Needs `FEEDBACK.md` and the Developer Feedback Form. Testnet liquidity is thin and there is **no sandbox** | 10 to 12 | $10,000 (4 places), $5,000 Continuity-labelled |
| **Hedera** | A Hedera-native pot without Solidity (HTS plus scheduled transactions and threshold keys) is **custodial in practice**, which contradicts rule 8 of [08](08-stakes-product-and-legal.md); not recommended for the pot | n/a | n/a |
| **Whitechain** | Unknown track. The contract is plain Solidity and deploys on any EVM chain, so a payments or consumer-app track there is a configuration change plus a deployment | 2 to 4 | $15,000 (unpublished) |

## 6. Demo moments this adds (see [07](07-schedule-prep-risks.md) section 6)

1. Two phones accept the same terms card ("Golf, 5 play-USDC each, winner takes all, oracle: relay") and fund; **Chonk's collar tags light up** as each seat funds; the pot locks and the match starts.
2. The match ends; both phones sign; the pot **pays in under a second** (Arc finality) and the Results window shows the transaction.
3. A second match where one phone is **contested**: the pot refunds everyone.
4. **Kill the relay mid-pot and pull the refund from the explorer or the Studio app** (the CROPS moment, and proof that the platform never holds the money).

## 7. Tests

Contract: every transition and every illegal transition; payout rules with ties and the remainder rule; each refund condition; cooperative signature validity (wrong signer, replay on another pot, replay on another chain: the domain separator carries the chain id); the oracle can only act through `propose` and only before a settlement; challenge window boundaries; token with non-18 decimals; a malicious ERC-20 (reentrancy). Platform: the payout vector computed by `server/stakes.cjs` equals the contract's for every case; the lock-before-start rule; the abandoned-match refund; fault injection (the chain provider down never stalls a room, the outbox retries). Studio generates and runs its own tests; **keep them, and add the cases above**.

## 8. Effort and order

Contract with tests (Studio generates, we review and extend): 10 to 14 hours. Web app (create, view, settle, refund, receipts; this is also the shareable receipt page and the Studio "frontend"): 6 to 8. Relay and phone wiring (terms card, funding, signing, lock rule, outbox): 10 to 12. Layer B oracle: 3. Layer C: 6 to 8 (optional). Total **about 29 to 37 hours without layer C**, which is why the pot has its own owner ([07](07-schedule-prep-risks.md)).

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| **Arc Studio is new**, the page has unfinished placeholders, and import/export behaviour is unconfirmed | A scratch Studio spike this month; start the real project at kick-off; keep the contract spec self-contained so it can be rebuilt by hand and ported (the contract is the product, Studio is the tool) |
| Studio-first rule conflicts with a long-lived codebase | The pot app is its own project that exposes an interface; the console talks to it |
| Arc faucet limits or a human CAPTCHA step | Fund the sponsor wallet well before the event; spare wallets; the mock Settlement provider keeps the demo alive |
| CRE does not support Arc | Layer B is the Arc oracle; CRE is demonstrated on a supported testnet |
| The legal exposure ([08](08-stakes-product-and-legal.md) section 6) | Testnet only, labelled play money, region gate, counsel by 6 November |
| Phones need gas in USDC | The drip covers stake plus gas; a low-balance check before the match |
| A contract bug | No admin means no rug, but also no fix: testnet only until audited |

## 10. Sources

[Arc bounties (ETHGlobal Mumbai prizes page)](https://ethglobal.com/events/mumbai/prizes/arc); [Arc network parameters](https://docs.arc.io/arc/references/connect-to-arc); [Circle unveils Arc Studio (secondary report)](https://www.digitaltoday.co.kr/vn/view/105707/circle-unveils-arc-studio-builds-onchain-apps-with-a-single-prompt); [Arc track winners at HackMoney 2026](https://www.arc.io/blog/meet-the-arc-track-winners-from-the-hackmoney-2026-hackathon-and-what-we-learned) (155 teams on Arc testnet; escrow and conditional payments were already a common theme, so a generic escrow alone will not stand out: the **human-verified, game-result-driven, refund-by-default** design is the differentiator); [Chainlink CRE docs](https://docs.chain.link/cre) (workflow model, `cre workflow simulate`, onchain writes to an `IReceiver` consumer, `--broadcast` flag).
