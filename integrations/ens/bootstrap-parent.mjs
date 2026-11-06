import {
  encodeFunctionData,
  keccak256,
  stringToHex,
  zeroAddress,
  parseAbi,
} from "viem";
import { checkedParent, labelId } from "./names.mjs";
import { request } from "./lifecycle-calls.mjs";
import { requireEns } from "./errors.mjs";
import { createHierarchyReader } from "./hierarchy.mjs";
import { digest } from "../shared/outbox.mjs";
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();
const linkAbi = parseAbi([
  "function setSubregistry(uint256 anyId,address registry)",
]);
export const bootstrapTransactionId = (parent, stage) =>
  `record:${digest(`ens-bootstrap:${parent}`)}:bootstrap:${stage}`;
export async function bootstrapParent({
  client,
  protocol,
  parent,
  owner,
  transact,
  hierarchy,
}) {
  parent = checkedParent(parent);
  const label = parent.split(".")[0],
    eth = protocol.contracts.ethRegistry,
    factory = protocol.contracts.factory;
  requireEns(
    (await client.getChainId()) === 11155111,
    "WRONG_CHAIN",
    "Bootstrap is Sepolia-only",
  );
  const read = (kind, target, fn, args = []) =>
    client.readContract(request(kind, target, fn, args));
  const state = await read("registry", eth, "getState", [labelId(label)]),
    head = await client.getBlock();
  requireEns(
    state.status === 2 &&
      state.expiry > head.timestamp + 86400n &&
      same(state.latestOwner, owner),
    "PARENT_NOT_READY",
    "Register the selected parent to this registrar first",
  );
  const proxies = [];
  for (const [name, kind, implementation, roles] of [
    [
      parent,
      "registry",
      protocol.contracts.userRegistryImpl,
      protocol.registryRoles,
    ],
    [
      `play.${parent}`,
      "registry",
      protocol.contracts.userRegistryImpl,
      protocol.registryRoles,
    ],
    [
      `play.${parent}:resolver`,
      "resolver",
      protocol.contracts.resolverImpl,
      protocol.resolverRoles,
    ],
  ]) {
    const salt = BigInt(keccak256(stringToHex(`chonks:bootstrap:v1:${name}`)));
    const target = await read("factory", factory, "predictProxyAddress", [
      owner,
      salt,
    ]);
    const grants = [{ account: owner, roleBitmap: roles }];
    const init = encodeFunctionData(
      request(
        kind,
        target,
        "initialize",
        kind === "registry" ? [grants] : [grants, []],
      ),
    );
    proxies.push({
      name,
      kind,
      implementation,
      roles,
      address: target,
      call: request(
        "factory",
        factory,
        "deployProxy",
        [implementation, salt, init],
        owner,
      ),
    });
  }
  const [root, play, resolver] = proxies;
  const linked = await read("registry", eth, "getSubregistry", [label]);
  requireEns(
    same(linked, zeroAddress) || same(linked, root.address),
    "EXISTING_NAMESPACE_CONFLICT",
    "Parent already points to a different registry; refusing overwrite",
  );
  const operations = [],
    receipts = [];
  const run = async (id, call) => {
    operations.push({
      id,
      from: owner,
      to: call.address,
      data: encodeFunctionData(call),
      value: "0",
    });
    if (transact)
      receipts.push(
        await transact(bootstrapTransactionId(parent, id), {
          ...call,
          account: owner,
        }),
      );
  };
  const deployed = async (target) => {
    const code = await client.getCode({ address: target });
    return code && code !== "0x";
  };
  for (const p of proxies) {
    if (await deployed(p.address)) {
      requireEns(
        same(
          await read("factory", factory, "verifyContract", [p.address]),
          p.implementation,
        ) && (await read(p.kind, p.address, "hasRootRoles", [p.roles, owner])),
        "UNTRUSTED_NAMESPACE",
        "Existing proxy implementation or registrar roles differ",
      );
    } else await run(`deploy:${p.name}`, p.call);
  }
  for (const [p, parentAddress, childLabel] of [
    [root, eth, label],
    [play, root.address, "play"],
  ]) {
    const current = (await deployed(p.address))
      ? await read("registry", p.address, "getParent")
      : [zeroAddress, ""];
    requireEns(
      same(current[0], zeroAddress) ||
        (same(current[0], parentAddress) && current[1] === childLabel),
      "EXISTING_NAMESPACE_CONFLICT",
      "Registry canonical parent differs",
    );
    if (same(current[0], zeroAddress))
      await run(
        `parent:${childLabel}`,
        request("registry", p.address, "setParent", [
          parentAddress,
          childLabel,
        ]),
      );
  }
  if (same(linked, zeroAddress))
    await run("link-parent", {
      address: eth,
      abi: linkAbi,
      functionName: "setSubregistry",
      args: [state.tokenId, root.address],
    });
  const currentPlay = (await deployed(root.address))
    ? await read("registry", root.address, "getState", [labelId("play")])
    : null;
  if (currentPlay?.status === 2 && currentPlay.expiry > head.timestamp) {
    requireEns(
      same(currentPlay.latestOwner, owner) &&
        currentPlay.expiry === state.expiry &&
        same(
          await read("registry", root.address, "getSubregistry", ["play"]),
          play.address,
        ) &&
        same(
          await read("registry", root.address, "getResolver", ["play"]),
          resolver.address,
        ),
      "EXISTING_NAMESPACE_CONFLICT",
      "Existing play namespace differs",
    );
  } else
    await run(
      "register-play",
      request("registry", root.address, "register", [
        "play",
        owner,
        play.address,
        resolver.address,
        protocol.registryRoles,
        state.expiry,
      ]),
    );
  let proof;
  if (transact) {
    hierarchy ||= createHierarchyReader({ client, protocol, parent });
    proof = await hierarchy.walk(`play.${parent}`, {
      expectedOwner: owner,
      requireResolver: true,
    });
  }
  return {
    parent,
    owner,
    expiry: String(state.expiry),
    status: transact ? "ready" : "unsigned-plan",
    parentRegistry: root.address,
    playRegistry: play.address,
    resolver: resolver.address,
    operations,
    receipts,
    ...(proof
      ? { blockNumber: String(proof.blockNumber), blockHash: proof.blockHash }
      : {}),
  };
}
