import {
  encodeFunctionData,
  decodeFunctionResult,
  namehash,
  parseAbi,
} from "viem";
import abi from "./lifecycle-abi.json" with { type: "json" };
import { dnsName } from "./names.mjs";

export const resolverReads = parseAbi([
  "function text(bytes32 node, string key) view returns (string)",
  "function addr(bytes32 node) view returns (address)",
]);
export function request(kind, address, functionName, args, account) {
  return { address, abi: abi[kind], functionName, args, account };
}
export function textCalls(name, records) {
  return Object.entries(records).map(([key, value]) =>
    encodeFunctionData({
      abi: abi.resolver,
      functionName: "setText",
      args: [dnsName(name), key, value],
    }),
  );
}
export function addressCall(name, address) {
  return encodeFunctionData({
    abi: abi.resolver,
    functionName: "setAddress",
    args: [dnsName(name), 60n, address],
  });
}
export async function readRecord(client, resolver, name, key, at = {}) {
  const functionName = key === undefined ? "addr" : "text";
  const data = encodeFunctionData({
    abi: resolverReads,
    functionName,
    args: key === undefined ? [namehash(name)] : [namehash(name), key],
  });
  const result = await client.readContract({
    ...request("resolver", resolver, "resolve", [dnsName(name), data]),
    ...at,
  });
  return decodeFunctionResult({
    abi: resolverReads,
    functionName,
    data: result,
  });
}
