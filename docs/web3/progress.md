# Funcaster Web3 progress

Documentation edition: **6 November 2026**.

PR #5 is merged into main with the earlier Web3 integration history. The updated XP controller/startup branch is integrated too. Current architecture is [../../ARCHITECTURE.md](../../ARCHITECTURE.md); judge guides are [Arc](../../ARC-JUDGES.md) and [ENS](../../ENS-JUDGES.md).

Done: Arc/ENS live HTTP and worker wiring, pinned contracts, party/seat names, PostgreSQL recovery, creator registration/pass and prediction receipts. Owner-deployed relay `cff34f0` and worker/verifier `11fe204` restored the ledger. Two predictions in the stopped test were refunded; no cheer was charged. The game never started in that attempt.

The new merged-main check is a bounded local browser flow with explicitly simulated providers. It does not replace public successful-game acceptance. Results will be recorded in [main integration check](main-integration-check.md).

Latest deployment: owner-approved [PR #6](https://github.com/hatif03/web3-multiplayer-games/pull/6) merged at `19d7bc0f289694d606905b89c78130acc46625d0`; relay deployment `dep-dbn79j3bc2fs738o5e8g` is live. Worker and verifier retain `025af597989a37e84a821576ca7b28a1b2be2634`. Each service tracks main with automatic deployments disabled. Health, controller and public ledger return 200; 112 public receipt rows remain readable. Live safe transaction logs were observed with canonical Arc/Sepolia links and replay labels. No public phone join or payment was initiated for this deployment check. The six focused logger tests passed; CI retains two pre-existing stale bundle-hash assertions in `tests/party/web3-parity.test.cjs`, also present on pre-PR6 main.

Remaining: a guarded new hosted game/cheer/payout/creator-claim test after preparing ENS allowance; physical phones; fuller quota-limited canonical refund verification. Last permitted ENS count was 118/120 before cleanup. Existing identities, journals and gas totals are preserved.

[Live recovery proof](market-read-recovery.md) retains exact transaction dates and hashes. [Previous implementation history](progress-pre-main-history.md) is historical evidence, not the current task list. No full regression matrix is required for this merge; focused checks and one browser flow are the agreed scope.
