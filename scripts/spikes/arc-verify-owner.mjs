// Independent public reads only. No wallet, private key, or transaction submission.
import assert from "node:assert/strict";
import { setDefaultResultOrder } from "node:dns";
setDefaultResultOrder("ipv4first");
import fs from "node:fs/promises";
import {
  createPublicClient,
  http,
  keccak256,
  stringToHex,
  parseAbi,
  decodeFunctionData,
  decodeEventLog,
} from "viem";
const root = new URL("../../", import.meta.url);
const symbol = process.argv[2] || "USDC";
assert(["USDC", "EURC"].includes(symbol));
assert(process.argv.length <= 3);
const suffix = symbol === "USDC" ? "" : "-eurc";
const source = JSON.parse(
  await fs.readFile(
    new URL(`docs/web3/spikes/arc${suffix}-owner-live.json`, root),
    "utf8",
  ),
);
const cfg = JSON.parse(
  await fs.readFile(
    new URL("docs/web3/spikes/arc-readonly-input.json", root),
    "utf8",
  ),
);
const abi = parseAbi([
  "function transfer(address,uint256) returns(bool)",
  "function receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)",
  "function balanceOf(address) view returns(uint256)",
  "function authorizationState(address,bytes32) view returns(bool)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
assert.equal(source.chainId, 5042002);
assert(same(source.asset, cfg.assets.find((a) => a.symbol === symbol).address));
assert(same(source.donor, cfg.relayer));
assert.equal(source.operations.length, 2);
const nonce = keccak256(
  stringToHex(`chonks:g0:${symbol}:receive:v1:${source.sender.toLowerCase()}`),
);
const report = {
  at: new Date().toISOString(),
  scope: "INDEPENDENT PUBLIC READS; no keys or sends",
  chainId: 5042002,
  providers: [],
};
let canonical;
for (const url of cfg.rpcUrls) {
  const c = createPublicClient({
    transport: http(url, { timeout: 15000, retryCount: 0 }),
    cacheTime: 0,
  });
  assert.equal(await c.getChainId(), 5042002);
  const observations = [];
  for (const [i, op] of source.operations.entries()) {
    const receipt = await c.getTransactionReceipt({ hash: op.hash });
    const tx = await c.getTransaction({ hash: op.hash });
    const block = await c.getBlock({ blockNumber: receipt.blockNumber });
    assert.equal(receipt.status, "success");
    assert.equal(receipt.blockHash, block.hash);
    assert.equal(String(receipt.blockNumber), op.blockNumber);
    assert.equal(tx.chainId, 5042002);
    assert(same(tx.from, source.donor));
    assert(same(tx.to, source.asset));
    assert.equal(tx.value, 0n);
    assert.equal(keccak256(tx.input), op.dataHash);
    assert.equal(
      String(receipt.gasUsed * receipt.effectiveGasPrice),
      op.gasCost,
    );
    const call = decodeFunctionData({ abi, data: tx.input });
    assert.equal(
      call.functionName,
      i === 0 ? "transfer" : "receiveWithAuthorization",
    );
    if (i === 0) {
      assert(same(call.args[0], source.sender));
      assert.equal(call.args[1], 51000n);
    } else {
      assert(same(call.args[0], source.sender));
      assert(same(call.args[1], source.donor));
      assert.equal(call.args[2], 1000n);
      assert.equal(call.args[5], nonce);
      assert(call.args[3] < block.timestamp && block.timestamp < call.args[4]);
    }
    const expectedFrom = i === 0 ? source.donor : source.sender,
      expectedTo = i === 0 ? source.sender : source.donor;
    const transfers = receipt.logs
      .filter((l) => same(l.address, source.asset))
      .flatMap((l) => {
        try {
          return [decodeEventLog({ abi, data: l.data, topics: l.topics })];
        } catch {
          return [];
        }
      })
      .filter(
        (l) =>
          l.eventName === "Transfer" &&
          same(l.args.from, expectedFrom) &&
          same(l.args.to, expectedTo),
      );
    assert.equal(transfers.length, 1, "Only token-emitter Transfer counts");
    assert.equal(transfers[0].args.value, i === 0 ? 51000n : 1000n);
    observations.push({
      hash: op.hash,
      blockNumber: op.blockNumber,
      blockHash: receipt.blockHash,
      status: receipt.status,
      gasCost: op.gasCost,
      checked:
        "sender, token, calldata, value, exact token-emitter Transfer, receipt gas, canonical block",
    });
  }
  const blockNumber = BigInt(source.operations.at(-1).blockNumber);
  const read = (functionName, args) =>
    c.readContract({
      address: source.asset,
      abi,
      functionName,
      args,
      blockNumber,
    });
  assert.equal(await read("authorizationState", [source.sender, nonce]), true);
  assert.equal(await read("balanceOf", [source.sender]), 50000n);
  assert.equal(
    String(await read("balanceOf", [source.donor])),
    source.after.donor,
  );
  if (symbol === "EURC")
    assert.equal(
      await c.getBalance({ address: source.sender, blockNumber }),
      0n,
    );
  const hashes = observations.map((x) => x.blockHash);
  if (canonical) assert.deepEqual(hashes, canonical);
  else canonical = hashes;
  report.providers.push({
    host: new URL(url).hostname,
    transactions: observations,
    postStateBlock: String(blockNumber),
    authorizationUsed: true,
    senderRetained: "0.05",
    symbol,
    donorMinorUnits: source.after.donor,
  });
}
report.totalGasUSDC = String(
  Number(source.operations.reduce((a, b) => a + BigInt(b.gasCost), 0n)) / 1e18,
);
report.result = `PASS: owner-executed ${symbol} authorization and retained floor; product flows remain separate gates`;
await fs.writeFile(
  new URL(`docs/web3/spikes/arc${suffix}-owner-verified.json`, root),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
