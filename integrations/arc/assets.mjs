import { parseAbi, hashDomain, getAddress } from "viem";
import { assetDomain, potDomain } from "./signatures.mjs";
export const ASSET_ABI = parseAbi([
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function decimals() view returns (uint8)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function balanceOf(address) view returns (uint256)",
  "function paused() view returns (bool)",
  "function isBlacklisted(address) view returns (bool)",
  "function authorizationState(address,bytes32) view returns (bool)",
  "function receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)",
  "function transfer(address,uint256) returns (bool)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
const domainTypes = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
};
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();
// A local guard is an injected test port, never an environment/CLI bypass.
export async function verifiedDomain(domain, chainId, localGuard) {
  if (chainId === 5042002) return domain;
  if (chainId !== 31337 || typeof localGuard !== "function")
    throw Error("Arc testnet required");
  await localGuard();
  return { ...domain, chainId };
}
export async function verifyAsset(
  client,
  asset,
  { now = Date.now, block: supplied, localGuard } = {},
) {
  const expected = await verifiedDomain(
    assetDomain({ ...asset, chainId: 5042002 }),
    asset.chainId,
    localGuard,
  );
  if ((await client.getChainId()) !== expected.chainId)
    throw Error("Asset RPC chain mismatch");
  const block = supplied || (await client.getBlock({ blockTag: "latest" }));
  if (
    now() / 1000 - Number(block.timestamp) > 30 ||
    Number(block.timestamp) > now() / 1000 + 5
  )
    throw Error("Asset proof is stale");
  const at = {
    address: expected.verifyingContract,
    abi: ASSET_ABI,
    blockNumber: block.number,
  };
  const [name, version, decimals, separator, paused, code] = await Promise.all([
    ...["name", "version", "decimals", "DOMAIN_SEPARATOR", "paused"].map(
      (functionName) => client.readContract({ ...at, functionName }),
    ),
    client.getCode({
      address: expected.verifyingContract,
      blockNumber: block.number,
    }),
  ]);
  if (
    name !== expected.name ||
    version !== expected.version ||
    decimals !== 6 ||
    !same(separator, hashDomain({ domain: expected, types: domainTypes })) ||
    !code ||
    code === "0x" ||
    paused
  )
    throw Error(
      "Asset domain, code or availability differs from configuration",
    );
  if (
    !same(
      (await client.getBlock({ blockNumber: block.number })).hash,
      block.hash,
    )
  )
    throw Error("Asset proof changed block");
  if (
    (await client.getChainId()) !== expected.chainId ||
    now() / 1000 - Number(block.timestamp) > 30
  )
    throw Error("Asset proof changed chain or became stale");
  return {
    ...asset,
    address: getAddress(asset.address),
    domainSeparator: separator,
    blockNumber: String(block.number),
    blockHash: block.hash,
    chainTime: String(block.timestamp),
  };
}
export async function verifyPotDomain(client, config, blockNumber, localGuard) {
  const expected = await verifiedDomain(
      potDomain({ ...config, chainId: 5042002 }),
      config.chainId,
      localGuard,
    ),
    abi = parseAbi([
      "function eip712Domain() view returns (bytes1 fields,string name,string version,uint256 chainId,address verifyingContract,bytes32 salt,uint256[] extensions)",
    ]);
  const actual = await client.readContract({
    address: expected.verifyingContract,
    abi,
    functionName: "eip712Domain",
    blockNumber,
  });
  if (
    actual[0] !== "0x0f" ||
    actual[1] !== expected.name ||
    actual[2] !== expected.version ||
    actual[3] !== BigInt(expected.chainId) ||
    !same(actual[4], expected.verifyingContract) ||
    actual[6].length
  )
    throw Error("Pot EIP-712 domain differs from configuration");
  return expected;
}
