# ConditionalPot: a conditional multi-party pot

`ConditionalPot` is a small, reusable escrow. Two to four parties each lock the same amount of one ERC-20 token. A pot pays out by a rule fixed at creation once the parties agree on a result, and otherwise gives every funded stake back. One contract holds many pots. It has no owner, no operator, no pause switch, no upgrade path and no fee.

Use it for anything shaped like "N parties put in equal stakes, a result decides who gets what": a game table, a bet between friends, a split-the-prize competition, a small tournament. The Funcaster game is one user of it. Nothing in the contract is game-specific.

TESTNET ONLY, PLAY MONEY. This build has not been deployed anywhere. Nothing here has been independently audited.

## Trust model in plain language

Who can do what:

- **The seats** (the 2 to 4 parties). Their signatures are the only thing that can start funding for them, settle a pot cooperatively, or freeze an oracle result. Nobody can move a seat's money without that seat's signature or a deadline passing.
- **Anyone** can create a pot, relay a seat's signed funding, trigger a refund once its conditions are met, finalize an unchallenged result, or trigger a claim. These calls are open on purpose: a relayer pays the network fee for players, and a stuck pot can always be unstuck by anyone.
- **One optional oracle per pot** can propose a result, only after the pot is full and a minimum play time has passed. It cannot move money. Its proposal pays out only if no seat contests it during the challenge window. A contest refunds everyone.
- **Nobody else.** There is no administrator who can change a pot, pause the contract, change the list of allowed tokens, or take a fee.

What you are trusting:

- **The token issuer.** The allowed tokens (USDC and EURC on Arc Testnet) are controlled by Circle. Circle can blocklist an address or upgrade the token. A blocklisted seat cannot receive a payout. A blocklisted contract address would freeze every pot that uses that token. The pot cannot work around this.
- **Your own signature.** Seats sign the exact terms of the pot. The terms hash is derived on-chain from every parameter, so a relayer cannot change the oracle, seats, rule, deadlines or amounts after you sign.
- **The oracle, only if you pick one.** You can always contest its result (a refund), but you cannot make it pay you. Choose "no oracle" (the zero address) to allow only unanimous settlement or refund.
- **Chain time.** Deadlines use block timestamps. Equal timestamps between blocks are handled (see Deadlines).

What it does not protect you from:

- Tokens sent straight to the contract address cannot be recovered. There is deliberately no rescue function.
- A seat whose address is blocklisted by the token issuer loses access to its share. Other seats are not affected.
- If the oracle proposes a result right after the minimum play time, it can pre-empt a cooperative settlement that seats were about to sign. Any seat can contest and get a refund; no seat can be forced into a payout it did not agree to.

## Lifecycle

```
None -> Funding -> Locked -> Proposed -> Settled
          |          |          |
          |          |          +-> Contested -> Refunded
          +----------+------------> Refunded (permissionless, conditions below)
```

| Step | Who | What happens |
| --- | --- | --- |
| `create(potId, params)` | anyone | Records the terms. The relayer supplies a unique `potId`; a repeat reverts, so a retried job is harmless. |
| `fundWithAuthorization(...)` | anyone | The seat has signed an Accept of the terms hash and a token funding authorization. The contract verifies Accept, pulls exactly one stake, and locks the pot when the last seat is in. The seat never needs gas. |
| `settleCooperative(potId, places, sigs)` | anyone | Every seat signs the same placing. Smart-contract wallets (ERC-1271) work. Pays out immediately. |
| `propose(potId, places, resultHash)` | the pot's oracle | Allowed from `lockedAt + minPlaySeconds` up to (not including) `settleDeadline`. Starts the challenge window. |
| `contestWithSig(potId, seat, sig)` | anyone | Any seat's signed Contest, strictly inside the window. The pot becomes refundable. |
| `finalize(potId, places)` | anyone | After the window, reveals the proposed placing and settles. |
| `refund(potId)` | anyone | Funding past its deadline, locked past the settle deadline with no proposal, or contested. |
| `claim(potId, seat)` | anyone | Pays that seat's share to that seat. One seat's failure never blocks another. |

Every transition emits an event: `Created`, `Funded`, `Locked`, `Proposed`, `Contested`, `Settled`, `Refunded`, `Claimed`.

## Terms and what seats sign

All signatures use EIP-712 with domain `{ name: "ChonksPot", version: "1", chainId, verifyingContract }`.

- `Accept(bytes32 potId, bytes32 termsHash)`: the seat accepts the pot. `termsHash` is computed by the contract (`hashTerms`) from the pot id and every parameter, so it commits to asset, stake, ordered seats, rule, oracle, both deadlines, challenge window, minimum play time and an opaque `metadataHash` for off-chain game rules.
- `Settle(bytes32 potId, bytes32 placesHash)`: a seat agrees to a placing. `placesHash = keccak256(abi.encode(uint8[] places))`.
- `Contest(bytes32 potId)`: a seat freezes an oracle proposal.
- The funding authorization is the token's own ERC-3009 `ReceiveWithAuthorization`, with `to` set to the pot and `nonce = keccak256(abi.encode("chonks-fund", potId, seat))`. Because the token only honours it when the pot itself calls it, nobody can front-run or redirect it.

TypeScript mirrors of all of these live in `src/lib/signing.ts` and are checked against frozen answers from the Solidity tests.

### Canonical terms hash (exact encoding)

`create` does not accept a terms hash from the caller. It computes one on-chain, stores only that, and exposes the same function as `hashTerms(potId, params)` (pure). The domain separately binds chain and contract. Definitions, where `||` is not used: every `abi.encode` below is standard ABI encoding of static types, 32 bytes per word.

```text
TERMS_HEAD_TYPEHASH = keccak256("TermsHead(bytes32 potId,address asset,uint256 stake,bytes32 seatsHash,uint8 rule)")
TERMS_TAIL_TYPEHASH = keccak256("TermsTail(address oracle,uint64 fundDeadline,uint64 settleDeadline,uint32 challengeWindow,uint32 minPlaySeconds,bytes32 metadataHash)")
TERMS_TYPEHASH      = keccak256("Terms(bytes32 head,bytes32 tail)")

seatsHash = keccak256(abi.encodePacked(address[] seats))      // 32 bytes per address, left padded, in seat order
head = keccak256(abi.encode(bytes32 TERMS_HEAD_TYPEHASH, bytes32 potId, address asset, uint256 stake, bytes32 seatsHash, uint8 rule))
tail = keccak256(abi.encode(bytes32 TERMS_TAIL_TYPEHASH, address oracle, uint64 fundDeadline, uint64 settleDeadline, uint32 challengeWindow, uint32 minPlaySeconds, bytes32 metadataHash))
termsHash = keccak256(abi.encode(bytes32 TERMS_TYPEHASH, bytes32 head, bytes32 tail))
```

`rule` is the enum index: 0 WINNER_TAKES_ALL, 1 TOP2_70_30, 2 EQUAL_AMONG_TOP. `metadataHash` is the caller's opaque commitment to off-chain game rules and is part of the hash. The JavaScript helper is `hashTerms` in `src/lib/signing.ts`; `contracts/test/Misc.t.sol` freezes a known answer that `src/lib/signing.test.ts` must reproduce. A test (`test_acceptSignature_cannotBeReusedAgainstAnySubstitutedField`) substitutes each of the fourteen creation fields in turn while reusing an Accept signed for the honest terms and requires `BadSignature` every time.

A pot id can be squatted by someone who creates it first with different terms. They gain nothing: the seats' Accept covers the exact terms, so it will not verify against the squatter's pot. The relay simply picks a new id. Use unguessable ids.

## Places and payout rules

A placing is `uint8[]` indexed by seat. 1 is best. Equal numbers are ties. Numbers must be dense: the distinct values are exactly 1, 2, ... k with no gap. `(1,1,2)` is valid. `(1,1,3)` is not; a game that reports competition ranks must normalise `(1,1,3)` to `(1,1,2)` first (`normalizeToDenseRanks` in `src/lib/payout.ts`).

Total `T = stake x seats`. `stake` is a full `uint256`; `create` rejects any stake above `maxUint256 / seats` (`StakeTooLarge`), so `T` can never overflow. All arithmetic is integer floor division, and the 70 and 30 percent steps use full-precision `mulDiv`, so `T x 70` is never formed as an intermediate.

- **WINNER_TAKES_ALL** and **EQUAL_AMONG_TOP**: `T` is split equally among the seats that placed 1st.
- **TOP2_70_30**: place 1 gets `floor(T x 70 / 100)` and place 2 gets `floor(T x 30 / 100)`; seats tied in a place share that place's amount equally. If every seat ties, `T` is split equally. Places 3 and 4 receive nothing.
- **Remainder**: whatever integer division leaves over goes to the lowest-index seat among those that placed 1st. The sum of all payouts always equals `T` exactly.

`docs/payout-vectors.json` lists every valid placing for 2, 3 and 4 seats under every rule, with the payouts the contract itself computed (stake 1,000,001 base units so rounding shows up). The relay should replay all of it before enabling settlement. Regenerate with `bash scripts/dump-vectors.sh`.

## Deadlines and races

- `fundDeadline`: funding is refused at or after it; refund of an unfilled pot opens at or after it. Exactly one of the two is possible at any timestamp.
- `settleDeadline`: cooperative settlement and oracle proposals are refused at or after it; refund of a locked, unproposed pot opens at or after it.
- `minPlaySeconds` (must be above zero): the oracle may propose only from `lockedAt + minPlaySeconds`. At creation `fundDeadline + minPlaySeconds < settleDeadline`, so even a pot that fills in the last second has room for the oracle.
- `challengeWindow` (at least 60 seconds): a contest is accepted strictly before `proposedAt + challengeWindow`; finalize opens at exactly that time. There is no gap and no overlap, and nothing assumes consecutive blocks have different timestamps.
- A result proposed just before `settleDeadline` keeps the pot in `Proposed`; it cannot be refunded by deadline, and it finalizes after its window. Anyone can finalize.

## The retained-balance floor

Funding must leave the seat holding at least 50,000 base units (0.05 of the six-decimal asset). This is a workaround for an Arc testnet behaviour found in the G0 checks, not a fee: the pot keeps nothing extra. The phone and the relay apply the same floor so players see the problem before signing.

## Interfaces and ABI

- Reusable interface: `contracts/IConditionalPot.sol`.
- ABI for the relay, the console and integrators: `abi/ConditionalPot.abi.json` and `abi/IConditionalPot.abi.json` (regenerate with `bun run abi:export` after `forge build`).
- `getPot` returns the asset, seats, funded and accepted bitmaps, deadlines, `lockedAt`, `minPlaySeconds`, rule, oracle, `metadataHash`, `termsHash`, state, proposal and total. `claimableOf(potId, seat)` returns a seat's pending payout.

License: MIT.
