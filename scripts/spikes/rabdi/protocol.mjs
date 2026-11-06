// Isolated K0 tooling, not a live game adapter. SDK APIs are pinned by this folder's lockfile.
import assert from "node:assert/strict";
import { setDefaultResultOrder } from "node:dns";
// Prefer IPv4 for local probes; endpoint timeouts are still reported explicitly.
setDefaultResultOrder("ipv4first");
import {
  createPublicClient,
  createWalletClient,
  ExpirationTime,
} from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import {
  defineSchema,
  str,
  i32,
  u64,
  u256,
  dec,
  bool,
  addr,
  key,
  bytes,
} from "@arkiv-network/sdk/schema";
import { custom, http, keccak256, hexToBytes } from "viem";
import { withReadRetry } from "./read-retry.mjs";
export const NETWORK = Object.freeze({
  id: 7794095,
  rpc: "https://rpc.rabdi.db-chain.testnet.arkiv.network",
  owner: "0xE581E56c592Ab9D6d3D234168EE9a89032273c00",
  recipient: "0xA98d5EB3cb1D0427F348f0130732243bB8bbc747",
});
export const chain = rabdi({ accessKey: "" });
export const Probe = defineSchema("chonks_k0_v2", {
  project: str().indexed(),
  entity_type: str().indexed(),
  schema_version: u64().indexed(),
  run: str().indexed(),
  ordinal: i32().indexed(),
  label: str().indexed(),
  at: u64().indexed(),
  amount: u256().indexed(),
  rating: dec().indexed(),
  active: bool().indexed(),
  who: addr().indexed(),
  related: key().indexed(),
  payload: bytes(),
  swarm_ref: bytes(),
});
export const serial = (value) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? String(v) : v), 2) +
  "\n";
export const same = (a, b) => a.toLowerCase() === b.toLowerCase();
export function publicClient() {
  return createPublicClient({
    chain,
    cacheTime: 0,
    transport: custom(publicRpc(), { retryCount: 0 }),
  });
}
export function publicRpc() {
  return withReadRetry(
    http(NETWORK.rpc, {
      retryCount: 0,
      timeout: 15000,
      fetchOptions: { redirect: "error" },
    })({ chain }),
  );
}
export function fixture(run, ordinal) {
  return {
    project: "chonks_k0",
    entity_type: "probe",
    schema_version: u64(2),
    run,
    ordinal,
    label: `synthetic_${ordinal}`,
    at: u64(1793912400000n + BigInt(ordinal)),
    amount: u256((1n << 80n) + BigInt(ordinal)),
    rating: dec("1.25"),
    active: true,
    who: addr(NETWORK.owner),
    related: key("0x" + "11".repeat(32)),
    payload: new TextEncoder().encode(
      JSON.stringify({ synthetic: true, ordinal }),
    ),
    swarm_ref: new Uint8Array(32).fill(0x22),
  };
}
export function createFixture(
  run,
  ordinal,
  { readonly = false, permissionlessExtension = false, seconds = 3600 } = {},
) {
  return {
    schema: Probe,
    values: fixture(run, ordinal),
    expiration: ExpirationTime.fromSeconds(seconds),
    salt: BigInt(ordinal + 1),
    flags: { readonly, permissionlessExtension },
  };
}
export function swarmReference(value) {
  assert(
    /^0x[0-9a-fA-F]{64}$/.test(value),
    "Only public 32-byte references; encrypted references are rejected",
  );
  return hexToBytes(value);
}
const readMethods = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getTransactionCount",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_estimateGas",
  "eth_call",
]);
export function unsignedAccount(address) {
  const reject = async () => {
    throw Error("Signing is forbidden in preflight");
  };
  return {
    address,
    type: "local",
    source: "custom",
    signMessage: reject,
    signTypedData: reject,
    signTransaction: reject,
  };
}
export async function captureBatch(rpc, batch, address = NETWORK.owner) {
  assert.equal(
    BigInt(await rpc.request({ method: "eth_chainId" })),
    BigInt(NETWORK.id),
  );
  let captured;
  const stop = Error("K0 unsigned calldata captured");
  const transport = custom(
    {
      async request(args) {
        assert(
          readMethods.has(args.method),
          "Unexpected or mutating RPC blocked",
        );
        if (args.method === "eth_estimateGas") {
          assert(!captured, "Multiple estimations are not expected");
          const tx = args.params?.[0];
          assert(
            tx?.data && same(tx.from, address) && tx.to,
            "Missing transaction",
          );
          captured = { ...tx };
          throw stop;
        }
        return rpc.request(args);
      },
    },
    { retryCount: 0 },
  );
  const w = createWalletClient({
    chain,
    account: unsignedAccount(address),
    transport,
  });
  try {
    await w.executeBatch(batch);
  } catch (e) {
    let cause = e;
    for (let i = 0; cause && i < 24; i++, cause = cause.cause)
      if (cause === stop) return captured;
    throw Error("Unsigned batch preparation failed; no signature or send", {
      cause: e,
    });
  }
  throw Error("SDK skipped the unsigned capture guard");
}
export async function estimateBatch(rpc, batch, address = NETWORK.owner) {
  const tx = await captureBatch(rpc, batch, address);
  const estimate = BigInt(
    await rpc.request({ method: "eth_estimateGas", params: [tx, "latest"] }),
  );
  assert(estimate > 0n);
  return { tx, estimate };
}
export function selectGas({ estimate, operations, blockGasLimit }) {
  assert(estimate > 0n && Number.isInteger(operations) && operations > 0);
  const floor = 1000000n + 400000n * BigInt(operations - 1),
    gas = 2n * estimate > floor ? 2n * estimate : floor;
  assert(
    gas <= blockGasLimit / 2n && gas <= 2n ** 24n,
    "Batch exceeds gas ceiling; split only unprepared work",
  );
  return gas;
}
export function admitCost({ gas, gasPrice, spent, budget, balance }) {
  assert(
    gas > 0n && gasPrice > 0n && spent >= 0n && budget > 0n && balance >= 0n,
  );
  const maxCost = gas * gasPrice;
  assert(spent + maxCost <= budget, "Aggregate K0 gas budget exceeded");
  assert(
    maxCost + 1000000000000000n <= balance,
    "Retain at least 0.001 tGLM for recovery",
  );
  return maxCost;
}
export const dataHash = (tx) => keccak256(tx.data);
export function mode(args) {
  if (!args.length || args[0] === "--check") {
    assert(args.length <= 1);
    return "check";
  }
  assert.deepEqual(
    args,
    ["--apply", "--confirm-network", "rabdi-k0"],
    "Owner must confirm Rabdi K0 writes",
  );
  return "apply";
}
