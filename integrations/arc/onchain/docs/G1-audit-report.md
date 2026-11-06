# G1 audit and hardening report

Scope: `ConditionalPot`, its Foundry tests and the `/pot/` console. Local compilation, tests and builds only. Nothing was deployed, broadcast, funded, signed with a key or sent to a faucet, and no wallet action was clicked.

## What was inspected

I read the code as it is on disk, not the earlier summary: `contracts/ConditionalPot.sol`, `contracts/IConditionalPot.sol`, `contracts/interfaces/IReceiveWithAuthorization.sol`, the tests under `contracts/test/` and every file under `src/`.

## Findings and fixes

| # | Finding | Status |
|---|---|---|
| 1 | `stake` had been narrowed to `uint128` in `CreateParams` and in the stored pot. | **Fixed.** Both are `uint256`. `create` reverts `StakeTooLarge` when `stake > maxUint256 / seatCount`, so `stake x seats` can never overflow. |
| 2 | The 70/30 split formed `total * 70` as an intermediate, which overflows for large `uint256` totals. | **Fixed.** Allocation moved to `contracts/PotMath.sol` and uses full-precision `Math.mulDiv`. The routine is tested directly (a token cannot hold a maxUint256 pot). |
| 3 | Terms binding (your critical acceptance requirement). | **Verified, no flaw found.** `create` ignores any caller-supplied hash: it computes `hashTerms` over the pot id, asset, stake, ordered seats, rule, oracle, both deadlines, challenge window, minimum play time and `metadataHash`, and stores only that. Encoding unchanged from the version your helper is aligned to; the exact types and typehashes are in `docs/CONDITIONAL_POT.md`. |
| 4 | Field-substitution coverage was partial (seat and oracle only). | **Fixed.** `test_acceptSignature_cannotBeReusedAgainstAnySubstitutedField` substitutes each of 14 changes (asset, stake, seat order, seat address, seat count, two rules, oracle, oracle removed, both deadlines, challenge window, minimum play time, metadata) in a hostile `create`, reuses the honest Accept, and requires `BadSignature` and no funds moved. A control proves the same signature works on the honest pot. |
| 5 | `BadSignature()` and `BadNonce()` carried no context (reviewer, Low). | **Fixed.** `BadSignature(address signer)`, `BadNonce(bytes32 expected)`. The relay can see which seat failed. |
| 6 | `State` natspec showed a direct `Proposed -> Refunded` transition that does not exist (reviewer, Low). | **Fixed.** Corrected in `IConditionalPot.sol`. |
| 7 | Pot-id squatting (functional reviewer, High). | **Not changed. Needs your decision**, see "Open decisions". |

Mutation check: I broke the contract 16 ways, one at a time (each terms field dropped from the hash, the stake bound removed, naive `total * 70` and `total * 30`, remainder to the wrong seat, the dense check weakened, tier 2 share changed). Every mutant was caught by at least one test.

## Review rounds (max preset)

- Round 1, rule-corpus review: 2 Low findings (items 5 and 6), fixed.
- Round 1, adversary and functional review: 1 High (item 7, deferred to you).
- Round 2 after the fixes: both reviewers returned **no material findings**. In round 2 I told the functional reviewer not to re-report the pot-id squatting item; that was my instruction, not a decision you made, so it remains open below.
- Static analysis (Slither): one "reentrancy-balance" High-confidence-Medium flag on the funding balance read, which is intended (the function is `nonReentrant` and the balance delta is the check), plus default-initialised locals, timestamp comparisons and a loop external call in the constructor. No other findings.

## Tests

Foundry, run locally in Studio: **177 passed, 0 failed** (fuzz at 2,000 runs). Raw output: `docs/test-output/forge-test.txt`.

| File | Tests | Covers |
|---|---|---|
| `contracts/test/Create.t.sol` | 21 | create success and every revert, allowlist, terms-hash sensitivity |
| `contracts/test/Fund.t.sol` | 32 | funding, signatures, replay across pot, chain and contract, 0.05 floor, delta checks, ERC-1271 |
| `contracts/test/Settle.t.sol` | 36 | cooperative settlement, oracle timing, contest and finalize boundaries |
| `contracts/test/RefundClaim.t.sol` | 26 | refund triggers and races, claims, blocklisted and reentrant recipients |
| `contracts/test/Payout.t.sol` | 21 | all tie cases, exhaustive 2 to 4 seat rankings, sum invariant, shared vectors |
| `contracts/test/PotMath.t.sol` | 10 | the production allocation routine up to `maxUint256 / seats`, exhaustive rankings, dense-rank validation |
| `contracts/test/Hardening.t.sol` | 17 | field substitution, stake bounds, hostile ERC-1271 wallets, per-asset domains, cross-pot reentrancy, units, diagnostic revert data |
| `contracts/test/Misc.t.sol` | 14 | no ether, no admin surface, no selfdestruct or delegatecall, domain, frozen known answers, conservation fuzz |

Checks you listed, and where they are proven:

- **Reentrancy**: `Hardening.t.sol` (claim across pots, refund during funding), `RefundClaim.t.sol` (claim re-entry, bubbling revert), `Fund.t.sol` (pull re-entry).
- **Replay**: Accept across pots, across a second deployment with identical terms, and across chains (`vm.chainId`); Settle and Contest across pots and chains; ERC-1271 Settle across pots.
- **ERC-1271**: wallet seats fund, settle and contest; four hostile wallet behaviours (revert, wrong magic, empty return, state write) all fail closed and cannot trap the pot.
- **Per-asset domains**: an authorization signed for EURC cannot fund a USDC pot, and one signed for a look-alike token with the same name at another address is rejected.
- **Units and floor**: six decimals enforced at deployment, `MIN_RETAINED_BALANCE == 5 x 10^(decimals-2) == 50,000`, boundary 49,999 fails and 50,000 passes, for USDC and EURC.
- **Deadline races and oracle timing**: funding, cooperative settlement and oracle proposals are refused at their deadline while refund opens at it; an oracle cannot rescue a pot that is already refundable.
- **Dense ranks and ties**: every ranking over `{0..n+1}^n` is classified identically by the contract and an independent model; valid counts are 3, 13 and 75; competition ranks such as (1,1,3) are rejected.
- **uint256 boundaries**: stakes at `maxUint256 / n`, one below, one above, and where `total x 70` would overflow, for every valid ranking and every rule, against a reference that never multiplies by 70 or 30. `create` accepts `maxUint256 / n` and rejects one more.

Console (Vitest): **215 passed** in 14 files. Raw output: `docs/test-output/vitest.txt`. New coverage: malformed amounts, ids, seats, oracle and timing; the full review screen and its canonical hash; wrong-chain and stale-config blocking (no contract, wrong chain, disallowed token, hash mismatch, taken id, passed deadline, RPC failure); wallet rejection, revert and connection refusal; proof that nothing is requested from the wallet and the network is never switched until its explicit button is pressed.

Lint, type check and the production build (base `/pot/`) are clean: `docs/test-output/lint-typecheck-build.txt`.

## Shared artifacts regenerated after the fix

- `abi/ConditionalPot.abi.json` (sha256 `9015e0c5…`), `abi/IConditionalPot.abi.json`, `src/lib/potAbi.ts`
- `docs/payout-vectors.json`: 273 vectors computed by the contract; the TypeScript rules reproduce all of them.

## Versions

- Solidity `0.8.28+commit.7893614a`, EVM `cancun`, optimizer 200 runs
- Foundry `forge 1.7.1`
- OpenZeppelin Contracts `5.6.1` (exact pin in `package.json` and `bun.lock`)
- forge-std `1.16.2`. It is vendored without git metadata, so **no commit hash is available**; to make it reproducible, pin a known tag by submodule or lock file. The `src/` tree fingerprint is `e93dbe05…fca96a` (see README).

## Open decisions and unresolved findings

1. **Pot-id squatting (High from the functional review, griefing only).** Whoever calls `create` first owns an id. A hostile creator cannot steal funds, because seats' signatures cover the exact terms, but they can make a relay's intended `create` revert with `PotExists`, and repeat it. Options: (a) keep as is and have the relay use unguessable ids and retry with a new one; (b) require the first 20 bytes of `potId` to equal `msg.sender`, so ids are namespaced by creator. (b) changes the id format your relay uses and I did not make it without your decision.
2. **Not independently audited.** Two automated reviews and Slither are not a substitute.
3. **The live tokens were not exercised.** Tests use a mock modelled on FiatToken v2.2. `receiveWithAuthorization(bytes)` on the real USDC and EURC, and the Arc-specific 50,000 floor behaviour, are as reported by your G0 checks; they were not re-run here, and there is no fork run.
4. **Issuer powers.** A token blocklist can freeze one seat's payout or the whole contract, and EURC is an upgradeable proxy. A blocklisted seat cannot redirect its share. Stray tokens are unrecoverable by design.
5. **Oracle pre-emption.** After the minimum play time an oracle proposal blocks cooperative settlement on that pot; a seat can contest, which refunds everyone.
6. **Smart-wallet seats must already be deployed** (undeployed ERC-6492 accounts cannot sign). A seat's wallet can make cooperative settlement fail for that pot, never the refund or oracle paths.
7. **Production timing values** (`minPlaySeconds`, challenge window, deadlines) are required inputs with no defaults and nothing was chosen.
8. **Console limits.** No browser was available, so the 320px layout is verified by structure tests and review only. No real wallet or chain was used, so the wallet path is tested with a stand-in provider and mocked transactions. The Create page needs `VITE_CHONKS_POT_ADDRESS` before it can submit; I did not invent an address. The configured-address note says plainly that the page has not verified the code at that address.
9. No relay endpoint exists in this app and none is implied anywhere in the console.

## Changed and added paths

Contracts: `contracts/ConditionalPot.sol`, `contracts/PotMath.sol` (new), `contracts/IConditionalPot.sol`.

Tests: `contracts/test/PotMath.t.sol` (new), `contracts/test/Hardening.t.sol` (new), `contracts/test/mocks/MockTokens.sol`, `contracts/test/PotBase.sol`, `contracts/test/Payout.t.sol`, and `expectPartialRevert` updates in `Fund.t.sol` and `Settle.t.sol`.

Generated: `abi/*.abi.json`, `src/lib/potAbi.ts`, `docs/payout-vectors.json`, `docs/test-output/*.txt`.

Console: `src/App.tsx`, `src/components/{Nav,AboutPage,CreatePage,CreateFields,TermsReview,ActionsPanel,SeatList,PotPage}.tsx`, `src/hooks/{useWallet,usePotActions,useView,usePot}.ts`, `src/lib/{createForm,createCheck,wallet,pot,reader}.ts`, plus tests `src/lib/{createForm,createCheck,wallet}.test.ts`, `src/components/{CreatePage,Wallet,PotPage}.test.tsx`, `src/App.test.tsx` and `src/test/fakeWallet.ts`.

Config and docs: `vite.config.ts`, `vitest.config.ts`, `tsconfig.json` (the `@` alias that the generated money module needs), `README.md`, `AGENTS.md`, `docs/CONDITIONAL_POT.md`, this report.
