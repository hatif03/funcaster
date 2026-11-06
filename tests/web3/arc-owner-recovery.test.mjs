import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { encodeFunctionData, keccak256 } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  exactFinalization,
  checkExactRecovery,
  recoverExactOnce,
} from "../../integrations/arc/owner-recovery.mjs";
import { POT_ABI } from "../../integrations/arc/chain.mjs";
import { atomicJson, readJson } from "../../integrations/shared/outbox.mjs";
import {
  main,
  recoveryArgs,
  retainedFinalization,
  finishRetainedClaims,
} from "../../scripts/web3-arc-recover-finalize.mjs";
import { acceptanceConfig } from "../../scripts/web3-arc-acceptance.mjs";
import { arcLimits } from "../../integrations/arc/config.mjs";
import { arcFailure } from "../../integrations/arc/diagnostics.mjs";

const hex = (s, n = 32) => `0x${s.repeat(n)}`;
const forbidden = () => {
  throw Error("Forbidden side effect or secret access");
};
async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-owner-recovery-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const account = privateKeyToAccount(generatePrivateKey()),
    potId = hex("11"),
    contract = hex("22", 20),
    places = [1, 2];
  const tx = {
    chainId: 5042002,
    type: "eip1559",
    to: contract,
    data: encodeFunctionData({
      abi: POT_ABI,
      functionName: "finalize",
      args: [potId, places],
    }),
    value: 0n,
    nonce: 52,
    gas: 111584n,
    maxFeePerGas: 40000000000n,
    maxPriorityFeePerGas: 0n,
  };
  const signed = await account.signTransaction(tx),
    hash = keccak256(signed);
  const entry = {
    id: `room:fixture:pot:${potId}:recover:finalize`,
    hash,
    to: contract,
    dataHash: keccak256(tx.data),
    nonce: 52,
    gas: String(tx.gas),
    maxFeePerGas: String(tx.maxFeePerGas),
    status: "prepared",
  };
  const args = {
    entry,
    owner: account.address,
    contract,
    potId,
    places,
    expectedHash: hash,
    spentWei: 108200200000000000n,
  };
  const state = {
    seen: "absent",
    sends: 0,
    signs: 0,
    time: 1000000,
    nonce: 52,
    ready: 0,
  };
  const block = {
    number: 10n,
    hash: hex("33"),
    timestamp: 1000n,
    baseFeePerGas: 20000000000n,
  };
  const receipt = {
    transactionHash: hash,
    blockHash: block.hash,
    blockNumber: 10n,
    status: "success",
    gasUsed: 90000n,
    effectiveGasPrice: 20000000000n,
  };
  const observed = {
    ...tx,
    hash,
    from: account.address,
    input: tx.data,
    blockHash: block.hash,
    blockNumber: 10n,
  };
  const miss = (name) => {
    throw Object.assign(Error("private RPC detail"), { name });
  };
  const client = {
    getChainId: async () => 5042002,
    getTransaction: async () =>
      state.seen === "absent" ? miss("TransactionNotFoundError") : observed,
    getTransactionReceipt: async () =>
      state.seen !== "confirmed"
        ? miss("TransactionReceiptNotFoundError")
        : receipt,
    getTransactionCount: async () => state.nonce,
    getBlock: async () => block,
    getBalance: async () => 1000000000000000000n,
    call: async () => ({ data: "0x" }),
    estimateGas: async () => 92986n,
    sendRawTransaction: async (input) => {
      state.sends++;
      const marker = await readJson(path.join(dir, "marker.json"));
      assert.equal(
        marker.status,
        "dispatching",
        "marker must exist before dispatch",
      );
      assert.equal(keccak256(input.serializedTransaction), hash);
      state.seen = "confirmed";
      return hash;
    },
  };
  const options = {
    candidate: exactFinalization(args),
    clients: [client, { ...client }],
    markerFile: path.join(dir, "marker.json"),
    wallet: {
      account,
      signTransaction: async (value) => {
        state.signs++;
        return account.signTransaction(value);
      },
    },
    now: () => state.time,
    wait: async (ms) => {
      state.time += ms;
    },
    ready: async () => {
      state.ready++;
    },
  };
  return {
    dir,
    account,
    entry,
    args,
    state,
    block,
    receipt,
    observed,
    client,
    options,
  };
}
test("owner recovery requires exact flags before file, env or RPC access", async () => {
  const env = new Proxy({}, { get: forbidden, ownKeys: forbidden });
  for (const args of [
    [],
    ["--apply"],
    ["--check", "--force"],
    ["--apply", "--confirm-arc-a4"],
    ["--apply", "--confirm-arc-a4-finalize-recovery", "--force"],
  ]) {
    assert.throws(
      () => recoveryArgs(args),
      (e) => e.code === "INVALID_CONFIG",
    );
    await assert.rejects(main(args, env), (e) => e.code === "INVALID_CONFIG");
  }
  assert.equal(recoveryArgs(["--check"]), true);
  assert.equal(
    recoveryArgs(["--apply", "--confirm-arc-a4-finalize-recovery"]),
    false,
  );
});
test("keyless recovery check simulates without signing, dispatching or writing a marker", async (t) => {
  const f = await fixture(t);
  const result = await checkExactRecovery({
    ...f.options,
    wallet: new Proxy({}, { get: forbidden }),
  });
  assert.equal(result.ready, true);
  assert.equal(result.nonce, 52);
  assert.equal(f.state.ready, 2);
  assert.equal(f.state.sends, 0);
  assert.equal(f.state.signs, 0);
  assert.equal(await readJson(f.options.markerFile), null);
});
test("finalization recovery binds immutable intent and the original total gas ceiling", async (t) => {
  const f = await fixture(t);
  for (const change of [
    { expectedHash: hex("44") },
    { places: [2, 1] },
    { contract: hex("55", 20) },
    { spentWei: 500000000000000000n },
    { entry: { ...f.entry, status: "reverted" } },
    { entry: { ...f.entry, gas: "0" } },
    { entry: { ...f.entry, maxFeePerGas: "100000000001" } },
  ])
    assert.throws(() => exactFinalization({ ...f.args, ...change }));
});
test("transport outages never count as transaction absence", async (t) => {
  const f = await fixture(t);
  f.options.clients[1].getTransaction = async () => {
    throw Object.assign(Error("private"), { status: 429 });
  };
  await assert.rejects(recoverExactOnce(f.options));
  assert.equal(f.state.signs, 0);
  assert.equal(f.state.sends, 0);
});
test("unused nonce, fresh canonical block, retained floor and exact gas are required on both hosts", async (t) => {
  for (const change of [
    { getChainId: async () => 1 },
    { getTransactionCount: async () => 53 },
    { getBalance: async () => 0n },
    { estimateGas: async () => 111585n },
    {
      getBlock: async () => ({
        number: 10n,
        hash: hex("33"),
        timestamp: 950n,
        baseFeePerGas: 20000000000n,
      }),
    },
    {
      call: async () => {
        throw Error("Simulation reverted");
      },
    },
  ]) {
    const f = await fixture(t);
    Object.assign(f.options.clients[1], change);
    await assert.rejects(recoverExactOnce(f.options));
    assert.equal(f.state.signs, 0);
    assert.equal(f.state.sends, 0);
  }
});
test("pending or disagreeing hosts never sign; a canonically mined hash is read-only recovery", async (t) => {
  const f = await fixture(t);
  f.state.seen = "pending";
  await assert.rejects(
    recoverExactOnce(f.options),
    (e) => e.code === "RECOVERY_WAIT",
  );
  f.state.seen = "confirmed";
  const r = await recoverExactOnce({
    ...f.options,
    wallet: new Proxy({}, { get: forbidden }),
  });
  assert.equal(r.state, "confirmed");
  assert.equal(f.state.sends, 0);
  assert.equal(f.state.signs, 0);
  f.receipt.blockHash = hex("99");
  await assert.rejects(
    recoverExactOnce(f.options),
    (e) => e.code === "INVALID_PROOF",
  );
});
test("owner recovery dispatches the identical signed hash exactly once and stores no signed bytes", async (t) => {
  const f = await fixture(t);
  const result = await recoverExactOnce(f.options);
  assert.equal(result.state, "confirmed");
  assert.equal(f.state.sends, 1);
  assert.equal(f.state.signs, 1);
  assert.equal((await stat(f.options.markerFile)).mode & 0o777, 0o600);
  assert.equal((await readJson(f.options.markerFile)).status, "confirmed");
  assert(
    !(await readFile(f.options.markerFile, "utf8")).includes(
      f.options.candidate.transaction.data,
    ),
  );
  await recoverExactOnce({
    ...f.options,
    wallet: new Proxy({}, { get: forbidden }),
  });
  assert.equal(f.state.sends, 1);
});
test("uncertain dispatch leaves a durable barrier even when both RPCs still report absence", async (t) => {
  const f = await fixture(t);
  f.options.clients[1].sendRawTransaction = async () => {
    f.state.sends++;
    assert.equal((await readJson(f.options.markerFile)).status, "dispatching");
    throw Error("private raw request");
  };
  await assert.rejects(
    recoverExactOnce(f.options),
    (e) => e.code === "RECOVERY_SEND_UNCERTAIN",
  );
  assert.equal((await readJson(f.options.markerFile)).status, "uncertain");
  await assert.rejects(
    recoverExactOnce(f.options),
    (e) => e.code === "RECOVERY_ALREADY_ATTEMPTED",
  );
  assert.equal(f.state.sends, 1);
  assert.equal(f.state.signs, 1);
  assert(!(await readFile(f.options.markerFile, "utf8")).includes("private"));
  f.state.seen = "confirmed";
  assert.equal((await recoverExactOnce(f.options)).state, "confirmed");
  assert.equal(f.state.sends, 1);
});
test("kill or a different deterministic signature cannot dispatch or leave a recovery marker", async (t) => {
  for (const mode of ["kill", "signature"]) {
    const f = await fixture(t);
    if (mode === "kill") f.options.killed = async () => true;
    else
      f.options.wallet.signTransaction = (tx) =>
        f.account.signTransaction({ ...tx, nonce: 53 });
    await assert.rejects(recoverExactOnce(f.options));
    assert.equal(f.state.sends, 0);
    assert.equal(await readJson(f.options.markerFile), null);
  }
});
test("owner recovery refuses a reverted original transaction and never reprices", async (t) => {
  const f = await fixture(t);
  f.state.seen = "confirmed";
  f.receipt.status = "reverted";
  await assert.rejects(
    recoverExactOnce(f.options),
    (e) => e.code === "REVERTED",
  );
  assert.equal(f.state.sends, 0);
  f.receipt.status = "success";
  f.observed.maxFeePerGas++;
  await assert.rejects(
    recoverExactOnce(f.options),
    (e) => e.code === "INVALID_PROOF",
  );
});
test("claims completion waits for canonical journals after balances reach zero", async (t) => {
  const f = await fixture(t);
  let polls = 0;
  const j = {
    entries: Array.from({ length: 50 }, () => ({ status: "success" })),
  };
  j.entries[49].status = "prepared";
  await atomicJson(
    path.join(f.dir, "arc-relayer-transactions/journal.json"),
    j,
  );
  await atomicJson(path.join(f.dir, "arc-lifecycle/journal.json"), {
    pots: { one: { claimsComplete: false } },
  });
  const provider = {
    chain: {
      snapshot: async () => ({ state: "Settled", claimables: [0n, 0n] }),
    },
    idle: async () => {
      polls++;
      if (polls === 2) {
        j.entries[49].status = "success";
        await atomicJson(
          path.join(f.dir, "arc-relayer-transactions/journal.json"),
          j,
        );
        await atomicJson(path.join(f.dir, "arc-lifecycle/journal.json"), {
          pots: { one: { claimsComplete: true } },
        });
      }
    },
  };
  await finishRetainedClaims({
    dir: f.dir,
    provider,
    potId: hex("11"),
    wait: async () => {},
  });
  assert.equal(polls, 2);
});
test("recovery diagnostics contain only allowlisted codes", () => {
  for (const code of [
    "RECOVERY_WAIT",
    "RECOVERY_ALREADY_ATTEMPTED",
    "RECOVERY_SEND_UNCERTAIN",
  ])
    assert.equal(
      arcFailure(Object.assign(Error("private"), { code })).code,
      code,
    );
});

test("post-dispatch proof failure records named checks and later reconciles without signing or sending", async (t) => {
  const f = await fixture(t);
  f.options.clients[1].sendRawTransaction = async (input) => {
    assert.equal(keccak256(input.serializedTransaction), f.entry.hash);
    f.state.sends++;
    f.state.seen = "confirmed";
    f.observed.blockHash = null;
    return f.entry.hash;
  };
  await assert.rejects(recoverExactOnce(f.options), (e) => {
    assert.equal(e.code, "INVALID_PROOF");
    assert.deepEqual(arcFailure(e).recoveryChecks, ["txBlock"]);
    return true;
  });
  const marker = await readJson(f.options.markerFile);
  assert.equal(marker.status, "acknowledged");
  assert.deepEqual(marker.failure.recoveryChecks, ["txBlock"]);
  f.observed.blockHash = f.block.hash;
  const result = await recoverExactOnce({
    ...f.options,
    wallet: new Proxy({}, { get: forbidden }),
  });
  assert.equal(result.state, "confirmed");
  assert.equal(f.state.sends, 1);
  assert.equal(f.state.signs, 1);
  assert.equal((await readJson(f.options.markerFile)).status, "confirmed");
});

test("recovery proof diagnostics discard untrusted fields, values and duplicates", () => {
  const error = Object.assign(Error("private request body"), {
    code: "INVALID_PROOF",
    recoveryChecks: [
      "txBlock",
      "secret raw calldata",
      "txBlock",
      "priceCeiling",
      {},
    ],
  });
  const safe = arcFailure(error);
  assert.deepEqual(safe.recoveryChecks, ["txBlock", "priceCeiling"]);
  assert(!JSON.stringify(safe).includes("secret"));
  assert(!JSON.stringify(safe).includes("private"));
});

test("recovery shares the original limits even if environment settings try to raise them", () => {
  const config = acceptanceConfig({
    env: {
      ARC_RELAYER_KEY: generatePrivateKey(),
      ARC_ORACLE_KEY: generatePrivateKey(),
      ARC_RELAYER_MAX_GAS_USDC: "100",
      ARC_DRIP_MAX_TOTAL_EURC: "100",
      ARC_MAX_FEE_GWEI: "200",
      ARC_MEMO: "on",
      WEB3_KILL: "1",
    },
    dir: "/tmp/unused",
    relayer: hex("11", 20),
    oracle: hex("22", 20),
    source: {
      rpcUrls: [
        "https://rpc.testnet.arc.io",
        "https://rpc.testnet.arc.network",
      ],
      assets: [{ address: hex("33", 20) }, { address: hex("44", 20) }],
    },
    deployment: {
      contract: hex("55", 20),
      runtimeCodeHash: hex("66"),
      blockNumber: 1,
    },
  });
  const limits = arcLimits(config);
  assert.equal(limits.roles.relayer.budgetWei, 500000000000000000n);
  assert.equal(limits.roles.oracle.budgetWei, 50000000000000000n);
  assert.equal(limits.drip.eurc.total, 120000n);
  assert.equal(limits.roles.relayer.maxFeePerGasWei, 100000000000n);
  assert.equal(config.ARC_MEMO, "off");
  assert.equal(config.WEB3_KILL, "1");
});

test("retained recovery rejects another checkpoint, incomplete old pot, altered admission or extra transaction", () => {
  const potId = hex("11"),
    hash = hex("22"),
    contract = hex("33", 20),
    creationTx = hex("44"),
    dataHash = hex("55");
  const oldPots = Array.from({ length: 7 }, (_, i) => ({
    potId: `0x${(i + 100).toString(16).padStart(64, "0")}`,
    claimsComplete: true,
  }));
  const checks = ["usdc", "eurc"]
    .flatMap((a) => [
      `${a} bankroll seat 1`,
      `${a} bankroll seat 2`,
      ...["cooperative", "refund", "contest", "finalize"].map(
        (k) => `${a} ${k}`,
      ),
    ])
    .slice(0, -1)
    .map((id) => ({ id, status: "PASS-PUBLIC-SCRIPT" }));
  let n = 0;
  for (const row of checks)
    if (!row.id.includes("bankroll")) row.potId = oldPots[n++].potId;
  const input = {
    chainId: 5042002,
    contract,
    potId,
    hash,
    dataHash,
    nonce: 52,
    gas: "111584",
    maxFeePerGas: "40000000000",
  };
  const entry = {
    ...input,
    id: `room:test:pot:${potId}:recover:finalize`,
    status: "prepared",
  };
  const base = {
    report: { complete: false, checks, deployment: { contract, creationTx } },
    pin: { contract, creationTx },
    input,
    relayer: {
      chainId: 5042002,
      entries: [
        ...Array.from({ length: 47 }, (_, i) => ({
          status: "success",
          nonce: i + 5,
        })),
        entry,
      ],
    },
    oracle: {
      chainId: 5042002,
      entries: Array.from({ length: 4 }, () => ({ status: "success" })),
    },
    lifecycle: {
      pots: Object.fromEntries(
        [...oldPots, { potId, places: [1, 2] }].map((p) => [p.potId, p]),
      ),
    },
  };
  assert.equal(retainedFinalization(base).entry.hash, hash);
  for (const change of [
    (b) => (b.report.complete = true),
    (b) => b.report.checks.pop(),
    (b) => (b.lifecycle.pots[oldPots[0].potId].claimsComplete = false),
    (b) => (b.relayer.entries[47].hash = hex("66")),
    (b) => b.relayer.entries.push({ nonce: 53, id: "another-pot:claim:" }),
    (b) => (b.oracle.entries[0].status = "prepared"),
  ]) {
    const b = structuredClone(base);
    change(b);
    assert.throws(
      () => retainedFinalization(b),
      (e) => e.code === "INVALID_PROOF",
    );
  }
});

test("receipt timeout is bounded and its write-ahead marker still forbids a second dispatch", async (t) => {
  const f = await fixture(t);
  f.options.clients[1].sendRawTransaction = async () => {
    f.state.sends++;
    return f.entry.hash;
  };
  f.options.wait = async () => {
    f.state.time += 121000;
  };
  await assert.rejects(
    recoverExactOnce(f.options),
    (e) => e.code === "RECOVERY_WAIT",
  );
  f.block.timestamp = BigInt(Math.floor(f.state.time / 1000));
  await assert.rejects(
    recoverExactOnce(f.options),
    (e) => e.code === "RECOVERY_ALREADY_ATTEMPTED",
  );
  assert.equal(f.state.sends, 1);
});
