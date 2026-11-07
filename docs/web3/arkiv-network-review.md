# Arkiv network / SDK decision — 6 November 2026

## Observed conflict

The build guide explicitly pins SDK 0.8.1 and Tiramisu (7738577). Current [official documentation](https://docs.arkiv.network/networks/older-networks/) marks Tiramisu as replaced by Rabdi. The [public Hub](https://hub.arkiv.network/networks) and [faucet](https://hub.arkiv.network/faucet) target Rabdi (7794095). No verified Tiramisu faucet route has been found. At initial discovery both console balances were zero; the owner has since funded Rabdi with 10 tGLM and completed the first live probe (see progress.md).

Read-only probes today reproduce the 0.8.1/Rabdi `contentType` failure. An isolated exact-version **SDK 1.0.1 + viem 2.57.14 + ensjs 5.2.7** probe successfully performs a creator-scoped anonymous Rabdi query and an ENS read in one process. Evidence and runnable source: `spikes/rabdi-1.0.1/`. No production dependency changed and no Arkiv write was sent.

## Approved decision — owner, 6 November 2026

Use Rabdi 7794095 and pin SDK 1.0.1, then repeat every required K0 verification against that combination before enabling K1/G1. The owner explicitly approved this exception to the master prompt's 0.8.1 pin. Never claim that the anonymous read completes the write or cost gates.

The alternative is retaining Tiramisu/0.8.1 and obtaining Tiramisu test GLM from the sponsor or an existing funded address. Do not send Rabdi faucet tokens to a different network and call Tiramisu funded.

## Approved migration work

- Schema-based typed columns and explicit indexes; preserve the five planned entity types, creator allowlist, validation, immutable records and u64 application timestamps.
- Payload becomes a bytes column. Unencrypted Swarm references remain public bytes32; no secret references.
- Flat system fields (`$key`, `$creator`, etc.) replace the old projection shape.
- Latest-state offset/keyset pagination replaces snapshot cursors. Record completeness/observed blocks honestly; do not imply a historical consistent snapshot.
- Re-measure expiry, batches, transfer/readonly behavior, byte/attribute/query limits, costs, public browser reads and bundle budget.
- Separate scratch first; update the plan and verification log only after owner choice. Keep original evidence and documented fallbacks.

## Funding completed

Fund public console address `0xE581E56c592Ab9D6d3D234168EE9a89032273c00` with **Rabdi test GLM** through the official Hub. Complete any wallet/CAPTCHA/signature step yourself. Do not share keys. Live entity creation remains a separate owner-executed probe; this decision does not claim success or authorize a mainnet transaction.

Funding and phase one are complete; do not repeat this faucet step. Current balance after the six verified transactions: 9.99761787 tGLM.
