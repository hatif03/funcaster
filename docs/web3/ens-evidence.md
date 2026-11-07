# E0 / ENS evidence — G0 setup and address verified

**Current verdict — 6 November 2026:** parent/play bootstrap and roles pass; `play.funcaster.eth` resolves to the project console, and the same process wrote the matching Arkiv fixture. G0 prerequisites are complete; party/seat/host product integration remains G1. Earlier pending statements below are historical. [G0 completion](g0-completion.md).

6 November 2026. **funcaster.eth is registered on Sepolia.** The owner executed the prepared script; the agent independently verified all four receipts and current registry state with read-only RPC calls at 2026-11-06T10:29:39.925Z.

| Check | Verified result |
| --- | --- |
| Chain | Sepolia, 11155111 |
| Name | funcaster.eth |
| Owner | `0x04b0970f4a58caa9E58C5aDBBF7eB402339264a5` |
| Registration | [0xfde4cb5c70062b1dda668345d593654f3402b23a225df2cf8501963d79ef0022](https://sepolia.etherscan.io/tx/0xfde4cb5c70062b1dda668345d593654f3402b23a225df2cf8501963d79ef0022) |
| Expiry | 1 November 2027, 15:57:12 IST (2027-11-01T10:27:12.000Z) |
| Payment | 8.000021 freely minted MockUSDC; no real-money purchase |
| Receipts | Mint, exact approval, commitment and registration all successful; registration had 12 confirmations at independent verification |
| Registration roles | Exact match to the pinned source bitmap; unrelated project key lacks SET_RESOLVER |
| Remaining token allowance | 0 |
| Total gas, four transactions | 0.000000000017831283 SepETH |
| Registrar balance afterward | 0.769999999982168717 SepETH |
| Resolver / subregistry | Both unset; bootstrap remains pending |

Evidence: [owner execution report](spikes/ens-registration.json), [independent verification](spikes/ens-registration-verified.json), [operator input](spikes/ens-registration-input.json), [unsigned preflight](spikes/ens-unsigned-check.json).

The deployment comes from the official [ENS deployment page](https://docs.ens.domains/learn/deployments/) and commit `07e55a056f5b6a9c90119f501bdd05714e67dddd`. Registrar: `0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3`; ETHRegistry: `0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4`. The operator checked registrar/registry/oracle links and verified the role-library and registrar-source hashes against the pinned artifact metadata. Both local service env files now set `ENS_CHAIN=sepolia` and `ENS_PARENT=funcaster.eth`; partner modes remain mock/off.

**VE-01 remains OPEN:** the parent ownership/expiry/registration-role subset passes, but guide 19 also requires `hasRootRoles` checks on the parent child registry and the `play` registry. Neither child registry exists yet. E0's resolver, child-name, grant/revoke and SDK checks now pass on a disposable local fork; their live equivalents and inclusion latency remain pending. Registration alone does not make the name resolve to an address or enable ENS in the game.

The earlier [discovery](spikes/foundation-readonly.json) recorded availability and a zero balance before funding. Automatic approval review rejected agent broadcasts twice; the owner completed the transaction handoff. No alternate agent broadcast route was used. [Handoff instructions](ens-registration-handoff.md) are retained as history, not outstanding work.

## Local E0 evidence — 6 November

`node scripts/spikes/ens-fork.mjs` passes **12 checks with 16 successful local transactions**, against the pinned Sepolia deployment at block 12040400. It verifies SDK addresses and write helpers, parent/play root roles, address/text resolution, soulbound transfer/write denial, host kick/control grants and revocations, mint/escalation denial and expiry. Total local gas: 1,941,481; this includes temporary party/seat fixtures, not just bootstrap. No public transaction was sent.

[Evidence](spikes/ens-fork.json), [artifact provenance](spikes/ens-artifacts.json), [runbook](g0-runbook.md). Local-only results deliberately do not complete VE-01 or the live CAN/CANNOT transaction book.

## Live bootstrap completed — 6 November (supersedes pending notes above)

Owner executed `ens-bootstrap.mjs --apply --confirm-parent funcaster.eth` after the seven-operation rehearsal passed on a fresh local fork. All seven public receipts, exact sender/calldata, canonical blocks, factory implementations, registrar root roles and canonical parent links were independently checked. Current unsigned plan has zero operations. **VE-01 passes for today's configured deployment/parent/roles**; later party/seat/host tasks remain unbuilt.

| Object | Public Sepolia address |
| --- | --- |
| funcaster.eth child registry | `0x03dB3cdE1139CE7aBa50E6176ee28E1eBECC77CD` |
| play.funcaster.eth registry | `0x15E729A01519A22a726D2C829285781a3DEEb0Cb` |
| play.funcaster.eth resolver | `0x8FB3Bc94532Ff13C75d84201D72E7A0A77Bf9439` |

[Owner receipts](spikes/ens-bootstrap-live.json), [two-provider verification](spikes/ens-bootstrap-verified.json), [rehearsal](spikes/ens-bootstrap-rehearsal.json). The parent expiry is unchanged. No game address record is set; a resolver existing does not imply the name resolves to a game. The original thirdweb endpoint rate-limited the rehearsal; PublicNode was separately checked as Sepolia and used as the public fallback. Three operator guard tests pass.


## Final G0 address-resolution probe — 6 November

`play.funcaster.eth` still has no address record. `spikes/cross-owner-plan.json` verifies the existing resolver and unsigned record-set estimate (384,834 gas; cap below 0.005 SepETH). `spikes/cross-rehearsal.json` records successful localhost-only resolution to the console after that exact record update, 112,080 gas used, and unchanged public state. Both artifacts carry calldata hash `0xf02468bbbe5f6653311ef0177b2f0556d79404e14273ac80cd96f9d0d07d8ec0`.

PublicNode timeouts and thirdweb 429 affected early rehearsals. The successful run serializes guarded upstream reads through localhost; it cannot forward send/sign methods. No real key or public write was used. The live record + same-process Arkiv write remain owner actions in [the final handoff](g0-final-handoff.md).

## Live address and cross-SDK probe completed — 6 November

Address-record transaction `0x18a59daed07c0fd5e5e95a430252946f47c4001c28a6fc81fa4c3259dec22ffe` succeeded on Sepolia; exact calldata matches the keyless plan/rehearsal. Cost **0.0003709400055641 SepETH**. Current `play.funcaster.eth` resolution is `0xE581E56c592Ab9D6d3D234168EE9a89032273c00`. The same owner process created Arkiv fixture `0xafc7c87bb6374e7d878dc5c5e48f6d395446502ad71e59ec797fa99c63488662` with that `who` value in transaction `0x2e8466a5b15092d1d46334bad1ce0c1e647ac9f4d33dc47d175090c0814ada8f`.

Its one-hour lease ended at Rabdi block 271294. [Immediate readback](spikes/cross-verified-at-completion.json) passed before expiry. [Current public verification](spikes/cross-verified.json) checks ENS, canonical receipts, engine creation/expiry event and exact reconstructed Arkiv calldata, then labels the row expired. No record was recreated; a missing row before its event-recorded expiry would fail. Fresh ENS bootstrap check still requires zero operations. Hosted name-joining and live party authority remain G1 work.
