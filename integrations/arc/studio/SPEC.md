# Funcaster ConditionalPot — Studio build specification

6 November 2026 from build-guide/03. G0 is complete with documented limits. The existing app's G0 diagnostic has been exported; proceed with the G1 ConditionalPot build. Public deployment remains owner-operated.

## Scope and unresolved source conflicts

- TESTNET ONLY, PLAY MONEY. Build and test locally in Studio; do not deploy, broadcast, sign with a live key, request faucet tokens, or expose credentials. A human executes all public-chain transactions separately.
- The immutable constructor allowlist contains USDC and EURC; `create` must include an explicit asset argument even though the older function table omits it. Never mix assets within a pot.
- Guide 03 removed `creditUsedAuthorization`; its old Appendix B rescue tests are obsolete. Test payee-only authorization and rejection of attempts to reuse a nonce instead. Do not add a rescue path.
- A valid contract placing is dense rank order indexed by seat: minimum 1, no gaps, ties allowed. The existing game result uses competition ranks (1,1,3); our adapter will normalize distinct ordered tiers to (1,1,2) without changing the canonical game result/hash. Share exhaustive two-to-four-seat vectors with the relay before enabling settlement.
- The source describes a minimum oracle play delay without a configured value. Add a required per-pot `minPlaySeconds` in create/terms and store `lockedAt`; allow oracle proposal only at/after lockedAt + minPlaySeconds and strictly before settleDeadline. Require minPlaySeconds > 0 and fundDeadline + minPlaySeconds < settleDeadline. Do not choose a production default or deploy. Local tests can explicitly use 60 seconds. Funding and cooperative settlement are refused at their respective deadlines; permissionless refund is allowed at/after them. This avoids an oracle racing an already-eligible refund and guarantees room for the configured delay even when funding finishes late.
- Chainlink CRE and onReport are stretch scope and require independent verification; the G1 contract uses cooperative settlement and the configured per-pot relay oracle. Never grant an unverified forwarder authority.
- No public-chain transaction is authorized by any generation prompt. Keep deployment scripts separate and gated; no automatic post-install/deploy hooks.
- Funding must leave the seat with at least 50,000 base units (0.05 of its six-decimal asset), including the allowance path if retained. The phone/worker enforce the same floor; contract tests prove it. This floor is the G0-tested Arc drain workaround, not a fee.
- Do not implement an allowance funding path for G1: receiveWithAuthorization passed G0 for both assets. No rescue function, CRE forwarder or onReport. Tests below mentioning these obsolete alternatives are replaced by payee-only/non-reuse tests.
- `placesHash = keccak256(abi.encode(uint8[] places))`. Use explicit function signatures/events/getters in a reusable interface so the relay and console consume one ABI. `getPot` must expose the asset, seats, funded/accepted bitmaps, deadlines, lockedAt, minPlaySeconds, rule, oracle, termsHash, state and proposal, plus claimableOf.
- The console uses configurable testnet RPC/contract/asset addresses and no hard-coded deployment. Build at base `/pot/`; support `?pot=`, direct public reads without a wallet, clear empty/error/loading states, persistent PLAY MONEY label, and a compact blue Funcaster/XP visual style that fits 320px phones. Refund/claim may use a connected wallet; later the Funcaster relay will expose its bounded relayer endpoints. Never claim deployment or independent verification without evidence. No telemetry, analytics or external tracking.

## 4. The behaviour the pot must have (product level)

1. A pot has 2 to 4 funded seats, equal stakes, one of three payout rules fixed at creation: **winner takes all**, **top two split 70/30**, **equal among tied top**.
2. **Funding is one tap, gasless, from the phone.** The seat signs two typed messages in one gesture: an **Accept** of the terms hash and a USDC **funding authorization**. A relayer submits them; the seat never holds gas.
3. **The pot locks when the last stake lands**; the relay refuses to start the match until the chain says Locked.
4. **Settlement is cooperative by default**: every seat signs the same placing. If seats do not agree, or one is gone, an oracle proposes the placing and a **challenge window** lets any seat freeze it (a signed contest, submitted by the relayer), which refunds everyone.
5. **Refund by default and permissionless**: unfilled at the funding deadline, locked but unsettled at the settle deadline, abandoned, or contested all refund every funded stake; anyone can trigger it.
6. **Payouts are claimable per seat** (pull), and the relayer claims for every seat immediately after settlement so winners see their money at once; **a blocklisted or reverting recipient can never block the others**.
7. **No admin, no owner, no fee, no pause, no upgrade.** The only addresses with powers are the seats (their signatures) and, per pot, one oracle address that can only propose a placing.

## 5. The contract specification: `ConditionalPot`

One contract holds many pots, keyed by a `potId` supplied by the relay (so `create` is idempotent: it reverts if the id exists, and a retried job is harmless). **The allowed assets are an immutable constructor argument: up to four ERC-20 addresses, by default USDC `0x3600…` and EURC `0x89B5…D72a` on Arc (both 6 decimals, both FiatToken v2.2, see [16](16-arc-native-features.md)); each pot names exactly one of them at creation and never mixes assets**; there is no admin who can add a token. Solidity version, OpenZeppelin `SafeERC20`, `ReentrancyGuard`, `EIP712` and `SignatureChecker` are used; **no `receive`, no payable functions, no `selfdestruct`**.

### 5.1 State

```text
Pot { stake (uint256, 6 dp), seats[] (2..4 addresses), funded bitmap, accepted bitmap, rule, oracle,
      fundDeadline, settleDeadline, challengeWindow, termsHash, state, proposal{ placesHash, resultHash, at },
      total, claimable[seat] }
state: None -> Funding -> Locked -> Proposed -> Settled
       Funding/Locked/Proposed -> Refunded        Proposed -> Contested -> Refunded
```

### 5.2 Functions

| Function | Caller | Preconditions | Effect |
| --- | --- | --- | --- |
| `create(potId, stake, seats[], rule, oracle, fundDeadline, settleDeadline, challengeWindow, termsHash)` | anyone (the relayer) | id unused; 2 to 4 distinct non-zero seats; stake > 0; deadlines in the future and ordered; window at least 60 s | Records the pot in **Funding** |
| `fundWithAuthorization(potId, seat, acceptSig, validAfter, validBefore, nonce, authSig)` | anyone (the relayer) | state Funding; seat listed and not yet funded; `acceptSig` is the seat's EIP-712 `Accept(potId, termsHash)`; `nonce == keccak256(abi.encode("chonks-fund", potId, seat))`; `validBefore <= fundDeadline` | Verifies Accept; calls the pot's asset `receiveWithAuthorization(seat, this, stake, …)` (**verified present on USDC and EURC; only this contract can pull, so the signature cannot be front-run**); **checks the balance delta equals `stake`**; marks funded; when the last seat funds, state becomes **Locked** and emits `Locked` |
| `fundFromAllowance(potId, seat, acceptSig)` | anyone | As above, and the seat approved the pot | Fallback path using `transferFrom` (needs the seat to have approved; used only if the authorization path fails the spike) |
| ~~`creditUsedAuthorization`~~ | removed | | **Not needed**: `receiveWithAuthorization` cannot be front-run, so the rescue path is dropped (fewer lines to audit) |
| `settleCooperative(potId, places[], sigs[])` | anyone | Locked; one valid EIP-712 `Settle(potId, placesHash)` signature from **every** seat (ERC-1271 accepted); `places` valid for the seat count | Computes `claimable` from the rule; state **Settled**; emits `Settled(potId, placesHash, "cooperative")` |
| `propose(potId, places[], resultHash)` | the pot's `oracle` only (or the CRE forwarder via `onReport`, section 7) | Locked and past a minimum play time or `settleDeadline` approaching as configured; no proposal yet | State **Proposed**; stores `placesHash`, `resultHash`, time; starts the challenge window |
| `contestWithSig(potId, seat, sig)` | anyone (the relayer) | Proposed and inside the window; `sig` is the seat's EIP-712 `Contest(potId)` | State **Contested**, which allows refund |
| `finalize(potId, places[])` | anyone | Proposed, window elapsed, `places` hash matches the proposal | Computes `claimable`; state **Settled** |
| `claim(potId, seat)` | anyone | Settled or Refunded and `claimable[seat] > 0` | Zeroes the balance **first**, then `transfer`s USDC to `seat`; if the transfer reverts (blocklist) the call reverts and **other seats are unaffected** |
| `refund(potId)` | anyone | Funding past `fundDeadline`; or Locked past `settleDeadline` with no proposal; or Contested | Marks Refunded; sets each funded seat's `claimable` to its stake |
| `getPot(potId)` and `claimableOf(potId, seat)` | view | | State for the relay, the console and tests |

### 5.3 EIP-712 types (domain `{name: "ChonksPot", version: "1", chainId, verifyingContract}`)

`Accept(bytes32 potId, bytes32 termsHash)`, `Settle(bytes32 potId, bytes32 placesHash)`, `Contest(bytes32 potId)`, `Bind(...)` lives in the relay domain, not the contract. `places` is a `uint8[]` indexed by seat order: 1 is best, equal numbers are ties. **Test the domain on chain** (call `eip712Domain()` and compare) as the BitRouter winner did; replaying a signature on another pot or another chain must fail.

### 5.4 Payout rules and rounding (fixed, tested)

Total pot `T = stake * seats`. **Winner takes all**: split `T` equally among seats with place 1. **Top two 70/30**: place 1 gets 70 percent and place 2 gets 30 percent of `T`; ties within a place share that tier's amount; with only one place-1 seat the second tier goes to the place-2 seats; **if every seat ties, equal split**. **Equal among top**: as winner-takes-all. **Integer math with floor division; the remainder goes to the lowest-index seat among the highest tier.** Invariant (assert in tests): the sum of `claimable` equals `T` exactly.

### 5.5 Arc-specific constraints (all tested)

ERC-20 interface only (6 decimals), never `msg.value`; **pull claims** so a blocklisted recipient cannot lock the pot; windows at least 60 s and tolerant of equal timestamps (no strict `>` assumptions on consecutive blocks); `SafeERC20`, `ReentrancyGuard`, checks-effects-interactions; events for every transition (`Created`, `Funded`, `Locked`, `Proposed`, `Contested`, `Settled`, `Refunded`, `Claimed`); a **reusable, documented, MIT-licensed** interface (the bounty gives bonus consideration to reusable contracts), with a README that explains it generically ("a conditional multi-party pot") before mentioning Funcaster.


## Appendix B: the contract test list (minimum; add more)

1. create: success, duplicate id, 1 seat, 5 seats, duplicate seat, zero seat, zero stake, past deadline, window under 60 s. 2. fundWithAuthorization: success for each seat, last seat locks, wrong signer, wrong nonce, expired, not a listed seat, already funded, balance-delta mismatch, replay on another pot, replay on another chain. 3. rescue: credit after a direct USDC submission; refuse when not used; refuse when balance is short. 4. settleCooperative: success for 2, 3 and 4 seats, missing signature, wrong signer, wrong potId, ERC-1271 seat, places invalid, double settle. 5. propose: only the oracle; wrong state; window start; contest inside the window; contest after the window refused; finalize before the window refused; finalize with a different places hash refused. 6. refund: unfilled funding; locked past deadline; contested; early refund refused; double refund refused. 7. claim: after settle and after refund; double claim; blocklisted recipient does not affect others; zero-address recipient; reentrancy token. 8. payout math: winner takes all with a tie; 70/30 with ties at first, at second and all tied; rounding remainder; sum invariant fuzz. 9. no ETH accepted, no payable functions, no selfdestruct, decimals read.
