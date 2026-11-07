# Final G0 handoff — completed

Updated **6 November 2026 (IST)**. The owner completed the combined command and the agent independently verified its receipts. **No further G0 faucet or signing step is required. Do not rerun the write probe to replace expired fixtures.**

[G0 completion, evidence and limits](g0-completion.md) is the current verdict. [progress.md](progress.md) and [human-setup.md](human-setup.md) track G1 and the deferred hosting/platform/phone work. Work stays on `web3/integrations`, draft PR #4; no merge or deployment.

For public verification only:

```sh
node scripts/spikes/rabdi/final-verify.mjs
node scripts/spikes/rabdi/cross-verify.mjs
node scripts/spikes/arc-verify-owner.mjs EURC
```

The 2,000-score fixtures have one-day leases; a later full-board read will expire naturally. Preserve existing evidence rather than recreate records. The one-hour cross-SDK fixture has already expired; its verifier now validates the canonical creation event and exact reconstructed calldata, while preserving the original live readback and labelling current expiry.

Original caps were 2 test GLM, 0.005 SepETH, 0.2 test USDC gas and 0.051 test EURC across restarts. Actual spend is recorded in the completion report and remains below every cap. Private journals remain unchanged by public verification. [Execution/recovery history](g0-execution-history.md) retains the original owner instructions, now obsolete.
