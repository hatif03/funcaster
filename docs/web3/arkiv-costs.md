# Arkiv G0 cost measurements

6 November 2026. **All ten cost cases were executed by the owner and their canonical receipts independently verified.** The completed final run has **121 confirmed receipts**, including all 2,000 score rows and the cross-SDK fixture. Gas **0.336958006 test GLM** plus the **0.02 test GLM** second-writer top-up totals **0.356958006**, below the 2-tGLM ceiling. The owner's recorded end-of-run primary balance is **9.640847597 tGLM**. Phase one separately spent 0.00238213 tGLM.

Evidence: [final independent verification](spikes/rabdi-final-verified.json), [owner observations](spikes/rabdi-final-live.json). All figures below are actual receipt costs, not estimates.

| Case | Requested bytes | Actual bytes | User columns | Lease | Gas used | Actual test GLM | Creates per observed 10-tGLM drip |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| 0 | 1,000 | 1,000 | 4 | 90 s | 161387 | 0.000161387 | 61962 |
| 1 | 1,000 | 1,000 | 4 | 2,592,000 s | 208146 | 0.000208146 | 48043 |
| 2 | 1,000 | 1,000 | 4 | 15,552,000 s | 481836 | 0.000481836 | 20753 |
| 3 | 64,000 | 64,000 | 4 | 90 s | 2597882 | 0.002597882 | 3849 |
| 4 | 128,000 | 128,000 | 4 | 90 s | 5158012 | 0.005158012 | 1938 |
| 5 | 129,000 | 129,000 | 4 | 90 s | 5198283 | 0.005198283 | 1923 |
| 6 | 131,072 | 32,000 | 4 | 90 s | 1317862 | 0.001317862 | 7588 |
| 7 | 1,000 | 1,000 | 15 | 2,592,000 s | 366529 | 0.000366529 | 27282 |
| 8 | 1,000 | 1,000 | 30 | 2,592,000 s | 558268 | 0.000558268 | 17912 |
| 9 | 1,000 | 1,000 | 31 | 15,552,000 s | 1250805 | 0.001250805 | 7994 |

Each cost is `receipt.gasUsed × receipt.effectiveGasPrice`. The owner captured matching before/after balance deltas while executing each case. **Rabdi serves balance state at the chain head only:** a later historical balance query returns `GolemDB cannot read at a past commit`. Therefore the per-case balance deltas are labelled owner-run observations, while receipt costs, canonical transaction contents, the current total balance and nonce continuity are independently checked. The verifier does not claim historical balance reads succeeded. Short-lease payload readbacks are also preserved as owner observations rather than recreated after expiry.

The 131,072-byte request returns HTTP 413, so case 6 measures an explicit 32,000-byte replacement. Actual 128,000- and 129,000-byte/four-column writes succeeded. With 31 columns, 128,000 bytes exceeds the request envelope; 120,000 passes unsigned estimation. The future application uses a 120,000-byte payload ceiling plus a 256,000-byte serialized-request ceiling. Larger data goes to Swarm or batches are split before signing.

Creates per drip is `floor(10e18 / gasCostWei)` at the observed one-gwei fee and 10-tGLM faucet amount; neither is promised constant. All 2,000 score rows, forged/malformed records and expiry observations are complete. The final aggregate ceiling remains 2 test GLM, including at most 0.02 sent to the second test writer.
