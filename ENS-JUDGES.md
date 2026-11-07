# Funcaster × ENS — judge guide

**Documentation edition: 7 November 2026.** Chain observations below were recorded on **6 November 2026**. This file is the technical record of how ENS is used and which public reads and receipts prove each claim. The payment path is separate: [ARC-JUDGES.md](ARC-JUDGES.md).

Funcaster uses ENS for readable party names, phone-owned seats and scoped host authority. A player still joins by QR and uses their phone with XP-style touch pads and optional motion. The name is bound to the phone's authenticated address. A label on screen is not evidence that the name exists.

**Demo:** [Funcaster console](https://funcaster.onrender.com/?shell=os), [Live Hub](https://funcaster.onrender.com/live/), [Hall and receipt ledger](https://funcaster.onrender.com/records/).

This is the **pinned ENS contracts-v2 deployment on Ethereum Sepolia, chain 11155111**. `funcaster.eth` here is a testnet registration. It does not claim the mainnet name. Registration was paid in freely minted MockUSDC plus Sepolia ETH for gas. No mainnet purchase was made.

## What ENS decides

Four product decisions are read from the live registry. If the chain is unavailable, the room still plays and the UI says the chain was not asked.

| Decision | On-chain object | What the relay does with the read |
| --- | --- | --- |
| Who is at the table | `<seat>.<table>.play.funcaster.eth`, owned by the phone key, `roleBitmap = 0` | The seat address used for Arc is the address stored on that name. Admission checks canonical registration and expiry before it trusts a resolver answer. |
| Who may run the table | Enhanced Access Control on that party's registry and resolver | A delegated phone's `start`, `kick` and the other host commands call `hasRoles` / `hasRootRoles`. A chain denial is a denial. |
| How long the table lives | Absolute `expiry` on the party and on each seat | Expiry is compared with the block timestamp, not with the server clock. Ending the party calls `unregister`. |
| How to find the table | Text records `chonks.code`, `chonks.relay`, `chonks.game` on the party resolver | A name lookup can resolve a join code. The six-character code and the QR still work when RPC does not. |

The phone keeps its browser key and proves that address to the relay. The relay queues naming jobs in PostgreSQL. A separate worker owns the budgeted registrar signer and pays Sepolia gas. Pending jobs stay pending. A nickname is not a registered name until the worker receipt exists.

## Protocol pin

Runtime addresses come from ensjs **5.2.7** and viem **2.57.14**, checked against the [official deployment page](https://docs.ens.domains/learn/deployments/) and against `UniversalHelper.ROOT_REGISTRY()`. The pin is [integrations/ens/deployment-pin.json](integrations/ens/deployment-pin.json): contracts-v2 commit `07e55a056f5b6a9c90119f501bdd05714e67dddd`. A mismatch fails preflight. An unreadable docs page cannot pass by defaulting to a cached address.

| Protocol contract | Address | Pinned artifact SHA-256 |
| --- | --- | --- |
| ETHRegistry | `0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4` | from the ensjs deployment set; the pin records the four artifacts below |
| RootRegistry | `0xb458d6a3a77919449d03e7a6903c26827c1ec43f` | ensjs does not expose this one; the pin takes it from the official deployment and checks `UniversalHelper.ROOT_REGISTRY()` |
| VerifiableFactory | `0xda70306c98e97ece36f997a21368e53298572991` | `0ea73700424533a3527f85e3c98804b58a1829821ac59d81187568aa7c134550` |
| UserRegistryImpl | `0x9bd8a88719068d09ecee662f36c0e3856708366a` | `33093b6a6d32d1d1525d92af4fd3bbeed14b5ccda84b27e61e0a80c193c4a528` |
| PermissionedResolverImpl | `0x115eb53f0c60696633855f90b138178fb40b2b2c` | `2e24a831e9180f9b5051dc8ac07afc2b2bc504a63a289ef9e1fcbfff07bc8486` |
| UniversalHelper | `0xd453e5bdb62cc3bea84341b1e306319c8ffd7dfe` | `53548d0059b4271e0674a902f5c20b8667f14f09bcab4efca39609a62a1a7404` |

Registries and resolvers are not created by a registry factory. Each one is a proxy from `VerifiableFactory.deployProxy`. Preflight calls `verifyContract` on that factory, then checks the implementation. Role bitmaps are loaded from the pinned SDK (`encodeRoleBitmap` / `encodeResolverRoleBitmap`). They are not numeric literals in the product code. `Status.REGISTERED = 2` is taken from that revision's `IPermissionedRegistry.Status`.

There is no registry factory in this deployment, and there is no GraphQL indexer in the admit path. The relay reads the contracts at one fresh block.

## Namespace

```text
funcaster.eth
├── play.funcaster.eth
│   └── <table>.play.funcaster.eth          party registry + that party's resolver
│       └── <seat>.<table>.play.funcaster.eth
└── players.funcaster.eth
    └── <earned-handle>.players.funcaster.eth
```

| Component | Sepolia address |
| --- | --- |
| `funcaster.eth` parent registry | [0x8d897aBC47Bba378121e32B7763C45217Db62036](https://sepolia.etherscan.io/address/0x8d897aBC47Bba378121e32B7763C45217Db62036) |
| `play.funcaster.eth` registry | [0x41f8F285AC4E0461650797a434876c4F0DfD1205](https://sepolia.etherscan.io/address/0x41f8F285AC4E0461650797a434876c4F0DfD1205) |
| Play resolver | [0xAc6399138406AA2F09019E0c32641B5397D430EE](https://sepolia.etherscan.io/address/0xAc6399138406AA2F09019E0c32641B5397D430EE) |
| `players.funcaster.eth` registry | [0x57f7594d1d1A15B77b201D1891E2a312514eD7e8](https://sepolia.etherscan.io/address/0x57f7594d1d1A15B77b201D1891E2a312514eD7e8) |
| Registrar / parent owner | [0x04b0970f4a58caa9E58C5aDBBF7eB402339264a5](https://sepolia.etherscan.io/address/0x04b0970f4a58caa9E58C5aDBBF7eB402339264a5) |

The live tree is this one. [ens-deployment.md](docs/web3/ens-deployment.md) records an earlier bootstrap of the same label: parent registry `0x03dB3cdE1139CE7aBa50E6176ee28E1eBECC77CD`, play registry `0x15E729A01519A22a726D2C829285781a3DEEb0Cb`, expiry `1825064832`. Those addresses are not the current hierarchy. Party routing does not hard-code either set. Each walk starts at the configured parent and follows `getSubregistry` / `getResolver`.

A walk pins every read to one block, checks each proxy implementation, each parent backlink, and `UniversalHelper.findCanonicalName`, then reads the block hash again before returning. Expiry uses that block's timestamp. Local time only bounds freshness (30 seconds). Token ids, subregistries and resolvers are not cached across walks, because a grant or revoke regenerates the token id.

Party labels are an adjective-animal pair derived from the room code, plus two characters of the code (`mellow-gecko-ve`). A taken label gets a numeric suffix. Seat labels are the nickname reduced to `a-z`, `0-9` and hyphen, 3–20 characters, or the seat color name when the nickname is empty. Reserved labels (`play`, `players`, `host`, `admin`, and the rest of the fixed list) are rejected. The filter is an explicit list plus NFKC normalization, not a general moderation system.

## Party and seat lifecycle

`createEnsLifecycle` in [integrations/ens/lifecycle.mjs](integrations/ens/lifecycle.mjs) exposes `refill`, `open`, `mint`, `release`, `grant`, `revoke` and `end`. It loads no key. Writes go through the shared transaction port: simulate, check the decoded signature, store the hash, broadcast once, reconcile the canonical receipt. An uncertain or reverted ENS admission stops further sends on that journal. Arc, by contrast, can continue an unrelated pot after a reverted claim. The two policies are intentional.

Warm opening a party is three transactions, not one. A future room code is unknown while proxies are predeployed, so the records and the parent link cannot be written in advance.

1. `setParent` on the reserved registry, pointing at `play.funcaster.eth` and this party's label.
2. `multicall` on that party's resolver: `chonks.v = 1`, `chonks.code` (the room code), `chonks.relay` (the HTTPS origin), `chonks.game` (`chonks.<slug>`).
3. `register` on the play registry: owner is the registrar, subregistry and resolver are the new pair, role bitmap is the registrar's operational set, expiry is `min(now + party TTL, parent expiry)`.

A cold open also deploys the registry proxy and the resolver proxy first (five transactions). The warm pool default is small and bounded (0–10 pairs). A used pair never returns to the pool. An ended party cannot be reopened. Public origin must be HTTPS with no path and no credentials. Party TTL is 1–4 hours, then capped by the parent expiry.

Minting a seat, on the party registry:

```text
register(label, owner = phone address, subregistry = 0, resolver = party resolver, roleBitmap = 0, expiry = party expiry)
```

`roleBitmap = 0` is the soulbound seat: the phone owns the name and holds no registry roles on it, so it cannot transfer the name, unregister it, or write the party resolver. The following multicall sets coin type 60 to the phone address and `chonks.seat` to `slot=<n>;shape=<shape>;color=#rrggbb`. Readback requires the owner, the expiry, the resolver, an empty subregistry, and a role word that is zero apart from the host kick role if that same address is also the delegated host.

Release clears resolver state and then unregisters. Unregister alone is not enough. The first local rehearsal showed a seat address still resolving after unregister, because the party's resolver still held the record and wildcard resolution inherited it. Release therefore writes the zero address, clears `chonks.seat` and `chonks.last`, and only then calls `unregister`. If a host already unregistered the seat, the clear still runs. Admission always rechecks canonical registration and expiry. A raw address answer is not membership.

`end` revokes a live host grant, then `unregister`s the party label on the play registry. The party registry contract remains deployed and becomes unreachable from the canonical name. Expired names stop resolving. History of a finished table is read from the resolver that the creation transaction actually wrote, not from a hard-coded address.

Jobs are idempotent on a durable fingerprint. A changed payload conflicts. A crash after a proxy deploy or a register resumes the same operation id. A revoked seat is not minted again by a retry.

## Host authority

The TV and the staff PIN stay local. They are in the room and they are not chain-checked. A phone that has been handed host duties is chain-checked.

Grant, only while that phone owns a currently registered seat, writes three transactions:

| Step | Call | Scope |
| --- | --- | --- |
| Kick | `grantRootRoles(ROLE_UNREGISTER, phone)` on the **party registry** | `remove` / kick. Root unregister is label-wide, so the relay still requires the target to be that party's seat. |
| Control | `grantSetterRoles` for the text key `chonks.control` on the **party resolver** | `start`, `pause`, `setup`, `select`, `lobby`, `extend`, `next-player`, `results-hold`, `pointer-mode`, `stakes`. |
| Record | `multicall` setting `chonks.host` to the phone address | The authority read requires the role and this record to name the same address. |

The registrar holds the admin variants, which ENSv2 requires in order to grant and revoke. Revoke removes those roles and clears `chonks.host`. A new grant is refused while an older grant is still live. A transient socket drop does not mint a new grant: the relay keeps the same binding until the seat actually changes. A real reassignment revokes the old grant first. Superseding a grant that was never admitted marks the job `JOB_SUPERSEDED` and sends nothing.

On each delegated command the relay calls [integrations/ens/authority.mjs](integrations/ens/authority.mjs):

1. Walk the seat name at a fresh block. The party owner must be the registrar. The seat owner must be this phone. Both must share the party resolver.
2. For control, `hasRoles(resource, ROLE_SET_TEXT, phone)` on the resolver, where `resource` is the `chonks.control` setter id. For kick, `hasRootRoles(ROLE_UNREGISTER, phone)` on the party registry.
3. `chonks.host` must equal the phone. The block hash is re-read and must still match. The proof must be at most 30 seconds old against chain time.
4. The answer is cached for at most five seconds, and never longer than the name's remaining lifetime. `EACRolesChanged` logs on that registry or resolver drop the cache. A head more than 100 blocks ahead invalidates rather than scanning without a bound.

Three results stay distinct. **Allowed:** the command runs, source `chain`. **Denied:** the command is refused with "The chain says no: this phone's host role was revoked." **Unavailable:** RPC failure. In `soft` mode the existing server token is used and the Players window says "Host power is server-checked right now." In `strict` mode the command is refused. A deterministic contract rejection is a denial, not an outage. Play itself is not blocked when the mode is `soft`.

This is application-authorized delegation inside one party. It is not control of `funcaster.eth` or of `play.funcaster.eth`. The phone cannot mint names, transfer a seat, write an arbitrary record, or grant itself roles.

## Transaction port

[integrations/ens/transactions.mjs](integrations/ens/transactions.mjs) is the signer used by the worker. It requires an explicit signer, a transaction-count limit, a fee limit, a cumulative cost limit and a kill callback. Before broadcast it checks chain id, signer, nonce, simulation and the decoded signature. The hash is durable before the send. A later retry loads that hash and does not broadcast it again. External nonce movement fails closed. The registrar key is not used for unrelated transactions while the journal is open.

Hosted budgets recorded for this deployment: ENS gas ceiling 0.05 SepETH. The namespace setup command itself was capped at 0.02 SepETH, 24 transactions, max fee 30 gwei, priority fee 1 gwei. The earlier parent-registration command was capped at 0.01 SepETH, 8 transactions and 20 MockUSDC. Those ceilings are historical operation caps. The live journal is the authority for what remains.

One public failure mode is recorded because it explains a guard. Seat text writes once failed `WRONG_SIGNATURE` before admission: ABI dynamic bytes still had EIP-55 checksum casing, and the signed-transaction parser had lowercased the same bytes. The bytes are equal. Admission now compares them as bytes. A one-byte change still fails before send. No uncertain seat-record transaction was rebroadcast.

Read-only preflight is `node --env-file=.env.relay scripts/web3-ens-preflight.mjs`. It must not load the worker env. The RPC transport allowlists read methods and refuses sign, send and debug methods.

## Champion handles

[integrations/ens/champion.mjs](integrations/ens/champion.mjs) issues one persistent name under `players.funcaster.eth`. It is not the season or Legend system. Those are not implemented.

The worker reads the canonical result and the participant list from the durable store. The browser cannot supply eligibility. The phone must acknowledge key recovery. A claim admits one durable intent first, then queues `ens.champion.claim`. Retries keep the same idempotency key.

A first claim is four transactions:

1. Deploy a dedicated resolver proxy. Temporary permissions exist for the registrar and the phone.
2. Write `addr`, `chonks.kind`, `chonks.receipt`, `chonks.proof` and `chonks.season`. `chonks.proof` is the local canonical result hash. `chonks.season` is the literal `verified-match`. No external season proof is invented.
3. Remove every registrar permission on that resolver. Later record changes belong to the phone.
4. `register` a one-year name to the phone, with transfer, renewal and resolver-management roles, and without unregister.

Preflight refuses the players registry if it has root unregister, root-unregister admin, or upgrade authority. Issuance also checks the new label. After a transfer, the adapter will not mint the name again. The new owner can point the name at a resolver they control; permissions on the old resolver do not move automatically. Ancestor ownership and the parent expiry still bound the name. A one-year registration under a parent that itself expires is not perpetual ownership.

Default product mode keeps handles local. `WEB3_ENS_CHAMPION=on` is prepared in the hosted config and still requires `PARTNERS=on` and `WEB3_ENS=on`. A pending job has no ENS name. A worker receipt is not labelled independently verified until a separate ledger check says so.

## Proofs

Sepolia reads in this section used `ethereum-sepolia-rpc.publicnode.com` unless a line names a second host. The second configured host was unavailable during the namespace readback. That readback is a **one-host** proof.

### 1. Parent registration and live hierarchy — one-host

| Fact | Value |
| --- | --- |
| Chain | 11155111 |
| Parent registration | [`0xa50e5552509f0c109d4feb489bd3d8c98aa2aa207b0a2c2cd28a439b78e6a1dc`](https://sepolia.etherscan.io/tx/0xa50e5552509f0c109d4feb489bd3d8c98aa2aa207b0a2c2cd28a439b78e6a1dc) |
| Owner | `0x04b0970f4a58caa9E58C5aDBBF7eB402339264a5` |
| Expiry | Unix **1857069048** |
| `play.funcaster.eth` readback | Block **12079008**, hash `0x4cc2acd7cde12e5f97921a6c588d040550b5c6684b3207405eb9286f914084e6` |
| `players.funcaster.eth` readback | Block **12079001**, hash `0x64c8422545b818a24ec5496d45eab0ad022c75e90f24c682297b3080509c6b96` |

The play readback checked the hosted public configuration: official deployment pins, canonical links, registrar ownership and the required roles. The players readback reported the restricted registry ready: no root unregister, no unregister-admin, and no upgrade authority on that registry. Ancestor ownership and expiry still apply. The owner completed seven parent/play operations before those reads. This file cites the readback and the registration, rather than an earlier bootstrap's transaction list, because that earlier list created the replaced registries in [ens-deployment.md](docs/web3/ens-deployment.md). Full setup notes: [funcaster-setup.md](docs/web3/funcaster-setup.md).

The first registration of the label, [`0xfde4cb5c70062b1dda668345d593654f3402b23a225df2cf8501963d79ef0022`](https://sepolia.etherscan.io/tx/0xfde4cb5c70062b1dda668345d593654f3402b23a225df2cf8501963d79ef0022), is recorded with expiry `1825064832` (1 November 2027, 15:57:12 IST) and a different child registry. It explains the history. It is not the tree the worker walks now.

### 2. Restricted players namespace — one-host receipts

Four owner transactions, in execution order, were checked as successful, on canonical blocks, from the configured registrar, on chain 11155111:

| # | Transaction | Block |
| --- | --- | --- |
| 1 | [`0x249d387f1f7b77863fa70107a1b7248c918827a842b496d4e1b3f2e9e90be352`](https://sepolia.etherscan.io/tx/0x249d387f1f7b77863fa70107a1b7248c918827a842b496d4e1b3f2e9e90be352) | 12078992 |
| 2 | [`0xe1bf89949c4661e91c0060864045043cc64b2c7467da11f3f306db9dd735cce0`](https://sepolia.etherscan.io/tx/0xe1bf89949c4661e91c0060864045043cc64b2c7467da11f3f306db9dd735cce0) | 12078994 |
| 3 | [`0x44e7f9c8f9f8068b5533056b877e2002f22fd7054ad2ecc2885518ff72db8fae`](https://sepolia.etherscan.io/tx/0x44e7f9c8f9f8068b5533056b877e2002f22fd7054ad2ecc2885518ff72db8fae) | 12078996 |
| 4 | [`0x3c2bd594a2d09c0f7ed049f8ad39202aee57ad38f912ba1615f648a2752ae700`](https://sepolia.etherscan.io/tx/0x3c2bd594a2d09c0f7ed049f8ad39202aee57ad38f912ba1615f648a2752ae700) | 12078998 |

The setup record checks these four registrar transactions in execution order and does not attach a separate function name to each hash. The Champion preparation that submits them, in that order, is: deploy the restricted registry, set the canonical parent link, remove authority to mutate that parent link, then register `players`. Readiness is the block 12079001 read above. No public phone has completed a Champion claim on this registry.

### 3. Hosted party and seat names

Historical party registration [`0xedb77d2788701f200a1ed5cb603ee153bd946b265ab352a98ae442caba84e497`](https://sepolia.etherscan.io/tx/0xedb77d2788701f200a1ed5cb603ee153bd946b265ab352a98ae442caba84e497) created `mellow-gecko-ve.play.funcaster.eth`. That table has ended. The transaction is a reference, not a join code.

A later replacement table's party registration is [`0x168f0558347b1bca2ac439472700734c3de006578d082eaafc4b4b727386d05f`](https://sepolia.etherscan.io/tx/0x168f0558347b1bca2ac439472700734c3de006578d082eaafc4b4b727386d05f). After worker `5dc8432`, both seat resolver receipts were matched to canonical Sepolia blocks and resolved to the retained phone addresses. The same phones each held 1.10 test USDC on both Arc hosts. Those seat receipts are the hosted proof that a seat name and a phone key were the same address. They are not a two-host ENS badge for the namespace setup, and that table is not a standing invitation. Narrative and the recovery that preceded them: [render-live.md](docs/web3/render-live.md).

### 4. Local contract rehearsal — not a public receipt

`node scripts/spikes/ens-lifecycle-rehearse.mjs` runs against a disposable Anvil fork of Sepolia. Signing cannot reach Sepolia. The rehearsal established three facts the public receipts do not need to repeat:

- Warm open is three transactions and cold open is five. The plan's one-register estimate was wrong for names chosen after the proxies exist.
- Unregister leaves resolver records in place. The release path clears them. A raw resolution after unregister is not a membership proof.
- CAN/CANNOT checks in that run are `eth_call` reverts on the fork. They are not public reverting transactions.

Champion rehearsal `integrations/ens/champion-rehearse.mjs`, source block **12078043**, passed on the same class of fork: restricted namespace discovery, the four-step mint, registrar unregister denial, phone-owner renewal, phone-owner transfer, and refusal to mint again after transfer. The fork locally extended parent expiry so the one-year name fit. That extension is not a public renewal. Detail: [CHAMPION.md](integrations/ens/CHAMPION.md).

### 5. Allowance

The last recorded allowance audit, a keyless read at 6 November 00:57 UTC, found **118 of 120 ENS admissions used**, before later cleanup. A further full table needs an explicit operator capacity review. Journals and spending totals are not reset to make the counter look fresh. Current readiness: [progress](docs/web3/progress.md).

## What is proven, and what remains

Proven on Sepolia: the current parent, the play hierarchy, the restricted players registry, hosted party registration, and hosted seat resolver records that match the phone addresses.

Proven on a local fork only: soulbound-seat denial, host grant/revoke behaviour, release-clears-records, and Champion mint, renewal, transfer and unregister denial.

Still open: a public phone-earned Champion claim and its independent audit; a public CAN/CANNOT transaction book for host denial; physical iPhone and Android motion. Pending and local handles are not issued names. Season and Legend issuance are outside this build.

## Suggested demonstration

1. Open the parent registration and one party transaction on Sepolia before starting any new naming job. Read `play.funcaster.eth` from the live registry address in the table above.
2. After the operator clears remaining admissions, create a table, scan its QR with two phones, and wait until the seats move from queued to registered. The room code remains the join path while a job is pending.
3. Compare the seat's on-chain owner and address record with the phone identity. Show a delegated host command only after `chonks.host` and the role read agree. A queued grant is not authority.
4. After a verified game, the earned-handle screen is the implemented claim flow. A public claim still has to be accepted before that handle is an ENS name. Keep game replay, worker completion and independent receipt verification as three different labels.

Source entry points: [hierarchy and preflight](integrations/ens/hierarchy.mjs), [party and seat lifecycle](integrations/ens/lifecycle.mjs), [host integration](server/web3/ens-rooms.cjs), [Champion adapter](integrations/ens/champion.mjs), [name and history reads](integrations/ens/reads.mjs). Browser keys and signer journals are not required for judging.
