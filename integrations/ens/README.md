# ENS integration — G1 / E1–E4 engine

Implemented: Sepolia protocol configuration, pinned ABIs, canonical hierarchy discovery/keyless preflight, and the worker-side party/seat lifecycle with a durable transaction port. E3/E4 still need outbox/relay integration and public acceptance. E5 host enforcement and E6 records/history remain pending. This module is not wired into gameplay yet; the worker CLI continues to refuse live sending.

Install the exact SDK separately, without changing the root lockfile:

```sh
npm run web3:install-ens
```

For a read-only check, set `ENS_PARENT`, `ENS_RPC_URLS` and **public** `ENS_REGISTRAR_ADDRESS` in the environment or `.env.relay`, then run:

```sh
node --env-file=.env.relay scripts/web3-ens-preflight.mjs
```

`--report path.json` saves public evidence. Never load `.env.worker` for this command. The relay config loader rejects worker secrets; the RPC transport only allows named read methods. There is no signing or broadcast path. This checks ENS prerequisites even while `PARTNERS=mock` or `off`; a pass does not enable a provider. The general `web3:preflight` still refuses unimplemented live product providers.

Each hierarchy walk checks the chain and a fresh block, then pins every contract read to that block. It follows the configured parent, verifies proxy implementations through VerifiableFactory, checks each parent backlink and UniversalHelper's canonical name, and checks the original block hash again before returning. Expiry uses the block's timestamp; local time only bounds freshness. No token ID, subregistry or resolver is cached across walks. `check()` distinguishes a deterministic denial from an unavailable RPC. It does not itself grant authority or implement E5's soft fallback.

Protocol addresses come from exact ensjs 5.2.7. That SDK does not expose RootRegistry, so its address comes from the pinned official deployment and is checked against `UniversalHelper.ROOT_REGISTRY()` and the current official deployment table. A mismatch fails the preflight; an unreadable/changed docs page cannot silently pass. `deployment-pin.json` records provenance, artifact SHA-256 hashes and the extracted ABI functions. The ABI subset is from [ENS contracts-v2](https://github.com/ensdomains/contracts-v2/tree/07e55a056f5b6a9c90119f501bdd05714e67dddd) (MIT); `Status.REGISTERED = 2` comes from that revision's `IPermissionedRegistry.Status` enum.

Validation: `node --test tests/web3/ens-hierarchy.test.mjs tests/web3/ens-lifecycle.test.mjs tests/web3/ens-transactions.test.mjs`; the root `npm run check` includes these tests without installing the optional SDK. The SDK is loaded only by runtime tools such as the live preflight and local-fork rehearsal. Both root and isolated dependencies pin viem 2.57.14.

`createEnsLifecycle` exposes `refill()`, `open({partyId, code, game})`, `mint({partyId, seatId, slot, nickname, address, shape, color})`, `release(partyId, seatId)`, `end(partyId)` and `close()`. A seat ID identifies a verified binding, not a reusable slot number. Give it a private durable directory, public configuration, a read client and a reconciled transaction port. It loads no key. Configuration bounds are 0–10 warm pairs and 1–4 hours; the public origin must be HTTPS with no path/credentials. Do not use the current relay's foundation placeholder jobs as these inputs.

`createEnsTransactions` requires an explicitly supplied signer, transaction-count/fee/total-cost limits and a kill callback. It stores a hash before broadcast and reconciles exact canonical receipts; unresolved admissions stop all further sends. Its budget is cumulative over that journal. Do not delete a journal, switch signers, or automatically resend an uncertain transaction. The dedicated registrar must not make unrelated transactions while the journal is active; external nonce movement fails closed. Runtime budget/rolling-limit configuration and owner-operated activation remain integration work.

The [E3/E4 evidence and integration handoff](../../docs/web3/g1-ens-lifecycle.md) records the local contract rehearsal and two important plan corrections: warm opening requires three transactions, and a seat's address record needs explicit clearing on release because unregister alone can leave it resolvable through an inherited resolver. Admission must check canonical registration and expiry first.

Current deployment, receipts and the next task: [ENS deployment](../../docs/web3/ens-deployment.md), [progress](../../docs/web3/progress.md).
