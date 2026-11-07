# Funcaster ENS setup

The product remains Funcaster. The owner selected `funcaster.eth` as the new Sepolia ENS parent. This is the pinned ENS v2 test deployment, using free MockUSDC for registration and SepETH for gas; it is not an Ethereum-mainnet registration.

## Current evidence

The owner registered the parent in transaction `0xa50e5552509f0c109d4feb489bd3d8c98aa2aa207b0a2c2cd28a439b78e6a1dc`. A subsequent independent read confirms owner `0x04b0970f4a58caa9E58C5aDBBF7eB402339264a5`, chain 11155111, and expiry `1857069048`. The CLI's final RPC read failed after the transaction succeeded; do not register again.

**Namespace setup is complete; no further owner namespace command is required.** The owner completed seven parent/play operations and four restricted `players` operations. Independent public reads subsequently confirmed:

- `play.funcaster.eth` at block **12079008**, hash `0x4cc2acd7cde12e5f97921a6c588d040550b5c6684b3207405eb9286f914084e6`. The hosted `relay.live.env` public configuration passed `preflightEns`: official deployment pins, canonical links, registrar ownership and required roles all agree.
- Parent registry `0x8d897aBC47Bba378121e32B7763C45217Db62036`, play registry `0x41f8F285AC4E0461650797a434876c4F0DfD1205`, play resolver `0xAc6399138406AA2F09019E0c32641B5397D430EE`.
- `players.funcaster.eth` at block **12079001**, hash `0x64c8422545b818a24ec5496d45eab0ad022c75e90f24c682297b3080509c6b96`, registry `0x57f7594d1d1A15B77b201D1891E2a312514eD7e8`, expiry **1857069048**. `ENS_CHAMPION_NAMESPACE` reports ready, with no root unregister/admin or upgrade authority in that registry. Ancestor ownership and expiry still apply.

These independent checks used `ethereum-sepolia-rpc.publicnode.com`. The second configured host was unavailable during verification; this is **not a two-host verification badge**. No journals were rewritten and the coding agent made no public signatures or broadcasts. Existing Champion mint/renew/transfer behavior passed the separate disposable local fork rehearsal in `integrations/ens/CHAMPION.md`; a public phone Champion claim is still a later runtime acceptance step.

All four owner namespace transactions were independently checked as successful, on canonical blocks, from the configured registrar on chain 11155111. Their references and blocks, in execution order, are:

1. `0x249d387f1f7b77863fa70107a1b7248c918827a842b496d4e1b3f2e9e90be352` — block 12078992.
2. `0xe1bf89949c4661e91c0060864045043cc64b2c7467da11f3f306db9dd735cce0` — block 12078994.
3. `0x44e7f9c8f9f8068b5533056b877e2002f22fd7054ad2ecc2885518ff72db8fae` — block 12078996.
4. `0x3c2bd594a2d09c0f7ed049f8ad39202aee57ad38f912ba1615f648a2752ae700` — block 12078998.

## Completed owner bootstrap (reference)

The following owner steps have already completed. Retain the journals; do not rerun apply to perform another setup:

```sh
node --env-file=.env.worker scripts/web3-ens-bootstrap-parent.mjs --check --confirm-parent funcaster.eth
node --env-file=.env.worker scripts/web3-ens-bootstrap-parent.mjs --apply --confirm-parent funcaster.eth
```

The apply command creates the canonical parent and `play` registries/resolver, then prepares the restricted `players` namespace. It caps total gas at **0.02 SepETH**, at most **24 transactions**, with max fee **30 gwei** and priority fee **1 gwei**. It uses `.local/ens-parents/funcaster/bootstrap`. Keep every journal after any error. It never changes the old `funcaster.eth` registration or lifecycle journals. Public signing remains owner-operated.

Transient nonce disagreement is retried only before signing and only while the fully reconciled transaction hash set is unchanged. Unknown broadcasts, missing receipts, changed transactions and exhausted fee/rate budgets stop rather than blindly resend. A successful final report names both `play.funcaster.eth` and the ready Champion namespace. No claim of completion is made until that report and public reads agree.

The earlier registration command remains available for read-only inspection:

```sh
node --env-file=.env.worker scripts/web3-ens-parent.mjs --check --confirm-parent funcaster.eth
```

Its already-used apply mode is isolated in `.local/ens-parents/funcaster`, with 0.01 SepETH / 8 transaction ceilings and at most 20 free MockUSDC, for a two-year registration. The repaired transaction identity fits the existing rate-limited ENS transaction port; no guard was removed.

## Runtime wiring

Use `ENS_PARENT=funcaster.eth`, the public registrar address above, approved Sepolia RPC hosts, and the final HTTPS origin in `PUBLIC_ORIGIN` / `ENS_APP_URL`. Install the pinned ENS runtime with `npm ci --ignore-scripts --prefix integrations/ens`. Store credentials only in the deployment secret store; do not commit env files.

The named namespace check now succeeds, and the prepared hosted config sets `WEB3_ENS_CHAMPION=on`. It requires `PARTNERS=on` and `WEB3_ENS=on`. Hosted worker activation remains a separate owner step. The worker reads completed, verified records and trusted participant addresses from shared storage, then issues a one-year phone-owned transferable name after signed key-recovery acknowledgment. Pending/failed jobs remain clearly local. Issued names retain `chainVerified:false` until separately audited. Season/Legend issuance is deferred.

New parent lifecycle state lives under `ens-namespaces/funcaster.eth/`. Old parent state is retained. The global ENS transaction journal and spending limits still apply; switching namespaces does not reset those limits.

## Owner hosted basic acceptance

Once the worker is explicitly activated and the live origin is ready:

```sh
node scripts/web3-hosted-basic.mjs --apply --confirm-funcaster-testnet --url https://YOUR_RENDER_ORIGIN
```

This opens one table and two persistent browser phones, waits for actual `funcaster.eth` party/seat names and Arc starting-USDC receipts, plays one 60-second Star Catch round through the real UI, checks its verified result in the durable Hall, and captures desktop/phone layouts. It signs phone identity bindings and triggers the already-capped ENS/Arc worker jobs. It does not accept stakes, predictions, creator purchases or a Champion claim. Those have separate acceptance steps. It is owner-operated because joins cause public-chain actions; this command has only been executed in `--mock` mode by the coding agent.

Keep `.local/hosted-basic/` private: browser profiles contain generated phone keys and `session.json` contains table credentials. Only `report.json` is suitable for sharing. A repeated completed command does nothing. An incomplete resume reuses its identities and existing table; a missing table or changed build stops rather than silently creating a replacement. Worker caps remain the authority for all gas and token spending. The command checks observed receipts, not an independent two-host chain audit.

The local MOCK rehearsal passed two phone joins, names, starting-USDC receipts, a real 60-second two-player round, verified replay/Hall storage and 320/390/1280-pixel browser layout checks. Read-only ENS RPC transport retries transient reads and the observed `-32001` / `block not found` replica lag only; tests prove signed broadcasts remain single-shot. Public namespace setup is complete; hosted product acceptance is the next step.
