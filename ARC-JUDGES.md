# Funcaster × Arc — judge guide

**Documentation edition: 6 November 2026.**

Funcaster turns a TV or laptop into a 13-game party console for 1–4 phone controllers. Players scan a QR code, use landscape XP-style touch pads or optional motion, and stay in the same room across games. Arc adds test-token bankrolls, optional player pots, spectator predictions, table cheers and creator room passes.

**Open:** [console](https://funcaster.onrender.com/?shell=os), [Live Hub](https://funcaster.onrender.com/live/), [predictions](https://funcaster.onrender.com/predict/), [creator commerce](https://funcaster.onrender.com/commerce/), [Hall and receipt ledger](https://funcaster.onrender.com/records/). These links show the deployed build; the latest repository merge is not itself a deployment.

## How Arc is used

Phone-signed requests enter the Node/Socket.IO relay, which stores immutable intents and jobs in PostgreSQL. A separate worker validates the pinned contract, chain, intent, nonce and cumulative spending limits before relaying a transaction. Phones authorize exact transfers with EIP-3009; the worker pays Arc gas in test USDC. Uncertain transactions retain their recorded hash for reconciliation rather than being sent again.

MatchMarkets and SplitPayout use two reporting keys. The second runs in a separate service and replays the canonical game record before reporting. Both services are operated by this project; this is not an independent third-party oracle network.

The ledger separately checks canonical transaction receipts through two distinct RPC hosts. **A confirmed receipt proves that transaction, not the correctness of a game result.** Replay verification is a separate label. Game records and the append-only receipt hash chain persist in PostgreSQL; the hash chain is not externally anchored and is not a complete chain index.

## Public contracts

All addresses below are on **Arc testnet, chain 5042002**. Only test assets are used.

| Contract           | Address and explorer                                                                                                             | Role                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| ConditionalPot     | [0xe339B15Aa54596B4752923d981DAC30B7A569F82](https://explorer.testnet.arc.io/address/0xe339B15Aa54596B4752923d981DAC30B7A569F82) | Player deposits, cooperative settlement, disputes and refunds; USDC/EURC      |
| ChonksMatchMarkets | [0x31c000cFe6FE6F5d12CA5735B913E3e0149fD5DF](https://explorer.testnet.arc.io/address/0x31c000cFe6FE6F5d12CA5735B913E3e0149fD5DF) | Spectator winner predictions, matching reports and pull claims                |
| SplitPayout        | [0xC82c2BA2c1A057C2ED73d8030e77FF7100a719F9](https://explorer.testnet.arc.io/address/0xC82c2BA2c1A057C2ED73d8030e77FF7100a719F9) | Cheers shared among the frozen human lineup, or refunded                      |
| RevenueRouter      | [0x43fD866eF3FCA5b0A7b02c262F3602283D5aA192](https://explorer.testnet.arc.io/address/0x43fD866eF3FCA5b0A7b02c262F3602283D5aA192) | Immutable creator versions, room passes and recipient-specific revenue claims |

Pinned tokens: [USDC](https://explorer.testnet.arc.io/address/0x3600000000000000000000000000000000000000) and [EURC](https://explorer.testnet.arc.io/address/0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a). Creator commerce currently accepts USDC only.

## What has actually been demonstrated

- **Public ConditionalPot acceptance:** 12 scripted checkpoints, 54 worker transactions and eight settled/refunded pots across USDC and EURC; all claims paid, independently checked through both RPC hosts on **6 November 2026**. These used synthetic canonical match fixtures, not a phone-played game. [Report and reproducible keyless audit](docs/web3/g1-arc-worker-public.md).
- **Hosted commerce:** [creator registration](https://explorer.testnet.arc.io/tx/0x5de7d5fa450b9606d233b3cd94ea5c70b09bd268dd22d57c4782b70d34828e0b) and a [0.50 test-USDC room pass](https://explorer.testnet.arc.io/tx/0xdf3096da05c5e12a17e817a4c8c81390526a6cc553390a745131a1022554e5b1) confirmed and appear in the independently checked ledger.
- **Hosted predictions and refunds:** two spectators paid 0.05 test USDC each. The game did not start; the market became Void. [Refund 1](https://explorer.testnet.arc.io/tx/0x4c2fc2c1b125385dc27f0780f090af5a6ab7c3211cde4a4cfc9948abf23ef82a) occurred **6 November, 00:04:12 UTC**; [refund 2](https://explorer.testnet.arc.io/tx/0xb80b67fe8a1130f85d8a2d6cd273e484de0648347bc03da464225cebdc75e3cd) at **00:04:38 UTC**. Explorer transfers and secondary-RPC receipts match. The fuller two-host refund audit remains partly rate-limited. The creator pass was a separate confirmed payment and was not refunded. [Exact evidence and limitations](docs/web3/market-read-recovery.md).
- **Game/replay separately:** a two-browser-phone Star Catch round completed on the hosted relay with Arc/ENS sending disabled; its verified record survived restart. Local full-flow rehearsals also pass. Neither is evidence of the combined live financial gameplay flow. [Deployment evidence](docs/web3/render-live.md).

**Still open:** a successful combined hosted game, cheer, winning prediction payout and creator earnings claim; physical iPhone/Android motion and multitouch acceptance. No cheer was charged in the stopped attempt. Check [current progress](docs/web3/progress.md) before presenting a fresh live round; the operator must first clear worker readiness and remaining signing allowances. Do not reset old identities, payment journals or spending totals.

## Suggested demonstration

1. Show the console, phone controller and existing ledger evidence first.
2. Once the operator clears live readiness, create one table, join two phones by QR, choose motion or touch, and wait for the actual bankroll/name status.
3. Use Star Catch for the verified replay path. Predictions belong to separate spectator phones; seated players cannot bet on their own game. Optional financial actions require their displayed confirmation.
4. Compare the game replay label with the independent transaction-receipt label. If the live gate cannot complete, show the recorded refund evidence and identify the remaining step instead of presenting a simulated payout as live.

## Arc Studio and source

| Studio app                                                                                | Reviewed source                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Funcaster Pot](https://studio.arc.io/app/3e018243-4be8-4b94-a488-1f69c9401fae)              | [ConditionalPot and tests](integrations/arc/onchain/), [prompts/export manifest](integrations/arc/studio/), [provenance](docs/web3/arc-ai-use.md) |
| [Funcaster markets](https://studio.arc.io/app/3901b893-7c4c-4a97-9506-962259ffef4a)          | [MatchMarkets, SplitPayout and tests](integrations/market/onchain/)                                                                               |
| [Funcaster creator commerce](https://studio.arc.io/app/7beefb8a-83bc-4c91-9055-a7190f08190e) | [RevenueRouter](integrations/commerce/studio/contracts/RevenueRouter.sol), [generation prompt](integrations/commerce/STUDIO-PROMPT.md)            |

Studio supplied contract code that was reviewed, tested and integrated locally. Its AI review is not a professional security audit. Contract generation and owner-operated public deployment are distinct steps. Runtime entry points: [worker](scripts/web3-worker.mjs), [market verifier](scripts/market-verifier.mjs), [relay integration](server/web3/index.cjs).
