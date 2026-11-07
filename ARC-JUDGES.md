# Funcaster × Arc — judge guide

**Documentation edition: 7 November 2026.** Chain observations below were recorded on **6 November 2026**. This file is the technical record of how Arc is used and which public receipts prove each claim. Deeper raw reports stay linked; the mechanism and the proof boundaries are here.

Funcaster turns a TV or laptop into a 13-game party console for 1–4 phone controllers. Players scan a QR code, use landscape XP-style touch pads or optional motion, and stay in the same room across games. Arc holds the test-token bankrolls, optional equal-stake pots, spectator predictions, table cheers and creator room passes.

**Open:** [console](https://funcaster.onrender.com/?shell=os), [Live Hub](https://funcaster.onrender.com/live/), [predictions](https://funcaster.onrender.com/predict/), [creator commerce](https://funcaster.onrender.com/commerce/), [Hall and receipt ledger](https://funcaster.onrender.com/records/). These links show the deployed build; the latest repository merge is not itself a deployment.

Only **Arc testnet, chain 5042002**, and Circle test USDC/EURC are used. Mainnet chain 5042 is refused by preflight. No real funds are used.

## How a phone payment reaches Arc

The relay is keyless. A phone creates a browser key, proves that address when it joins, and only ever signs. A separate worker holds the relayer key, pays Arc gas in test USDC, and is the only process allowed to submit those transactions.

1. **Identity.** QR join binds the phone session to a seat. The same address is the Arc seat and, when ENS is on, the owner of the seat name. See [ENS-JUDGES.md](ENS-JUDGES.md).
2. **Bankroll.** On a funded room the worker sends a capped plain USDC transfer to that address (hosted cap: 1.10 test USDC per identity, 4.40 per room, 10 per IP-hour, 10 total). The phone never needs native gas. EURC is implemented in the pot and in the worker, and the public pot audit used it; the hosted runtime enables USDC only.
3. **Terms freeze.** Stake, asset, seats, payout rule, oracle, deadlines, challenge window, minimum play time and a metadata hash are fixed before any phone signs. `create` does not accept a caller-supplied terms hash. `ConditionalPot.hashTerms` derives it on chain from those fields. A squatted `potId` with different terms fails the seat's `Accept`.
4. **Two signatures, one gesture.** The phone signs an EIP-712 `Accept(potId, termsHash)` under domain `{name: "ChonksPot", version: "1", chainId: 5042002, verifyingContract: ConditionalPot}`, and an EIP-3009 `ReceiveWithAuthorization` under the token domain (`name` `"USDC"` or `"EURC"`, `version` `"2"`, `chainId` 5042002, `verifyingContract` the token proxy). The authorization pays the pot, for exactly `stake`, with `nonce = keccak256(abi.encode("chonks-fund", potId, seat))` and `validBefore` no later than the funding deadline.
5. **Admission before broadcast.** The worker checks the pinned contract, chain, domain separator, intent, nonce and cumulative spending journal, simulates, stores the exact hash, then broadcasts once. An uncertain transaction keeps that hash and is reconciled. It is not replaced or sent again. External nonce movement stops the signer.
6. **Pull on chain.** `fundWithAuthorization` checks `Accept`, then the pot itself calls the token's payee-only `receiveWithAuthorization` (the `bytes` signature overload, so an ERC-1271 seat can sign). The contract requires the pot's balance to rise by exactly `stake`. A front-run to a different recipient cannot succeed, because only the payee may submit that authorization.
7. **Lock, then result.** The last funded seat moves the pot to `Locked`. The relay will not start a staked match until it reads that state. Settlement is cooperative when every seat signs the same `Settle(potId, placesHash)`. Otherwise the pot's oracle may `propose` after `minPlaySeconds`. Any seat can `contest` inside the challenge window, which refunds everyone. An uncontested proposal can be `finalize`d by anyone. Unfilled funding and an unsettled lock past their deadlines are also permissionless refunds.
8. **Claims.** `claim` zeroes that seat's credit first, then transfers. A blocklisted or reverting recipient reverts only that call. Other seats still claim. The worker claims for each seat after settlement.

Predictions and cheers use the same EIP-3009 pattern with the token's `(v, r, s)` overload. Creator passes add a second EIP-712 permit on `RevenueRouter` itself. Those three contracts are separate from the pot. A seated player is excluded from betting on, or cheering, their own table.

PostgreSQL stores the intents, jobs and receipt journal. Rooms themselves stay in relay memory. A relay restart interrupts a live round; admitted payments and receipts remain.

## Arc properties this build actually uses

These are properties of Arc testnet and of Circle's FiatToken v2.2 deployment on it. Each one has a corresponding check in code or in the 6 November probes.

| Arc fact | Address or value | How Funcaster uses it |
| --- | --- | --- |
| Chain | 5042002. RPC `https://rpc.testnet.arc.io`, second host `https://rpc.testnet.arc.network`. Explorer `https://explorer.testnet.arc.io` | Every live send and every independent read pins this chain. A wrong chain fails closed. |
| Gas token | Native USDC, 18 decimals. ERC-20 USDC is the same balance with 6 decimals (`DECIMALS_SCALING_FACTOR = 1e12`) | The relayer pays gas. Humans see one 6-decimal amount. Fee display uses `gasUsed × effectiveGasPrice / 1e18` from the receipt. The two views are never added. |
| USDC | `0x3600000000000000000000000000000000000000`, `FiatTokenProxy` to `NativeFiatTokenV2_2` `0xC6AD664ac6679F4Ce74e10E91449C93Ec1ae3cA6`, name `"USDC"`, version `"2"`, 6 decimals | Pot, markets, cheers and creator commerce. Preflight compares a local EIP-712 hash with on-chain `DOMAIN_SEPARATOR()`. |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`, `FiatTokenProxy` to `FiatTokenV2_2` `0xECA045ED98a6D70887d2050F3BE1Fb0F0311017c`, name `"EURC"`, version `"2"`, 6 decimals | Second immutable pot/market asset. An EURC-only account has no native gas, so the relayer pattern is required. Creator commerce accepts USDC only: a USD fee threshold has no documented FX rate. |
| EIP-3009 | `receiveWithAuthorization` selectors `0xef55bec6` (`v,r,s`) and `0x88b7ab63` (`bytes`). Payee-only. Replay reverts once `authorizationState` is used | Funding, bets, cheers and room passes. The pot uses the `bytes` overload. Markets, cheers and commerce use `v,r,s`. |
| Fee floor | Minimum base fee 20 gwei. A lower `maxFeePerGas` is dropped with no receipt | Worker fees are quoted, then bounded: at least the base fee and 20 gwei, at most the configured ceiling (100 gwei on the pot deployment). Priority fee on Arc sends is 0. |
| Fresh-account drain | A transfer that empties a brand-new USDC account reverts (`Cannot clear balance of empty account`) | `MIN_RETAINED_BALANCE = 50_000` (0.05 of a 6-decimal token). Funding reverts unless the seat still holds that much after the pull. The phone and the relay apply the same floor before signing. The pot keeps nothing extra. |
| Blocklist | A transfer to or from a blocklisted address reverts and the included transaction still burns gas. The published test address `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` is blocklisted on USDC and not on EURC | Payouts are pull claims, one recipient per call. One blocked seat cannot freeze the others. |
| Finality | Deterministic BFT finality; explorer samples on the research day were sub-second. Several blocks can share one timestamp | A returned receipt is treated as final. Ingestion is still idempotent on transaction hash and log index. Deadlines use `>=` and `<` so equal timestamps have no gap and no overlap. |
| Double USDC log | One ERC-20 USDC transfer emits a 6-decimal `Transfer` from `0x3600…0000` and an 18-decimal system log from `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` | Audits match the token-emitter transfer and its 6-decimal value. The two logs are never summed. |
| `eth_getLogs` | Ranges above 10,000 blocks return -32012. Near-head reads can return -32014 | Readers page in chunks of at most 9,999 blocks and retry bounded read failures. Sends are single-shot. |

The token proxies are upgradeable and have a pauser, a blocklister and an owner. Funcaster's own contracts have no admin, pause, upgrade or rescue. A paused or blocklisted token can still stop every pot that uses it. That dependency is stated in [ConditionalPot's trust note](integrations/arc/onchain/docs/CONDITIONAL_POT.md).

Researched and left unused, with no public receipt: Circle Memo (`0x5294E9927c3306DcBaDb03fe70b92e01cCede505`; the worker requires `ARC_MEMO=off`), Chainlink CRE, Circle Gas Station, and any privacy or cross-chain transfer. The local Arc fork still reverts an unsigned Memo call after the live `eth_call` succeeded; that simulator gap is unresolved and no Memo transaction was sent.

## Contracts

All five addresses are on chain 5042002.

| Name | Address | Role |
| --- | --- | --- |
| Relayer | [0x81DdeD7eE7753791cEaF24Ab6Cb1694d1F39A008](https://explorer.testnet.arc.io/address/0x81DdeD7eE7753791cEaF24Ab6Cb1694d1F39A008?tab=txs) | Worker EOA. Pays gas and submits sponsored transfers. |
| ConditionalPot | [0xe339B15Aa54596B4752923d981DAC30B7A569F82](https://explorer.testnet.arc.io/address/0xe339B15Aa54596B4752923d981DAC30B7A569F82) | Equal-stake pots, cooperative settlement, oracle proposal, contest, refund, pull claim. USDC and EURC. |
| MatchMarkets | [0x31c000cFe6FE6F5d12CA5735B913E3e0149fD5DF](https://explorer.testnet.arc.io/address/0x31c000cFe6FE6F5d12CA5735B913E3e0149fD5DF) | Spectator winner markets (`ChonksMatchMarkets`). |
| SplitPayout | [0xC82c2BA2c1A057C2ED73d8030e77FF7100a719F9](https://explorer.testnet.arc.io/address/0xC82c2BA2c1A057C2ED73d8030e77FF7100a719F9) | Fixed cheers, then an equal split of the frozen human lineup, or a refund. |
| RevenueRouter | [0x43fD866eF3FCA5b0A7b02c262F3602283D5aA192](https://explorer.testnet.arc.io/address/0x43fD866eF3FCA5b0A7b02c262F3602283D5aA192) | Immutable creator versions, 24-hour room passes, per-recipient credits. USDC only. |

Pinned tokens: [USDC](https://explorer.testnet.arc.io/address/0x3600000000000000000000000000000000000000) and [EURC](https://explorer.testnet.arc.io/address/0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a).

### ConditionalPot

One contract holds many pots. Construction freezes an allowlist of one to four 6-decimal tokens. This deployment's allowlist is USDC and EURC. There is no setter.

```text
None → Funding → Locked → Proposed → Settled
         │          │         │
         │          │         └→ Contested → Refunded
         └──────────┴───────────→ Refunded
```

| Call | Who may succeed | Effect |
| --- | --- | --- |
| `create(potId, params)` | Anyone | 2–4 distinct seats, stake > 0, challenge window ≥ 60 s, `minPlaySeconds` > 0, deadlines ordered. Stores `Funding` and the on-chain terms hash. A repeat id reverts. |
| `fundWithAuthorization` | Anyone, carrying the seat's signatures | Verifies `Accept`, pulls `stake`, requires the seat to retain ≥ 0.05. The last seat emits `Locked`. |
| `settleCooperative` | Anyone, with every seat's `Settle` | Dense places only: `(1,1,2)` is valid and `(1,1,3)` is not. The relay normalizes competition ranks before signing and does not change the game-result hash. |
| `propose` | That pot's oracle only | After `lockedAt + minPlaySeconds` and before `settleDeadline`. Stores a places hash and a result hash. The oracle cannot set amounts. |
| `contestWithSig` | Anyone, with one seat's `Contest` | Strictly inside the window. Moves to `Contested`, which refunds every funded stake. |
| `finalize` | Anyone | At `proposedAt + challengeWindow`, places must match the proposal. |
| `refund` | Anyone | Funding past `fundDeadline`, locked and unproposed past `settleDeadline`, or contested. |
| `claim` | Anyone | Pays one seat. Failure is isolated. |

Payout rules are fixed at creation: winner-takes-all, top two at 70/30, or equal among the seats tied for first. Integer division floors; the remainder goes to the lowest-index seat in the highest paid tier. The sum of claimable amounts equals `stake × seats`. A universal tie pays everyone equally. Places 3 and 4 receive nothing under the 70/30 rule.

The public A4 run used a project-operated oracle key for `propose`. That key can only propose. Seats can still force a refund by contesting. Cooperative settlement needs no oracle. Chainlink CRE was not wired to `propose`.

Source and the encoding: [ConditionalPot.sol](integrations/arc/onchain/contracts/ConditionalPot.sol), [CONDITIONAL_POT.md](integrations/arc/onchain/docs/CONDITIONAL_POT.md).

### MatchMarkets and SplitPayout

Both take an immutable asset allowlist and have no admin and no asset setter.

`ChonksMatchMarkets.placeBet` pulls a spectator's stake with EIP-3009. Creation freezes the excluded seat addresses, so a seated player cannot bet that market. Two outcomes must be funded before a report is accepted. `reportResult` may be called only by `reporterA` or `verifierB`. Each key submits once. The stored commitment is `keccak256(abi.encode(chainId, address(this), marketId, resultHash, winMask))`. Matching commitments start a liveness window. The verifier alone may `veto` during that window, which voids the market. After liveness, anyone may `finalize`. Disagreement cannot be overwritten; the market can only expire into a void. `voidExpired` is permissionless at the resolve deadline. Winners and the fee recipient pull their own credits. Claim-order rounding gives any dust to the first winner so the pool sums exactly.

The verifier is a second process with its own key. It replays the canonical game record before it reports. Both keys belong to this project. This is an application two-key check, not an independent oracle network. A confirmed market receipt proves that those two keys submitted the same commitment. It does not, by itself, prove the game.

`SplitPayout` uses the same two-key report. Cheer sizes are fixed at 50,000, 100,000 and 250,000 base units (0.05, 0.10 and 0.25). One cheer per address, at most 25 per table. A frozen recipient cannot cheer. After matching reports the total is split equally across the frozen human lineup; each recipient pulls. A void refunds each spectator their own cheer.

On the hosted attempt, market 1 took two opposing 0.05 USDC bets and then became Void because the game never started. The cheer authorization was valid in the client and never reached signer admission, so no cheer was charged.

### RevenueRouter

`RevenueRouter` is creator commerce, separate from pots and markets. Deployment pins one 6-decimal EIP-3009 token; this deployment uses USDC. The immutable operator can register a version and relay a payment. It cannot forge a payer signature or withdraw a credited balance. There is no pause, upgrade or rake sweep.

A version freezes the creator, price (at most 100 USDC), optional venue, optional referral and up to four collaborators. Registration is one-shot. A payer signs `PassPermit(paymentId, versionId, payer, roomHash, attribution, referred, atVenue, validAfter, validBefore)` on the router (domain bound to the live chain id) and a matching EIP-3009 authorization. `paymentId` is a one-use token nonce. A successful payment sets a 24-hour pass for that version, room and payer. Passes do not stack.

The first 1,000 test USDC of a creator's lifetime gross (`FREE_BAND = 1000e6`) is fee-free. Above that, the platform fee is 10% of gross, or 5% when the permit sets `attribution`, and the contract hard-caps any fee at 15%. Venue and referral shares are extra slices of gross, configured on the version; they do not reduce the platform fee. Division rounds down and the creator pool receives the remainder. Collaborator dust stays with the creator. Each recipient pulls with a sequential `ClaimPermit`. The transfer destination is the signer. ERC-1271 claim signatures are accepted. A failed claim leaves every other credit in place.

Hosted evidence includes creator registration and one 0.50 USDC pass. An earnings claim on that pass was not completed.

## What a receipt proves

Two Arc hosts are `rpc.testnet.arc.io` and `rpc.testnet.arc.network`. A **two-host receipt** means both returned the same transaction hash, status, sender, calldata, canonical block hash, fee fields and the token-emitter `Transfer`. Reproduce the pot audit with `node scripts/web3-arc-verify-acceptance.mjs`. It loads no key, signs nothing and does not edit journals.

A confirmed receipt proves that transaction and those log fields. It does not prove that a game result was correct. Game replay is a separate label (`verificationScope: game-replay`). The append-only receipt hash chain in PostgreSQL is an application journal. It is not anchored on Arc and it is not a full chain index. The public ledger shows worker receipts the relay persisted. Automatic idle refunds can land in the worker journal and on the explorer without a matching ledger row; those refunds are cited from the explorer and from direct RPC reads.

## Proofs

### 1. EIP-3009 and the 0.05 floor — two-host

USDC probe, relayer `0x81Dd…A008`, signer `0xd910Fb008F7F9A63f20e575aC394A47aCcb7bc91` (this address held USDC, so it was not a zero-native signer; the EURC probe below is):

| Step | Transaction | Block | What was checked on both hosts |
| --- | --- | --- | --- |
| Relayer transfers 0.051 USDC | [`0xb99934a228a783c23a5fdd62aa98181680ebc6a34b94e6ce11de28be171b16bb`](https://explorer.testnet.arc.io/tx/0xb99934a228a783c23a5fdd62aa98181680ebc6a34b94e6ce11de28be171b16bb) | 70919676 | Sender, token, calldata, exact token-emitter transfer, gas, canonical block |
| Relayer submits `receiveWithAuthorization` for 0.001; signer keeps 0.05 | [`0xf1a0c031706d1c97891ec1918d50985fa4145e796aecf11a877aabfea0c6c76c`](https://explorer.testnet.arc.io/tx/0xf1a0c031706d1c97891ec1918d50985fa4145e796aecf11a877aabfea0c6c76c) | 70919681 | Same fields, plus `authorizationState` used. A second unsigned simulation of the same authorization reverts |

Gas for both: 0.00322892 test USDC. Relayer afterward: 19.946771 USDC. Reports: [owner](docs/web3/spikes/arc-owner-live.json), [both hosts](docs/web3/spikes/arc-owner-verified.json).

EURC probe, fresh signer `0x7a66B9dD5eED3F3fB4B5f82619f8f0A8112CF08E`, which stayed at zero native USDC before and after:

| Step | Transaction | Block |
| --- | --- | --- |
| Relayer transfers 0.051 EURC | [`0x4e1cca71dd8d5215bc2100394fed8d49907ff6598bbc1d1ef4e22e6029ae2e62`](https://explorer.testnet.arc.io/tx/0x4e1cca71dd8d5215bc2100394fed8d49907ff6598bbc1d1ef4e22e6029ae2e62) | 70943614 |
| Sponsored receive of 0.001 EURC; signer keeps 0.05 EURC and 0 native USDC | [`0x0468caecbca29a8d05fd3947a047b6fc6ea4c8763d285e64a17767211b0292f6`](https://explorer.testnet.arc.io/tx/0x0468caecbca29a8d05fd3947a047b6fc6ea4c8763d285e64a17767211b0292f6) | 70943623 |

Replay simulation reverts. Gas 0.00296636 test USDC, under the 0.2 cap. Relayer afterward: 19.95 EURC. Reports: [owner](docs/web3/spikes/arc-eurc-owner-live.json), [both hosts](docs/web3/spikes/arc-eurc-owner-verified.json).

These two probes prove payee-only sponsored transfer, the retained floor, and that an account with no native USDC can still move EURC when the relayer pays gas. They are not pot, market or commerce payments.

### 2. ConditionalPot deployment — two-host

Owner-signed creation [`0x69d3bbc0f5428c25827e314f83121a4dcef954a69413d754e8b3adf629737448`](https://explorer.testnet.arc.io/tx/0x69d3bbc0f5428c25827e314f83121a4dcef954a69413d754e8b3adf629737448), block **71010272**, cost **0.06359452** test USDC, under the 0.1 ceiling. Both hosts were checked for the exact reviewed creation calldata, runtime code, EIP-712 domain and the USDC/EURC allowlist. The first local wrapper returned `INVALID_PROOF` before that read-only reconciliation; no second deployment was sent. Studio's deployer was not used: it could not enforce the fee ceiling or the no-resend rule. The bytecode is the reviewed Studio export.

### 3. Public pot lifecycle — two-host, synthetic matches

On 6 November the owner ran 12 scripted checkpoints. The keyless verifier then accepted **54 worker transactions** and **eight terminal pots** on both RPC hosts: exact intent, sender, nonce, gas, canonical receipt and block, method and asset restrictions, deployment code, fixture terms, bankroll transfers and final `getPot` / claimable state.

| Flow | Final state | Unpaid claims |
| --- | --- | --- |
| USDC cooperative, refund, contest, finalize | Settled, Refunded, Refunded, Settled | none |
| EURC cooperative, refund, contest, finalize | Settled, Refunded, Refunded, Settled | none |

Spending: relayer gas 0.11218748 USDC, oracle gas 0.00859752 USDC, USDC drips 0.12, EURC drips 0.12. Combined with deployment gas, 0.18437952 test USDC, under the 0.65 combined ceiling. The last two EURC claims are [`0xa95a631263f573a4c860eb70d67394ead41016c3d0287fd155092bc3e2f31ff3`](https://explorer.testnet.arc.io/tx/0xa95a631263f573a4c860eb70d67394ead41016c3d0287fd155092bc3e2f31ff3) (block 71028902) and [`0x9961aade2d12667b66a3b40ea4b5cf309b9a941ba1e3529437b86faa60b1cb3d`](https://explorer.testnet.arc.io/tx/0x9961aade2d12667b66a3b40ea4b5cf309b9a941ba1e3529437b86faa60b1cb3d) (block 71029002).

The full hash list, pot ids and block hashes are in [the independent audit](docs/web3/spikes/g1-arc-worker-public-verified.json) and [the write-up](docs/web3/g1-arc-worker-public.md). Results were synthetic canonical fixtures. This audit does not prove a phone-played match, and it is not a professional security audit. Locally, before that public run: 177 Foundry passes, 273 contract/relay payout matches, and 17 Arc-fork checks covering both assets.

### 4. Hosted commerce, predictions and refunds

Public ledger rows for these four were independently confirmed after relay `cff34f0`:

| Action | Transaction | Amount |
| --- | --- | --- |
| Creator version registration | [`0x5de7d5fa450b9606d233b3cd94ea5c70b09bd268dd22d57c4782b70d34828e0b`](https://explorer.testnet.arc.io/tx/0x5de7d5fa450b9606d233b3cd94ea5c70b09bd268dd22d57c4782b70d34828e0b) | registration |
| Room pass | [`0xdf3096da05c5e12a17e817a4c8c81390526a6cc553390a745131a1022554e5b1`](https://explorer.testnet.arc.io/tx/0xdf3096da05c5e12a17e817a4c8c81390526a6cc553390a745131a1022554e5b1) | 0.50 test USDC |
| Spectator 1 bet, market 1 | [`0xfea537d8ca9e0c7e073bafe89fb19819dae017cbdaa16015a38ae3788a2790c2`](https://explorer.testnet.arc.io/tx/0xfea537d8ca9e0c7e073bafe89fb19819dae017cbdaa16015a38ae3788a2790c2) | 0.05 test USDC |
| Spectator 2 bet, opposite outcome | [`0xe904e76162adeb53ae49f0ac7d48d1dd7cb9051692c88266bfee7cf927012ecc`](https://explorer.testnet.arc.io/tx/0xe904e76162adeb53ae49f0ac7d48d1dd7cb9051692c88266bfee7cf927012ecc) | 0.05 test USDC |

Market id 1. The recovery note attaches bytes32 `0x2591b3d9eb861c1aff8a27f6aa9739eaad86fdf97858c769378bc95391473aa8` to that market and does not name the field. The game did not start. Both hosts read market 1 as Void at block **71110279**, hash `0x090bb51813029959eda3bf5063989be581ce84cb50bcfa9052a85ffa7a4ebbed`, chain time 6 November 00:07:03 UTC.

| Refund | Transaction | Block | Time (UTC) |
| --- | --- | --- | --- |
| Expiry void | [`0x8d29d3f002ea61a475eb1a9528c18b42af5e557fc0e7d426cef2ba07dbe0bda8`](https://explorer.testnet.arc.io/tx/0x8d29d3f002ea61a475eb1a9528c18b42af5e557fc0e7d426cef2ba07dbe0bda8) | — | 00:03:27 |
| Spectator 1, 50,000 base units | [`0x4c2fc2c1b125385dc27f0780f090af5a6ab7c3211cde4a4cfc9948abf23ef82a`](https://explorer.testnet.arc.io/tx/0x4c2fc2c1b125385dc27f0780f090af5a6ab7c3211cde4a4cfc9948abf23ef82a) | 71109941 | 00:04:12 |
| Spectator 2, 50,000 base units | [`0xb80b67fe8a1130f85d8a2d6cd273e484de0648347bc03da464225cebdc75e3cd`](https://explorer.testnet.arc.io/tx/0xb80b67fe8a1130f85d8a2d6cd273e484de0648347bc03da464225cebdc75e3cd) | 71109994 | 00:04:38 |

Explorer transfers match the pinned USDC and the saved spectator addresses. The secondary host returned both refund receipts with `Claimed` and USDC `Transfer` logs. The first receipt's canonical block hash was rechecked (`0xc968ab3041850f9251e4f6e2d2a50855b6e6f14babfae1fb926ce3a1c97252c3`). The second receipt's separate block-hash recheck, and a fresh balance read, stayed rate-limited (HTTP 429 / -32005). Treat the refund pair as explorer-confirmed and partially two-host, not as a finished two-host audit. The 0.50 pass stayed paid. Detail: [market-read-recovery.md](docs/web3/market-read-recovery.md).

### 5. Game replay, separate from Arc

A two-browser Star Catch round finished on the hosted relay while Arc and ENS sends were disabled. Record `ec6e9fd7288c8a98ee29f340dc18fda0b5cb91bf5ee3dc68de3f61fe9677de47` was read back from PostgreSQL after a restart. That proves replay persistence. It does not prove a combined live payment. Local rehearsals of the full flow also pass under simulation. [Deployment notes](docs/web3/render-live.md).

## Still open

A single hosted round that includes a finished game, a charged cheer, a winning prediction payout and a creator earnings claim. Physical iPhone and Android motion and multitouch. The remaining two-host refund recheck, when RPC quota allows, without replaying any refund.

Check [current progress](docs/web3/progress.md) before a fresh live round. The operator has to clear worker readiness and remaining signing allowances first. Do not reset identities, payment journals or spending totals.

## Suggested demonstration

1. Show the console, a phone controller, and the ledger rows for the registration, the 0.50 pass and the two refunded predictions.
2. Open any proof above on the explorer and compare it with the second RPC host when the call is not rate-limited. Say which proof class it is: two-host receipt, partial refund audit, or game-replay record.
3. After the operator clears live readiness, create one table, join two phones by QR, and wait for the real bankroll and name status before starting.
4. Use Star Catch when the goal is the verified replay path. Predictions belong on separate spectator phones. Optional payments need the confirmation the phone displays.
5. If the live gate stops, show the recorded refunds and name the unfinished step. A simulated payout stays labelled as a simulation.

## Arc Studio and source

| Studio app | Reviewed source |
| --- | --- |
| [Funcaster Pot](https://studio.arc.io/app/3e018243-4be8-4b94-a488-1f69c9401fae) | [ConditionalPot and tests](integrations/arc/onchain/), [prompts and export manifest](integrations/arc/studio/), [provenance](docs/web3/arc-ai-use.md) |
| [Funcaster markets](https://studio.arc.io/app/3901b893-7c4c-4a97-9506-962259ffef4a) | [MatchMarkets, SplitPayout and tests](integrations/market/onchain/) |
| [Funcaster creator commerce](https://studio.arc.io/app/7beefb8a-83bc-4c91-9055-a7190f08190e) | [RevenueRouter](integrations/commerce/studio/contracts/RevenueRouter.sol), [generation prompt](integrations/commerce/STUDIO-PROMPT.md) |

Studio, CLI 1.2.2, wrote the pot in app `3e018243-4be8-4b94-a488-1f69c9401fae`, thread `85ab97c1-da4e-4bb4-97a1-8eebac5ba283`. Generation and local tests were authorized. Studio deployment was not: its tool could not enforce fee fields or a no-resend rule, and the completed Studio deployment list is empty. The owner deployed the pulled bytecode with the bounded local command in proof 2. An interim unbound `termsHash` and a `uint128` stake were rejected and fixed before that deploy. The Studio audit report is an AI review, not a professional security audit.

Runtime entry points: [worker](scripts/web3-worker.mjs), [market verifier](scripts/market-verifier.mjs), [relay integration](server/web3/index.cjs). Signing keys and journals are not required to read this record.
