# A0 / Arc evidence — G0 primitives verified

**Current verdict — 6 November 2026:** G0 primitives pass. USDC and EURC sponsored authorizations, retained floors and exact canonical token-emitter receipts are verified on both Arc RPC hosts. EURC signer has zero native gas. Daily discovery passes all 11 read checks. Product-flow/Memo gates remain separate. [G0 completion](g0-completion.md). Earlier pending statements below are historical. Subsequent [A4 worker public acceptance](g1-arc-worker-public.md) is also complete; A5/A6 gameplay and Ledger/Memo remain separate.

Observed 2026-11-06 at 09:00 UTC. **Read-only discovery; no transaction, Studio app or deployment. VA-01 and VA-12 remain OPEN.**

| Read on primary `rpc.testnet.arc.io` | Observed value |
| --- | --- |
| Chain ID | 5042002 |
| Observation block | 70154566 |
| Token | USDC, version 2, 6 decimals |
| EIP-712 domain | Local hash equals `DOMAIN_SEPARATOR()` |
| Base fee | 20000000000 wei (20 gwei) |
| Fresh relayer ERC-20 balance | 0 base units |

Raw evidence: [foundation-readonly.json](spikes/foundation-readonly.json). Script and input: `scripts/spikes/foundation-readonly.cjs` and `docs/web3/spikes/discovery-input.json`. Reads use the shared public config. The script never loads a wallet or key and cannot send a transaction.

Two issues were observed:

1. Our initial domain-hash harness omitted viem's EIP712Domain types and failed with `Cannot read properties of undefined (reading 'EIP712Domain')`. This was a local harness error, not a network failure; fixed by supplying the explicit type list. [Original output](spikes/first-readonly-harness-error.json) is retained.
2. The legacy `rpc.testnet.arc.network` endpoint returned `Request exceeds defined limit.` during concurrent reads. This endpoint is not verified as a reliable fallback. Add bounded retry/backoff in the live preflight and retest before enabling it.

Reproduce with `node scripts/spikes/foundation-readonly.cjs docs/web3/spikes/discovery-input.json`. No transaction hashes exist. Next: faucet funding, EURC/Memo/Multicall3 discovery, EIP-3009 authorization and drain tests, actual fee measurements, Arc Studio login/app and the dependency-alignment gate. Do not infer live settlement or gasless funding from these reads.

## Refreshed read-only evidence — 6 November

`node scripts/spikes/arc-readonly.mjs` passes all eleven checks at block **70169139**. Both RPC host families respond under sequential reads. USDC and EURC are unpaused, have six decimals and matching per-asset EIP-712 domains. Both reject a non-payee caller. Multicall3 and Memo have deployed code. The test blocklist address is blocked on USDC and not on EURC. Relayer balances are **20 test USDC, 0 EURC**. This supersedes the earlier pre-funding balance, not its historical evidence. [Raw report](spikes/arc-readonly.json).

Arc Studio authentication is complete; app creation/deployment remains pending. The rate-limited legacy endpoint is reachable in this run but its reliability is not established. The independent EIP-3009 success, receipt/gas and Memo checks run locally with Arc's own simulator; live authorization, below-fee-floor behavior, and per-product-flow VA-12 coverage remain open. [Runbook](g0-runbook.md).

## Native local simulator — 6 November

[arc-native.json](spikes/arc-native.json) records successful USDC/EURC sponsored receives, replay denial, insufficient-balance denial, native USDC blocklist denial and a EURC transfer from a signer that remains at zero native balance. Signatures use chain 31337 and ephemeral keys, never the real project signers. USDC exact drain reproduces `Cannot clear balance of empty account`; 0.05 retained succeeds. EURC exact drain only simulated successfully; no live-flow guarantee follows.

Memo's unsigned local simulation reverts; the test sends no Memo transaction, then verifies the plain-transfer fallback and exact recipient balance delta. [Original failure](spikes/arc-native-memo-failure.json). After matching the deployed no-return-value ABI, the unsigned live Memo eth_call passes while the official local fork still reverts. The local simulator limitation is unresolved; actual live Memo transaction/receipt behavior remains unverified. No public Arc transaction or Studio deployment was performed.

## Live USDC and Studio completed — 6 November (supersedes pending notes above)

Owner executed the capped USDC probe. [Two successful receipts](spikes/arc-owner-live.json) were [independently verified on both official RPC hosts](spikes/arc-owner-verified.json), including canonical blocks, sender, exact calldata, token-emitter Transfer events, gas and block-pinned final balances. The relayer funded 0.051 test USDC; the developer authorized 0.001 back with `receiveWithAuthorization`, retaining **0.05**. Replay unsigned simulation reverts. Gas total **0.00322892 USDC**; relayer afterward **19.946771 USDC**.

`arc-native.mjs` also passed again against a fresh local Arc fork on November 6, including both assets, replay/insufficient balances, drain floor and the same Memo simulation limitation. Public EURC/Memo receipts and future per-product floor tests remain open, so VA-01/VA-12 are still partial. The initial “no hashes” statement above is historical.

Studio app now exists and its diagnostic has been exported, reviewed and browser-tested: [provenance](arc-ai-use.md). No ConditionalPot contract exists or has been deployed. Never infer game settlement from a diagnostic authorization.


## Final G0 EURC preparation — 6 November

The separate EURC probe key is `0x7a66B9dD5eED3F3fB4B5f82619f8f0A8112CF08E`; it has zero native USDC. It does not reuse the already-USDC-funded developer key. `spikes/arc-eurc-owner-plan.json` rechecks the domain, token state and balances without loading a key; the relayer still has **zero EURC**, so the free faucet step remains. Dia's official Circle form is prepared for EURC on Arc Testnet to the existing relayer. No agent faucet/signing action was taken.

The owner-only EURC mode has a separate journal and nonce domain, a maximum 0.051-EURC top-up, 0.001 sponsored receive, 0.05 retained floor, 0.2-test-USDC gas ceiling, explicit pending-nonce checks and zero-native-before/after assertions. The independent two-host receipt verifier accepts EURC as an explicit asset. See [the final handoff](g0-final-handoff.md).

Scope: VA-12 primitive drain/floor behavior is G0 evidence; repetitions for each future product flow stay at that flow's gate. Memo receipts are VA-07/P1. CRE and Gas Station remain disabled stretch/polish per guide 03; Chainlink's [official network-support announcement](https://docs.chain.link/changelog/cre-expands-testnet-support) lists Arc testnet simulation support, but no CRE broadcast or Gas Station sponsorship is claimed here.

## Live EURC completed — 6 November

Owner sent 0.051 EURC to the fresh zero-native probe, then sponsored 0.001 back. Both receipts are canonical on `rpc.testnet.arc.io` and `rpc.testnet.arc.network`; signatures/calldata, token-emitter transfers, used nonce and pinned post-state match. The probe retains **0.05 EURC** and **0 native USDC**, the relayer **19.95 EURC**. Replay unsigned simulation reverts. Gas **0.00296636 test USDC** is below the 0.2 cap. [Owner report](spikes/arc-eurc-owner-live.json), [independent two-host verification](spikes/arc-eurc-owner-verified.json).

Funding/setup is complete; do not repeat the faucet/probe. VA-01 passes for G0; VA-12 primitive evidence passes, with each future product flow still gated on its own tests. Actual Memo transactions, CRE, Gas Station, ConditionalPot and live product settlement remain unbuilt/unverified as recorded elsewhere.
