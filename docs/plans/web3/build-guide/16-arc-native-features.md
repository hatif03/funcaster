# Build guide 16: EURC and the Arc-native features we use (verified on the testnet)

Part of the [build guide](00-README.md). Status: plan, 6 November 2026. **No code is written.** The owner asked for **USDC and EURC support** and for **Arc-specific features used for our own benefit**. This document records what was **verified live on the Arc testnet on 6 November 2026** (JSON-RPC calls, storage reads, the explorer's verified source and API, the Circle Gateway API), then decides which features to build, which to skip and why. Marks: **[V]** verified by direct query or by reading the verified source; **[D]** read in the Arc or Circle docs; **[I]** inference to confirm in a spike. **Re-run the spikes on build day: the testnet has had hard forks** (a "Zero5" fork is mentioned in the USDC system-events document [D]).

## 1. Corrections this research made to the earlier guides

1. **`receiveWithAuthorization` exists on both tokens** [V]: use it; the front-run rescue function is dropped ([03](03-arc-guide.md) is already corrected).
2. **USDC at `0x3600…0000` is not a precompile**: it is a `FiatTokenProxy` pointing at `NativeFiatTokenV2_2` [V].
3. **The EIP-712 domain name is "USDC" for USDC and "EURC" for EURC, version "2" for both**; both domain separators were recomputed locally and match `DOMAIN_SEPARATOR()` on chain [V].
4. **The Arc test blocklisted address `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` is blacklisted on USDC only**; `isBlacklisted` returns false for it on EURC [V]. The EURC blocklist test needs its own plan (section 3).
5. **The token layer is not trustless.** Both token proxies are **upgradeable** and have a blacklister, a pauser, an owner and `rescueERC20` [V]. **The README must say "no admin in our contracts", never "trustless" or "no admin" about the token layer.** A paused or upgraded token can halt every pot and market (a refund also needs the token to move): state it as a known dependency.
6. **Memo and Multicall3From work only when the caller is an EOA** [D]. Smart-account submitters (ERC-4337, Circle modular wallets, Safe, any bundler flow) revert. Our relayer is an EOA, so memos work; **do not use a Circle smart-contract account as the relayer if memos are wanted.**

## 2. EURC and USDC on Arc

| Item | EURC | USDC |
| --- | --- | --- |
| Address (testnet) | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` (mainnet differs: `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1`) | `0x3600000000000000000000000000000000000000` (same on both networks) |
| Proxy and implementation | `FiatTokenProxy` to `FiatTokenV2_2` at `0xECA045ED98a6D70887d2050F3BE1Fb0F0311017c` (verified, solc 0.6.12) | `FiatTokenProxy` to `NativeFiatTokenV2_2` at `0xC6AD664ac6679F4Ce74e10E91449C93Ec1ae3cA6` (verified, solc 0.6.12) |
| name, symbol, version, currency | EURC, EURC, "2", EUR | USDC, USDC, "2", USD |
| decimals | 6 | 6 (native gas view has 18; `DECIMALS_SCALING_FACTOR = 1e12`) |
| `DOMAIN_SEPARATOR` | `0x649ec6b0…ebf160` | `0x36119152…11c8c6b0` |
| Not paused | yes | yes |

**Selectors (identical on both) [V]:** `transferWithAuthorization` `0xe3ee160e` (v, r, s) and `0xcf092995` (bytes signature); `receiveWithAuthorization` `0xef55bec6` and `0x88b7ab63`; `cancelAuthorization` `0x5a049a70` and `0xb7b72899`; `authorizationState(address,bytes32)` `0xe94a0102`; `permit` `0xd505accf` and `0x9fd5a6cf`; `nonces` `0x7ecebe00`; `isBlacklisted` `0xfe575a87`. **Typehashes (same on both) [V]:** TransferWithAuthorization `0x7c7c6cdb…1a2267`, ReceiveWithAuthorization `0xd099cc98…413de8`, CancelAuthorization `0x158b0a9e…597429`, Permit `0x6e71edae…6126c9`.

**Live behaviour [V]:** `receiveWithAuthorization` with a dummy signature reverts "FiatTokenV2: caller must be the payee" (the caller must be the `to` address: exactly a pot or market contract); a bad `v` reverts in ECRecover; the **`bytes`-signature overloads use a `SignatureChecker` with ERC-1271** (smart-account seats can sign); events are `AuthorizationUsed` and `AuthorizationCanceled`.

**Blocklist [V, D]:** EURC's `receiveWithAuthorization` checks `notBlacklisted(from)` and `notBlacklisted(to)` in the token; USDC's has only `whenNotPaused` and its blocklist enforcement is in the native layer; a transfer to or from a blocklisted address reverts and the included transaction still burns gas.

**Gas is always USDC [D].** An **EURC-only account cannot pay gas**, so **the relayer pattern is mandatory for EURC users** (they only ever sign).

**The double Transfer log [V, D]:** a single ERC-20 USDC transfer emits **two** `Transfer` logs (one from `0x3600…` with 6 decimals and one from the system emitter `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` with 18 decimals). **Ledger rule: filter by emitter address and never sum the two views** ([12](12-reality-and-ledger.md)). Logs before the Zero5 fork came from `0x1800…0000` as `NativeCoin*` events; keep the decoder configurable.

**Cost [V]:** `eth_estimateGas` for an ERC-20 transfer is 49,097 (USDC) and 45,199 (EURC); a 3009 call is about 65,000 [D]; base fee was exactly 20 gwei over the last 6 blocks; `eth_maxPriorityFeePerGas` returned 1.5 gwei; sampled transactions paid an effective 21 to 39 gwei. **About $0.001 for a transfer and $0.001 to $0.002 for a 3009 call**: show the fee as `gasUsed × effectiveGasPrice / 1e18` from the receipt, never a constant.

### 2.1 How EURC is supported (multi-asset design)

- **Contracts:** the pot and the market take an **immutable allowlist of up to four assets** (USDC and EURC by default) in the constructor; **each pot or market names exactly one asset and never mixes assets**; no admin can add one ([03](03-arc-guide.md), [10](10-prediction-market.md) updated).
- **Signing:** the helper keeps a **per-asset EIP-712 domain** (`name`, `version`, `chainId`, `verifyingContract`); preflight checks every configured asset's `DOMAIN_SEPARATOR()` against the locally computed one.
- **Rooms:** the host (or a proposer) chooses the asset in the Stakes and Predictions rows ("**play dollars**" or "**play euros**" in the UI; the words USDC and EURC appear only in the Wallet details and the Ledger); the Wallet shows both balances; the refill rule and the bankroll are **per asset**; the relayer bankrolls both (the faucet offers USDC, EURC and cirBTC; the EURC amount per request was not confirmed [D]).
- **Boards:** per-asset profit boards and an **asset-neutral ROI** board ([14](14-stats-and-leaderboards.md)); no FX conversion is attempted.
- **No conversion inside a pot or market.** Cross-currency is out of scope (StableFX is not available to us, section 3); a user who holds the wrong asset is told so and given the room's asset by the refill.

## 3. Arc-specific features: verdicts

| Feature | Verified status (testnet) | Decision | Hours |
| --- | --- | --- | --- |
| **EURC as a second asset** | [V] 3009, permit, cancel; domain "EURC"/"2"; 6 decimals | **Build** (the bounty text says "USDC or EURC") | 5 |
| **`receiveWithAuthorization` for funding and betting** | [V] live; payee-only | **Build** (done in the specs; net fewer lines) | 2 |
| **Arc-faithful tests** with Arc's own Foundry fork (`arc-anvil --network arc`, from the Arc docs [D], not run by us) | [D] | **Build**: test the native blocklist, the system logs, USDC and EURC blacklist as **separate cases** (the test address is blacklisted on USDC only; for EURC blacklist `isBlacklisted`-style behaviour use a token fork with a blacklister impersonated [I]) | 3 |
| **Receipt-first ledger with the dollar fee** | [V] receipts, `/api/v2`, `/api` | **Build** (section 4) | in L lane |
| **Memo tagging** | [V] contract and live traffic; [D] EOA-only | **Build** (section 5) | 4 |
| **Daily checkpoint published through Memo** | [V] Memo exists | **Build**: carries the stats checkpoint and the Ledger head ([14](14-stats-and-leaderboards.md) section 6) | 3 |
| **Plain Multicall3 batch claims** (`0xcA11…CA11`) | [V] code present | **Build**: one transaction claims every seat with `allowFailure = true`, which also isolates a blocklisted recipient | 2 |
| **ERC-8004 referee identity and validation** | [V] ABIs; registries are upgradeable proxies | **Build after the above**: register the **Funcaster Referee** once; per match `validationRequest(requestHash = canonical result hash)` and a verifier answers `validationResponse`; seats may `giveFeedback` about the referee. Not for per-predictor reputation (it needs one agent per player) | 7 |
| **Gas Station with a passkey smart-account seat** | [D] Arc supported for SCA wallets, 5 percent of gas billed to a card; [V] contract has code; behaviour with native-USDC gas untested | **Polish tier**: a second seat type (the pot already accepts ERC-1271); **conflicts with Memo** (a smart account cannot call Memo), so memos stay on the relayer's own calls | 6 |
| **Gateway treasury top-up** | [V] `gateway-api-testnet.circle.com/v1/info` lists Arc (domain 26) with USDC, EURC and cirBTC and Sepolia, Base Sepolia, Fuji and others; `depositWithAuthorization` exists | **Optional**: the team funds one Gateway balance from several testnets' faucets and mints on Arc for the relayer treasury (turns a hard faucet limit into a supply). **Not for players** (no wallets) | 9 |
| **App Kit Swap** (USDC to EURC) | [D] on Arc testnet; liquidity and limits undocumented | **Optional**: a "take it in EURC" payout after a claim; high risk | 8 |
| **CCTP Forwarder cash-out** | [D] | **Optional**, only to match the bounty's "crosschain conditional transfer via Circle Forwarder" example, which the page marks "[confirm reachable from Studio]"; large effort | 10 |
| **StableFX / FxEscrow** `0xd682…2E10` | [V] source: `recordTrade` is relayer-gated; [D] a permissioned institutional RFQ engine | **Skip**: a cross-currency pot cannot be built on it | n/a |
| **USYC** | [V] the Teller's deposit and redeem revert `NotPermissioned` without a role; [D] a regulated fund share | **Skip** (wrong for play money) | n/a |
| **Nanopayments** | [D] needs EOA signatures, no ERC-1271; built for pay-per-request | **Skip** (our bets already cost about $0.001 by 3009) | n/a |
| **Permit2, ERC-8183, EIP-7702, Onramp, Marketplace Discovery API, Multicall3From** | various | **Skip** (3009 already makes approve-and-bet one signature; ERC-8183 is a 1:1:1 job escrow that does not model an N-seat pot; Multicall3From adds value only when a target reads `msg.sender`, which none of ours does) | n/a |
| **Privacy** | [D] "not yet available on Arc"; the Privacy Sector is an enclave-based confidential EVM, not confidential transfers | **Do not claim any privacy** | n/a |

(One Arc page worth reading before building the market: `https://docs.arc.io/build/prediction-markets.md`, Arc's own guide to prediction markets, which the research listed but did not summarise.)

## 4. The Ledger on Arc (rules from the research, folded into [12](12-reality-and-ledger.md))

1. **Final on inclusion**: Arc has deterministic finality (Malachite BFT; the explorer shows confirmation durations of 0 to 510 ms [V]); a returned receipt is final, so **no confirmation counter and no reorg handler on Arc**; keep **idempotent ingestion keyed on `(txHash, logIndex)`** anyway.
2. **Order by block number, not timestamp**: timestamps have one-second granularity and several blocks share one (blocks 69317773 to 69317778 had only five distinct timestamps [V]); blocks arrive about twice a second.
3. **Filter token logs by emitter** (the double `Transfer` log) and never sum the 6- and 18-decimal views.
4. **Show the fee in dollars** from the receipt (`gasUsed × effectiveGasPrice / 1e18`).
5. **Cross-check with Blockscout** (`/api/v2/transactions/{hash}`, `/logs`, `/token-transfers`, and the verified-source state `/api/v2/smart-contracts/{a}` for the "source verified" badge): the explorer answers HTTP 200 for these endpoints, with a rate limit of about 180 calls on address and contract endpoints [V observed]; it is a **best-effort cross-check, never a dependency**; the primary ledger reads RPC receipts and `eth_getLogs` in chunks of 9,999 blocks or fewer (a 10,000-block range was confirmed to succeed [V]).
6. **Memo makes the Ledger complete** (section 5): one indexed `eth_getLogs` call by `memoId` returns every transaction of a match.
7. **Expect noise**: the testnet carries heavy bot traffic (memo farming, swaps); filter by our relayer and contract addresses and by `memoId`.

## 5. Memo tagging (the Arc-native way to make every transaction self-describing)

**What it is [V source, D]:** Circle's non-upgradeable `Memo` contract at `0x5294E9927c3306DcBaDb03fe70b92e01cCede505`; entry point `memo(address target, bytes data, bytes32 memoId, bytes memoData)`; it forwards the call through the `CallFrom` precompile **with the original sender**, so the target sees the **EOA** as `msg.sender`; it emits `BeforeMemo(uint256 indexed memoIndex)`, then the target's events, then `Memo(address indexed sender, address indexed target, bytes32 callDataHash, bytes32 indexed memoId, bytes memo, uint256 memoIndex)` (topic0 `0xeb15ee72…47a5e4`, matching the docs); a failed child call reverts the whole transaction; **EOA callers only** [D].

**How we use it:** the **relayer EOA wraps single calls** (`fundWithAuthorization`, `settle`, `claim`, `report`, `bet`) in `memo(...)` with `memoId = keccak256("chonks:pot:" + potId)` or `"chonks:mkt:" + marketId` and a short `memoData` (`chonks/v1 match=<id> seat=2 kind=fund`). The pot and market contracts see the relayer as `msg.sender`, which is what they expect. **The Ledger pulls every transaction of one pot or market with one `eth_getLogs` call** (`topics = [Memo topic0, null, null, memoId]`) and the explorer shows the memo too. Cost: about 10 to 16 thousand gas per call [I: 37,278 total for a call with empty data minus the 21,000 base]. **Constraints:** single calls only (composition with Multicall3From is undocumented and untested); never call Memo from our contracts (it has `STATICCALL` and `DELEGATECALL` guards); offchain blocklist operators must include the Memo address; **keep a plain-transaction fallback if the Memo path fails**; filter by `sender` and `memoId` because bots send many empty memos.

**Checkpoint publication:** the daily stats checkpoint and the Ledger head are published as a Memo call with `memoId = keccak256("chonks:checkpoint:" + date)` and `memoData` carrying the root, the ruleset hash and the board hash: no contract of ours is needed, and anyone can query it by `memoId`.

## 6. The ERC-8004 referee (the "AI agents as identities" angle across ENS and Arc)

Register the **Funcaster Referee** oracle once in the Identity registry (`register(agentURI)` mints an ERC-721 identity; the registries are `0x8004A818…BD9e` Identity, `0x8004B663…8713` Reputation, `0x8004Cb1B…4272` Validation [V ABI, D]); the agent URI points at the referee's description and its **ENS name** (`oracle.agents.<parent>.eth`, [02](02-ens-guide.md) E10) whose ENSIP-25 record links back to the registration; per match `validationRequest(validator, agentId, requestURI, requestHash)` with `requestHash` equal to the **canonical result hash**, and the independent verifier answers `validationResponse(requestHash, 100, ...)` after re-running the replay ([10](10-prediction-market.md) layer B). The referee's owner cannot give its own agent feedback [D]; seats may. This ties the three partners together (ENS identity, Arc registry, replay verification) and earns the "AI agents as namespaces" bonus; it is built only after items 1 to 5 of the priority list.

## 7. Testing on Arc faithfully

Use **Arc's own Foundry fork** (`arc-anvil --network arc`, [D], to be installed and run by the Arc lane) for the native blocklist, the `0x1800…` and system-emitter logs and the USDC/EURC differences; test **USDC blacklist and EURC blacklist as separate cases**; add a **recipient-reverts-on-claim** test with a hostile token and one with the real blocklist address; test the **drain quirk** (a transfer that fully drains a brand-new sender account reverts [D]); test the **20 gwei floor** (a transaction below it is silently dropped); test the **Memo path and its failure fallback**; keep the live-testnet reality run ([12](12-reality-and-ledger.md) section 6) as the final proof.

## 8. README wording (what is honest to say about Arc)

"Finality in under a second on a permissioned BFT validator set (Circle's documentation)": **avoid "decentralized"**. "No admin in our contracts; the stablecoins themselves are Circle's upgradeable, pausable, blocklist-capable tokens." "Play money on the Arc testnet; no privacy is claimed." "Fees are about $0.001 per transfer, computed from receipts." (A press report names 11 founding validators for 6 November 2026 mainnet launch; it is a single source, so do not repeat it as fact.)

## 9. Tasks (lane N) and what each adds

| ID | Task | Depends | Hours |
| --- | --- | --- | --- |
| N1 | Asset registry (USDC, EURC), per-asset EIP-712 domains, preflight domain checks, UI badges and per-asset balances and refills | A3, S1 | 5 |
| N2 | Arc-faithful test setup (`arc-anvil`), separate USDC and EURC blacklist tests, hostile-recipient and drain-quirk tests | A2 | 3 |
| N3 | Memo tagging in the worker with a plain fallback; the Ledger's `memoId` queries | A4, L2 | 4 |
| N4 | Multicall3 batch claims | A4 | 2 |
| N5 | Checkpoint and Ledger-head publication through Memo | R5, L3 | 3 |
| N6 | ERC-8004 referee registration, validation requests and responses | M6, E10 | 7 |
| N7 | Gas Station passkey seat (polish) | A4 | 6 |
| N8 | Gateway treasury top-up (optional) | A4 | 9 |
| N9 | Optional: App Kit Swap payout; CCTP Forwarder cash-out | A4 | 8 to 18 |

Core (N1 to N5): about **17 hours**; N6 to N8 are polish; N9 only if the bounty page's cross-chain example becomes the target.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| The token layer changes (upgrade, pause, blocklist) | Stated as a dependency; preflight checks `paused()` and domains; the pull-claim design isolates a blocklisted recipient; refunds resume when the token resumes |
| The testnet forks again | Chain config and decoders are configurable; re-run the spikes on the day |
| Memo composition surprises | Single calls only; a plain fallback; tests |
| EURC liquidity and faucet amounts are unknown | EURC is a room option, not a requirement; the USDC path is the headline |
| Gas Station behaves differently with native-USDC gas | Polish tier only; tested in a spike first |
| Bot traffic distorts explorer views | Our Ledger filters by address and `memoId` and reads RPC directly |
