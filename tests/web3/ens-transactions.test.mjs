import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  keccak256,
  parseTransaction,
  createWalletClient,
  custom,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createEnsTransactions } from "../../integrations/ens/transactions.mjs";
import {
  request,
  addressCall,
  textCalls,
} from "../../integrations/ens/lifecycle-calls.mjs";

// Public deterministic test-only key. It is never funded or used on a network.
const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const target = `0x${"22".repeat(20)}`,
  blockHash = `0x${"ab".repeat(32)}`;
test("room and hourly caps survive restart and count warm-pool transactions", async (t) => {
  const f = await fixture(t, { maxPerRoom: 1, maxPerHour: 2 });
  const room = `party:${"a".repeat(64)}`;
  await f.port.transact(`${room}:parent`, f.call);
  await f.port.transact("pair:one:registry", f.call);
  await f.port.close();
  const restarted = await f.start();
  await assert.rejects(
    restarted.transact(`party:${"b".repeat(64)}:parent`, f.call),
    (e) => e.code === "RATE_LIMIT",
  );
  f.advance(3601);
  await assert.rejects(
    restarted.transact(`${room}:register`, f.call),
    (e) => e.code === "RATE_LIMIT",
  );
  await restarted.transact(`party:${"b".repeat(64)}:parent`, f.call);
  assert.deepEqual(f.counts(), { broadcasts: 3, signatures: 3 });
});
async function fixture(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "chonks-ens-tx-"));
  let port,
    nonce = 0,
    chainId = options.chainId || 11155111,
    broadcasts = 0,
    signatures = 0,
    timestamp = 10000n;
  const receipts = new Map(),
    transactions = new Map();
  const journal = () =>
    fs.readFile(path.join(dir, "ens-transactions/journal.json"), "utf8");
  const client = {
    async getChainId() {
      return chainId;
    },
    async getTransactionCount() {
      return nonce;
    },
    async getBlock() {
      return { number: 1n, hash: blockHash, baseFeePerGas: 2n, timestamp };
    },
    async getTransactionReceipt({ hash }) {
      if (!receipts.has(hash)) throw Error("Receipt not found");
      return receipts.get(hash);
    },
    async getTransaction({ hash }) {
      return transactions.get(hash);
    },
    async simulateContract() {},
    async estimateGas() {
      return 100n;
    },
    async getBalance() {
      return 100000n;
    },
    async sendRawTransaction({ serializedTransaction }) {
      broadcasts++;
      const hash = keccak256(serializedTransaction),
        stored = JSON.parse(await journal());
      assert.equal(
        stored.entries.at(-1).hash,
        hash,
        "hash must be durable before broadcast",
      );
      assert.equal(
        (await journal()).includes(serializedTransaction),
        false,
        "never store signed bytes",
      );
      if (options.failBeforeBroadcast) throw Error("Connection timeout");
      const tx = parseTransaction(serializedTransaction);
      transactions.set(hash, {
        ...tx,
        from: account.address,
        input: tx.data,
        value: tx.value || 0n,
        blockHash,
      });
      receipts.set(hash, {
        transactionHash: hash,
        blockHash,
        blockNumber: 1n,
        status: options.revert ? "reverted" : "success",
        gasUsed: 90n,
        effectiveGasPrice: 3n,
      });
      nonce++;
      if (options.failAfterBroadcast)
        throw Error("Connection timeout after admission");
      return hash;
    },
    async waitForTransactionReceipt({ hash }) {
      return receipts.get(hash);
    },
  };
  const wallet = {
    account,
    async signTransaction(tx) {
      signatures++;
      return account.signTransaction(
        options.wrongSignature ? { ...tx, to: account.address } : tx,
      );
    },
  };
  const start = async () => {
    port = await createEnsTransactions({
      dir,
      client,
      wallet,
      chainId: options.chainId || 11155111,
      owner: account.address,
      budgetWei: options.budgetWei || 100000n,
      maxTransactions: options.maxTransactions || 10,
      priorityFeeWei: 1n,
      maxFeePerGasWei: options.maxFeePerGasWei || 100n,
      killed: options.killed,
      maxPerRoom: options.maxPerRoom,
      maxPerHour: options.maxPerHour,
    });
    return port;
  };
  t.after(async () => {
    await port?.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  return {
    dir,
    client,
    wallet,
    journal,
    receipts,
    transactions,
    start,
    port: await start(),
    counts: () => ({ broadcasts, signatures }),
    advance: (n) => {
      timestamp += BigInt(n);
    },
    setNonce(n) {
      nonce = n;
    },
    setChain(n) {
      chainId = n;
    },
    call: request(
      "registry",
      target,
      "setParent",
      [target, "party"],
      account.address,
    ),
  };
}
test("transaction admissions persist hashes first, reconcile receipts and never repeat an ID", async (t) => {
  const f = await fixture(t);
  const first = await f.port.transact("open:1", f.call);
  await f.port.close();
  const restarted = await f.start();
  const second = await restarted.transact("open:1", f.call);
  assert.equal(first.tx, second.tx);
  assert.equal(second.reconciled, true);
  assert.deepEqual(f.counts(), { broadcasts: 1, signatures: 1 });
  assert.equal(
    (await fs.stat(path.join(f.dir, "ens-transactions/journal.json"))).mode &
      0o777,
    0o600,
  );
});
test("post-broadcast timeout reconciles a mined receipt without resending", async (t) => {
  const f = await fixture(t, { failAfterBroadcast: true });
  await assert.rejects(f.port.transact("open:1", f.call), /timeout/);
  assert.equal((await f.port.transact("open:1", f.call)).reconciled, true);
  assert.deepEqual(f.counts(), { broadcasts: 1, signatures: 1 });
});
test("uncertain or never-broadcast prepared hash stops all subsequent sends", async (t) => {
  const f = await fixture(t, { failBeforeBroadcast: true });
  await assert.rejects(f.port.transact("open:1", f.call), /timeout/);
  const saved = await f.journal();
  assert.equal(await f.port.hasAdmission("open:"), true);
  assert.equal(await f.port.hasAdmission("other:"), false);
  assert.equal(
    await f.journal(),
    saved,
    "presence checks never alter journals",
  );
  for (const id of ["open:1", "open:2"])
    await assert.rejects(f.port.transact(id, f.call), /unresolved/);
  assert.deepEqual(f.counts(), { broadcasts: 1, signatures: 1 });
});
test("changed payload under an existing ID is rejected", async (t) => {
  const f = await fixture(t);
  await f.port.transact("open:1", f.call);
  await assert.rejects(
    f.port.transact("open:1", { ...f.call, args: [target, "different"] }),
    (e) => e.code === "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(f.counts().broadcasts, 1);
});
test("gas reservation and transaction-count limits reject before signing", async (t) => {
  for (const options of [{ budgetWei: 500n }, { maxFeePerGasWei: 4n }]) {
    const f = await fixture(t, options);
    await assert.rejects(
      f.port.transact("open:1", f.call),
      (e) => e.code === "BUDGET_EXCEEDED",
    );
    assert.deepEqual(f.counts(), { broadcasts: 0, signatures: 0 });
  }
  const f = await fixture(t, { maxTransactions: 1 });
  await f.port.transact("open:1", f.call);
  await assert.rejects(
    f.port.transact("open:2", f.call),
    (e) => e.code === "BUDGET_EXCEEDED",
  );
  assert.equal(f.counts().signatures, 1);
});
test("canonical receipt costs count toward the aggregate ceiling", async (t) => {
  const f = await fixture(t, { budgetWei: 700n });
  await f.port.transact("open:1", f.call);
  await assert.rejects(
    f.port.transact("open:2", f.call),
    (e) => e.code === "BUDGET_EXCEEDED",
  );
  assert.equal(f.counts().broadcasts, 1);
});
test("receipt tampering and reverted transactions cannot unlock another send", async (t) => {
  const f = await fixture(t);
  const result = await f.port.transact("open:1", f.call);
  f.transactions.get(result.tx).to = account.address;
  await assert.rejects(
    f.port.transact("open:2", f.call),
    (e) => e.code === "RECEIPT_MISMATCH",
  );
  const reverted = await fixture(t, { revert: true });
  await assert.rejects(
    reverted.port.transact("open:1", reverted.call),
    (e) => e.code === "REVERTED",
  );
  await assert.rejects(
    reverted.port.transact("open:2", reverted.call),
    (e) => e.code === "REVERTED",
  );
  assert.equal(reverted.counts().broadcasts, 1);
});
test("history proof reads overlap within a bound, refresh every hash, and drain failures before another admission", async (t) => {
  const f = await fixture(t, { chainId: 31337 });
  for (let i = 0; i < 5; i++) await f.port.transact(`parallel:${i}`, f.call);
  let active = 0,
    peak = 0;
  const seen = new Map(),
    original = f.client.getTransactionReceipt;
  f.client.getTransactionReceipt = async ({ hash }) => {
    active++;
    peak = Math.max(peak, active);
    seen.set(hash, (seen.get(hash) || 0) + 1);
    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return await original({ hash });
    } finally {
      active--;
    }
  };
  await f.port.receipts();
  assert.equal(peak, 3);
  assert.equal(active, 0);
  assert.equal(seen.size, 5);
  await f.port.receipts();
  assert.ok([...seen.values()].every((count) => count === 2));
  const first = [...f.receipts.keys()][0];
  f.receipts.get(first).blockHash = `0x${"ff".repeat(32)}`;
  await assert.rejects(
    f.port.transact("parallel:blocked", f.call),
    (e) => e.code === "RECEIPT_MISMATCH",
  );
  assert.equal(active, 0);
  assert.equal(f.counts().broadcasts, 5);
  f.receipts.delete(first);
  await assert.rejects(
    f.port.transact("parallel:unresolved", f.call),
    /unresolved/,
  );
  assert.equal(active, 0);
  assert.equal(f.counts().broadcasts, 5);
});
test("outside nonce movement and chain mismatch stop signing", async (t) => {
  const f = await fixture(t);
  await f.port.transact("open:1", f.call);
  f.setNonce(2);
  await assert.rejects(
    f.port.transact("open:2", f.call),
    (e) => e.code === "NONCE_CONFLICT",
  );
  f.setChain(1);
  await assert.rejects(
    f.port.transact("open:2", f.call),
    (e) => e.code === "WRONG_CHAIN",
  );
  assert.equal(f.counts().broadcasts, 1);
});
test("wrong signed intent never reaches the network", async (t) => {
  const f = await fixture(t, { wrongSignature: true });
  await assert.rejects(
    f.port.transact("open:1", f.call),
    (e) => e.code === "WRONG_SIGNATURE",
  );
  assert.equal(f.counts().broadcasts, 0);
  assert.equal(JSON.parse(await f.journal()).entries.length, 0);
});
test("local wallet accepts identical mixed-case dynamic bytes but rejects a one-byte calldata change", async (t) => {
  for (const tamper of [false, true]) {
    const f = await fixture(t, { chainId: 31337 });
    const localWallet = createWalletClient({
      account,
      chain: {
        id: 31337,
        name: "Local signing fixture",
        nativeCurrency: { name: "Local Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: ["http://127.0.0.1:1"] } },
      },
      transport: custom({
        request: async ({ method }) => {
          assert.equal(method, "eth_chainId");
          return "0x7a69";
        },
      }),
    });
    f.wallet.signTransaction = (tx) =>
      localWallet.signTransaction(
        tamper
          ? {
              ...tx,
              data:
                tx.data.slice(0, -2) + (tx.data.endsWith("00") ? "01" : "00"),
            }
          : tx,
      );
    const name = "peeli.table.play.fixture.eth";
    const call = request(
      "resolver",
      target,
      "multicall",
      [
        [
          addressCall(name, account.address),
          ...textCalls(name, {
            "chonks.seat": "slot=0;shape=circle;color=#f7c600",
          }),
        ],
      ],
      account.address,
    );
    const data = encodeFunctionData(call);
    assert.notEqual(
      data,
      data.toLowerCase(),
      "fixture includes checksum casing inside dynamic bytes",
    );
    if (tamper) {
      await assert.rejects(f.port.transact("seat:fixture:records", call), {
        code: "WRONG_SIGNATURE",
      });
      assert.equal(f.counts().broadcasts, 0);
      assert.equal(JSON.parse(await f.journal()).entries.length, 0);
    } else {
      const first = await f.port.transact("seat:fixture:records", call);
      assert.equal(
        (await f.port.transact("seat:fixture:records", call)).tx,
        first.tx,
      );
      assert.equal(f.counts().broadcasts, 1);
    }
  }
});
test("kill switch before and after admission never broadcasts", async (t) => {
  const before = await fixture(t, { killed: async () => true });
  await assert.rejects(
    before.port.transact("open:1", before.call),
    (e) => e.code === "KILLED",
  );
  assert.equal(before.counts().signatures, 0);
  let checks = 0;
  const after = await fixture(t, { killed: async () => ++checks >= 3 });
  await assert.rejects(
    after.port.transact("open:1", after.call),
    (e) => e.code === "KILLED",
  );
  assert.equal(after.counts().broadcasts, 0);
  assert.equal(JSON.parse(await after.journal()).entries[0].status, "prepared");
});
