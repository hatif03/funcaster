import test from "node:test";
import assert from "node:assert/strict";
import { keccak256 } from "viem";
import { NETWORK } from "./protocol.mjs";
import { verifyReceipts } from "./receipt-verify.mjs";
import { observeBalanceAfter } from "./balance-observation.mjs";
function fixture() {
  const entry = {
    id: "fund second synthetic writer",
    hash: "0x" + "01".repeat(32),
    from: NETWORK.owner,
    to: NETWORK.recipient,
    nonce: 80,
    value: "20000000000000000",
    dataHash: keccak256("0x"),
    gas: "1000000",
    gasPrice: "1",
    maxCost: "20000000001000000",
    expectedStatus: "success",
    createCount: 0,
    created: [],
    gasCost: "21000",
  };
  const tx = {
    from: entry.from,
    to: entry.to,
    nonce: 80,
    chainId: NETWORK.id,
    value: BigInt(entry.value),
    input: "0x",
    gas: 1000000n,
    gasPrice: 1n,
  };
  const receipt = {
    status: "success",
    blockNumber: 100n,
    blockHash: "0xabc",
    logs: [],
    gasUsed: 21000n,
    effectiveGasPrice: 1n,
  };
  const block = { hash: "0xabc" };
  const reader = {
    getTransactionReceipt: async () => receipt,
    getTransaction: async () => tx,
    getBlock: async () => block,
  };
  return { entry, tx, receipt, block, reader };
}
test("partial reconciliation accepts only matching public receipts and exact funding ceiling", async () => {
  const { entry, reader } = fixture();
  const result = await verifyReceipts(reader, [entry]);
  assert.equal(result.receipts.length, 1);
  assert.equal(result.topupTGLM, "0.02");
  assert.equal(result.gasTGLM, "0.000000000000021");
});
test("reconciliation rejects changed chain, nonce, calldata, fees, canonical block and outcomes", async () => {
  for (const mutate of [
    (f) => f.tx.chainId++,
    (f) => f.tx.nonce++,
    (f) => (f.tx.input = "0x01"),
    (f) => f.tx.gasPrice++,
    (f) => f.tx.gas++,
    (f) => f.tx.value++,
    (f) => (f.block.hash = "0xdef"),
    (f) => (f.receipt.status = "reverted"),
    (f) => (f.receipt.gasUsed = 1000001n),
    (f) => (f.entry.maxCost = "1"),
    (f) => (f.entry.created = ["unexpected"]),
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(verifyReceipts(f.reader, [f.entry]));
  }
});
test("duplicate journal ids and hashes cannot be counted as independent receipts", async () => {
  const { entry, reader } = fixture();
  await assert.rejects(verifyReceipts(reader, [entry, { ...entry }]));
  await assert.rejects(
    verifyReceipts(reader, [entry, { ...entry, id: "another" }]),
  );
});
test("head-only RPC limitation labels historical balance evidence without skipping receipt or observed-delta checks", async () => {
  const f = fixture();
  Object.assign(f.entry, {
    id: "cost 0",
    to: "0x4400000000000000000000000000000000000044",
    value: "0",
    maxCost: "1000000",
    balanceBefore: "1000000",
    balanceAfter: "979000",
  });
  Object.assign(f.tx, { to: f.entry.to, value: 0n });
  f.reader.getBalance = async () => {
    throw Object.assign(Error("unavailable"), {
      code: -32603,
      details: "arkiv serves state at the chain head only",
    });
  };
  const report = await verifyReceipts(f.reader, [f.entry]);
  assert.match(report.costBalanceEvidence, /owner-run observations/);
  f.entry.balanceAfter = "978999";
  await assert.rejects(verifyReceipts(f.reader, [f.entry]));
});
test("post-send observation uses head state and rejects pending nonces or unaccounted balance movement", async () => {
  const entry = {
    from: NETWORK.owner,
    nonce: 80,
    balanceBefore: "100000",
    gasCost: "21000",
    value: "0",
  };
  const reader = {
    getTransactionCount: async () => 81,
    getBalance: async (args) => {
      assert.equal(args.blockNumber, undefined);
      assert.equal(args.blockTag, "latest");
      return 79000n;
    },
  };
  await observeBalanceAfter(reader, entry);
  assert.equal(entry.balanceAfter, "79000");
  await assert.rejects(
    observeBalanceAfter(
      { ...reader, getTransactionCount: async () => 82 },
      { ...entry },
    ),
  );
  await assert.rejects(
    observeBalanceAfter(
      { ...reader, getBalance: async () => 79001n },
      { ...entry },
    ),
  );
});
