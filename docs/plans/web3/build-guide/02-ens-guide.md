# Build guide 02: ENS (ENSv2 as the party's namespace, roster, permission layer and receipt trail)

Part of the [build guide](00-README.md). Status: plan, 6 November 2026. **No code is written; this is the specification a teammate and Codex build from.** It replaces the build detail of [6 November ENS plan](../03-ens-plan.md) (kept as background) using the winning-project study and a fresh ENSv2 fact check.

Evidence marks: **[V]** verified in source or docs on 6 November; **[code]** read in a winning repository; **[I]** inference to be verified in a spike (section 11). **Re-read every [V] fact on the day you build.** ENSv2 addresses changed about three times in six weeks.

## 1. The track, and what "central" must mean for Funcaster

**Best Use of ENSv2** ($7,000; $3,000, $2,000, $1,000, $1,000) [V]: built on ENSv2 on mainnet **or Sepolia**; ENSv2 features **central, "not a cosmetic add-on"**; a **functional demo, not hard-coded values**; a live demo link; open-source code. Features the page names: hierarchical registries, wildcard resolution, subname registries, **Enhanced Access Control**, **Permissioned Resolvers**, aliasing, subnames that are expiring, revocable, transferable or permanent; **bonus points for AI agents as namespaces with their own identities and permissions**. The Continuity-only track ($3,000) requires mainnet and is out of scope unless mainnet resolution goes live ([section 12](#12-mainnet)).

**ENS is deep in Funcaster when ENS is where these four decisions are made, and the product reads them live:**

| Decision | Made by ENS | What breaks without it |
| --- | --- | --- |
| **Who is in the party** | The party registry and the seat names (owned by each phone's key) | The pot's seat list is built from ENS names at lock time; without ENS it would just be the relay's say-so |
| **Who may command the party** | **EAC roles** on the party registry and the party resolver; the relay checks `hasRoles` on every delegated `host.cmd` | A delegated phone's power would be a server token the TV can't prove or revoke on a public ledger |
| **How long a party and a seat live** | **Expiry** on the party and seat names; `unregister` ends the party | Names would never expire; no on-chain notion of "this party is over" |
| **How to find and join a party** | The party name's text records (`chonks.code`, `chonks.relay`): a phone can join **by name** | Joining would need the code or the QR only |

Plus a **receipt trail**: each result's hash is written as a text record on the party name, and the Records window reads the party's history back **from the registry's own event logs** (the product visibly reads what it wrote; this avoids the "mirror" weakness that cost Tide first place). The pattern is the one all four winners share ([10](../10-winner-patterns.md), the ENS research): **ENS is the policy store and the enforcer reads it live; authority flows down from the parent; expiry and revocation are real and shown live; "can't" is proven on chain; a server key pays gas; there is a transaction-hash book.**

## 2. What the four winners did, in one table (code-verified)

| Winner | Core ENS pattern | What we take | What we avoid |
| --- | --- | --- | --- |
| **Radius** (1st, existing-project track): ENS subname as WiFi and API credential | A **registrar contract** holds the mint role (no human does) and **derives** authority in `_getRoles`; per-key text rights via `authorizeTextRoles`; seats are soulbound (`roleBitmap = 0`); the enforcer re-reads ENS at each admission and keeps "denied" distinct from "could not ask"; "can't" shown by reverts with hashes | Wrapper registrar (Tier 2); soulbound seats; deny versus could-not-ask; tx-hash proof of reverts; expiry as the access window | CCIP-Read claims it did not build; a single GraphQL indexer as a point of failure |
| **Relay** (1st, Best Use): API gateway where people and agents are names | Six-level hierarchy; limits stored on the **parent's** resolver so a child cannot widen its own; a **live check every 5 s** cuts off in-flight use if the name is removed or expired; expiry from **chain time**; shared `SessionMinter` writes an agent's name and records in one tx; `verifyContract` and canonical-name checks reject fake subtrees | Parent-controlled records; live check; chain time; a one-transaction mint wrapper; no demo mode | A heavy six-level tree (we need three) |
| **ENS Drive** (2nd): team-inherited roles | Cascading roles through a custom registry (82 tests, 3 Halmos proofs) | The seriousness of the test evidence; first-hand feedback notes | Cascade inheritance (too deep for us) |
| **Tide** (3rd): ENS as strategy and agent control plane | A scoped, revocable text-role for a manager agent; agent name with ENSIP-26 records | Scoped revocable agent role; agent identity records | **Mirroring**: the on-chain contract did not read ENS, so ENS was less load-bearing |

## 3. Facts (re-verify on the day)

| Item | Value | Mark |
| --- | --- | --- |
| Where Sepolia addresses come from | `addEnsContracts(sepolia)` in `@ensdomains/ensjs` (**5.2.7** on 27 Oct) exposes them as `chain.contracts.*`; the docs page `https://docs.ens.domains/learn/deployments` is generated from pinned contracts-v2 commits (Sepolia `07e55a05`, mainnet `4f47cbcc`). **Do not copy addresses from the `contracts-v2` `main` branch or its `deployments/sepolia/` folder (stale June deployment)** | [V] |
| Sepolia set of 1 Oct 2026 (reference only; read from config) | RootRegistry `0xb458d6a3a77919449d03e7a6903c26827c1ec43f`; ETHRegistry `0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4`; ETHRegistrar `0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3`; **Universal Resolver proxy `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe`** (same on mainnet and Sepolia); UniversalHelper `0xd453e5bdb62cc3bea84341b1e306319c8ffd7dfe`; PermissionedResolverImpl `0x115eb53f0c60696633855f90b138178fb40b2b2c`; **VerifiableFactory `0xda70306c98e97ece36f997a21368e53298572991`**; UserRegistryImpl `0x9bd8a88719068d09ecee662f36c0e3856708366a`; MockUSDC (free `mint`) `0x240b0316df57887dbbe58b586508b19e633a14aa` | [V] |
| Payment token mismatch | The readiness page names other test USDC and DAI addresses than the Deployments table; confirm with `isPaymentToken(token)` on the StandardRentPriceOracle | [V] discrepancy |
| Registries and resolvers | **No registry factory**: registries and resolvers are **proxies from the VerifiableFactory** (`deployProxy(impl, salt, initData)`; address in the `ProxyDeployed` event; salt convention `keccak256("UserRegistry", namehash, version)` / `keccak256("OwnedResolver", owner, version)`) | [V], [code] |
| Parent registration | ETHRegistrar: `isAvailable`, `getRegisterPrice`, `makeCommitment`, `commit`, **wait at least 60 s**, `register(label, owner, secret, subregistry, resolver, duration, paymentToken, referrer)`; minimum 28 days; **$8 a year for 5 or more characters**, paid in the mock USDC (mint, approve); gas is Sepolia ETH from a public faucet. The owner receives only `SET_SUBREGISTRY`, `SET_RESOLVER` and transfer-admin roles, **not `ROLE_REGISTRAR` on its own subregistry** | [V] |
| Subnames | `UserRegistry.register(label, owner, subregistry, resolver, roleBitmap, expiry)`: caller needs root `ROLE_REGISTRAR`; `expiry` is an absolute unix timestamp; **no minimum duration** (hour-long seats are fine; the 28-day minimum is for `.eth` second-level names only); an expired label can be re-registered; `roleBitmap = 0` with a real owner is accepted (soulbound seat) | [V] |
| Roles (registry) | `ROLE_REGISTRAR 1<<0`, `REGISTER_RESERVED 1<<4`, `SET_PARENT 1<<8`, **`UNREGISTER 1<<12`**, **`RENEW 1<<16`**, `SET_SUBREGISTRY 1<<20`, `SET_RESOLVER 1<<24`, `CAN_TRANSFER_ADMIN (1<<28)<<128` (admin only). Admin variant of each role is the role shifted left 128. **Take constants from the library, never hard-code** (a winner found the docs and the library disagreed on `ROLE_RENEW`) | [V], [code] |
| Roles (resolver) | `SET_ADDRESS 1<<0`, **`SET_TEXT 1<<4`**, `SET_CONTENTHASH 1<<8`, `SET_ABI 1<<12`, `SET_INTERFACE 1<<16`, `SET_NAME 1<<20`, `SET_DATA 1<<24`, `LINK 1<<28`; admin variants `<<128` | [V] |
| EAC | `grantRoles(resource, bitmap, account)`, `grantRootRoles`, `revokeRoles`, `revokeRootRoles`, `hasRoles`, `hasRootRoles`, `roles`, `roleCount`. **Granting or revoking needs the `_ADMIN` variant of every role in the bitmap.** Effective roles are root OR resource. At most 15 holders per role per resource. **Token ids regenerate on every grant or revoke**: key data by label hash or resource | [V] |
| Resolver text scope | `PermissionedResolver.setText(bytes dnsName, string key, string value)` (DNS-encoded name, `toHex(packetToBytes(name))`); `grantSetterRoles(bytes setter, address account)` and `authorizeTextRoles(dnsName, key, account, grant)` scope a writer to **one key**; **role scope is per resolver, not per name**: use **one resolver per party**. `initialize(Grant[] grants, bytes[] calls)` can write records in the same transaction. A name with its own record bundle stops using the default bundle entirely | [V], [code] |
| Names without a resolver | Inherit the closest ancestor's resolver; a subname owner holds no roles on the shared resolver, so their own `setText` reverts `EACUnauthorizedAccountRoles` | [V] |
| Renew, revoke | `renew(anyId, newExpiry)` (cannot shorten); `unregister(anyId)` needs `ROLE_UNREGISTER` and ends the name now; an expired name resolves to nothing | [V] |
| Reads | viem **2.35.0 or later** (latest 2.57.12), ensjs 4.2.3 or later, ethers 6.17.0 or later for ENSv2 resolution; registry reads (`getState`, `getExpiry`, `getSubregistry`, `getResolver`) and role reads need the ABIs (viem's ENS helpers do not expose expiry or roles) | [V] |
| Writes | **ensjs 5.2.5 or later** (`@ensdomains/ensjs/wallet/v2`): `createSubname`, `deleteSubname(s)`, `setRecords`, `grantRoles`, `revokeRoles`, `grantResolverRoles`, `revokeResolverRoles`, `setResolver`, `setSubregistry`, `setParent`, `deployVerifiableProxy`, `deploySubregistry`; `public/v2`: `hasRoles`, `getExpiry`, `getNameRolesAccounts`, `getNameRegistries`, `getOwner`. **All four winners used raw viem ABIs for writes.** Decide on day one (spike S-ENS-2) | [V], [code] |
| Events (for live UI and history) | Registry: `LabelRegistered`, `LabelUnregistered`, `ExpiryUpdated`, `SubregistryUpdated`, `ResolverUpdated`, `TokenRegenerated`; EAC: `EACRolesChanged(resource, account, old, new)`; resolver: `TextUpdated(recordId, keyHash, key, value)`, `Linked`; factory: `ProxyDeployed`. **No event marks expiry**: compute from `expiry` and the clock | [V] |
| Status on 27 Oct | The **DAO vote passed** (about 1.69M for); execution possible from about 27 Oct 06:00 UTC after a 2-day timelock; after execution `.eth` registrations freeze for a few hours; **mainnet resolution is still v1 until activation**; Sepolia is live and resolves through ENSv2. A follow-up proposal about a month later trims over-broad v2 roles | [V] secondary source for the vote |
| Explorers and apps | `https://sepolia.app.ens.domains`, `https://sepolia.explorer.ens.domains` (use these in the demo to show registries, roles and expiry) | [V] |
| Tooling | `https://docs.ens.domains/llms.txt` and `llms-full.txt` (best context for a coding agent), Context7 MCP, `ensdomains/ens-cli` (experimental; **its `resolver deploy` can default to the zero address: never broadcast that**) | [V] |

## 4. The namespace

```text
<parent>.eth                              the team's parent on Sepolia (ENS_PARENT in config)
  play.<parent>.eth                       a registry of parties (one, created once by bootstrap)
    kart-otter-7k.play.<parent>.eth       ONE PARTY: its own registry AND its own resolver (per-party), expiry = party end
      asha.kart-otter-7k.play.<parent>.eth     a SEAT: owned by the phone's key, soulbound, same expiry or earlier
  players.<parent>.eth                    (stretch E-S1) persistent hall-of-fame names owned by winners' keys
  agents.<parent>.eth                     (stretch E-S2) the referee and the CPU racers
  games.<parent>.eth                      (stretch E-S3) creator namespaces
```

**Party label:** an adjective-animal pair chosen by hashing the room code, plus two characters from the code (for example `kart-otter-7k`); check `getState` and bump the suffix on collision. **Seat label:** the nickname slugged to a-z, 0-9 and hyphen, 3 to 20 characters, de-duplicated within the party (`asha`, `asha-2`); reserved labels blocked (`play`, `players`, `legends`, `fans`, `booth`, `hall`, `games`, `agents`, `host`, `tv`, `admin`, `chonks`, `www`); empty nickname falls back to the seat name (`peeli`, `magenta`, `cyan`, `marigold`).

**Namespace extension (review, 6 November).** The expansion features of [20](20-feature-expansion.md) add, all as stretch lanes **under the same rules** (one registry per parent label, **one resolver per party, agent, creator and fan-group name** because role scope is per resolver): `legends.<parent>.eth` (Legend names, no expiry), `fans.<parent>.eth` (F-E3), `booth.<parent>.eth` (F-E4 venue names), `hall.<parent>.eth` (one name carrying the Hall's Swarm `contenthash`, F-X1). The **handle** of a player is one label under `players`; the same string is the Arkiv `profile.handle` (see [20](20-feature-expansion.md) F-E2 review fixes). **A seat or party name expiring does not break history**: the permanent references are the handle, the Arkiv entity keys and the transaction logs. Name wording in the UI: **name** (handle) and **table name** (party); the words *registry*, *resolver*, *subname* stay in Proof ([21](21-ux-laws-and-os-ux.md)).

## 5. The records (what is written, who reads it, what it changes)

| Name | Key | Value | Written | **Read by the product to…** |
| --- | --- | --- | --- | --- |
| Party | `chonks.v` | schema version `1` | at open | validate |
| Party | `chonks.code` and `chonks.relay` | room code; public origin | at open | **join by name** (the relay resolves them) |
| Party | `chonks.game` | current game id (`chonks.<slug>`) | on game change (not every state) | Invite window and Records header |
| Party | `chonks.host` | the delegated host's key address | on host grant and revoke | the Players window "host: asha" chip and the live check |
| Party | `chonks.pot` | `arc:5042002:<potAddress>:<potId>` | on pot create | the Results window's pot link; the roster check |
| Party | `chonks.receipt` | latest result hash | on each result | **History**: the Records window reads the party's `TextUpdated` logs for this key to list every match with its hash |
| Seat | `addr` (coin type 60) | the seat's session-key address | on mint, in the same `multicall` (the resolver's setter admin role covers `SET_ADDRESS`) | **the pot roster**: resolving the seat name returns the staking address, so ENS and Arc always agree on who is who |
| Seat | `chonks.seat` | `slot=2;shape=circle;color=#…` | on mint (set in the same transaction via the resolver's `multicall`) | seat identity on the phone and the shell |
| Seat | `chonks.last` | `<matchId>:<resultHash>:<place>` | on each result | the player's "last match" line |

**One transaction per meaningful change, batched with `multicall`; never one write per game tick.** Seat owners hold no resolver roles, so they cannot edit records; only the worker (registrar) writes, and the host holds only the **control** scope.

## 6. Permissions: how the chain is the authority for the host

**Roles granted to the delegated host's key address** when the existing host grant happens (the first ready seat after 5 s, or a TV-initiated transfer):

| Capability | On-chain grant | Commands it authorises (relay maps `host.cmd` and the `onAdmin` handlers to a class) |
| --- | --- | --- |
| **control** | `grantSetterRoles(setText calldata for key "chonks.control")` on the **party resolver** (so the resource is `keccak256("chonks.control")`, role `ROLE_SET_TEXT`) | `start`, `pause`, `setup`, `select`, `lobby`, `extend`, `next-player`, `results-hold`, `pointer-mode`, `stakes` |
| **kick** | **root** `ROLE_UNREGISTER` on the **party registry** (`grantRootRoles(ROLE_UNREGISTER, host)`) | `remove` (the relay then executes `unregister` on that seat's name) |

The registrar key holds `ROLE_UNREGISTER_ADMIN` and the resolver admin roles so it can **revoke** (granting and revoking need the admin variant) [V]. **Transfer, decline, end and a TV-side "Revoke" button** enqueue the matching revoke; the TV shell host and the staff PIN paths keep working as today and are **not** chain-checked (they are physically in the room).

**Enforcement (the heart of "central"):**

1. A `host.cmd` from a delegated phone reaches the relay as today (socket plus seat token plus the bound address).
2. The relay maps the command to a class and calls `authorize(address, class)`: `hasRoles` on the party resolver or registry, answered from a **cache with a 5-second TTL**, invalidated at once by a watched `EACRolesChanged` event for the party's resources.
3. **Three outcomes, kept distinct (the Radius lesson):** the chain says **yes** (command runs); the chain says **no** (command refused with the plain message "the chain says no: this phone's host role was revoked" and a message in the shell); the chain **could not be asked** (RPC down): behaviour per `ENS_ENFORCE`: `soft` (default: fall back to the existing token model and **say so** in the Players window, "host power is server-checked right now") or `strict` (refuse). Never block play on an outage when `soft`.
4. A **live check every 5 s** re-validates a delegated host while it is acting (Relay's pattern): revoke on chain and the phone's admin sheet closes within seconds, even after a relay restart.
5. Expiry is computed from **chain time** (`block.timestamp` of a recent block), never `Date.now()`.

**Evidence to produce:** committed transaction hashes for the CAN and CANNOT book ([07](07-tests-evidence-demo.md)): the host phone can kick a seat; the host phone cannot mint, cannot transfer a seat, cannot write another record, cannot grant itself roles; a seat cannot re-point its name, cannot transfer, cannot write a record; a revoked host's next command is refused.

## 7. Lifecycle and the worker jobs

| Job | Steps (one signer queue, sequential nonces) | Notes |
| --- | --- | --- |
| `ens.party.open` | (1) take a **pre-warmed pair** (registry proxy plus resolver proxy) from the warm pool, or deploy them via the VerifiableFactory (the registry `initialize` grants must include `ROLE_REGISTRAR_ADMIN`, `ROLE_RENEW_ADMIN`, `ROLE_UNREGISTER_ADMIN` to the registrar key; the resolver `initialize` grants the setter admin roles and writes the initial records in `calls`); (2) `register(label, owner = registrar key, subregistry, resolver, roleBitmap, expiry)` on the `play` registry; (3) confirm via `getState` | A warm pool (`ENS_WARM_POOL`, default 3) removes two transactions from the critical path: a party then needs one register transaction (about one Sepolia block, 12 s [I]). Refill the pool in the background |
| `ens.seat.mint` | `register(label, owner = seat address, 0, partyResolver, 0, expiry)` on the party registry; then `multicall` the seat records on the resolver | Idempotent by label: if the label is registered to the same owner, no-op; collision to a different owner gets the next suffix |
| `ens.record.set` | `multicall(setText…)` on the party resolver | Only on meaningful changes; coalesce within 2 s |
| `ens.role.grant` and `ens.role.revoke` | As in section 6 | Bust the permission cache on receipt |
| `ens.party.end` | `unregister` the party name (names stop resolving at once); the party registry remains but is unreachable | Also on host end, 120 s host loss and the 4 h cap |
| `ens.seat.release` | `unregister` a seat on leave or kick | Frees the label |

**Never block play:** a room starts at once; `party.status` shows `pending` then `ready`; seat names show the nickname immediately and gain the "on ENS" mark when minted. **Hardening tier (E9):** a **wrapper registrar contract** (Radius's and Relay's pattern) holds `ROLE_REGISTRAR` and `ROLE_RENEW` on each party registry and exposes `mintSeat(label, owner, expiry)` callable only by the worker, forcing `roleBitmap = 0` and `expiry <= party expiry`, so even the worker key **cannot** mint a transferable or over-long seat; the can't-do reverts become the evidence.

## 8. Reads, caches and the "no hard-coded values" rule

- Configuration is only: `ENS_CHAIN` (`sepolia` or `mainnet`), `ENS_PARENT`, the RPC list, and the registrar key. **Registry and resolver addresses for the `play` registry and every party are discovered at runtime** by walking `getSubregistry` and `getResolver` from the parent (Relay's `hierarchy.ts` pattern), and verified as genuine and canonical (`findCanonicalName`, `verifyContract` on the VerifiableFactory) so a fake subtree is rejected.
- Protocol addresses come from `addEnsContracts(chain)` (or the docs page) and are **printed and compared against the docs page in preflight**; a mismatch is a warning with the diff.
- Reads: Universal Resolver (through viem or ensjs) for text and addresses; registry reads for `getState`, `getExpiry`, `getOwner`; EAC `hasRoles`; Multicall3 to batch; `getLogs` for history in chunks (the public RPC caps ranges; Alchemy's free tier caps at 10 blocks).
- **Never cache token ids or resolver addresses beyond a party's life; key by label hash or resource.**

## 9. Seamless user experience

A player types a nickname they already type today. Nothing else: no wallet, no seed phrase, no gas, no ENS jargon. The seat name shows as their nickname with a small check when it is on ENS; the party shows as a readable name (`kart-otter-7k`) next to the room code and works as a join target; the host's special power shows as "host (on-chain)". Judges and curious players open the ENS explorer from the Chain window to see the registry, expiry and roles. The phone's session key is generated silently in the browser ([01](01-architecture.md) section 5).

## 10. Tasks (lane E; estimates are for one engineer; dependencies in [06](06-tasks-and-codex-prompts.md))

| ID | Task | Hours |
| --- | --- | --- |
| E0 | Spikes S-ENS-1 to S-ENS-6 (section 11) | 5 |
| E1 | `integrations/ens/` config, ABI set, hierarchy walker, genuine-and-canonical check, preflight (prints addresses and diffs them with the docs page) | 4 |
| E2 | Bootstrap script: register the parent (commit, wait, register), deploy the `play` registry and resolver, link, grant the registrar roles (including the admin variants), write `docs/web3/ens-deployment.md` | 4 |
| E3 | `ens.party.open` with the warm pool, party label generation, idempotency, expiry, records in `initialize` | 6 |
| E4 | `ens.seat.mint`, `ens.seat.release`, label sanitising and reserved list, collision handling, seat records | 4 |
| E5 | Host delegation: grants and revokes tied to the host grant events, `authorize` with cache, the `EACRolesChanged` watcher, the 5 s live check, `soft` and `strict`, relay enforcement and messages | 8 |
| E6 | Records: batching, `chonks.*` writes, the History read from logs, join by name, roster resolution for the pot | 6 |
| E7 | UI work with lane U ([05](05-ui-integration.md)) | (in U) |
| E8 | Tests: fork tests, CAN and CANNOT book, time-travel expiry, revoke, fault injection ([07](07-tests-evidence-demo.md)) | 8 |
| E9 | Hardening: the wrapper registrar contract and its tests | 6 |
| E10 | Stretch: **players hall-of-fame** (`players.<parent>`: winners get a persistent soulbound name whose records hold best scores) 6; **the referee as an agent** (`oracle.agents.<parent>.eth` with ENSIP-26 `agent-context` and `agent-endpoint[web]` pointing at `/api/web3/result`, and an ENSIP-25 link to the **ERC-8004 identity registry deployed on Arc** [the registry address is in the Arc docs; the ERC-7930 encoding for the record key is **[I]**, verify]) 6; **creator namespaces** 8 | 6 to 20 |

Core scope is E0 to E6 plus E8 (about 37 hours); E9 and E10 are additions in that order. The referee agent is the best stretch item because it ties ENS to Arc and earns the "AI agents as namespaces" bonus.

## 11. Spikes (first hours; record results in `docs/web3/ens-evidence.md`)

| ID | Question |
| --- | --- |
| S-ENS-1 | Sepolia ETH from a faucet; parent registration through `https://sepolia.app.ens.domains` or the registrar; which test USDC the registrar actually accepts (`isPaymentToken`) |
| S-ENS-2 | Do the ensjs 5.2.x v2 write helpers cover `deployVerifiableProxy`, `createSubname`, `setRecords`, `grantRoles` and `grantResolverRoles` against the live Sepolia set; else fall back to raw ABIs from `@ensdomains/ensjs-abi` |
| S-ENS-3 | A subname with `roleBitmap = 0` and an explicit resolver: confirm it resolves, the owner cannot `setText`, the owner cannot transfer |
| S-ENS-4 | Root `ROLE_UNREGISTER` grant to a second key, then that key `unregister`s a seat; the registrar revokes it (admin variant needed) |
| S-ENS-5 | `grantSetterRoles` for the key `chonks.control`: `hasRoles(keccak256("chonks.control"), ROLE_SET_TEXT, host)` is true, then false after the revoke; confirm the cache-busting `EACRolesChanged` event |
| S-ENS-6 | Gas and latency for: deploy two proxies, register the party, mint a seat, grant, revoke (measure with `estimateGas` and wall time) |

## 12. Mainnet

Build and demo on **Sepolia**. Mainnet addresses are published (from branch `deploy/mainnet-v2-20261002`, redeployed on 23 6 November) but **resolution stays on v1 until the activation transaction and the security council's upgrade**; after execution `.eth` registrations freeze for hours. Keep `ENS_CHAIN` configurable so the same code can target mainnet if resolution flips before the event; **re-check the rollout tracker (`https://discuss.ens.domains/t/tracking-the-ensv2-rollout-on-enswhois/22507`) and the DAO timelock `0xFe89cc7aBB2C4183683ab71653C4cdc9B02D44b7` daily**, and decide on 6 November. The Continuity-only mainnet track is out of scope unless that happens.

## 13. Tests (summary; full list in [07](07-tests-evidence-demo.md))

Fork tests on a Sepolia fork (anvil) with an `eth_call` CAN and CANNOT assertion for every role above; expiry by time travel; revoke then refuse; label sanitising and collisions; party warm pool refill; the live check; `soft` versus `strict` with the RPC down; idempotent jobs across a worker restart; the mock provider passes the same capability contract test; **parity with partners off**.

## 14. Risks

| Risk | Mitigation |
| --- | --- |
| Addresses or contracts change again | Config from `addEnsContracts`, runtime discovery, preflight diff against the docs page, a pinned contracts commit recorded in `docs/web3/ens-deployment.md` |
| ensjs write helpers immature | Raw ABIs ready (all winners did this); decide in S-ENS-2 |
| Sepolia latency makes a party slow to name | Warm pool; async naming; the UI never waits |
| Role mistakes (missing admin variants, token regeneration, resolver scope) | One resolver per party; key by label hash or resource; early grant and revoke tests |
| RPC range caps and flaky load-balanced RPC | Chunked `getLogs`, retry with backoff, two RPC URLs |
| "Mirror" weakness | The relay **reads** ENS to decide (roster, host authority, join by name, history) |
| The ENS explorer or apps down during the demo | Screenshots and the evidence file; direct RPC reads from the Chain window |
| Mainnet flips mid-build | Chain is configuration; do not migrate before the event unless it is clearly stable |

## Sources

[Prize page](https://ethglobal.com/events/mumbai/prizes/ens); [ENS deployments](https://docs.ens.domains/learn/deployments); [ENSv2 docs](https://docs.ens.domains/ensv2/overview) (permissioned registry, permissioned resolver, enhanced access control, verifiable factory, subnames, indexing, universal resolver v2, tutorials); [ensjs](https://github.com/ensdomains/ensjs) 5.2.7; [contracts-v2](https://github.com/ensdomains/contracts-v2) (pinned commits above); [ens-cli](https://github.com/ensdomains/ens-cli); [the rollout tracker](https://discuss.ens.domains/t/tracking-the-ensv2-rollout-on-enswhois/22507); [DAO vote report (secondary)](https://themerkle.com/ens-dao-approves-ensv2-with-169m-votes-execution-due-october-27); the four winning repositories (Radius, Relay, ENS Drive, Tide).
