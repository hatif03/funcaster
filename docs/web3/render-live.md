> Current main integration: see [architecture](../../ARCHITECTURE.md) and [plan](../../plan.md). Service revisions below are deployed evidence, not an automatic main deployment.

# Funcaster live deployment

Owner-6 November 2026. PR #4 was merged into main at `4c79bf44c19fa25fe920fc2e178d3e1a4bdbdb6c` after both game checks passed. Its two GitGuardian findings were independently matched to public source SHA-256 hashes. New backend changes are on `codex/render-live` for a separate PR; they are not covered by permission to merge PR #4.

## Current handoff — 6 November 2026

**Deployed and verified:** the owner deployed `11fe204` to worker/verifier/relay, then relay reader follow-up `cff34f0`. The public ledger now returns 200 with 241 journal rows/106 receipts, its original 130-row prefix intact, storage ready and zero dropped/pending entries. Creator registration, the 0.50 test-USDC pass and both 0.05 test-USDC predictions all appear with independent receipt confirmations. No old transaction or journal was replayed/reset; only the durable receipt display was rebuilt.

**Stopped attempt recovered:** the game did not start and the cheer never reached signing. Both Arc RPC hosts confirm market 1 is Void. The public explorer records successful 0.05 test-USDC refunds to each of the two retained spectators at 00:04:12 and00:04:38 UTC. Both refunds also have successful `.network` receipts with matching Claimed/Transfer logs; the first canonical block hash was rechecked. The fuller two-host audit remains partly rate-limited. Refunds are not being withheld from a new test. [Public hashes, exact evidence and limitations](market-read-recovery.md).

**Validation:** `npm run check`: 1,018 passed, one opt-in browser skip; 13 focused ledger/replay tests pass. The preceding 36-check browser/recovery suite and three real PostgreSQL tests passed. Both game CI jobs and the security check pass for `19b5451`. These are the repair/recovery results; the integrated successful game/cheer/payout/creator-claim flow is still incomplete.

**Next work:** prepare the next guarded attempt with the same identities and preserved old payments, and a concrete owner-run ENS allowance update. The last permitted SELECT-only audit at 6 November 00:57:19 UTC recorded 118/120 ENS admissions, leaving at most 2 before later cleanup; no allowance has been increased. A full new table cannot fit that remainder. Review original gas/bankroll capacity and preserve all spending totals before requesting execution. No more deployment or acceptance command is required for this repair. Do not rerun old replacement flags, activation, registration, faucets or expired authorizations.

The recovery chronology below is historical evidence, not extra commands to execute.

## Infrastructure and persistence

- Render Singapore: one web relay, one payment worker, a separately keyed prediction verifier, and PostgreSQL 18.
- Database `funcaster-postgres` (`dpg-dbn3bt6i0phs73beq2o0-a`), smallest paid compute, 1 GB; public database access restricted.
- PostgreSQL holds application documents, canonical replay records, prediction/commerce intents, signer recovery journals, pending jobs and ordered receipts. Private keys stay in dedicated service environments. The data-directory path is a namespace, not an ephemeral-file dependency.
- Advisory locks admit one process per service and one writer per signer/lifecycle. Losing the lock session stops DB operations.
- Rooms remain in memory. Restarting the relay interrupts active rounds; saved payments and receipts survive. This is a single-instance hackathon deployment.
- Per-service disks preserve nonfinancial event counters and force stop-before-start deployments, avoiding concurrent relay writers during rolling updates.

## Activation

Services initially paused public writes (`WEB3_KILL=1`); the owner has now activated the reviewed configuration. Payment and verifier private keys belong only to their separate services. No Studio token or browser wallet is uploaded. Public-chain signing/activation remains owner-operated under the earlier approval-review boundary.

New contracts: MatchMarkets, SplitPayout and RevenueRouter. Existing ConditionalPot is unchanged. `scripts/web3-live-deploy.mjs --check` performs unsigned simulation; owner-only `--apply --confirm-funcaster-testnet` caps total gas at 0.48 test USDC and verifier funding at 0.5 test USDC. Journals are preserved; uncertain transactions are never automatically resent.

ENS target: `funcaster.eth` on Sepolia, two-year free test registration. This is independent of Ethereum-mainnet registration.

## Acceptance to record

- Public HTTPS and QR joining with two phone browser identities.
- Real Arc test-token bankroll and stakes settlement/refund.
- Spectator prediction, seat exclusion, report/claim and cancellation refund.
- Room pass and creator claim with real receipt/explorer links.
- ENS party/seat names and earned handle after namespace setup.
- Database records and worker receipts survive controlled restart.
- Physical phone sensor/multitouch testing remains with the owner.

## Current deployment

- Public HTTPS: https://funcaster.onrender.com (desktop and phone layouts checked).
- Relay: `srv-dbn3labbc2fs73ebli4g`; worker: `srv-dbn3llbrjlhs73diklfg`; isolated verifier: `srv-dbn3lm3ncjis73e2frsg`.
- Review: draft [PR #5](https://github.com/hatif03/web3-multiplayer-games/pull/5), branch `codex/render-live`. Do not merge without separate approval.
- MatchMarkets: `0x31c000cFe6FE6F5d12CA5735B913E3e0149fD5DF`; SplitPayout: `0xC82c2BA2c1A057C2ED73d8030e77FF7100a719F9`; RevenueRouter: `0x43fD866eF3FCA5b0A7b02c262F3602283D5aA192`. Each deployment is pinned; verifier received 0.5 test USDC.
- `funcaster.eth`, `play.funcaster.eth`, and `players.funcaster.eth` are ready on Sepolia. Never rerun registration or redeploy completed contracts.

Hosted worker budgets: relayer gas 2 test USDC, oracle gas 0.5, verifier gas 0.4; ENS gas 0.05 SepETH. USDC starting play money is 1.10 per identity, capped at 10 total, 4.40 per room and 10 per IP/hour. Runtime enables USDC only; the ConditionalPot deployment proof still verifies its full USDC/EURC allowlist. All budget journals persist in PostgreSQL across restarts.

Owner activation **completed** at commit `08c97ac` with all three saved deploy IDs live. Do not rerun the activation command; its journal and local paused configuration files remain preserved. The helper reads private role-separated configuration files locally, checks contract/service identities and caps, then activates worker, verifier and relay in order. `--check` is local/read-only. Public signing remains owner-operated under the earlier automatic approval-review restriction. Startup checks and the handoff script passed before activation.

Status: services deployed and owner-activated; public financial acceptance is not complete. Current validation: 911 repository tests, two real PostgreSQL tests, local EVM happy/refund flows, browser checks and focused recovery regressions. Physical phone sensor checks remain with the owner.

Public nonfinancial smoke: two browser phones joined the HTTPS relay and completed a verified Star Catch round. Record `ec6e9fd7288c8a98ee29f340dc18fda0b5cb91bf5ee3dc68de3f61fe9677de47` is present in PostgreSQL-backed Hall records; it was independently read back after the activation restart, confirming persistence. Arc/ENS sends were disabled during this smoke. The final unsigned worker preflight passes through the secondary Arc RPC; primary rate limiting falls back without weakening code/domain/freshness checks.

The owner acceptance retains four browser identities across retries, tests two phone joins/ENS names, test-USDC bankrolls, opposing 0.05 predictions, a 0.05 cheer, one verified round, payouts, a 0.50 creator room pass and earnings claim. No separate public refund round is included; refund behavior passed local EVM and the earlier A4 public acceptance. Keep `.local/hosted-basic-market`; never upload browser profiles or its private session journal. Use the current recovery handoff below for the stopped attempt.

### Acceptance startup recovery (6 November)

All three services were activated on the reviewed revision. Payment worker and verifier logs confirmed actual testnet provider startup, not only Render deploy status. The first acceptance command stopped on an initial HTTP read, before creating a session journal, room or browser identities. The exact initial HTTP status was not recorded; startup routes subsequently returned 200. The harness now retries transient failures only on GET reads, with bounded attempts and endpoint/status diagnostics. Eight focused harness/guard tests passed. This initial startup issue is resolved; the subsequent ENS issue below supersedes its normal-resume instructions.

### ENS seat recovery (6 November)

**Update:** the owner deployed `10aaf26` successfully and the guarded replacement table is running with the original funded phones. Do not repeat that recovery command while it is running. See the worker-performance follow-up below.

Both phone controllers became ready and received their Arc test-USDC bankrolls. The party `mellow-gecko-ve.play.funcaster.eth` and its two seat registrations were confirmed. The address/text resolver writes failed with `WRONG_SIGNATURE` before journal admission or broadcast: ABI dynamic bytes retained checksum-address casing, while signed transaction parsing normalized identical bytes to lowercase. Exact local-wallet reproductions now pass using byte-equivalent comparison; a one-byte change still fails before submission. No uncertain seat-record transaction needs rebroadcast.

The patch also compares ENS lifecycle/Champion context objects structurally, allowing PostgreSQL JSONB key reordering on restart while still rejecting changed configuration. Worker failure receipts expose only fixed, allowlisted error codes, never provider messages or RPC credentials.

Validation: the full required repository check passed 919 tests after the worker fixes. Subsequent recovery changes pass nine focused harness tests, including an opt-in real Chromium test with disposable local profiles: the original key is retained, missing/mismatched keys fail, and the probe makes no joins, websocket connections or signatures. Changed JavaScript files pass formatting. These local checks are not a claim that the patched worker or financial flow has completed publicly.

The owner stopped the stalled acceptance. Its original room is now absent (display invite expired and public pairing route returns `404 Party not found`). No game, prediction, cheer or creator payment started. The first two bankrolls and on-chain transaction history are preserved; original room cleanup may retire its temporary ENS names.

Next owner step: deploy **only the payment worker** from recovery revision `10aaf2630cd56eeb79dbe4b7f6c86862437ef5f2` in PR #5. Keep its existing configuration, PostgreSQL journals, caps and keys. Do not rerun `render-activate.mjs`, redeploy contracts or restart the relay/verifier. Run from the repository:

```sh
render deploys create srv-dbn3llbrjlhs73diklfg --commit 10aaf2630cd56eeb79dbe4b7f6c86862437ef5f2 --wait --confirm && node scripts/web3-hosted-market.mjs --apply --confirm-funcaster-testnet --url https://funcaster.onrender.com --recover-expired-table
```

Recovery first waits for a fresh worker heartbeat, then confirms the original table is absent, preserves its session archive and consumes at most one replacement-table allowance. It reuses the existing funded phone profiles, rejects missing/changed keys and refuses recovery after gameplay or extension payment work has begun. No signer journal or bankroll budget is reset. A crash during replacement creation stops for inspection; it does not silently create another table. The readiness wait now reports phone/name counts and stops on terminal ENS failure. Public predictions, cheers, payouts and creator commerce remain unverified until this owner run finishes. The earlier automatic approval review requires owner execution because worker deployment resumes public-chain signing.

### Worker performance and heartbeat follow-up

**Queued permission fix (ready for worker-only deployment):** brief readiness/socket loss was also causing unnecessary host grant/revoke cycles. The relay patch retains the same assigned binding through transient loss, still denies unready/disconnected commands before and after permission reads, and waits for a confirmed seat before a new grant. Keep that relay deployment until after this active acceptance, because restarting the relay loses its in-memory room.

Completed owner worker-only command (do not repeat): `render deploys create srv-dbn3llbrjlhs73diklfg --commit 1d79b54e637f2938b670c02d26db871c1d8de7e5 --wait --confirm`.

The worker patch can already reduce the existing backlog: an `ens.role.grant` is terminally marked `JOB_SUPERSEDED` with no transaction only if a validated, strictly later revoke matches room/party/grant/address, and serialized lifecycle/admission lookups prove no grant state or transaction was ever admitted. Partial/uncertain grants are never skipped; their paired revoke remains queued. No budgets or signer journals are reset. Fifty-one focused tests and the full required suite pass (933 passed, one opt-in Chromium test skipped); formatting passes. The standalone worker deployment preserves this room and does not deploy the relay patch.

**Resume ordering correction:** the subsequent owner resume returned both seats to pending. The harness had restored the host before its disconnected phones; after a 30-second absence this re-enabled ordinary seat cleanup before the phones could reclaim their stored tokens. This was reproduced with a local Socket.IO fixture: host-first replaced the player objects/tokens; phone-first preserved both. The harness now reconnects and acknowledges saved phones before restoring the host. Fresh/replacement tables still create the host first. This local harness correction needs no hosted deployment. The current run remains connected while queued old role/release jobs and its new seat bindings drain; do not restart it merely to pick up this change.

The old run's 15-minute ENS timer is shorter than the already-admitted role/cleanup backlog. The updated harness allows a bounded 30-minute live ENS wait, still failing immediately on a terminal seat/party error. The owner can stop and immediately rerun the normal saved-session command to load the phone-first fix before that old timeout; no replacement flag, deployment, new identity, receipt reset or cap increase is involved. Both phones must reconnect before the host, and the existing table must still exist.

**Deployed and verified:** `5dc8432` is live in `dep-dbn4isdbedkc73a7vuog`. Worker heartbeat is healthy. Both seat resolver receipts independently match canonical Sepolia blocks and resolve to the retained phone addresses. Both Arc RPC hosts independently report 1.10 test USDC on each phone. No refund/replacement funding is needed.

The acceptance process had exited and both phones were disconnected when inspected; its saved table still existed. The owner was asked to run the normal acceptance command promptly to reconnect that table, without redeploying or using another replacement flag. The command refuses to create a fresh table if the saved room is unavailable. Public predictions, cheers, payouts and creator commerce are still pending; do not infer completion from the ENS receipts.

Owner repair deployment `dep-dbn4c3e1egvs73fskp8g` is live. The replacement table's party registration confirmed as `0x168f0558347b1bca2ac439472700734c3de006578d082eaafc4b4b727386d05f`. A keyless read-only PostgreSQL diagnostic showed zero retries for its pending party/seat jobs and fresh transaction confirmations, so this wait is not another terminal ENS failure. Both original phone addresses are unchanged.

Each write was serially rereading all 27+ historical receipts several times. The patch reads at most three independent proofs at a time, still freshly verifies every hash/block/intent/cost before each admission, drains read failures before returning, and removes only the duplicate pre-admission scan used to obtain a hash-list baseline. No proof cache or signature/nonce/cap relaxation is introduced. A read-only check of five latest public receipts passed with zero signing/broadcasts. Concurrent polls now update process liveness during a long provider call without running another signer job; shutdown waits for the pulse before recording stopped.

Validation: `npm run check` passes 927 tests with one opt-in Chromium case skipped (that case passed explicitly in the prior recovery check). The initial check hit the existing timing-sensitive party queue test at `arcade.test.cjs:99`; an unchanged rerun passed. Thirty-five focused worker/admission/transaction tests and changed-file formatting pass. No party/game code changed.

Deploy only the updated payment worker from the pinned follow-up revision, in a separate Terminal while the acceptance remains running. Do not restart the relay, rerun activation, create another room or reset journals. Physical phone testing cannot resolve this server queue delay. Once ready, the owner should test QR join on two real phones, motion permission/calibration, one round, disconnect/rejoin and the visible receipt links; the automated run covers test-USDC predictions, cheers and creator commerce separately.

```sh
render deploys create srv-dbn3llbrjlhs73diklfg --commit 5dc8432e4aee6fe4e55c73c175a9ba8853c45dd0 --wait --confirm
```
