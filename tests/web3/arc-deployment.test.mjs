import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  encodeDeployData,
  getContractAddress,
  keccak256,
  parseTransaction,
} from "viem";
import { account } from "./fixtures/arc-chain.mjs";
import {
  deploymentLimits,
  reviewedCreation,
  preflightDeployment,
  deployOnce,
} from "../../integrations/arc/deployment.mjs";
import { deployArgs, main } from "../../scripts/web3-arc-deploy.mjs";
const pin = JSON.parse(
  await readFile(
    new URL(
      "../../integrations/arc/studio/A4-DEPLOYMENT.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const sender = account(41),
  data = "0x60006000f3",
  blockHash = `0x${"11".repeat(32)}`;

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-deploy-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const receipts = new Map(),
    txs = new Map();
  const state = {
    nonce: 0,
    pending: 0,
    sends: 0,
    signs: 0,
    balance: 10n ** 20n,
    gas: 1000000n,
    fee: 23000000000n,
    chainId: 5042002,
    timeout: false,
    revert: false,
    time: 1000n,
    reorg: false,
    code: "0x",
  };
  const client = {
    getChainId: async () => state.chainId,
    getTransactionCount: async ({ blockTag }) =>
      blockTag === "pending" ? state.pending : state.nonce,
    getBlock: async ({ blockNumber } = {}) => ({
      number: 1n,
      hash: state.reorg && blockNumber ? `0x${"22".repeat(32)}` : blockHash,
      timestamp: state.time,
      baseFeePerGas: 20000000000n,
    }),
    call: async () => ({ data: "0x6001" }),
    estimateGas: async () => state.gas,
    getGasPrice: async () => state.fee,
    getBalance: async () => state.balance,
    getCode: async () => state.code,
    async sendRawTransaction({ serializedTransaction }) {
      state.sends++;
      const decoded = parseTransaction(serializedTransaction),
        hash = keccak256(serializedTransaction);
      txs.set(hash, {
        ...decoded,
        hash,
        from: sender.address,
        to: decoded.to || null,
        value: decoded.value || 0n,
        maxPriorityFeePerGas: decoded.maxPriorityFeePerGas || 0n,
        input: decoded.data,
        blockHash,
      });
      receipts.set(hash, {
        transactionHash: hash,
        blockHash,
        blockNumber: 1n,
        status: state.revert ? "reverted" : "success",
        gasUsed: state.gas,
        effectiveGasPrice: 20000000000n,
        contractAddress: getContractAddress({
          from: sender.address,
          nonce: BigInt(decoded.nonce),
        }),
      });
      state.nonce++;
      state.pending++;
      return hash;
    },
    async getTransactionReceipt({ hash }) {
      if (!receipts.has(hash)) throw Error("Unresolved receipt");
      return receipts.get(hash);
    },
    getTransaction: async ({ hash }) => txs.get(hash),
    async waitForTransactionReceipt({ hash }) {
      if (state.timeout) throw Error("Receipt timeout");
      return receipts.get(hash);
    },
  };
  const options = {
    dir,
    client,
    owner: sender.address,
    data,
    limits: deploymentLimits(pin),
    now: () => 1000000,
    wait: async () => {},
    signTransaction: async (tx) => {
      state.signs++;
      return sender.signTransaction(tx);
    },
  };
  return { options, state, client, receipts, txs, dir };
}

test("owner deploy accepts only exact check/apply modes before env or file access", async () => {
  assert.equal(deployArgs([]), "check");
  assert.equal(deployArgs(["--check"]), "check");
  assert.equal(deployArgs(["--apply", "--confirm-arc-a4-deploy"]), "apply");
  const env = new Proxy(
    {},
    {
      get() {
        throw Error("No env access");
      },
      ownKeys() {
        throw Error("No env access");
      },
    },
  );
  for (const args of [
    ["--apply"],
    ["--check", "--force"],
    ["--apply", "--confirm-mainnet"],
    ["--apply", "--confirm-arc-a4-deploy", "--retry"],
  ])
    await assert.rejects(main(args, env), { code: "INVALID_CONFIG" });
});
test("reviewed artifact pins compiler, optimizer, bytecode and ordered constructor payload", () => {
  const artifact = {
    abi: [
      {
        type: "constructor",
        inputs: [{ name: "assets", type: "address[]" }],
        stateMutability: "nonpayable",
      },
    ],
    bytecode: { object: data },
    metadata: {
      compiler: { version: pin.compiler },
      settings: {
        evmVersion: pin.evmVersion,
        optimizer: { enabled: true, runs: 200 },
      },
    },
  };
  const assets = [
    { address: account(1).address },
    { address: account(2).address },
  ];
  const encoded = encodeDeployData({
    abi: artifact.abi,
    bytecode: data,
    args: [assets.map((a) => a.address)],
  });
  const expected = {
    ...pin,
    bytecodeHash: keccak256(data),
    creationHash: keccak256(encoded),
    creationBytes: (encoded.length - 2) / 2,
  };
  assert.equal(reviewedCreation(artifact, assets, expected), encoded);
  assert.throws(
    () => reviewedCreation(artifact, [...assets].reverse(), expected),
    /payload/,
  );
  assert.throws(
    () =>
      reviewedCreation(
        { ...artifact, bytecode: { object: "0x6001" } },
        assets,
        expected,
      ),
    /artifact/,
  );
  artifact.metadata.settings.optimizer.runs = 201;
  assert.throws(() => reviewedCreation(artifact, assets, expected), /artifact/);
  assert.throws(
    () => deploymentLimits({ ...pin, maximumGasUSDC: "0.11" }),
    /ceiling/,
  );
  assert.throws(
    () => deploymentLimits({ ...pin, minimumFeeGwei: "19" }),
    /ceiling/,
  );
});
test("unsigned preflight includes margin, quote, exact nonce, fee floor and retained balance", async (t) => {
  const f = await fixture(t),
    p = await preflightDeployment(f.options);
  assert.equal(p.gas, 1200000n);
  assert.equal(p.fee, 23000000000n);
  assert.equal(p.cost, 27600000000000000n);
  assert.equal(
    p.address,
    getContractAddress({ from: sender.address, nonce: 0n }),
  );
  f.state.fee = 1n;
  assert.equal((await preflightDeployment(f.options)).fee, 20000000000n);
  assert.equal(f.state.signs, 0);
  assert.equal(f.state.sends, 0);
});
test("fee, gas and retained-balance limits stop before a signature", async (t) => {
  const f = await fixture(t);
  for (const [field, value, code] of [
    ["fee", 101000000000n, "BUDGET_EXCEEDED"],
    ["gas", 10000000n, "BUDGET_EXCEEDED"],
    ["balance", 50000000000000000n, "INSUFFICIENT_BALANCE"],
  ]) {
    const prior = f.state[field];
    f.state[field] = value;
    await assert.rejects(deployOnce(f.options), { code });
    f.state[field] = prior;
  }
  assert.equal(f.state.signs, 0);
  assert.equal(f.state.sends, 0);
});
test("wrong chain, pending nonce, stale block, reorg and occupied address stop deployment", async (t) => {
  const f = await fixture(t);
  for (const [field, value] of [
    ["chainId", 5042],
    ["pending", 1],
    ["time", 900n],
    ["reorg", true],
    ["code", "0x6000"],
  ]) {
    const prior = f.state[field];
    f.state[field] = value;
    await assert.rejects(deployOnce(f.options));
    f.state[field] = prior;
  }
  await assert.rejects(deployOnce({ ...f.options, chainId: 31337 }), {
    code: "INVALID_CONFIG",
  });
  assert.equal(f.state.signs, 0);
  assert.equal(f.state.sends, 0);
});
test("successful direct creation is canonical, bounded and replayed without signing", async (t) => {
  const f = await fixture(t),
    result = await deployOnce(f.options);
  assert.equal(result.reconciled, false);
  const saved = JSON.parse(
    await readFile(path.join(f.dir, "arc-deployment/journal.json"), "utf8"),
  );
  assert.equal(saved.status, "success");
  assert.equal(saved.costWei, "20000000000000000");
  assert(!("signed" in saved) && !("privateKey" in saved));
  assert.equal(
    (await stat(path.join(f.dir, "arc-deployment/journal.json"))).mode & 0o777,
    0o600,
  );
  const replay = await deployOnce({
    ...f.options,
    signTransaction: () => {
      throw Error("Never sign twice");
    },
  });
  assert.equal(replay.hash, result.hash);
  assert.equal(replay.reconciled, true);
  assert.equal(f.state.sends, 1);
  await assert.rejects(deployOnce({ ...f.options, data: "0x6001" }), {
    code: "CONFLICT",
  });
});
test("post-send receipt timeout recovers the admitted hash without another send", async (t) => {
  const f = await fixture(t);
  f.state.timeout = true;
  await assert.rejects(deployOnce(f.options), /timeout/);
  const resumed = await deployOnce(f.options);
  assert.equal(resumed.reconciled, true);
  assert.equal(f.state.sends, 1);
  assert.equal(f.state.signs, 1);
});
test("canonical receipt waits for pending or stale transaction metadata without another send", async (t) => {
  for (const staleHash of [null, `0x${"33".repeat(32)}`]) {
    const f = await fixture(t),
      original = f.client.getTransaction;
    let reads = 0,
      waits = 0;
    f.client.getTransaction = async (args) => {
      const tx = await original(args);
      return ++reads < 3 ? { ...tx, blockHash: staleHash } : tx;
    };
    const result = await deployOnce({
      ...f.options,
      wait: async () => waits++,
    });
    assert.equal(result.reconciled, false);
    assert.equal(reads, 3);
    assert.equal(waits, 2);
    assert.equal(f.state.sends, 1);
    assert.equal(f.state.signs, 1);
  }
});
test("permanent transaction metadata disagreement stops after bounded reads and preserves no-resend journal", async (t) => {
  const f = await fixture(t),
    original = f.client.getTransaction;
  let reads = 0,
    waits = 0;
  f.client.getTransaction = async (args) => {
    reads++;
    return { ...(await original(args)), blockHash: null };
  };
  await assert.rejects(
    deployOnce({ ...f.options, wait: async () => waits++ }),
    { code: "INVALID_PROOF", failedChecks: ["transactionBlock"] },
  );
  assert.equal(reads, 4);
  assert.equal(waits, 3);
  const saved = JSON.parse(
    await readFile(path.join(f.dir, "arc-deployment/journal.json"), "utf8"),
  );
  assert.equal(saved.status, "prepared");
  assert.deepEqual(saved.lastProofFailure.checks, ["transactionBlock"]);
  f.client.getTransaction = original;
  const resumed = await deployOnce(f.options);
  assert.equal(resumed.reconciled, true);
  assert.equal(f.state.sends, 1);
  assert.equal(f.state.signs, 1);
  const reconciled = JSON.parse(
    await readFile(path.join(f.dir, "arc-deployment/journal.json"), "utf8"),
  );
  assert.equal(reconciled.status, "success");
  assert.equal(reconciled.lastProofFailure, undefined);
});
test("uncertain or canonically reverted creation cannot be resent", async (t) => {
  const f = await fixture(t);
  f.state.revert = true;
  await assert.rejects(deployOnce(f.options), { code: "REVERTED" });
  await assert.rejects(deployOnce(f.options), { code: "REVERTED" });
  f.receipts.clear();
  await assert.rejects(deployOnce(f.options), { code: "UNRESOLVED" });
  assert.equal(f.state.sends, 1);
  assert.equal(f.state.signs, 1);
});
test("signed recipient, nonce, fee or owner substitution cannot be broadcast", async (t) => {
  const f = await fixture(t);
  for (const change of [
    { to: account(3).address },
    { nonce: 42 },
    { maxPriorityFeePerGas: 1n },
    { gas: 1n },
  ])
    await assert.rejects(
      deployOnce({
        ...f.options,
        signTransaction: (tx) => sender.signTransaction({ ...tx, ...change }),
      }),
      { code: "WRONG_SIGNATURE" },
    );
  await assert.rejects(
    deployOnce({
      ...f.options,
      signTransaction: (tx) => account(5).signTransaction(tx),
    }),
    { code: "WRONG_SIGNATURE" },
  );
  assert.equal(f.state.sends, 0);
});
test("kill after admission preserves a no-resend journal", async (t) => {
  const f = await fixture(t);
  let checks = 0;
  await assert.rejects(
    deployOnce({ ...f.options, killed: async () => ++checks >= 3 }),
    { code: "KILLED" },
  );
  await assert.rejects(deployOnce(f.options), { code: "UNRESOLVED" });
  assert.equal(f.state.signs, 1);
  assert.equal(f.state.sends, 0);
});
test("receipt reorg, wrong calldata, excess gas and wrong address never verify", async (t) => {
  const f = await fixture(t),
    first = await deployOnce(f.options),
    tx = f.txs.get(first.hash),
    receipt = f.receipts.get(first.hash);
  for (const [object, key, value] of [
    [tx, "input", "0x6001"],
    [receipt, "gasUsed", 1200001n],
    [receipt, "contractAddress", account(6).address],
  ]) {
    const prior = object[key];
    object[key] = value;
    await assert.rejects(deployOnce(f.options));
    object[key] = prior;
  }
  f.state.reorg = true;
  await assert.rejects(deployOnce(f.options), { code: "INVALID_PROOF" });
  const journal = JSON.parse(
    await readFile(path.join(f.dir, "arc-deployment/journal.json"), "utf8"),
  );
  assert.deepEqual(journal.lastProofFailure.checks, [
    "receiptBlock",
    "transactionBlock",
  ]);
  assert.equal(f.state.sends, 1);
});
test("two owner processes cannot admit the same deployment concurrently", async (t) => {
  const f = await fixture(t);
  let enter, resume;
  const entered = new Promise((resolve) => {
      enter = resolve;
    }),
    held = new Promise((resolve) => {
      resume = resolve;
    });
  const first = deployOnce({
    ...f.options,
    signTransaction: async (tx) => {
      enter();
      await held;
      return sender.signTransaction(tx);
    },
  });
  await entered;
  await assert.rejects(deployOnce(f.options), /already owns/);
  resume();
  await first;
  assert.equal(f.state.sends, 1);
});
