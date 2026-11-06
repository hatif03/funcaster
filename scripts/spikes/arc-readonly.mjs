// A0 / VA-01 public read subset. No wallet, env loading or transaction submission.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { setTimeout as pause } from "node:timers/promises";
import {
  createPublicClient,
  http,
  parseAbi,
  keccak256,
  encodeFunctionData,
  stringToHex,
} from "viem";
import { hashDomain } from "viem";
const config = JSON.parse(
  await fs.readFile("docs/web3/spikes/arc-readonly-input.json"),
);
assert.equal(config.chainId, 5042002);
const abi = parseAbi([
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function decimals() view returns (uint8)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function paused() view returns (bool)",
  "function isBlacklisted(address) view returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)",
]);
const types = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
};
const report = {
  at: new Date().toISOString(),
  scope:
    "Daily public A0 reads only; combine with authorization receipts and native-flow evidence for the G0 verdict",
  config,
  endpoints: [],
  checks: [],
};
let client;
for (const rpc of config.rpcUrls) {
  const reader = createPublicClient({
    transport: http(rpc, { timeout: 12000, retryCount: 0 }),
    cacheTime: 0,
  });
  try {
    const chainId = await reader.getChainId();
    assert.equal(chainId, config.chainId);
    report.endpoints.push({ rpc, status: "PASS", chainId });
    client ||= reader;
  } catch (e) {
    report.endpoints.push({
      rpc,
      status: "FAIL",
      error: e.shortMessage || e.message,
    });
  }
  await pause(1000);
}
async function check(id, fn) {
  await pause(250);
  try {
    const result = await fn();
    report.checks.push({ id, status: "PASS-READ", result });
    console.log(`PASS-READ ${id}`);
  } catch (e) {
    report.checks.push({
      id,
      status: "FAIL",
      error: e.shortMessage || e.message,
    });
    console.log(`FAIL ${id}`);
  }
}
if (client) {
  const block = await client.getBlock();
  report.block = {
    number: String(block.number),
    hash: block.hash,
    timestamp: String(block.timestamp),
    baseFeePerGas: String(block.baseFeePerGas),
  };
  for (const asset of config.assets) {
    const read = (functionName, args = []) =>
      client.readContract({
        address: asset.address,
        abi,
        functionName,
        args,
        blockNumber: block.number,
      });
    await check(`${asset.symbol} code`, async () => {
      const code = await client.getCode({
        address: asset.address,
        blockNumber: block.number,
      });
      assert(code && code !== "0x");
      return { bytes: (code.length - 2) / 2, hash: keccak256(code) };
    });
    await check(`${asset.symbol} domain`, async () => {
      const name = await read("name");
      await pause(250);
      const version = await read("version");
      await pause(250);
      const decimals = await read("decimals");
      await pause(250);
      const separator = await read("DOMAIN_SEPARATOR");
      const computed = hashDomain({
        domain: {
          name,
          version,
          chainId: config.chainId,
          verifyingContract: asset.address,
        },
        types,
      });
      assert.equal(name, asset.name);
      assert.equal(version, asset.version);
      assert.equal(decimals, asset.decimals);
      assert.equal(separator, computed);
      return { name, version, decimals, separator, matches: true };
    });
    await check(`${asset.symbol} state`, async () => {
      const paused = await read("paused");
      await pause(250);
      const testAddressBlacklisted = await read("isBlacklisted", [
        config.testBlocklistedAddress,
      ]);
      await pause(250);
      const relayerBalance = await read("balanceOf", [config.relayer]);
      assert.equal(paused, false);
      return {
        paused,
        testAddressBlacklisted,
        relayerBalance: String(relayerBalance),
        units: "ERC20 minor units (6 decimals)",
      };
    });
    await check(`${asset.symbol} payee-only guard`, async () => {
      // Invalid signature + mismatched caller is an eth_call only. It proves the guard, not a successful funding flow.
      try {
        await client.simulateContract({
          address: asset.address,
          abi,
          functionName: "receiveWithAuthorization",
          args: [
            config.relayer,
            config.testBlocklistedAddress,
            1n,
            0n,
            block.timestamp + 600n,
            `0x${"11".repeat(32)}`,
            "0x",
          ],
          account: config.relayer,
          blockNumber: block.number,
        });
        throw new Error("Expected payee guard revert");
      } catch (e) {
        const cause = e.walk?.(
          (x) => x.name === "ContractFunctionRevertedError",
        );
        assert(
          cause?.reason?.includes("caller must be the payee"),
          e.shortMessage || e.message,
        );
        return { revert: cause.reason, successfulAuthorization: "NOT TESTED" };
      }
    });
  }
  for (const [name, address] of Object.entries(config.contracts))
    await check(`${name} code`, async () => {
      const code = await client.getCode({ address, blockNumber: block.number });
      assert(code && code !== "0x");
      return { bytes: (code.length - 2) / 2, hash: keccak256(code) };
    });
}
if (client)
  await check("Memo EOA unsigned simulation", async () => {
    const token = config.assets.find(
      (asset) => asset.symbol === "USDC",
    ).address;
    const transferAbi = parseAbi([
      "function transfer(address,uint256) returns (bool)",
    ]);
    const memoAbi = parseAbi([
      "function memo(address target,bytes data,bytes32 memoId,bytes memoData)",
    ]);
    const data = encodeFunctionData({
      abi: transferAbi,
      functionName: "transfer",
      args: ["0x4000000000000000000000000000000000000004", 1000n],
    });
    await client.simulateContract({
      address: config.contracts.Memo,
      abi: memoAbi,
      functionName: "memo",
      args: [
        token,
        data,
        keccak256(stringToHex("chonks:readonly-g0")),
        stringToHex("UNSIGNED SIMULATION ONLY"),
      ],
      account: config.relayer,
      blockNumber: BigInt(report.block.number),
    });
    return {
      result: "eth_call succeeded",
      transactionSent: false,
      source:
        "https://explorer.testnet.arc.io/api/v2/smart-contracts/" +
        config.contracts.Memo,
    };
  });
await fs.writeFile(
  "docs/web3/spikes/arc-readonly.json",
  JSON.stringify(report, null, 2) + "\n",
);
if (!client || report.checks.some((r) => r.status === "FAIL"))
  process.exitCode = 1;
