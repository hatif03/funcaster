import assert from "node:assert/strict";
import {
  encodeFunctionData,
  decodeFunctionData,
  encodeFunctionResult,
  keccak256,
  stringToHex,
  zeroAddress,
} from "viem";
import abi from "../../../integrations/ens/lifecycle-abi.json" with { type: "json" };
import { resolverReads } from "../../../integrations/ens/lifecycle-calls.mjs";
import { labelId } from "../../../integrations/ens/names.mjs";

export const address = (n) => `0x${n.toString(16).padStart(40, "0")}`;
export function chainFixture() {
  const owner = address(1),
    playRegistry = address(2);
  const protocol = {
    chainId: 11155111,
    registeredStatus: 2,
    hostRoles: { control: 8n, kick: 16n },
    registryRoles: 3n,
    resolverRoles: 5n,
    contracts: {
      rootRegistry: address(10),
      ethRegistry: address(11),
      factory: address(12),
      userRegistryImpl: address(13),
      resolverImpl: address(14),
      universalHelper: address(15),
    },
  };
  const config = {
    ENS_PARENT: "fixture.eth",
    ENS_REGISTRAR_ADDRESS: owner,
    ENS_WARM_POOL: 2,
    ENS_PARTY_TTL_HOURS: 4,
    PUBLIC_ORIGIN: "https://console.example",
  };
  let timestamp = BigInt(Math.floor(Date.now() / 1000)),
    resource = 100n,
    crashAfter = "";
  const proxies = new Map(),
    rows = new Map(),
    records = new Map(),
    transactions = new Map(),
    calls = [];
  const extraRoles = new Map();
  const effectiveRoles = (target, resource, account) =>
    (extraRoles.get(`${target}:${resource}:${account.toLowerCase()}`) || 0n) |
    (extraRoles.get(`${target}:0:${account.toLowerCase()}`) || 0n) |
    (proxies
      .get(target)
      ?.grants.find((g) => g.account.toLowerCase() === account.toLowerCase())
      ?.roleBitmap || 0n);
  const controlResource = BigInt(keccak256(stringToHex("chonks.control")));
  const rowKey = (registry, id) => `${registry}:${id}`;
  const state = (registry, id) =>
    rows.get(rowKey(registry, id)) || {
      status: 0,
      expiry: 0n,
      latestOwner: zeroAddress,
      resource: 0n,
    };
  const client = {
    async getChainId() {
      return 11155111;
    },
    async getBlock() {
      return { timestamp, number: timestamp, hash: `0x${"ab".repeat(32)}` };
    },
    async getCode({ address }) {
      return proxies.has(address) ? "0x6000" : "0x";
    },
    async readContract({ address: target, functionName: fn, args: values }) {
      if (fn === "predictProxyAddress")
        return `0x${keccak256(stringToHex(`${values[0]}:${values[1]}`)).slice(-40)}`;
      if (fn === "verifyContract")
        return (
          proxies.get(values[0].toLowerCase())?.implementation || zeroAddress
        );
      if (fn === "hasRootRoles")
        return (
          (effectiveRoles(target, 0n, values[1]) & values[0]) === values[0]
        );
      if (fn === "hasRoles")
        return (
          (effectiveRoles(target, values[0], values[2]) & values[1]) ===
          values[1]
        );
      if (fn === "decodeSetter")
        return ["0x", controlResource, protocol.hostRoles.control];
      if (fn === "getParent")
        return proxies.get(target)?.parent || [zeroAddress, ""];
      if (fn === "getState") return state(target, values[0]);
      if (fn === "getResolver")
        return state(target, labelId(values[0])).resolver || zeroAddress;
      if (fn === "getSubregistry")
        return state(target, labelId(values[0])).subregistry || zeroAddress;
      if (fn === "roles")
        return (
          (state(target, values[0]).roles || 0n) |
          effectiveRoles(target, 0n, values[1])
        );
      if (fn === "resolve") {
        const decoded = decodeFunctionData({
          abi: resolverReads,
          data: values[1],
        });
        const value = records.get(
          `${target}:${values[0]}:${decoded.functionName === "addr" ? "addr" : decoded.args[1]}`,
        );
        return encodeFunctionResult({
          abi: resolverReads,
          functionName: decoded.functionName,
          result: value || (decoded.functionName === "addr" ? zeroAddress : ""),
        });
      }
      throw Error(`Unexpected read ${fn}`);
    },
  };
  async function transact(id, call) {
    const data = encodeFunctionData(call),
      fingerprint = `${call.address}:${data}`;
    if (transactions.has(id)) {
      assert.equal(transactions.get(id), fingerprint);
      return { tx: keccak256(data) };
    }
    calls.push({ id, ...call });
    const a = call.args,
      target = call.address;
    switch (call.functionName) {
      case "grantRootRoles":
      case "revokeRootRoles": {
        const k = `${target}:0:${a[1].toLowerCase()}`,
          old = extraRoles.get(k) || 0n;
        extraRoles.set(
          k,
          call.functionName === "grantRootRoles" ? old | a[0] : old & ~a[0],
        );
        break;
      }
      case "grantSetterRoles": {
        extraRoles.set(
          `${target}:${controlResource}:${a[1].toLowerCase()}`,
          protocol.hostRoles.control,
        );
        break;
      }
      case "revokeRoles": {
        const k = `${target}:${a[0]}:${a[2].toLowerCase()}`;
        extraRoles.set(k, (extraRoles.get(k) || 0n) & ~a[1]);
        break;
      }
      case "deployProxy": {
        const kind =
          a[0] === protocol.contracts.userRegistryImpl
            ? "registry"
            : "resolver";
        const decoded = decodeFunctionData({ abi: abi[kind], data: a[2] });
        const predicted = await client.readContract({
          functionName: "predictProxyAddress",
          args: [owner, a[1]],
        });
        assert(!proxies.has(predicted));
        proxies.set(predicted, {
          implementation: a[0],
          grants: decoded.args[0],
        });
        break;
      }
      case "setParent":
        proxies.get(target).parent = a;
        break;
      case "register": {
        const key = rowKey(target, labelId(a[0])),
          old = rows.get(key);
        assert(
          !old || old.status === 0 || old.expiry <= timestamp,
          "registration collision",
        );
        rows.set(key, {
          status: 2,
          latestOwner: a[1],
          subregistry: a[2],
          resolver: a[3],
          roles: a[4],
          expiry: a[5],
          resource: resource++,
        });
        break;
      }
      case "unregister":
        rows.set(rowKey(target, a[0]), {
          ...state(target, a[0]),
          status: 0,
          latestOwner: zeroAddress,
        });
        break;
      case "multicall":
        for (const data of a[0]) {
          const d = decodeFunctionData({ abi: abi.resolver, data });
          records.set(
            `${target}:${d.args[0]}:${d.functionName === "setAddress" ? "addr" : d.args[1]}`,
            d.args[2],
          );
        }
        break;
      default:
        throw Error(`Unexpected write ${call.functionName}`);
    }
    transactions.set(id, fingerprint);
    if (crashAfter && id.endsWith(crashAfter)) {
      crashAfter = "";
      throw Error("Simulated post-send crash");
    }
    return { tx: keccak256(data) };
  }
  return {
    client,
    config,
    protocol,
    owner,
    playRegistry,
    calls,
    proxies,
    rows,
    records,
    transact,
    discoverPlay: async () => ({
      name: "play.fixture.eth",
      expiresAt: timestamp + 86400n,
      leaf: { owner, subregistry: playRegistry },
    }),
    crashAfter(suffix) {
      crashAfter = suffix;
    },
    advance(seconds) {
      timestamp += BigInt(seconds);
    },
    occupy(registry, label, overrides = {}) {
      rows.set(rowKey(registry, labelId(label)), {
        status: 2,
        latestOwner: address(999),
        expiry: timestamp + 86400n,
        resource: resource++,
        ...overrides,
      });
    },
  };
}
