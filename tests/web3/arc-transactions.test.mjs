import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { keccak256, parseTransaction, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createArcTransactions } from "../../integrations/arc/transactions.mjs";
// Offline-only public fixture key; these tests never use RPC or any live key.
const account = privateKeyToAccount(`0x${"11".repeat(32)}`),
  target = `0x${"22".repeat(20)}`;
const blockHash = `0x${"ab".repeat(32)}`,
  id = `room:${"a".repeat(64)}:pot:create`;
async function fixture(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "chonks-arc-tx-"));
  let nonce = 0,
    signed = 0,
    sent = 0,
    port,
    latest;
  const receipts = new Map(),
    txs = new Map();
  const file = path.join(dir, "arc-relayer-transactions/journal.json");
  const client = {
    getChainId: async () => 5042002,
    getTransactionCount: async () => nonce,
    getBlock: async () => ({
      number: 1n,
      hash: blockHash,
      baseFeePerGas: options.baseFee ?? 7_000_000_000n,
      timestamp: 10000n,
    }),
    getTransactionReceipt: async ({ hash }) => {
      if (!receipts.has(hash)) throw Error("Unknown receipt");
      return receipts.get(hash);
    },
    getTransaction: async ({ hash }) => txs.get(hash),
    simulateContract: async () => {},
    estimateGas: async () => 100n,
    getBalance: async () => options.balance ?? 1_000_000_000_000_000_000n,
    async sendRawTransaction({ serializedTransaction }) {
      sent++;
      latest = parseTransaction(serializedTransaction);
      const hash = keccak256(serializedTransaction),
        journal = JSON.parse(await fs.readFile(file, "utf8"));
      assert.equal(journal.entries.at(-1).hash, hash);
      if (options.uncertain) throw Error("Timeout before acceptance is known");
      txs.set(hash, {
        ...latest,
        from: account.address,
        input: latest.data,
        value: 0n,
        blockHash,
      });
      receipts.set(hash, {
        transactionHash: hash,
        blockHash,
        blockNumber: 1n,
        status: options.revertFirst && sent === 1 ? "reverted" : "success",
        gasUsed: 90n,
        effectiveGasPrice: 20_000_000_000n,
      });
      nonce++;
      if (options.timeout) throw Error("Timeout after acceptance");
      return hash;
    },
    waitForTransactionReceipt: async ({ hash }) => receipts.get(hash),
  };
  const wallet = {
    account,
    signTransaction: (tx) => {
      signed++;
      return account.signTransaction(tx);
    },
  };
  const start = async () =>
    (port = await createArcTransactions({
      dir,
      role: "relayer",
      client,
      wallet,
      chainId: 5042002,
      owner: account.address,
      budgetWei: 100_000_000_000_000n,
      maxTransactions: 10,
      priorityFeeWei: 0n,
      minimumFeePerGasWei: 20_000_000_000n,
      nativeBalanceFloorWei: options.floor ?? 0n,
      maxFeePerGasWei: options.maxFee ?? 100_000_000_000n,
      maxPerRoom: options.maxRoom ?? 5,
      maxPerHour: 10,
    }));
  await start();
  t.after(async () => {
    await port?.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const call = {
    account: account.address,
    address: target,
    abi: parseAbi(["function refund(bytes32 potId)"]),
    functionName: "refund",
    args: [`0x${"33".repeat(32)}`],
  };
  return {
    port,
    start,
    call,
    latest: () => latest,
    counts: () => ({ signed, sent }),
  };
}
test("Arc signs at the verified 20-gwei floor even when base fee and priority are lower", async (t) => {
  const f = await fixture(t);
  await f.port.transact(id, f.call);
  assert.equal(f.latest().maxFeePerGas, 20_000_000_000n);
  assert.equal(f.latest().maxPriorityFeePerGas || 0n, 0n);
  assert.equal(f.latest().value, undefined);
  await f.port.close();
  const restarted = await f.start();
  assert.equal((await restarted.transact(id, f.call)).reconciled, true);
  assert.deepEqual(f.counts(), { signed: 1, sent: 1 });
});
test("Arc admits rising fees but refuses a configured fee ceiling or retained native-gas floor breach before signing", async (t) => {
  const high = await fixture(t, { baseFee: 25_000_000_000n });
  await high.port.transact(id, high.call);
  assert.equal(high.latest().maxFeePerGas, 50_000_000_000n);
  for (const options of [
    { maxFee: 19_000_000_000n },
    { balance: 2_400_000_000_000n, floor: 1n },
  ]) {
    const f = await fixture(t, options);
    await assert.rejects(f.port.transact(id, f.call));
    assert.deepEqual(f.counts(), { signed: 0, sent: 0 });
  }
});
test("Arc reconciles a post-send timeout; an uncertain prepared hash stops any new send", async (t) => {
  const mined = await fixture(t, { timeout: true });
  await assert.rejects(mined.port.transact(id, mined.call), /Timeout/);
  assert.equal((await mined.port.transact(id, mined.call)).reconciled, true);
  assert.deepEqual(mined.counts(), { signed: 1, sent: 1 });
  const uncertain = await fixture(t, { uncertain: true });
  await assert.rejects(uncertain.port.transact(id, uncertain.call), /Timeout/);
  await assert.rejects(
    uncertain.port.transact(id + "2", uncertain.call),
    /unresolved/,
  );
  assert.deepEqual(uncertain.counts(), { signed: 1, sent: 1 });
});
test("Arc enforces private room identities and persistent per-room caps", async (t) => {
  const f = await fixture(t, { maxRoom: 1 });
  await assert.rejects(
    f.port.transact("raw:ROOMAA", f.call),
    (e) => e.code === "INVALID_JOB",
  );
  await f.port.transact(id, f.call);
  await f.port.close();
  const restarted = await f.start();
  await assert.rejects(
    restarted.transact(id + "2", f.call),
    (e) => e.code === "RATE_LIMIT",
  );
  assert.deepEqual(f.counts(), { signed: 1, sent: 1 });
});
test("a canonically mined revert is charged once, never resent, and does not block another pull claim", async (t) => {
  const f = await fixture(t, { revertFirst: true });
  await assert.rejects(
    f.port.transact(id, f.call),
    (e) => e.code === "REVERTED",
  );
  await f.port.close();
  const restarted = await f.start();
  await assert.rejects(
    restarted.transact(id, f.call),
    (e) => e.code === "REVERTED",
  );
  assert.equal(
    (await restarted.transact(id + ":other-seat", f.call)).reconciled,
    false,
  );
  assert.deepEqual(f.counts(), { signed: 2, sent: 2 });
  const rows = await restarted.receipts();
  assert.deepEqual(
    rows.map((r) => r.status),
    ["reverted", "success"],
  );
  assert(rows.every((r) => BigInt(r.costWei) > 0n));
});
test("USDC drips reserve the native-equivalent token debit as well as gas and the retained floor", async (t) => {
  const f = await fixture(t, {
    balance: 1_000_000_000_000_000_000n,
    floor: 500_000_000_000_000_000n,
  });
  await assert.rejects(
    f.port.transact(id, {
      ...f.call,
      nativeDebitWei: 500_000_000_000_000_000n,
    }),
    (e) => e.code === "INSUFFICIENT_BALANCE",
  );
  await assert.rejects(f.port.transact(id, { ...f.call, nativeDebitWei: -1n }));
  assert.deepEqual(f.counts(), { signed: 0, sent: 0 });
});
