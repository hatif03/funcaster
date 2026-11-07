> Historical implementation milestone. Current integrated behavior and remaining tasks are in [architecture](../../ARCHITECTURE.md) and [progress](progress.md); do not execute old activation instructions from this milestone.

# G1 Arc contract and console — 6 November 2026

Historical A2/A3/A7 checkpoint. The subsequent [A4 public completion](g1-arc-worker-public.md) supersedes the worker/deployment-pending items below. A5/A6 gameplay and A7 real-wallet console acceptance remain pending.

Implementation commits: **a4e13e8** (contract, canonical helpers and fork evidence),
**7a49422** (console, browser tests and route evidence).

This is local implementation and acceptance of the A2 contract, A3 canonical
terms/read helpers and A7 console. It is not the public A2 deployment gate or a
completed G1. The relay and worker remain in MOCK configuration.

## Contract and signatures

Studio generated the contract in the existing Funcaster app, then ran the saved
`G1-AUDIT-PROMPT.md` audit turn. Public sources are exported to
`integrations/arc/onchain/`; the original G0 diagnostic remains separate.
Dependencies are isolated and pinned: OpenZeppelin 5.6.1, forge-std 1.16.2 at
`bf647bd6046f2f7da30d0c2bf435e5c76a780c1b`, Solidity 0.8.28, Cancun, optimizer
200, 2,000 fuzz runs. The local Arc Foundry is 1.7.1-dev at
`d497beea7096ff2a8e583c8b307941f24a61b06b` (Arc v0.8.0-2).

Review corrections:

- An opaque caller-supplied terms hash did not bind the actual pot terms. The
  contract now computes the hash from every immutable field, including pot id,
  ordered seats, asset, stake, rule, oracle, all timings and metadata hash.
  Existing Accept signatures cannot authorize altered terms. The JavaScript
  helper uses the same TermsHead/TermsTail/Terms encoding, checked against the
  actual deployed local bytecode.
- The interim uint128 stake restriction was not in the specification. The final
  ABI uses uint256, explicitly bounded by `maxUint256 / seatCount`. Full-precision
  percentage arithmetic avoids intermediate overflow. The production allocation
  library is directly exercised at maximum integer values.
- Removed appendix allowance/rescue/CRE paths stay absent. All externally
  mutating ABI entry points are checked by the repository regression test.

Independent checks: **177 Foundry tests pass**. Contract-generated payout vectors
cover all 91 valid two-to-four-seat placings under three rules; all **273** match
the relay. Separate relay tests cover 2,184 boundary vectors. Game result ranks
and hashes remain unchanged; only the pot adapter derives dense ranks.

The A3 reader verifies exact configured runtime code, token allowlist, domain,
canonical terms, funding bitmaps and claimables at one fresh block. It rechecks
the chain and block hash after the reads. It never fabricates the later Ledger
verification badge.

## Local product rehearsal

`scripts/spikes/arc-pot-rehearse.mjs` passes **17 checks / 54 local transactions**
against the exported contract on a disposable Arc fork of block **70998665**.
It tests both actual USDC and EURC implementations: Accept and gasless funding,
retained 0.05-token floor, EURC seats with no native gas, last-seat lock,
cooperative settlement, exact payouts and dust, authorization replay denial,
isolated blocked-recipient claims, partial-funding deadline refunds, minimum
play time, oracle proposal, signed contest and full refunds. Every completed
scenario drains the contract's accounted token balance to zero.

Evidence: [public local-only report](spikes/g1-arc-pot-rehearsal.json). All signing
and issuer impersonation is guarded to loopback Anvil, chain 31337, ephemeral
test keys. Public RPC is only a fork source. No role key or env file is loaded.

The initial rehearsal exposed an intermittent viem receipt-watcher timeout even
though the local transaction was mined. The runner now polls the exact receipt
with a finite deadline and never automatically resends; unresolved evidence is
preserved. This did not involve public sends.

## Console acceptance

Pot, Create and About pages are exported to `integrations/arc/pot-console/` and
build at `/pot/`. Pot lookup needs no wallet. Create requires every timing field,
exact six-decimal amounts, the full terms review and a matching on-chain hash.
Wallet connection and network switching are separate explicit actions. Every
send revalidates the fresh canonical block, signing domain and current account;
creation repeats its terms-hash check at submission. Repeated button presses
cannot start concurrent transactions. Fees have a 20-gwei minimum, a 100-gwei
ceiling and zero priority fee.

Lookup and contract/deadline details collapse on a loaded pot, keeping the
current state and actions accessible. Address/hash text wraps; controls have
phone-sized targets. The product build has **no public deployment address** and
honestly shows unconfigured states. It contains no live relay endpoint or
independent Ledger badge. Vite is loopback-only; unused template chain support
and transaction polling code were removed. No remote fonts or analytics load.

- **219 console tests**, TypeScript, lint and production build pass.
- **88 Chromium cases** at 320×568, 390×844, 844×390 and 1280×720 cover all pot
  states, stale/wrong/unavailable RPC, expanded details, Create/About, exact
  terms, claim/refund/create success, wallet rejection and account changes.
  RPC replies and wallet sends in this matrix are explicit fixtures, not public
  transaction evidence. [Report](spikes/g1-arc-pot-browser.json).
- **12 compiled-console cases** exercise the actual production `dist/` through
  the existing relay router, with external browser requests forbidden.
  [Report](spikes/g1-arc-pot-dist.json).
- **752 root tests** pass (313 unit + 117 party + 168 OS + 154 Web3), including
  both off-mode parity gates. [Root log](g1-arc-check.txt),
  [Foundry log](g1-arc-foundry.txt), [console log](g1-arc-console-check.txt).

Screenshots were visually reviewed: [phone](spikes/g1-arc-pot-phone.png),
[desktop](spikes/g1-arc-pot-desktop.png), [Create review](spikes/g1-arc-create-phone.png).
The main JavaScript bundle is 159.81 KB gzip. Vite's advisory about a chunk above
500 KB uncompressed remains; it is not a failed build. Physical phones and real
wallet approvals are not claimed tested.

## Retained availability finding

Permissionless creation allows someone to reserve an intended pot id first.
Terms binding prevents that pot from using signatures for different terms, but
does not eliminate denial of service. Studio's report rated this High and did
not resolve it. We retain the plan's generic contract interface and track the
required A4 behavior: persist unpredictable ids, reconcile an existing pot only
when its immutable terms match exactly, fail closed on conflicting terms and
require fresh acceptance for any replacement pot. Random ids alone do not stop
transaction front-running. Public activation remains pending integration and
acceptance; this finding has not been silently dismissed.

## Remaining and next task

1. **A4:** concrete Arc worker jobs, preflight, token-domain registry, signed
   receipt metadata, funding/settlement/deadline recovery and actual drips using
   the already tested transaction journal and persistent budgets.
2. **A5/A6 and phone integration:** consume the ENS roster, wire both start
   gates, private reliable phone terms/funding/settlement/contest requests,
   cancellation, disconnects and restart behavior. The policy module alone is
   not live gameplay integration.
3. Prepare the bounded owner-operated public deployment/receipt book after the
   integrated flow passes locally. Earlier automatic approval review reserves
   public signing/broadcasts for the owner. No new owner command is requested
   for this coding chunk.
4. Ledger L1–L4, real match and partner failure/stop-the-relay
   drills. Hosting and physical-phone acceptance remain owner-deferred.

No open owner decision blocks A4. No main merge or deployment is authorized.
