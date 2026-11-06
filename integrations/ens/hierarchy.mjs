import { zeroAddress } from "viem";
import abi from "./abi.json" with { type: "json" };
import { EnsError, requireEns } from "./errors.mjs";
import { checkedName, checkedParent, dnsName, labelId } from "./names.mjs";

const same = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.toLowerCase() === b.toLowerCase();
const nonzero = (a) => /^0x[\da-fA-F]{40}$/.test(a) && !same(a, zeroAddress);

// One immutable block per walk: never combine owner/expiry/parent links from
// different heads. No token IDs or resolver addresses are cached across walks.
export function createHierarchyReader({
  client,
  protocol,
  parent,
  now = () => Date.now(),
  maxBlockAgeS = 30,
}) {
  parent = checkedParent(parent);
  requireEns(
    protocol.chainId === 11155111,
    "WRONG_CHAIN",
    "ENS reader supports Sepolia only",
  );
  requireEns(
    Number.isFinite(maxBlockAgeS) && maxBlockAgeS > 0 && maxBlockAgeS <= 30,
    "INVALID_CONFIG",
    "ENS freshness limit must be at most 30 seconds",
  );
  const contracts = protocol.contracts;
  for (const key of [
    "rootRegistry",
    "ethRegistry",
    "factory",
    "userRegistryImpl",
    "resolverImpl",
    "universalHelper",
  ])
    requireEns(
      nonzero(contracts[key]),
      "INVALID_CONFIG",
      `Missing ENS protocol address: ${key}`,
    );

  async function walk(
    value,
    { expectedOwner, requireResolver = false, blockNumber } = {},
  ) {
    const name = checkedName(value);
    requireEns(
      name === parent || name.endsWith(`.${parent}`),
      "OUTSIDE_NAMESPACE",
      "Name is outside ENS_PARENT",
    );
    requireEns(
      name.split(".").length <= 5,
      "INVALID_NAME",
      "Name is deeper than the Funcaster namespace",
    );
    requireEns(
      (await client.getChainId()) === protocol.chainId,
      "WRONG_CHAIN",
      "ENS RPC returned a different chain",
    );
    requireEns(
      blockNumber === undefined ||
        (typeof blockNumber === "bigint" && blockNumber >= 0n),
      "INVALID_BLOCK",
      "Invalid snapshot block",
    );
    const block = await client.getBlock(
      blockNumber === undefined ? { blockTag: "latest" } : { blockNumber },
    );
    const age = now() / 1000 - Number(block.timestamp);
    requireEns(
      age >= -5 && age <= maxBlockAgeS,
      "STALE_CHAIN",
      "ENS RPC head is not fresh",
    );
    requireEns(
      typeof block.number === "bigint" && /^0x[\da-fA-F]{64}$/.test(block.hash),
      "INVALID_BLOCK",
      "ENS RPC returned an incomplete block",
    );
    const read = (kind, address, functionName, args = []) =>
      client.readContract({
        address,
        abi: abi[kind],
        functionName,
        args,
        blockNumber: block.number,
      });
    const code = async (address) => {
      requireEns(
        nonzero(address),
        "MISSING_CONTRACT",
        "ENS contract address is absent",
      );
      const value = await client.getCode({
        address,
        blockNumber: block.number,
      });
      requireEns(
        value && value !== "0x",
        "MISSING_CONTRACT",
        "ENS contract has no code",
      );
    };
    for (const key of [
      "rootRegistry",
      "ethRegistry",
      "factory",
      "universalHelper",
    ])
      await code(contracts[key]);
    requireEns(
      same(
        await read("registry", contracts.rootRegistry, "getSubregistry", [
          "eth",
        ]),
        contracts.ethRegistry,
      ),
      "DEPLOYMENT_DRIFT",
      "Root no longer points to the configured ETH registry",
    );
    requireEns(
      same(
        await read("helper", contracts.universalHelper, "ROOT_REGISTRY"),
        contracts.rootRegistry,
      ),
      "DEPLOYMENT_DRIFT",
      "Universal Helper root differs from the configured root",
    );
    requireEns(
      same(
        await read("helper", contracts.universalHelper, "findCanonicalName", [
          contracts.ethRegistry,
        ]),
        dnsName("eth"),
      ),
      "NONCANONICAL",
      "ETH registry is not canonical",
    );

    let registry = contracts.ethRegistry;
    let suffix = "eth";
    let expiresAt = (1n << 64n) - 1n;
    const nodes = [];
    const labels = name.split(".").slice(0, -1).reverse();
    for (let index = 0; index < labels.length; index++) {
      const label = labels[index];
      const fullName = `${label}.${suffix}`;
      const state = await read("registry", registry, "getState", [
        labelId(label),
      ]);
      // Registered status comes from the pinned contract's enum. latestOwner
      // persists after expiry; it alone is not evidence of a live registration.
      requireEns(
        state.status === protocol.registeredStatus &&
          nonzero(state.latestOwner),
        "NOT_REGISTERED",
        "ENS name is not registered",
      );
      requireEns(
        state.expiry > block.timestamp,
        "EXPIRED",
        "ENS name has expired",
      );
      expiresAt = state.expiry < expiresAt ? state.expiry : expiresAt;
      if (index === 0 && expectedOwner)
        requireEns(
          same(state.latestOwner, expectedOwner),
          "OWNER_MISMATCH",
          "ENS parent owner differs from the configured registrar",
        );
      const child = await read("registry", registry, "getSubregistry", [label]);
      const resolver = await read("registry", registry, "getResolver", [label]);
      // Even a genuine proxy is rejected if its canonical parent/name differs.
      if (nonzero(child)) {
        await code(child);
        requireEns(
          same(
            await read("factory", contracts.factory, "verifyContract", [child]),
            contracts.userRegistryImpl,
          ),
          "UNTRUSTED_REGISTRY",
          "Subregistry implementation is not the pinned UserRegistry",
        );
        const [actualParent, actualLabel] = await read(
          "registry",
          child,
          "getParent",
        );
        requireEns(
          same(actualParent, registry) && actualLabel === label,
          "NONCANONICAL",
          "Subregistry parent link does not match the namespace",
        );
        requireEns(
          same(
            await read(
              "helper",
              contracts.universalHelper,
              "findCanonicalName",
              [child],
            ),
            dnsName(fullName),
          ),
          "NONCANONICAL",
          "Subregistry canonical name does not match",
        );
      } else
        requireEns(
          index === labels.length - 1,
          "MISSING_REGISTRY",
          "ENS subtree is not registered",
        );
      if (nonzero(resolver)) {
        await code(resolver);
        requireEns(
          same(
            await read("factory", contracts.factory, "verifyContract", [
              resolver,
            ]),
            contracts.resolverImpl,
          ),
          "UNTRUSTED_RESOLVER",
          "Resolver implementation is not the pinned PermissionedResolver",
        );
      }
      nodes.push({
        name: fullName,
        label,
        registry,
        subregistry: child,
        resolver,
        owner: state.latestOwner,
        expiresAt: state.expiry,
        resource: state.resource,
      });
      registry = child;
      suffix = fullName;
    }
    const leaf = nodes.at(-1);
    if (requireResolver)
      requireEns(
        nonzero(leaf.resolver),
        "MISSING_RESOLVER",
        "This Funcaster name needs an explicit resolver",
      );
    // Detect a reorg during the walk rather than returning a mixed proof.
    const canonical = await client.getBlock({ blockNumber: block.number });
    requireEns(
      same(canonical.hash, block.hash),
      "REORG",
      "ENS block changed during discovery",
    );
    requireEns(
      now() / 1000 - Number(block.timestamp) <= maxBlockAgeS,
      "STALE_CHAIN",
      "ENS discovery exceeded the freshness window",
    );
    return {
      name,
      parent,
      chainId: protocol.chainId,
      blockNumber: block.number,
      blockHash: block.hash,
      chainTime: block.timestamp,
      expiresAt,
      nodes,
      leaf,
    };
  }

  async function check(value, options) {
    try {
      return { outcome: "allowed", proof: await walk(value, options) };
    } catch (error) {
      // Only deterministic namespace/permission failures are denials. Unknown
      // RPC errors stay unavailable and cannot mint an on-chain authority badge.
      const unavailable =
        !(error instanceof EnsError) ||
        ["STALE_CHAIN", "REORG", "INVALID_BLOCK"].includes(error.code);
      return {
        outcome: unavailable ? "unavailable" : "denied",
        code: error.code || "RPC_UNAVAILABLE",
      };
    }
  }
  return Object.freeze({ walk, check });
}
