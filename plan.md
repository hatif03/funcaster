# Funcaster implementation plan

Documentation edition: **6 November 2026**.

## North star and direction (6 November 2026)

A walk-up party console: scan a QR, join on a phone, and play one of 13 games on a shared screen. Preserve the Windows-XP desktop, Luna-blue controller, landscape per-game pads, accessible touch fallback and up to four human seats. Solo stays unchanged. Games and input mechanics must remain usable independently of optional financial features.

## Integrated on main

- [x] Owner-approved Web3 PR #5 merged; earlier PR #4 work is included.
- [x] `new-controller-updated` merged with its XP pads, landscape mechanics, Funcaster naming and startup research.
- [x] Keep both XP pad styling and the phone stake/consent sheet through the merge.
- [x] Arc stake pots, predictions, cheers and creator commerce wired through durable worker jobs.
- [x] ENS parent, party/seat names and restricted player namespace deployed.
- [x] Render relay, worker, separate verifier, PostgreSQL and persistent disks provisioned and activated by the owner.
- [x] Ledger ordering/replay fixes deployed; creator registration/pass and predictions have independently confirmed receipt rows.
- [x] Stopped hosted prediction attempt voided; both spectators refunded 0.05 test USDC. Public proof is preserved in the recovery evidence.
- [x] Current README/architecture and root Arc/ENS judge guides describe the actual integrations.

## This merge's bounded validation

- [x] Focused compatibility: 23 controller/orientation/phone checks, 10 Web3 context checks and all 13 game manifests pass.
- [x] One bounded main browser game reached verified result and simulated prediction/cheer payouts. Creator pass/claim also passed. The wrapper tap assertion needed a separate touch-enabled component check; see [exact scope](docs/web3/main-integration-check.md).
- [x] Record screenshots and limitations; no full-suite rerun or second financial round.

## Remaining release work

- [ ] A successful hosted game/cheer/payout/creator-claim attempt with a guarded new session. Preserve the old paid journal and four identities.
- [ ] Prepare an owner-run ENS allowance update within unchanged gas ceilings: the last allowed read found 118/120 operations used, leaving at most two before later cleanup. Never reset spending records.
- [x] Deploy merged main `025af597` to all three Render services on explicit owner request; public pages and the durable ledger respond. Auto-deploy remains off.
- [x] Owner-approved [PR #6](https://github.com/hatif03/web3-multiplayer-games/pull/6) merged at `19d7bc0` and deployed to the relay. Safe public-wallet/receipt logging is live; read-only monitoring uses `node scripts/demo-terminal.mjs`.
- [ ] Refresh the two stale Web3 parity golden-fixture assertions after the controller bundle change. CI already fails these on pre-PR6 main; the logger’s six focused tests pass.
- [ ] Complete quota-limited canonical refund audit when RPC limits permit. Successful public transfers are already evidenced.
- [ ] Physical iPhone/Android multitouch, landscape fallback, sensor permissions and event-network rehearsal.
- [ ] Earned player-handle issuance acceptance, external creator trial and streaming-platform account setup remain later work.

Current architecture: [ARCHITECTURE.md](ARCHITECTURE.md). Judges: [Arc](ARC-JUDGES.md), [ENS](ENS-JUDGES.md). [Web3 progress](docs/web3/progress.md), [owner handoff](docs/web3/human-setup.md), [startup plan](docs/plans/startup/README.md). Earlier detailed plans are retained in [historical plan](plan-pre-main-history.md); their old branch restrictions and unchecked boxes do not supersede this checklist.
