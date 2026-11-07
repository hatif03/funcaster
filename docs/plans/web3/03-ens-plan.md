# Web3 plan 03: ENS (ENSv2 as the names, the party namespace and the host's permissions)

Part of the [web3 plan](README.md). Status: plan, 6 November 2026. The ENS tracks are **published**, so this is the best-grounded plan of the three. Facts come from the prize page and ENS documentation as retrieved on 6 November 2026 by a research pass; **S** = stated in a fetched source, **I** = inference, **U** = could not verify. Sources are listed at the end.

> **6 November update:** ENS is now the **first reserve**, not a primary: it is not needed for betting and costs about 30 hours of optional work ([README](README.md) section 1). Build it with a fifth engineer, or promote it if the Arkiv or World brief disappoints. For a staked room, the party namespace also gives the pot terms card readable names (`asha.kart-otter.play.<parent>.eth owes ravi...`). The Continuity-only prize below is available only if the team is also entered as Continuity ([README](README.md) section 3).

## 1. The two tracks and what they ask

| Track | Prize | Requirement that matters |
| --- | --- | --- |
| **Best Use of ENSv2** | $7,000; 4 places ($3,000, $2,000, $1,000, $1,000) | "Project must be built on ENSv2 on Ethereum mainnet **or Sepolia**." ENSv2 features "central to the product, not a cosmetic add-on"; a functional demo, "not just hard-coded values"; live demo link; open source. Features named: registry hierarchy, Enhanced Access Control, Permissioned Resolvers, aliasing, subnames that are expiring, revocable, transferable or permanent; **bonus for AI agents as namespaces** |
| **Best Integration of ENSv2 into an Existing Project** (Continuity only) | $3,000; 2 places ($2,000, $1,000) | "Integration must use ENSv2 **on Ethereum mainnet** and integrate it into an existing project. It should be clear how ENSv2 improves the project, not just a cosmetic add-on." |

Both count as **one** of our three partner slots. Whether one project can win both is **U**.

**The mainnet risk (important).** The Mumbai page says ENSv2 "is now live on Ethereum mainnet", but the rollout tracker shows the contracts deployed in early October with names reserved and a daily sync, **resolving still through v1 until a cutover**; a DAO activation vote closes about **6 November 2026** with a timelock of at least two days after (S). No mainnet ENSv2 addresses were found (U); the official deployments page listed only ENSv1 for mainnet. **ENSv2 on Sepolia is live as a beta** (S). So: **build and demo on Sepolia (enough for "Best Use")**, keep the chain id in configuration, and **re-check on 6 November** whether mainnet resolves; if it does, also deploy the integration to mainnet to be eligible for the Continuity prize. Earlier events (Tokyo, ETHOnline) required Sepolia for both prizes; Mumbai's Continuity wording is stricter.

## 2. Why ENSv2 genuinely fits this product

Our product already has four things ENSv2 models natively, which keeps the integration *central* instead of cosmetic:

1. **Ephemeral groups with member names:** a party is a room that exists for a couple of hours and has seats. ENSv2 subregistries with **expiring** subnames are the natural namespace for it.
2. **Delegated, revocable authority:** the host phone is granted scoped commands (start, pause, kick, lock) that the TV can revoke. ENSv2's **Enhanced Access Control** (roles as bitmaps, per-resource, revocable) is a close semantic match.
3. **Namespaces owned by outside creators:** the creator platform already has `chonks.<slug>` ids and namespace owners. ENSv2's **registry hierarchy** gives each creator a subregistry they control.
4. **Agents and bots with identities:** we have CPU racers, helper bots and planned human-backed agent seats. ENSIP-25/26 define agent records.

## 3. What to build (scope tiers for 36 hours; one strong engineer is about 80 to 90 hours for everything, so cut)

| Tier | Item | Hours | ENSv2 features used |
| --- | --- | --- | --- |
| **Core (build first)** | 1. Bootstrap: register or reuse a parent name; deploy a `play` registry and a shared Permissioned Resolver; grant the relay's minting role | 6 | Registry, Permissioned Resolver, EAC |
| | 2. **Party namespace with expiring seats**: on room creation the relay deploys a party registry, mints seat names with an expiry equal to the planned party end, and links resolver records | 8 | Registry hierarchy, expiring subnames, non-transferable roles |
| | 3. **Live reads** in the shell and the phone: resolve names, read expiry and roles; the Players window shows the seat's ENS name and a "valid until" | 8 | Universal Resolver reads |
| | 4. **Host delegation as EAC roles**: the TV grants the VIP phone scoped roles on the party registry and resolver; the relay accepts a `host.cmd` from that phone only if the chain says the phone holds the role; revoking removes the power | 8 | Enhanced Access Control, scoped roles, revoke |
| **Stretch** | 5. **Creator namespaces**: `kart-rush.chonks.games.<parent>.eth` resolves the bundle hash and manifest; the creator holds the subregistry | 10 | Sub-registries, per-creator resolvers, scoped roles, aliasing |
| | 6. **Player text records**: best scores and the latest receipt on a player name | 6 | Permissioned Resolver text roles |
| | 7. **Agents as namespaces**: CPU racers and helper bots get names with ENSIP-26 records; a human-backed agent from the World track gets an ENSIP-25 link | 6 | Agent records, non-transferable names |

Tests 10 h and demo and docs 8 h on top. **Recommended scope: items 1 to 4, then 6 or 5 if time allows, 7 as the bonus** (it ties to the World plan).

## 4. The design in detail

### 4.1 Naming scheme

```text
<parent>.eth                      the project's parent (a name the team owns; check availability, mainnet and Sepolia are different registries)
play.<parent>.eth                 a registry for parties
  kart-otter.play.<parent>.eth    one party (its own registry), expiry = planned end of the party
    asha.kart-otter.play.<parent>.eth    a seat, non-transferable, same expiry
games.<parent>.eth                a registry for creators        (stretch)
  chonks.games.<parent>.eth       a creator namespace            (stretch)
    kart-rush.chonks.games.<parent>.eth   a game (contenthash = bundle, text = manifest, version)
agents.<parent>.eth               a registry for agents          (bonus)
```

The party word (`kart-otter`) is generated from the room code plus a word list; the seat label is the sanitised nickname (a-z, 0-9, hyphen), de-duplicated within the party.

### 4.2 The calls (all S unless marked; use raw `viem` ABIs: library write helpers are only "preview")

1. **Parent and the user registries.** Deploy a UserRegistry and a PermissionedResolver as proxies through the **VerifiableFactory** (`deployProxy(impl, salt, initData)`, salt `keccak256("UserRegistry", namehash, 0)`); `initialize(grants[])` takes `(account, roleBitmap)` pairs and **must include `ROLE_REGISTRAR_ADMIN` and `ROLE_RENEW_ADMIN`** or later `grantRootRoles` fails. Register the parent through the **ETHRegistrar** (commit, wait at least 60 seconds, register; fee $8 a year for five or more characters, paid in USDC or DAI; **Sepolia uses an open-mint MockUSDC**), passing the pre-deployed subregistry and resolver, or link them afterwards with `setSubregistry` and `setResolver` (until linked, subnames mint but do not resolve). Registration does **not** deploy a resolver or grant text roles: an easy step to miss.
2. **Roles for the minting service.** `grantRootRoles(bitmap, relayAddress)` with `ROLE_REGISTRAR` (`1<<0`) and `ROLE_RENEW` (`1<<16`).
3. **A party.** In the `play` registry: `register(label, owner, registry, resolver, roleBitmap, expiry)` with `expiry` an absolute `uint64`, the party's own freshly deployed UserRegistry as `registry`, and the shared or per-party resolver. `renew(id, newExpiry)` extends (it cannot shorten); `unregister(id)` ends the party at once (needs `ROLE_UNREGISTER`); an expired name resolves to a zero owner and zero resolver, and when a parent expires its subnames stop resolving.
4. **A seat.** In the party registry: `register(label, owner, 0, resolver, roleBitmap = 0 or minimal, expiry)`. Leaving out `ROLE_CAN_TRANSFER_ADMIN` makes the name **non-transferable**; leaving out `ROLE_SET_RESOLVER` and `ROLE_SET_SUBREGISTRY` stops the owner re-pointing it. Per-name admin roles can only be assigned at registration; afterwards they can only be revoked.
5. **Seat records.** `PermissionedResolver.setText(bytes dnsName, key, value)`; records live in numbered bundles linked to nodes (`linkToNode`, `linkToRecord`), and the root node's record is the default for names without their own. Keys: `chonks.seat` (shape, colour), `chonks.game`, `chonks.best[...]`, `chonks.receipt`.
6. **Delegation.** Grant the host phone's **session address** roles on the party registry (`grantRoles(resource, bitmap, account)`): `ROLE_UNREGISTER` for kick; on the resolver, `grantSetterRoles(...)` scoped to a single key (for example `chonks.state`) for start and pause; `revokeRoles` removes them. **Resolver roles are not per name** (a scoped grant applies to every name that resolver serves), so **each party gets its own resolver instance**. The caller of a grant must hold the admin role for every role in the request; there are at most 15 holders per role per resource; **token ids regenerate on every role change, so key data by label hash or resource**.

### 4.3 Where the relay and the chain meet

- Real-time commands stay on the socket (a chain round trip is far too slow for "pause"). **The chain is the source of truth for who may command**: when a `host.cmd` arrives from a delegated phone, the relay checks `hasRoles(resource, role, phoneAddress)` (cached for a few seconds, re-checked after any `host.revoke`) and a signed challenge from the phone's session key. Revoke on chain and the relay stops obeying even after a restart.
- **Never block play.** Creating a registry and minting seats takes several transactions (Sepolia blocks are about 12 seconds): a party starts at once and the ENS names appear when ready ("Naming ready" balloon in the shell). If ENS or the RPC is down, the room and the nicknames work as today.
- **The phone's session key** (a keypair generated in the browser, kept in IndexedDB, holds no value): its address is the "owner" of the seat name and the delegated account; the same key serves the World and Arkiv plans (a shared `sessionKey(seat)` in [02](02-integration-architecture.md)). The sponsor wallet pays all gas.

### 4.4 No hard-coded values (how the demo must behave)

A judge should be able to change data on-chain and see the app react with no code change. So: **only the parent name and the chain are configuration**; registry and resolver addresses are **discovered at runtime** by walking `getSubregistry` and `getResolver` from the parent; the seat list and expiry come from `getState` and `getExpiry`; host permissions come from `hasRoles`; scores and receipts come from text records; the game list (stretch) comes from registry events (`LabelRegistered`, `ExpiryUpdated`, `SubregistryUpdated`, `EACRolesChanged`, resolver `TextUpdated` and `Linked`). **Never cache token ids or resolver addresses**; keep demo fixtures out of the demo path. Reads use `viem` `getEnsText`, `getEnsAddress`, `getEnsResolver`, `getEnsAvatar` with `sepolia` or `mainnet`; **minimum versions for ENSv2 resolution: viem 2.35.0, ensjs 4.2.3, ethers 6.17.0 (or the ENS ethers patch)**. Expiry, roles and ownership are not exposed by viem's ENS helpers: read them from the registries (and index events with `getLogs` or `watchContractEvent`).

### 4.5 Agents as namespaces (bonus)

CPU racers and helper bots get names under `agents.<parent>.eth` with `roleBitmap = 0` (not re-pointable). ENSIP-26 (draft) records: `agent-context` (entry point) and `agent-endpoint[mcp|a2a|web]`. ENSIP-25 links a name to a registry entry through `agent-registration[<ERC-7930 registry address>][<agentId>]` (any non-empty value verifies the claim) and needs an agent registry such as ERC-8004 whose Sepolia address is **U**. Link to the World plan: a **human-backed agent** (a verified human's autopilot "ghost") carries an ENS name whose record points at the owner's nullifier hash, never an identity ([04](04-world-plan.md)).

### 4.6 Do offchain (CCIP-Read) names count?

**I:** probably not alone. The prize names the new registry hierarchy, EAC, Permissioned Resolvers and aliasing, and requires them to be central. The Universal Resolver v2 does serve CCIP-Read, so a gateway could carry volume as a supplement, but **keep the hierarchy, expiry and roles on chain**. Ask the ENS team at the venue; no judge statement was found.

## 5. UI surfaces (Funcaster and the phone)

| Surface | Change |
| --- | --- |
| Invite window | The party's ENS name beside the room code; a copy button |
| Players window | The seat's ENS name, "valid until" from `getExpiry`, a delegated-role chip for the host phone with a **Revoke** button that sends the revoke transaction |
| Phone gate | An optional "claim your name" field (the nickname becomes the seat label) |
| Results window | A line "Played in `kart-otter.play.<parent>.eth`" and, with the stretch tier, the receipt text record |
| Settings | Partners switch; chain (Sepolia or mainnet) read-only |

## 6. Tests

Foundry or anvil fork tests against Sepolia (the ENS CLI does this); **CAN and CANNOT checks with `eth_call` for each role** (a seat cannot re-point, transfer or set text; the host phone can kick but not mint); a time-travel test that a seat stops resolving at expiry; revoke test (power removed on chain, relay refuses); an end-to-end read-back through `viem`; relay fault injection (RPC down: the room still runs); the contract test for the `Naming` capability against the mock provider.

## 7. Demo moments

1. The party's name resolves live in the shell (`asha.kart-otter.play.<parent>.eth`), with an explorer view showing the registry, the expiry and the roles.
2. The host phone kicks a player; revoke its role in the explorer and the next command is refused ("the chain says no").
3. End the party: the seat names stop resolving at once (`unregister`) or at expiry.
4. (Stretch) a creator's game resolves to its bundle hash; (bonus) an agent name with its ENSIP-26 record.

## 8. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| **Mainnet ENSv2 not live by 6 November, but the Continuity prize needs mainnet** | Chain id in config; build on Sepolia and enter Best Use; check the vote and tracker daily; decide on 6 November whether to deploy on mainnet (small real cost) |
| Contracts or addresses change (earlier Sepolia deployments did) | Never hard-code; read `docs.ens.domains/learn/deployments` on day 1; discover addresses from the parent at runtime |
| Library write support is immature | Raw `viem` ABIs from the ENS tutorials; the ENS CLI (experimental, installed from a `pkg.pr.new` URL, not on npm) as a fallback; the Manager and Explorer web UIs for debugging |
| A registry proxy per party is slow and costs gas | Create it asynchronously; a cheaper variant is one shared party registry with flat labels (`asha-kart-otter`) |
| Role mistakes (missing admin roles, token regeneration, resolver roles not per name) | One resolver per party; early grant tests; key data by label hash |
| Continuity: pre-existing versus new | Tag the baseline; **write no ENS integration code before the hackathon starts** (pre-event code counts as pre-existing); small commits from hour 0 |
| Gas numbers unknown | Measure with `estimateGas` on Sepolia on day 1 (an assumption of 100k to 300k per proxy deploy or mint is **I**) |

## 9. What to prepare 6 November (non-code)

Faucet ETH; a funded wallet and secrets in an environment file; a decision on the parent name and its availability on Sepolia (and mainnet); reading the ENSv2 docs; a clean, documented baseline commit of the console; the Foundry fork setup.

## 10. Evidence of what wins (third-party, partly unverified)

Past ENS tracks used the same language: "not just a cosmetic add-on", "ENS should clearly improve the product", "functional, no hard-coded values", "be clear about which ENS-powered feature was built during the hackathon" (Tokyo, ETHOnline, New York and Cannes 2026 pages). At Tokyo, six projects shared $10,000 across access control, DeFi, collectibles and private messaging (a repost of ENS's own post); a Continuity entry there (GoHealthMe) wrote settlement receipts to names and gave an agent a non-re-pointable name, which is the same pattern as items 6 and 7. The Mumbai page lists no judging criteria and does not mention presenting at the ENS booth (earlier events did: ask).

## Sources

ethglobal.com/events/mumbai/prizes/ens; ethglobal.com/events/mumbai/info/details; docs.ens.domains (ensv2/overview, permissioned-registry, permissioned-resolver, enhanced-access-control, verifiable-factory, universal-resolver-v2, eth-registrar, indexing, tutorial-contract-developers, tutorial-app-developers, registry-hierarchy, learn/deployments, web/ensv2-readiness, ensip/25, ensip/26, building-with-ai); github.com/ensdomains/ens-cli; the ENSv2 rollout tracker on discuss.ens.domains (topic 22507); ens.domains/blog/post/ensv2-beta-public-testing; ETHGlobal Tokyo, ETHOnline, New York and Cannes 2026 ENS prize pages; github.com/Meowteam6/gohealthme-tokyo.
