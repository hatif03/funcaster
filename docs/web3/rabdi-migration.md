# Approved Arkiv migration — 6 November 2026

Owner decision: use **Rabdi 7794095**, exact **@arkiv-network/sdk 1.0.1**, **viem 2.57.14** and **ensjs 5.2.7**. This overrides older network/SDK/API assumptions in guides 04/08/18/19/22/26. No K0 or G0 test is waived, and live game providers remain off. [Decision record](arkiv-network-review.md).

The isolated reproducible package is `scripts/spikes/rabdi/`; install with `npm ci --prefix scripts/spikes/rabdi --ignore-scripts`. The root lockfile and production dependencies are unchanged. Prior Tiramisu reports remain historical evidence, not evidence for Rabdi.

| Old assumption | SDK 1.0.1 adaptation / evidence boundary |
| --- | --- |
| Tiramisu / 0.8.1 | Rabdi RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network`, WS `wss://rpc.rabdi.db-chain.testnet.arkiv.network`; anonymous chain/read tests pass. Console received 10 tGLM. |
| Separate payload and attribute list | `defineSchema` with typed columns and explicit `.indexed()` for predicate fields. JSON payload is a named `bytes()` column. Keep the five product entity types and application schema version 2 when K1 starts. |
| `bytes32` constructor | No exported bytes32 constructor. Public Swarm refs are unindexed `bytes()` validated as exactly 32 bytes; optional indexed hex string for equality. Reject encrypted/long refs. |
| 30 attributes / payload 128,000 bytes | SDK allows 32 total attributes (31 columns + named schema tag), at most 131,072 aggregate bytes. Our tests verify these **SDK checks**, not the live node/gas limits. 129,000 bytes is valid in this SDK; the old expected 413 is not assumed. Funded 128000/129000-byte four-column writes now pass; use the stricter 120000-payload/256000-request application caps measured below. |
| Lowercase snake_case is a node rule | It remains the Funcaster naming convention. SDK permits more names; enforce the app convention explicitly, never claim the node rejects all uppercase. |
| No server sorting; opaque snapshot cursor/next | SDK has ordering, counts and latest-state offset/keyset queries. Use stable `$key` order, bounded traversal, strict schema mismatch handling and observed blocks; never claim atomic historical snapshots or complete data from one page. |
| Nested projections | Rows are flat (`$key`, `$creator`, `$owner`, typed values). Scope by configured creator allowlist and validate schema/payload. Namespace tags are copyable and do not authenticate publishers. |
| Implicit write gas | Estimate exact unsigned calldata, then explicit current nonce/gasPrice and gas headroom. Lock the signer, cap aggregate fees, durably journal the signed hash before broadcast, stop after uncertain/reverted receipts. |
| Old expiration assumptions | Absolute block deadlines plus relative floors; live expiry/extension/cost tests now pass with recorded samples and actual costs. No permanent-storage or exact wall-clock lease claim. |

Read official skills at reference commit `9fcbdc3066563ea05d3973eb1a9c73cecc82f9e3` (query, modeling, lifecycle, security and write safety), then cross-check installed 1.0.1 declarations. Skills target 1.0.0; installed source and actual checks decide compatibility. No global hooks or unreviewed agent instructions were installed.

## Verification sequence

1. Offline schema/transport/journal tests and public anonymous reads/unsigned estimates.
2. Owner executes the phase-one probe; independently verify its receipts and current entity fields. This covers creation, typed data and basic permission/transfer/extension behavior, not all VK checks.
3. Complete typed `eq`/`gt`/`lt`, funded size/attribute limits, failed-last-operation atomicity, ten-case cost table, 2,000-row paging, bounded rate measurements, expiry and copied-namespace forgery. Record exact failures and use the specified fallbacks when warranted.
4. Direct browser CORS/read and dependency bundle checks; actual same-process ENS/Arkiv write and final worker/Hall builds. Then record G0 and proceed to K1/G1.

No postage stamp purchase is planned. Swarm currently has synthetic immediate and ~4.4-day observations only; keeper and longer observations remain. All claims continue to distinguish SDK validation, unsigned simulation, local fork and public receipts.


Final G0 boundary follow-up (6 November): the RPC's encoded-request limit is stricter than the SDK's per-entity bytes maximum. 131,072 payload bytes returns 413 even with four user columns. With 31 columns, 128,000 payload bytes produces a 269,251-byte request and also returns 413; 120,000 produces 253,251 bytes and passes unsigned estimation. Evidence: `spikes/rabdi-request-envelope.json`. Provisional application policy is at most 120,000 payload bytes **and** 256,000 serialized JSON-RPC request bytes, including attributes and batching. K1 must enforce both before signing and split batches or move larger data to Swarm. The final G0 diagnostic intentionally measures larger boundary cases; no production writer is enabled yet.

G0 engineering verification is complete: [verdict and next work](g0-completion.md). Free-gateway keeper fallback is tested; production wiring and seven-day retention observation remain explicitly pending.
