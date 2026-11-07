# Hosted registration and prepayment recovery — 6 November 2026

## Current status — recovery complete

The owner deployed relay `d42fe6b`, and the original registration confirmed at `0x5de7d5fa450b9606d233b3cd94ea5c70b09bd268dd22d57c4782b70d34828e0b`. The guarded replacement table joined both phones/ENS names and confirmed its 0.50 test-USDC creator pass. Both predictions later confirmed, but a market-read error paused acceptance; the cheer never reached signing and the game did not start.

Do not repeat this recovery, any replacement flag, or the old normal acceptance command. Follow [market-read-recovery.md](market-read-recovery.md) for the current deployment and refund audit. All original profiles, journals and caps remain intact.

The recovery design and checks below are retained as history.

## What is complete

The repaired display observer passed both live phone/ENS checkpoints. Both spectators subsequently received test USDC, completing funding of four retained identities. Read-only Chromium probes confirmed every existing profile matches its saved address. No pass, prediction, cheer or gameplay intent exists in the saved journal.

The test stopped on a creator-status GET connection failure. Its browsers closed and the table expired (pairing404 and expired display invite independently checked). The same registration later reached a terminal pre-execution validation failure. PostgreSQL JSONB field ordering caused equivalent recipient objects to fail the old string comparison; strict structural comparison fixes it without changing any economic term or signed payload hash.

SELECT-only Render evidence `job-dbn58nl6e07s73ckj6k0` reproduced `INVALID_COMMERCE_JOB` with no commerce admission. `job-dbn5durl550s73fhbef0` passed nine exact recovery checks at 6 November 00:39 UTC, including matching version/terms/fingerprint, preserved failed receipt with no tx, absent provider execution record, and absent original/recovery transaction IDs. ENS 98/120 admissions; caps are not raised or reset.

## Latest diagnosis

The owner successfully deployed worker and relay revision `09f79d8`. Both attempts reused one immutable manifest; the second Render recovery job reports `existing`. The relay never queued recovery because it expected `getVersion` to return `exists: false`; the compiled contract instead reverts `UnknownVersion()`.

Read-only Render diagnostic `job-dbn5phjncjis73e7kv3g` confirms: manifest present; operation still failed; recovery not applied; original and recovery transaction admissions absent; recovery provider document absent; exact database guards pass. Both hosts returned `UnknownVersion`, raw `0x8da6a6a4`, at common block `71102849`.

Repair `d42fe6b` verifies that exact error independently on both pinned hosts at one verified block. It rejects disagreement, outages, other reverts and invalid tuples. Ordinary version reads still throw. The keyless repaired public proof passed at block `71103111`; no transaction or journal mutation occurred. Public operation status now identifies waiting/blocked recovery checks, and the owner wait permits bounded RPC recovery instead of treating the old failed state as a new worker failure.

## What the recovery does

The owner-only writer inserts one immutable `commerce-recovery/<digest(operationId)>.json` request. It never deletes or edits the failed receipt, old job, signer journal or application state. The relay verifies the manifest and fresh two-host absence of the version, preserves the original failure on the operation, then queues exactly one corrected registration with a separate deterministic recovery job key. The original creator operation ID and version remain the same. Any execution/admission evidence, altered terms, wrong actor/fingerprint, or second recovery fails closed. Subsequent starts reconcile the recovery job rather than enqueue another.

Only after the original registration is confirmed does the explicit `--recover-prepayment-table` command allow one replacement table. It independently requires the old table to be absent, absent durable pay/claim operations, confirmed matching creator terms, no listing/game/payment intent, and all four existing browser keys. A separate one-use marker links to the original journal and prior recovery marker; all earlier evidence stays intact. No new wallets or bankroll baseline are created.

Future status/balance reads retry bounded GET failures only. Payment POSTs are not automatically retried. A future acceptance failure retains connected screens for 15 minutes without further test actions, giving time for review before room expiry. The production worker now yields between provider jobs, and the relay avoids host-grant churn during brief phone reconnects.

## Completed owner sequence (do not repeat)

The owner deployed relay `d42fe6b`, reused the existing immutable manifest, confirmed the original registration, and consumed the guarded prepayment-table recovery. No more manifests or tables should be created for this run.

The registration/prepayment recovery is consumed and superseded by the current market handoff. No further registration execution is required.

## Validation and limits

`npm run check`: 996 passed, one opt-in Chromium skip (the prior focused browser run passed; no browser/UI changes in this repair). 53 focused recovery/commerce/owner-command tests pass, including real viem RPC error decoding. A disposable local Anvil run proved absence, executed registration using the compiled router, checked presence and reconciled a repeated operation with one send; token metadata fixture shims were used, with no public transactions. The repaired full public proof passed read-only through both hosts. Registration recovery and the pass/prediction transactions subsequently confirmed. The final integrated game/payout acceptance remains pending. Physical motion/multitouch remains owner-tested. Work stays in draft [PR #5](https://github.com/hatif03/web3-multiplayer-games/pull/5); no merge is authorized.
