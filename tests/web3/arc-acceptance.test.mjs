import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptanceArgs,
  main,
  runAcceptanceScenario,
} from "../../scripts/web3-arc-acceptance.mjs";
import {
  arcFailure,
  withArcPhase,
} from "../../integrations/arc/diagnostics.mjs";
import { verifyArcDeployment } from "../../scripts/web3-arc-pin.mjs";
import {
  waitForWorkerReceipt,
  waitForPotOutcome,
} from "../../scripts/spikes/arc-worker-scenario.mjs";
import { createOutbox } from "../../integrations/shared/outbox.mjs";
import { createWorker } from "../../integrations/shared/worker.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("public acceptance requires exact owner flags before reading env, keys, files or RPC", async () => {
  const env = new Proxy(
    {},
    {
      get() {
        throw Error("Key access forbidden");
      },
      ownKeys() {
        throw Error("Env access forbidden");
      },
    },
  );
  for (const args of [
    [],
    ["--apply"],
    ["--apply", "--confirm-arc-a4"],
    ["--apply", "--confirm-mainnet", "--deployment", "x"],
    ["--apply", "--confirm-arc-a4", "--deployment", "x", "--force"],
    ["--check"],
    ["--check", "--deployment", "x", "--apply"],
  ]) {
    assert.throws(
      () => acceptanceArgs(args),
      (e) => e.code === "INVALID_CONFIG",
    );
    await assert.rejects(main(args, env), (e) => e.code === "INVALID_CONFIG");
  }
  assert.equal(
    acceptanceArgs(["--apply", "--confirm-arc-a4", "--deployment", "pin.json"]),
    "pin.json",
  );
  assert.equal(
    acceptanceArgs(["--check", "--deployment", "pin.json"]),
    "pin.json",
  );
});
test("startup-only acceptance opens the provider without polling, signing, broadcasting or claiming public completion", async () => {
  let starts = 0;
  const checks = [];
  const forbidden = () => {
    throw Error("No effect allowed in a startup check");
  };
  assert.equal(
    await runAcceptanceScenario({
      checkOnly: true,
      restartProvider: async () => {
        starts++;
        return { execute: forbidden, idle: forbidden };
      },
      sign: forbidden,
      advanceTo: forbidden,
      chain: { client: new Proxy({}, { get: forbidden }) },
      record: (id, detail) => checks.push({ id, detail }),
    }),
    false,
  );
  assert.equal(starts, 1);
  assert.equal(checks.length, 1);
  assert.match(checks[0].detail.scope, /READS ONLY/);
  assert.equal(
    await runAcceptanceScenario({
      checkOnly: true,
      initialProvider: { execute: forbidden, idle: forbidden },
      restartProvider: forbidden,
      record: () => {},
    }),
    false,
  );
});
test("acceptance reports the innermost startup phase and safe RPC cause chain", async () => {
  const error = Object.assign(Error("request body must stay private"), {
    name: "ContractFunctionExecutionError",
    cause: Object.assign(Error("signed calldata must stay private"), {
      name: "HttpRequestError",
      cause: Object.assign(Error("secret endpoint"), {
        name: "ConnectTimeoutError",
        code: "UND_ERR_CONNECT_TIMEOUT",
      }),
    }),
  });
  await assert.rejects(
    withArcPhase("provider-preflight", () =>
      withArcPhase("preflight-eurc", async () => {
        throw error;
      }),
    ),
    (e) => {
      assert.deepEqual(arcFailure(e), {
        code: "UND_ERR_CONNECT_TIMEOUT",
        phase: "preflight-eurc",
        causes: [
          { name: "ContractFunctionExecutionError" },
          { name: "HttpRequestError" },
          { name: "ConnectTimeoutError", code: "UND_ERR_CONNECT_TIMEOUT" },
        ],
      });
      return true;
    },
  );
});
test("diagnostics distinguish stale proofs and worker locks without exporting arbitrary error fields", () => {
  for (const [message, code] of [
    ["Arc read is stale", "STALE_READ"],
    ["Arc read changed chain or block", "INVALID_PROOF"],
    ["Another worker already owns this volume", "WORKER_BUSY"],
  ])
    assert.equal(arcFailure(Error(message)).code, code);
  const secret = "PRIVATE_KEY_OR_SIGNED_REQUEST";
  const error = Object.assign(Error(secret), {
    code: secret,
    name: secret,
    arcPhase: secret,
    step: secret,
    payload: secret,
  });
  error.cause = error;
  const safe = arcFailure(error);
  assert.equal(safe.code, "UNAVAILABLE");
  assert.equal(safe.causes.length, 12);
  assert(!JSON.stringify(safe).includes(secret));
  assert.equal(
    arcFailure({ cause: { name: "InternalRpcError", code: -32603 } }).causes[1]
      .rpcCode,
    -32603,
  );
});
test("phase diagnostics preserve frozen failures and worker-step identities", async () => {
  await assert.rejects(
    withArcPhase("provider-lifecycle", async () => {
      throw Object.freeze(Error("private"));
    }),
    (e) => arcFailure(e).phase === "provider-lifecycle",
  );
  const safe = arcFailure(
    Object.assign(Error("private"), {
      code: "ACCEPTANCE_STEP_PENDING",
      step: "arc.pot.fund",
    }),
  );
  assert.equal(safe.code, "ACCEPTANCE_STEP_PENDING");
  assert.equal(safe.step, "arc.pot.fund");
});
test("deployment pinner refuses another chain or a transaction that is not exact contract creation", async () => {
  await assert.rejects(
    verifyArcDeployment({ client: { getChainId: async () => 5042 } }),
    /testnet/,
  );
  const address = `0x${"11".repeat(20)}`,
    txHash = `0x${"22".repeat(32)}`;
  const client = {
    getChainId: async () => 5042002,
    getTransactionReceipt: async () => ({
      status: "success",
      transactionHash: txHash,
      contractAddress: address,
    }),
    getTransaction: async () => ({
      to: address,
      hash: txHash,
      value: 0n,
      chainId: 5042002,
    }),
  };
  await assert.rejects(
    verifyArcDeployment({ client, address, txHash }),
    /exact reviewed/,
  );
});
test("acceptance waits through worker backoff and an absent receipt file without duplicating an effect", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-acceptance-retry-"));
  let time = 1000000,
    effects = 0,
    observed = false;
  const payload = {
    asset: "usdc",
    address: `0x${"11".repeat(20)}`,
    device: "a".repeat(64),
    ip: "b".repeat(64),
  };
  const output = {
    tx: null,
    data: {
      mode: "mock",
      chainId: 5042002,
      blockNumber: "1",
      blockHash: `0x${"22".repeat(32)}`,
      chainTime: 1000,
      observedAt: time,
      chainVerified: false,
      outcome: "applied",
      asset: payload.asset,
      address: payload.address,
      amount: "60000",
    },
  };
  const queue = createOutbox(dir, { now: () => time });
  const worker = createWorker({
    dir,
    now: () => time,
    providers: {
      arc: {
        lookup: async () => (observed ? output : null),
        execute: async () => {
          effects++;
          observed = true;
          throw Error("First post-effect proof unavailable");
        },
      },
    },
  });
  t.after(async () => {
    await worker.close();
    await queue.close();
    await rm(dir, { recursive: true, force: true });
  });
  const job = await queue.enqueue({
    type: "arc.drip",
    room: "ACCEPT",
    idempotencyKey: "one",
    payload,
  });
  const receipt = await waitForWorkerReceipt({
    dir,
    job,
    worker,
    wallNow: () => time,
    wait: async (ms) => {
      time += ms;
    },
  });
  assert.equal(receipt.status, "done");
  assert.equal(effects, 1);
  assert(time > 1000000);
});
test("acceptance waiting is bounded and preserves a pending step identity", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-acceptance-bound-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let time = 0,
    polls = 0;
  await assert.rejects(
    waitForWorkerReceipt({
      dir,
      job: { id: "pending", type: "arc.drip" },
      worker: {
        poll: async () => {
          polls++;
        },
      },
      wallNow: () => time,
      wait: async (ms) => {
        time += ms;
      },
      timeoutMs: 2000,
    }),
    { code: "ACCEPTANCE_STEP_PENDING", step: "arc.drip" },
  );
  assert.equal(polls, 3);
});

test("idle recovery waits past a mined transition until delayed pull claims are paid", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-recovery-wait-"));
  let time = 1000000,
    polls = 0,
    refundEffects = 0,
    claimEffects = 0;
  let proof = { state: "Funding", claimables: [0n, 0n] };
  const worker = createWorker({
    dir,
    now: () => time,
    providers: {
      arc: {
        independentJobs: true,
        async idle() {
          polls++;
          if (polls === 1) {
            refundEffects++;
            proof = { state: "Refunded", claimables: [1000n, 0n] };
            return;
          }
          if (polls === 2) return; // canonical receipt/backoff still pending
          claimEffects++;
          proof = { state: "Refunded", claimables: [0n, 0n] };
        },
      },
    },
  });
  t.after(async () => {
    await worker.close();
    await rm(dir, { recursive: true, force: true });
  });
  const result = await waitForPotOutcome({
    worker,
    chain: { snapshot: async () => proof },
    potId: "fixture",
    state: "Refunded",
    step: "arc.pot.refund",
    wallNow: () => time,
    wait: async (ms) => {
      time += ms;
    },
  });
  assert.equal(result.state, "Refunded");
  assert.deepEqual(result.claimables, [0n, 0n]);
  assert.equal(polls, 3);
  assert.equal(refundEffects, 1);
  assert.equal(claimEffects, 1);
});
test("recovery read outages can retry but canonical proof failures and wrong terminal states stop", async () => {
  let time = 0,
    calls = 0;
  const base = {
    worker: { poll: async () => {} },
    potId: "fixture",
    state: "Settled",
    step: "arc.pot.finalize",
    wallNow: () => time,
    wait: async (ms) => {
      time += ms;
    },
  };
  const proof = await waitForPotOutcome({
    ...base,
    chain: {
      snapshot: async () => {
        calls++;
        if (calls === 1) throw { code: -32005 };
        if (calls === 2) throw Error("Arc read is stale");
        return { state: "Settled", claimables: [0n, 0n] };
      },
    },
  });
  assert.equal(calls, 3);
  assert.equal(proof.state, "Settled");
  await assert.rejects(
    waitForPotOutcome({
      ...base,
      chain: {
        snapshot: async () => {
          throw Object.assign(Error("bad proof"), { code: "INVALID_PROOF" });
        },
      },
    }),
    { code: "INVALID_PROOF" },
  );
  await assert.rejects(
    waitForPotOutcome({
      ...base,
      chain: {
        snapshot: async () => ({ state: "Refunded", claimables: [0n, 0n] }),
      },
    }),
    { code: "ACCEPTANCE_WRONG_OUTCOME", step: "arc.pot.finalize" },
  );
});
test("unpaid recovery has a bounded wait and retains its actionable step", async () => {
  let time = 0,
    polls = 0;
  await assert.rejects(
    waitForPotOutcome({
      worker: {
        poll: async () => {
          polls++;
        },
      },
      chain: {
        snapshot: async () => ({ state: "Refunded", claimables: [1000n, 0n] }),
      },
      potId: "fixture",
      state: "Refunded",
      step: "arc.pot.refund",
      wallNow: () => time,
      wait: async (ms) => {
        time += ms;
      },
      timeoutMs: 2000,
    }),
    { code: "ACCEPTANCE_RECOVERY_PENDING", step: "arc.pot.refund" },
  );
  assert.equal(polls, 3);
});
