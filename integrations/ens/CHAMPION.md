# Champion handle adapter

This is the basic persistent Champion name under `players.<parent>`, not the full Legend/season system. Live issuance is wired through the signed community handle request and `ens.champion.claim` durable worker job, gated by `WEB3_ENS=on` and `WEB3_ENS_CHAMPION=on`. The default remains **local handles only**. Pending jobs have no ENS name; only a matching real worker receipt adds one, without an independent-verification badge. See [funcaster setup](../../docs/web3/funcaster-setup.md) for the new parent.

The worker independently reads the canonical result and trusted participant history from the shared durable store. The browser cannot provide eligibility. Admission persists a stable claim intent before queueing; retries keep the same idempotency key. Worker startup checks namespace readiness when Champion is explicitly enabled. Lifecycle data is isolated under `ens-namespaces/<parent>/` so changing the parent cannot reuse an old namespace's state.

## Earlier public prerequisites, 6 November 2026 (old parent)

The named read-only `ENS_CHAMPION_NAMESPACE` check against the existing public parent/registrar returned:

- `CHAMPION_NAMESPACE_REQUIRED`: `players.funcaster.eth` is not registered in the canonical hierarchy.
- The unsigned preparation check returned `CHAMPION_PARENT_RENEWAL_REQUIRED`: the parent has less than a full year remaining, so it cannot support a full-year effective Champion lifetime.
- The first public RPC returned an unavailable block. The second known Sepolia host completed both checks. An outage is never treated as namespace readiness.

These observations apply to the old parent. On 6 November the owner registered `funcaster.eth` for two years; its restricted namespace setup is a separate bounded owner operation. This adapter never bypasses the named readiness check.

## Integration contract

```js
const adapter = await createChampionAdapter({
  dir,
  client,
  protocol,
  config,
  transact, // existing durable ENS transaction port with budgets/kill/reconciliation
  verifyEligibility: async ({ address, resultHash }) => ({
    result: canonicalCompletedVerifiedResult,
    addresses: recordedParticipantAddresses,
  }),
});
await adapter.preflight();
await adapter.claim({
  id: stableClaimId,
  address: phoneAddress,
  handle: "asha",
  resultHash: canonicalResultHash,
  recoveryAcknowledged: true,
});
```

`verifyEligibility` must be a trusted relay/worker lookup. Never use eligibility or participant arrays supplied by the browser. The adapter checks the canonical result hash, completed/verified status, participant membership, strict recovery acknowledgment, reserved labels and the existing ASCII name policy. The phone must use a key separate from the registrar.

`claim` admits one durable handle per phone, checks fresh canonical availability, and refuses collisions with an address-suffix suggestion. A changed or uncertain claim is reconciled rather than silently renamed or re-minted. Successful claims expose public transaction references and fresh ownership details; `chainVerified: false` remains until an independent ledger check. `lookup(id)` rechecks ownership and namespace roles. A transfer changes ownership and prevents automatic re-minting. Owner renewal remains valid.

## Authority and transactions

Role constants are loaded from the pinned ENS SDK. The hierarchy reader verifies canonical registry links, implementations, ownership, expiry and a fresh block. Root `ROLE_UNREGISTER` and its admin apply to every label, so merely omitting a per-label grant is insufficient. Preflight checks global role counts and refuses root unregister/admin or upgrade authority; issuance also checks per-label roles. This follows the pinned [EnhancedAccessControl](https://github.com/ensdomains/contracts-v2/blob/07e55a056f5b6a9c90119f501bdd05714e67dddd/contracts/src/access-control/EnhancedAccessControl.sol) and [PermissionedRegistry](https://github.com/ensdomains/contracts-v2/blob/07e55a056f5b6a9c90119f501bdd05714e67dddd/contracts/src/registry/PermissionedRegistry.sol) implementations.

Each first claim uses four transactions through the injected port:

1. Deploy a dedicated verified resolver with temporary registrar and phone permissions.
2. Write `addr`, `chonks.kind`, `chonks.receipt`, `chonks.proof` and `chonks.season`.
3. Remove all registrar resolver permissions; the phone controls future changes.
4. Register a one-year name to the phone with transfer, renewal and resolver-management roles; no unregister role.

`chonks.proof` explicitly identifies a local canonical result hash, and `chonks.season` is `verified-match`. No Arkiv season proof is invented. Avatar/season embellishments, season eligibility and Legend issuance are not implemented. Transferring the name does not automatically move permissions on its old dedicated resolver; the new name owner can select a resolver they control.

The namespace preparation reader emits four ordered **unsigned** payloads: deploy restricted registry, set canonical parent link, remove parent-link mutation authority, register `players`. It refuses to overwrite an existing namespace and refuses insufficient parent lifetime. Owner execution needs its own reviewed fee limits and step reconciliation. Ancestor ownership and expiry still govern reachability; this is not the stronger irreversible Legend guarantee.

## Checks

```sh
node --test tests/web3/ens-champion.test.mjs
node integrations/ens/champion-check.mjs --parent funcaster.eth --registrar PUBLIC_REGISTRAR_ADDRESS --rpc HTTPS_SEPOLIA_RPC
```

The four focused tests cover missing/unsafe/short-lived namespace gates; a four-step phone-owned claim; earned/recovery/reserved/collision refusal; and uncertain registration reconciliation after restart without another mint.

`champion-rehearse.mjs` runs only against a disposable guarded Anvil localhost fork and loads no keys or env files. The basic rehearsal passed on source Sepolia block **12078043**:

- Restricted namespace preparation and canonical discovery.
- Four-step mint, proof records and repeat reconciliation.
- Registrar unregister denial.
- Phone-owner renewal.
- Phone-owner transfer and refusal to re-mint the transferred name.

The fork setup locally simulates renewed parent expiry. This is not evidence of public renewal, public namespace setup or live product acceptance. The first fork source was rate-limited; the completed rehearsal used the other known public read-only host at a stable source block. No further scenario matrix was run.
