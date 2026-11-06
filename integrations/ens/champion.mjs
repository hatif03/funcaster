import path from "node:path";
import { mkdir } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import {
  encodeFunctionData,
  keccak256,
  stringToHex,
  parseAbi,
  zeroAddress,
} from "viem";
import { createHierarchyReader } from "./hierarchy.mjs";
import { checkedParent, labelId } from "./names.mjs";
import {
  request,
  addressCall,
  textCalls,
  readRecord,
} from "./lifecycle-calls.mjs";
import { EnsError, requireEns } from "./errors.mjs";
import { atomicJson, readJson, digest } from "../shared/outbox.mjs";
import { acquireWorkerLock } from "../shared/worker.mjs";
import { hash } from "../../server/records.cjs";
import { sanitizeName } from "../../server/web3/names.cjs";

export const CHAMPION_YEAR = 31536000n;
const extraRolesAbi = parseAbi([
  "function roleCount(uint256 resource) view returns (uint256)",
  "function roles(uint256 resource,address account) view returns (uint256)",
  "function revokeRootRoles(uint256 roleBitmap,address account) returns (bool)",
]);
const same = (a, b) =>
  typeof a === "string" && a.toLowerCase() === b?.toLowerCase();
const address = (value) =>
  /^0x[\da-f]{40}$/i.test(value) && !same(value, zeroAddress);
const available = (state, time) =>
  state.status === 0 || (state.status === 2 && state.expiry <= time);
const countMask = (roles) =>
  roles | (roles << 1n) | (roles << 2n) | (roles << 3n);

// Constants come from the pinned SDK, not duplicated bit positions.
export async function loadChampionRoles() {
  const { encodeRoleBitmap: registry, encodeResolverRoleBitmap: resolver } =
    await import("@ensdomains/ensjs/utils/v2");
  return {
    registrar: registry(["ROLE_REGISTRAR"]),
    namespace: registry(["ROLE_REGISTRAR", "ROLE_REGISTRAR_ADMIN"]),
    parentSetup: registry(["ROLE_SET_PARENT", "ROLE_SET_PARENT_ADMIN"]),
    forbidden: registry([
      "ROLE_UNREGISTER",
      "ROLE_UNREGISTER_ADMIN",
      "ROLE_UPGRADE",
      "ROLE_UPGRADE_ADMIN",
    ]),
    owner: registry([
      "ROLE_CAN_TRANSFER_ADMIN",
      "ROLE_RENEW",
      "ROLE_RENEW_ADMIN",
      "ROLE_SET_RESOLVER",
      "ROLE_SET_RESOLVER_ADMIN",
    ]),
    resolver: resolver([
      "ROLE_SET_ADDRESS",
      "ROLE_SET_ADDRESS_ADMIN",
      "ROLE_SET_TEXT",
      "ROLE_SET_TEXT_ADMIN",
    ]),
  };
}

export async function createChampionReader({
  client,
  protocol,
  config,
  hierarchy,
  loadRoles = loadChampionRoles,
  now = Date.now,
}) {
  const parent = checkedParent(config.ENS_PARENT),
    registrar = config.ENS_REGISTRAR_ADDRESS;
  requireEns(
    address(registrar),
    "INVALID_CONFIG",
    "Champion issuance needs a public registrar address",
  );
  // Like the hierarchy/client ports, offline fixtures inject a role loader.
  // Production still requires the pinned SDK; there is no fallback bitmap.
  const roles = await loadRoles();
  requireEns(
    [
      "registrar",
      "namespace",
      "parentSetup",
      "forbidden",
      "owner",
      "resolver",
    ].every((key) => typeof roles?.[key] === "bigint" && roles[key] > 0n),
    "INVALID_CONFIG",
    "Champion roles must be supplied by the pinned SDK or an explicit test port",
  );
  hierarchy ||= createHierarchyReader({ client, protocol, parent, now });
  async function canonical(proof) {
    const block = await client.getBlock({ blockNumber: proof.blockNumber });
    requireEns(
      same(block.hash, proof.blockHash),
      "REORG",
      "Champion namespace changed block",
    );
    requireEns(
      now() / 1000 - Number(proof.chainTime) <= 30,
      "STALE_CHAIN",
      "Champion namespace read is no longer fresh",
    );
  }
  const read = (target, fn, args, proof) =>
    client.readContract({
      address: target,
      abi: extraRolesAbi,
      functionName: fn,
      args,
      blockNumber: proof.blockNumber,
    });
  async function namespace({ minimumLifetime = CHAMPION_YEAR } = {}) {
    let proof;
    try {
      proof = await hierarchy.walk(`players.${parent}`, {
        expectedOwner: registrar,
      });
    } catch (error) {
      if (["NOT_REGISTERED", "MISSING_REGISTRY"].includes(error.code))
        requireEns(
          false,
          "CHAMPION_NAMESPACE_REQUIRED",
          "The canonical players namespace must be prepared by its owner before Champion issuance",
        );
      throw error;
    }
    requireEns(
      same(proof.leaf.owner, registrar) && address(proof.leaf.subregistry),
      "CHAMPION_NAMESPACE_OWNER",
      "Unexpected players namespace owner or registry",
    );
    requireEns(
      proof.expiresAt >= proof.chainTime + minimumLifetime,
      "CHAMPION_PARENT_RENEWAL_REQUIRED",
      "The parent and players names must remain valid for a full year before minting a one-year Champion name",
    );
    const registry = proof.leaf.subregistry;
    const [registrarRoles, rootCount] = await Promise.all([
      read(registry, "roles", [0n, registrar], proof),
      read(registry, "roleCount", [0n], proof),
    ]);
    requireEns(
      (registrarRoles & roles.registrar) === roles.registrar,
      "CHAMPION_REGISTRAR_REQUIRED",
      "Champion registrar role is missing",
    );
    requireEns(
      (rootCount & countMask(roles.forbidden)) === 0n,
      "CHAMPION_NAMESPACE_UNSAFE",
      "Players registry retains root unregister or upgrade authority; Champion names would remain revocable",
    );
    await canonical(proof);
    return { ...proof, registry, roles };
  }
  async function preflight() {
    try {
      const proof = await namespace();
      return {
        check: "ENS_CHAMPION_NAMESPACE",
        ready: true,
        name: proof.name,
        registry: proof.registry,
        blockNumber: String(proof.blockNumber),
        blockHash: proof.blockHash,
        expiresAt: String(proof.expiresAt),
        parentRevocation:
          "No root unregister/admin or upgrade authority in the players registry; ancestor expiry and ownership still apply.",
      };
    } catch (error) {
      return {
        check: "ENS_CHAMPION_NAMESPACE",
        ready: false,
        code: error instanceof EnsError ? error.code : "RPC_UNAVAILABLE",
        message:
          error instanceof EnsError
            ? error.message
            : "ENS namespace read unavailable; no transaction was prepared or sent.",
      };
    }
  }
  async function prepareNamespace() {
    const proof = await hierarchy.walk(parent, { expectedOwner: registrar });
    requireEns(
      address(proof.leaf.subregistry),
      "CHAMPION_PARENT_REGISTRY_REQUIRED",
      "Prepare the canonical parent registry first",
    );
    requireEns(
      proof.expiresAt >= proof.chainTime + CHAMPION_YEAR,
      "CHAMPION_PARENT_RENEWAL_REQUIRED",
      "Renew the parent beyond one year before preparing players",
    );
    const current = await client.readContract({
      ...request("registry", proof.leaf.subregistry, "getState", [
        labelId("players"),
      ]),
      blockNumber: proof.blockNumber,
    });
    requireEns(
      available(current, proof.chainTime),
      "CHAMPION_NAMESPACE_EXISTS",
      "Players already exists. Inspect its named preflight; this helper never replaces an existing namespace",
    );
    const salt = BigInt(
      keccak256(
        stringToHex(
          `chonks:champion:players:v1:${parent}:${registrar.toLowerCase()}`,
        ),
      ),
    );
    const registry = await client.readContract({
      ...request("factory", protocol.contracts.factory, "predictProxyAddress", [
        registrar,
        salt,
      ]),
      blockNumber: proof.blockNumber,
    });
    const init = encodeFunctionData(
      request("registry", registry, "initialize", [
        [
          {
            account: registrar,
            roleBitmap: roles.namespace | roles.parentSetup,
          },
        ],
      ]),
    );
    const requests = [
      request(
        "factory",
        protocol.contracts.factory,
        "deployProxy",
        [protocol.contracts.userRegistryImpl, salt, init],
        registrar,
      ),
      request(
        "registry",
        registry,
        "setParent",
        [proof.leaf.subregistry, "players"],
        registrar,
      ),
      {
        address: registry,
        abi: extraRolesAbi,
        functionName: "revokeRootRoles",
        args: [roles.parentSetup, registrar],
        account: registrar,
      },
      request(
        "registry",
        proof.leaf.subregistry,
        "register",
        ["players", registrar, registry, zeroAddress, 0n, proof.expiresAt],
        registrar,
      ),
    ];
    await canonical(proof);
    return {
      check: "ENS_CHAMPION_NAMESPACE_PREPARATION",
      requiresOwnerExecution: true,
      noAutomaticSubmission: true,
      name: `players.${parent}`,
      registry,
      chainId: protocol.chainId,
      blockNumber: String(proof.blockNumber),
      transactions: requests.map((call, index) => ({
        id: `champion-namespace:${index + 1}`,
        description: [
          "Deploy a restricted players registry",
          "Set its canonical parent link",
          "Remove parent-link mutation authority",
          "Register players under the parent",
        ][index],
        from: registrar,
        to: call.address,
        value: "0",
        data: encodeFunctionData(call),
      })),
      warning:
        "Unsigned ordered preparation only. The owner must review fees and reconcile each step before executing; do not blindly resend after an uncertain response. Re-run ENS_CHAMPION_NAMESPACE afterward.",
    };
  }
  return {
    preflight,
    namespace,
    prepareNamespace,
    canonical,
    roles,
    parent,
    registrar,
    hierarchy,
  };
}

// Worker-only adapter. The injected existing transaction port owns budgets,
// signing, durable send reconciliation and kill checks. No keys are loaded here.
export async function createChampionAdapter({
  dir,
  client,
  protocol,
  config,
  transact,
  verifyEligibility,
  hierarchy,
  loadRoles = loadChampionRoles,
  now = Date.now,
}) {
  const reader = await createChampionReader({
    client,
    protocol,
    config,
    hierarchy,
    loadRoles,
    now,
  });
  requireEns(
    typeof transact === "function" && typeof verifyEligibility === "function",
    "INVALID_CONFIG",
    "Champion claims need a reconciled transaction port and trusted completed-result lookup",
  );
  const { parent, registrar, roles } = reader,
    folder = path.join(dir, "ens", "champions"),
    file = path.join(folder, "state.json");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const unlock = await acquireWorkerLock(folder);
  const context = {
    parent,
    registrar: registrar.toLowerCase(),
    chainId: protocol.chainId,
  };
  let state,
    tail = Promise.resolve(),
    closed = false;
  try {
    state = (await readJson(file)) || {
      version: 1,
      context,
      claims: {},
      owners: {},
    };
    requireEns(
      state.version === 1 && isDeepStrictEqual(state.context, context),
      "STATE_CONFLICT",
      "Champion journal belongs to a different namespace",
    );
    await atomicJson(file, state);
  } catch (error) {
    await unlock();
    throw error;
  }
  const save = () => atomicJson(file, state);
  const read = (kind, target, fn, args = [], at = {}) =>
    client.readContract({ ...request(kind, target, fn, args), ...at });
  const extra = (target, fn, args, at = {}) =>
    client.readContract({
      address: target,
      abi: extraRolesAbi,
      functionName: fn,
      args,
      ...at,
    });
  const send = async (claim, stage, call) => {
    const outcome = await transact(
      `record:${digest(`champion:${parent}:${claim.address}`)}:champion:${claim.key}:${stage}`,
      {
        ...call,
        account: registrar,
      },
    );
    requireEns(
      /^0x[\da-f]{64}$/i.test(outcome?.tx),
      "INVALID_RECEIPT",
      "Champion transaction port did not return a public receipt reference",
    );
    claim.transactions[stage] = outcome.tx;
    await save();
    return outcome;
  };
  async function verifyOwned(claim) {
    const proof = await reader.hierarchy.walk(claim.name, {
      expectedOwner: registrar,
      requireResolver: true,
    });
    requireEns(
      same(proof.leaf.owner, claim.address) &&
        same(proof.leaf.resolver, claim.resolver) &&
        same(proof.leaf.registry, claim.registry) &&
        proof.leaf.expiresAt >= BigInt(claim.expiresAt),
      "CHAMPION_OWNERSHIP_CHANGED",
      "Champion owner, expiry or resolver changed; never silently re-mint",
    );
    requireEns(
      !claim.resource || String(proof.leaf.resource) === claim.resource,
      "CHAMPION_GENERATION_CHANGED",
      "Champion registration generation changed",
    );
    const at = { blockNumber: proof.blockNumber };
    const [phoneRoles, issuerRoles, counts] = await Promise.all([
      read(
        "registry",
        claim.registry,
        "roles",
        [labelId(claim.handle), claim.address],
        at,
      ),
      read(
        "registry",
        claim.registry,
        "roles",
        [labelId(claim.handle), registrar],
        at,
      ),
      extra(claim.registry, "roleCount", [proof.leaf.resource], at),
    ]);
    requireEns(
      (phoneRoles & roles.owner) === roles.owner &&
        (issuerRoles & roles.forbidden) === 0n &&
        (counts & countMask(roles.forbidden)) === 0n,
      "CHAMPION_ROLES_CHANGED",
      "Champion must be transferable, renewable by its phone owner, and without unregister authority",
    );
    const [addr, kind, receipt, operatorResolverRoles] = await Promise.all([
      readRecord(client, claim.resolver, claim.name, undefined, at),
      readRecord(client, claim.resolver, claim.name, "chonks.kind", at),
      readRecord(client, claim.resolver, claim.name, "chonks.receipt", at),
      extra(claim.resolver, "roles", [0n, registrar], at),
    ]);
    requireEns(
      same(addr, claim.address) &&
        kind === "champion" &&
        receipt === claim.resultHash &&
        operatorResolverRoles === 0n,
      "CHAMPION_RECORDS_CHANGED",
      "Champion proof records or resolver custody differ",
    );
    await reader.canonical(proof);
    return {
      name: claim.name,
      handle: claim.handle,
      address: claim.address,
      registry: claim.registry,
      resolver: claim.resolver,
      expiresAt: String(proof.leaf.expiresAt),
      effectiveExpiresAt: String(proof.expiresAt),
      resource: String(proof.leaf.resource),
      status: "ready",
      mode: "on",
      chainVerified: false,
      resultHash: claim.resultHash,
      tx: claim.transactions.register,
      transactions: { ...claim.transactions },
      blockNumber: String(proof.blockNumber),
      blockHash: proof.blockHash,
    };
  }
  async function issue(input) {
    requireEns(
      input &&
        /^[a-zA-Z0-9:_-]{1,160}$/.test(input.id) &&
        address(input.address) &&
        /^[a-f0-9]{64}$/.test(input.resultHash),
      "INVALID_JOB",
      "Invalid Champion claim identity or result hash",
    );
    requireEns(
      !same(input.address, registrar),
      "INVALID_JOB",
      "Champion ownership must use a separate phone key",
    );
    const handle = input.handle;
    requireEns(
      typeof handle === "string" &&
        /^[a-z][a-z0-9-]{2,19}$/.test(handle) &&
        sanitizeName(handle) === handle,
      "INVALID_NAME",
      "Choose an ASCII handle without reserved labels or lookalike characters",
    );
    requireEns(
      input.recoveryAcknowledged === true,
      "CHAMPION_RECOVERY_REQUIRED",
      "Link or export this phone's key before minting a persistent name",
    );
    const proof = await verifyEligibility({
      address: input.address,
      resultHash: input.resultHash,
    });
    const result = proof?.result,
      { hash: resultHash, ...unsigned } = result || {};
    requireEns(
      result?.status === "completed" &&
        result.verification === "verified" &&
        resultHash === input.resultHash &&
        hash(unsigned) === resultHash &&
        Array.isArray(proof.addresses) &&
        proof.addresses.some((a) => same(a, input.address)),
      "CHAMPION_NOT_EARNED",
      "A canonical completed, verified match tied to this phone is required",
    );
    const key = digest(input.id),
      fingerprint = hash({
        address: input.address.toLowerCase(),
        handle,
        resultHash: input.resultHash,
      });
    let claim = state.claims[key];
    requireEns(
      !claim || claim.fingerprint === fingerprint,
      "STATE_CONFLICT",
      "Champion claim changed after admission",
    );
    requireEns(
      !state.owners[input.address.toLowerCase()] ||
        state.owners[input.address.toLowerCase()] === key,
      "CHAMPION_ALREADY_CLAIMED",
      "This phone already has an admitted Champion handle",
    );
    if (claim?.status === "ready") {
      await reader.namespace({ minimumLifetime: 0n });
      return verifyOwned(claim);
    }
    const namespace = await reader.namespace();
    const current = await read(
      "registry",
      namespace.registry,
      "getState",
      [labelId(handle)],
      { blockNumber: namespace.blockNumber },
    );
    if (!claim) {
      if (!available(current, namespace.chainTime)) {
        const error = Object.assign(
          Error(
            `That handle is taken. Try ${handle.slice(0, 15).replace(/-$/, "")}-${input.address.slice(-4).toLowerCase()}.`,
          ),
          { code: "CHAMPION_NAME_TAKEN" },
        );
        throw error;
      }
      const salt = BigInt(
        keccak256(
          stringToHex(
            `chonks:champion:resolver:v1:${parent}:${key}:${fingerprint}`,
          ),
        ),
      );
      const resolver = await read(
        "factory",
        protocol.contracts.factory,
        "predictProxyAddress",
        [registrar, salt],
      );
      claim = {
        key,
        fingerprint,
        handle,
        name: `${handle}.players.${parent}`,
        address: input.address.toLowerCase(),
        resultHash: input.resultHash,
        registry: namespace.registry,
        resolver,
        salt: String(salt),
        transactions: {},
        status: "preparing",
      };
      state.claims[key] = claim;
      state.owners[claim.address] = key;
      await save();
    }
    requireEns(
      same(namespace.registry, claim.registry),
      "STATE_CONFLICT",
      "Players registry changed after admission",
    );
    if (claim.expiresAt && !available(current, namespace.chainTime)) {
      await verifyOwned(claim);
      if (!claim.transactions.register)
        await send(
          claim,
          "register",
          request("registry", claim.registry, "register", [
            claim.handle,
            claim.address,
            zeroAddress,
            claim.resolver,
            roles.owner,
            BigInt(claim.expiresAt),
          ]),
        );
      const owned = await verifyOwned(claim);
      claim.resource = owned.resource;
      claim.status = "ready";
      await save();
      return owned;
    }
    requireEns(
      available(current, namespace.chainTime),
      "CHAMPION_NAME_TAKEN",
      "Handle was taken before mint; no replacement is sent",
    );
    if (
      !(await client.getCode({ address: claim.resolver }))?.replace(/^0x$/, "")
    ) {
      const init = encodeFunctionData(
        request("resolver", claim.resolver, "initialize", [
          [
            { account: registrar, roleBitmap: roles.resolver },
            { account: claim.address, roleBitmap: roles.resolver },
          ],
          [],
        ]),
      );
      await send(
        claim,
        "resolver",
        request("factory", protocol.contracts.factory, "deployProxy", [
          protocol.contracts.resolverImpl,
          BigInt(claim.salt),
          init,
        ]),
      );
    }
    requireEns(
      same(
        await read("factory", protocol.contracts.factory, "verifyContract", [
          claim.resolver,
        ]),
        protocol.contracts.resolverImpl,
      ),
      "UNTRUSTED_RESOLVER",
      "Champion resolver is not the pinned implementation",
    );
    requireEns(
      await read("resolver", claim.resolver, "hasRootRoles", [
        roles.resolver,
        claim.address,
      ]),
      "CHAMPION_RESOLVER_OWNER",
      "Phone does not own its resolver permissions",
    );
    const issuerResolverRoles = await extra(claim.resolver, "roles", [
      0n,
      registrar,
    ]);
    if (issuerResolverRoles !== 0n) {
      requireEns(
        issuerResolverRoles === roles.resolver,
        "CHAMPION_RESOLVER_ROLES",
        "Unexpected issuer resolver authority",
      );
      await send(
        claim,
        "records",
        request("resolver", claim.resolver, "multicall", [
          [
            addressCall(claim.name, claim.address),
            ...textCalls(claim.name, {
              "chonks.kind": "champion",
              "chonks.receipt": claim.resultHash,
              "chonks.proof": `local-result:sha256:${claim.resultHash}`,
              "chonks.season": "verified-match",
            }),
          ],
        ]),
      );
      await send(claim, "handoff", {
        address: claim.resolver,
        abi: extraRolesAbi,
        functionName: "revokeRootRoles",
        args: [roles.resolver, registrar],
      });
    }
    requireEns(
      (await extra(claim.resolver, "roles", [0n, registrar])) === 0n,
      "CHAMPION_RESOLVER_HANDOFF",
      "Registrar still retains resolver permissions",
    );
    requireEns(
      same(
        await readRecord(client, claim.resolver, claim.name),
        claim.address,
      ) &&
        (await readRecord(
          client,
          claim.resolver,
          claim.name,
          "chonks.receipt",
        )) === claim.resultHash,
      "CHAMPION_RECORDS_CHANGED",
      "Champion records did not read back before registration",
    );
    const fresh = await reader.namespace();
    requireEns(
      same(fresh.registry, claim.registry),
      "STATE_CONFLICT",
      "Players registry changed before registration",
    );
    if (!claim.expiresAt) {
      claim.expiresAt = String(fresh.chainTime + CHAMPION_YEAR);
      await save();
    }
    requireEns(
      BigInt(claim.expiresAt) > fresh.chainTime &&
        BigInt(claim.expiresAt) <= fresh.expiresAt,
      "CHAMPION_EXPIRY_CHANGED",
      "Admitted expiry no longer fits the namespace",
    );
    await send(
      claim,
      "register",
      request("registry", claim.registry, "register", [
        claim.handle,
        claim.address,
        zeroAddress,
        claim.resolver,
        roles.owner,
        BigInt(claim.expiresAt),
      ]),
    );
    const owned = await verifyOwned(claim);
    claim.resource = owned.resource;
    claim.status = "ready";
    await save();
    return owned;
  }
  return {
    preflight: reader.preflight,
    prepareNamespace: reader.prepareNamespace,
    claim(input) {
      requireEns(!closed, "CLOSED", "Champion adapter is closed");
      const next = tail.then(() => issue(input));
      tail = next.catch(() => {});
      return next;
    },
    async lookup(id) {
      await tail;
      const claim = state.claims[digest(id)];
      if (claim?.status !== "ready") return null;
      await reader.namespace({ minimumLifetime: 0n });
      return verifyOwned(claim);
    },
    async close() {
      closed = true;
      await tail;
      await unlock();
    },
  };
}
