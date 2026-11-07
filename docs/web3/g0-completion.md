# G0 completion — 6 November 2026

**Network and compatibility verification: PASS WITH RECORDED LIMITS.** All G0 items in build guide 22 have passing evidence or the specified fallback recorded. The owner completed the signed probes; the agent independently reran the public verifiers. No further G0 faucet/signing action is required. Work remains on `web3/integrations`, draft PR #4, with no merge or deployment.

This closes the engineering probes, **not hosted acceptance**. The owner deferred hosting; guide 22's hosted gate has not been demonstrated. G1 implementation is next, and its real-match/hosted acceptance remains pending. Live product providers stay mock/off.

## Verified results

| Gate | Result and evidence |
| --- | --- |
| VK-01–07 | Rabdi/SDK 1.0.1 creation/types/permissions/ownership, limits, atomicity and ten actual cost cases verified. Phase one has six receipts; the final run has **121 canonical receipts**, including one deliberately reverted atomicity test. [Cost table](arkiv-costs.md), [security readback](spikes/rabdi-security-verified.json). |
| VK-08 | **2,002 rows: 2,000 trusted, one unknown creator, one invalid payload.** Complete ordered walk independently verified. Full scans measured 7.08–10.87 s, above the five-second target: use the tested bucket + stale-cache fallback. A 100-row bucket measured 0.91 s; sorting 5,000 rows took 2.04 ms. [Final report](spikes/rabdi-final-verified.json). |
| VK-09 | A 60-second lease extended twice to block 269435; observed total lifetime 80 s and zero lag at the sampled query block. Canonical create/extend receipts verified; timed observations preserved from the owner run. Renew at one third of lease; do not promise zero lag globally. |
| VK-10 | The forged high-score record and allowlisted malformed payload are excluded from the ranking and counted separately. Fresh independent public reads confirm 2000/1/1. |
| VK-15/16 | Tested public-gateway content-addressed keeper fallback; original retention cohort untouched. Seven-day observation is still 6 November. No paid stamp/permanence claim; production keeper wiring belongs to K1. |
| VE-01 | Parent/play registries, resolver and roles verified; refreshed daily check requires zero bootstrap operations. `play.funcaster.eth` now resolves to the console. [ENS evidence](ens-evidence.md). |
| VA-01/12 | USDC and EURC sponsored authorizations/retained floors verified; EURC signer remains at zero native gas. EURC canonical receipts match on both Arc RPC hosts; replay simulation rejects reuse. Daily token-domain/state/address checks pass. Future product flows must repeat their own floor tests. [Arc evidence](arc-evidence.md). |
| VX-08 | Same-process ENS address resolution and Arkiv write completed with pinned viem 2.57.14, ensjs 5.2.7, Arkiv SDK 1.0.1. Hall is 118,552 bytes gzip; both worker builds and 15 browser cases pass. [Cross verification](spikes/cross-verified.json). |

## Actual final-run spend

- Rabdi: **0.336958006 test GLM gas + 0.02 test GLM transfer** to the second test writer; aggregate **0.356958006**, below the 2-test-GLM ceiling. Phase-one gas (0.00238213) is separate.
- ENS address record: **0.0003709400055641 SepETH**, below 0.005.
- EURC authorization: **0.00296636 test USDC gas**, below 0.2. A 0.051-test-EURC top-up and 0.001 return leave **0.05 EURC** with the test signer and **19.95 EURC** with the relayer.

## Verification boundaries

Rabdi only serves current balance state; receipt costs are independently verified, while per-case historical balance deltas are labelled owner observations. Full historical balance RPC support is not claimed. The one-hour cross-SDK fixture is now expired. Its immediate successful readback is preserved in [the completion report](spikes/cross-verified-at-completion.json); today's verifier checks the canonical creation event, recorded expiry and exact keyless reconstruction of its calldata. It rejects a missing record before expiry and never recreates it.

One repeat verification hit a temporary Rabdi DNS failure; the subsequent full public verification passed. No transaction was repeated. Browser cases use labelled synthetic UI states; they are not physical-phone or hosted-product acceptance.

## Tests and next work

**626 root tests**, **38 isolated probe tests**, formatting, and **15 real Chromium layout/state cases** pass. Phone screenshot visually inspected. Logs: `g0-complete-check.txt`, `g0-complete-isolated.txt`, `g0-complete-format.txt`, `g0-complete-browser.txt`.

Next is **G1**: ENS party/seat/host enforcement (E3–E6), Studio ConditionalPot (A2–A5), Arkiv/Swarm adapters and independent readback (K1–K3/K6/K7), and receipt Ledger basics (L1–L4), followed by one real match. Keep partner-off parity, spend/journal guards, pull claims, replay checks and failure drills. G2+ is not started. Hosting, physical phones, platform accounts/audits and key backup remain separately tracked in [human-setup.md](human-setup.md).
