import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  readFile,
  stat,
  writeFile,
  readdir,
  mkdir,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  createOutbox,
  listJobs,
  createReceiptReader,
  atomicJson,
  readJson,
  digest,
} from "../../integrations/shared/outbox.mjs";
import {
  createWorker,
  mockProvider,
  acquireWorkerLock,
} from "../../integrations/shared/worker.mjs";
const payload = {
  result: { hash: "fixture-result", matchId: "fixture-match" },
};
const input = (key, type = "ens.record.set") => ({
  type,
  room: "ROOMAA",
  idempotencyKey: key,
  payload,
});
test("bounded provider batches admit newly queued Arc work before draining an old ENS backlog", async (t) => {
  const dir = await temporary(t),
    outbox = createOutbox(dir),
    calls = [];
  await outbox.enqueue(input("ens-first"));
  await outbox.enqueue(input("ens-second"));
  await outbox.enqueue(input("ens-third"));
  let entered, release;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const worker = createWorker({
    dir,
    jobsPerProviderPoll: 1,
    providers: {
      ens: {
        lookup: async () => null,
        execute: async (job) => {
          calls.push(job.idempotencyKey);
          if (job.idempotencyKey === "ens-first") {
            entered();
            await blocked;
          }
          return { mock: true };
        },
      },
      arc: {
        lookup: async () => null,
        execute: async (job) => {
          calls.push(job.idempotencyKey);
          return { mock: true };
        },
      },
    },
  });
  const first = worker.poll();
  await started;
  await outbox.enqueue(input("new-arc-work", "arc.pot.create"));
  await worker.poll();
  assert.deepEqual(
    calls,
    ["ens-first"],
    "heartbeat must not start a second drain",
  );
  release();
  await first;
  assert.deepEqual(calls, ["ens-first"]);
  await worker.poll();
  assert.ok(calls.includes("new-arc-work"));
  assert.deepEqual(
    calls.filter((key) => key.startsWith("ens-")),
    ["ens-first", "ens-second"],
  );
  assert.deepEqual(
    (await listJobs(dir)).map(({ job }) => job.idempotencyKey),
    ["ens-third"],
  );
  await worker.poll();
  assert.equal(new Set(calls).size, 4);
  assert.equal(calls.length, 4, "no replay after bounded batch completion");
  await worker.close();
  await outbox.close();
});

test("bounded batches preserve signer backoff but let independent jobs pass a deferred item", async (t) => {
  for (const independentJobs of [false, true]) {
    const dir = await temporary(t),
      outbox = createOutbox(dir),
      calls = [];
    await outbox.enqueue(input("deferred"));
    await outbox.enqueue(input("ready"));
    const [first] = await listJobs(dir);
    await atomicJson(first.file, {
      ...first.job,
      nextAttemptAt: Date.now() + 60000,
    });
    const worker = createWorker({
      dir,
      jobsPerProviderPoll: 1,
      providers: {
        ens: {
          independentJobs,
          lookup: async () => null,
          execute: async (job) => {
            calls.push(job.idempotencyKey);
            return { mock: true };
          },
        },
      },
    });
    await worker.poll();
    assert.deepEqual(calls, independentJobs ? ["ready"] : []);
    await worker.close();
    await outbox.close();
  }
});
test("busy worker polls refresh liveness without another job and close cannot be overwritten by a late pulse", async (t) => {
  const dir = await temporary(t),
    outbox = createOutbox(dir);
  await outbox.enqueue(input("long-first"));
  await outbox.enqueue(input("waiting-second"));
  let time = 1000,
    calls = 0,
    entered,
    release;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const worker = createWorker({
    dir,
    now: () => time,
    providers: {
      ens: {
        lookup: async () => null,
        execute: async () => {
          calls++;
          entered();
          await blocked;
          return { mock: true };
        },
      },
    },
  });
  const draining = worker.poll();
  await started;
  time += 20000;
  await Promise.all([worker.poll(), worker.poll()]);
  assert.deepEqual(await readJson(path.join(dir, "heartbeat.json")), {
    at: time,
    status: "running",
  });
  assert.equal(calls, 1);
  assert.equal(
    (await listJobs(dir)).length,
    2,
    "liveness does not imply completion",
  );
  time += 1000;
  const pulse = worker.poll(),
    closing = worker.close();
  await pulse;
  release();
  await draining;
  await closing;
  assert.equal(
    (await readJson(path.join(dir, "heartbeat.json"))).status,
    "stopped",
  );
  time += 20000;
  await worker.poll();
  assert.equal(
    (await readJson(path.join(dir, "heartbeat.json"))).status,
    "stopped",
  );
  assert.equal(calls, 1, "the second signer job remained queued during close");
  assert.equal((await listJobs(dir)).length, 1);
  await outbox.close();
});
async function temporary(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-outbox-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
test("atomic 0600 jobs, deferred hot-path I/O, mock round trip and receipt tailing", async (t) => {
  const dir = await temporary(t),
    outbox = createOutbox(dir);
  let resolved = false;
  const promise = outbox.enqueue(input("one")).then((job) => {
    resolved = true;
    return job;
  });
  assert.equal(resolved, false);
  await promise;
  const [item] = await listJobs(dir);
  if (process.platform !== "win32")
    assert.equal((await stat(item.file)).mode & 0o777, 0o600);
  assert.ok(
    (await readdir(path.join(dir, "outbox"))).every((f) => f.endsWith(".json")),
  );
  const worker = createWorker({ dir, providers: { ens: mockProvider(dir) } });
  await worker.poll();
  assert.equal((await listJobs(dir)).length, 0);
  const receipts = [],
    health = [];
  const reader = createReceiptReader(dir, {
    onReceipt: (r) => receipts.push(r),
    onHealth: (h) => health.push(h),
  });
  await reader.poll();
  await new Promise((r) => setTimeout(r, 30));
  await reader.poll();
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].mock, true);
  assert.equal(receipts[0].tx, null);
  assert.equal(health.at(-1).up, true);
  await reader.poll();
  assert.equal(receipts.length, 1);
  reader.close();
  await worker.close();
  await outbox.close();
});
test("crash after external effect is recovered by provider lookup, then duplicate is a no-op", async (t) => {
  const dir = await temporary(t),
    q = createOutbox(dir);
  await q.enqueue(input("once"));
  let effects = 0;
  const durable = mockProvider(dir),
    provider = {
      ...durable,
      execute: async (j) => {
        effects++;
        return durable.execute(j);
      },
    };
  const crash = createWorker({
    dir,
    providers: { ens: provider },
    afterExecute: async () => {
      const e = new Error("simulated crash");
      e.simulateCrash = true;
      throw e;
    },
  });
  await assert.rejects(crash.poll(), /simulated crash/);
  assert.equal(effects, 1);
  const restarted = createWorker({ dir, providers: { ens: provider } });
  await restarted.poll();
  assert.equal(effects, 1);
  await q.enqueue(input("once"));
  await restarted.poll();
  assert.equal(effects, 1);
  assert.equal((await listJobs(dir)).length, 0);
  await q.enqueue({ ...input("once"), payload: { different: true } });
  await restarted.poll();
  const lines = (await readFile(path.join(dir, "receipts.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(lines.at(-1).error, "Idempotency payload conflict");
  await q.close();
  await restarted.close();
});
test("receipt I/O failure on the final attempt preserves confirmed output and resumes without resending", async (t) => {
  const dir = await temporary(t),
    q = createOutbox(dir);
  const job = await q.enqueue(input("confirmed-before-io-failure"));
  const [item] = await listJobs(dir);
  await atomicJson(item.file, { ...item.job, attempts: 7 });
  // Appending to this directory fails after the done-set is durably written.
  const receiptFile = path.join(dir, "receipts.jsonl");
  await mkdir(receiptFile);
  let effects = 0;
  const tx = "0x" + "a".repeat(64);
  const worker = createWorker({
    dir,
    providers: {
      ens: {
        lookup: async () => null,
        execute: async () => {
          effects++;
          return { tx, explorer: "https://example.test/tx/" + tx };
        },
      },
    },
  });
  await assert.rejects(worker.poll());
  const saved = await readJson(
    path.join(dir, "done", digest(job.idempotencyKey) + ".json"),
  );
  assert.equal(saved.receipt.status, "done");
  assert.equal(saved.receipt.tx, tx);
  assert.equal((await listJobs(dir))[0].job.attempts, 7);
  await rm(receiptFile, { recursive: true });
  await worker.poll();
  assert.equal(effects, 1);
  assert.equal((await listJobs(dir)).length, 0);
  const receipt = JSON.parse((await readFile(receiptFile, "utf8")).trim());
  assert.equal(receipt.status, "done");
  assert.equal(receipt.tx, tx);
  await worker.close();
  await q.close();
});

test("retry backoff is bounded, a signer queue preserves order and another partner continues", async (t) => {
  const dir = await temporary(t);
  let time = 100000,
    calls = [];
  const q = createOutbox(dir, { now: () => time });
  await q.enqueue(input("first"));
  time++;
  await q.enqueue(input("second"));
  time++;
  await q.enqueue(input("other", "arc.pot.create"));
  const provider = {
    lookup: async () => null,
    execute: async (j) => {
      calls.push(j.idempotencyKey);
      throw Object.assign(
        Error("secret provider details must never reach receipts"),
        { code: "secret provider code must never reach receipts" },
      );
    },
  };
  const worker = createWorker({
    dir,
    now: () => time,
    providers: { ens: provider, arc: mockProvider(dir) },
  });
  await worker.poll();
  assert.deepEqual(calls, ["first"]);
  assert.equal((await listJobs(dir)).length, 2);
  await worker.poll();
  assert.equal(calls.length, 1);
  for (let n = 1; n < 8; n++) {
    time += 60000;
    await worker.poll();
  }
  const receipts = (await readFile(path.join(dir, "receipts.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(
    receipts.find((r) => r.type === "ens.record.set").status,
    "failed",
  );
  assert.ok(!JSON.stringify(receipts).includes("secret provider"));
  assert.equal(calls.filter((x) => x === "first").length, 8);
  assert.ok(calls.includes("second"));
  await q.close();
  await worker.close();
});
test("terminal failures expose only allowlisted provider codes", async (t) => {
  const dir = await temporary(t);
  let time = 100000;
  const q = createOutbox(dir, { now: () => time });
  await q.enqueue(input("diagnostic"));
  const worker = createWorker({
    dir,
    now: () => time,
    providers: {
      ens: {
        lookup: async () => null,
        execute: async () => {
          throw Object.assign(Error("private RPC details"), {
            code: "WRONG_SIGNATURE",
          });
        },
      },
    },
  });
  for (let n = 0; n < 8; n++) {
    await worker.poll();
    time += 60000;
  }
  const raw = await readFile(path.join(dir, "receipts.jsonl"), "utf8");
  assert.equal(
    JSON.parse(raw.trim()).error,
    "Provider failed after eight attempts (WRONG_SIGNATURE)",
  );
  assert.ok(!raw.includes("private RPC details"));
  await q.close();
  await worker.close();
});
test("kill file and env stop sending; lock excludes a second worker", async (t) => {
  const dir = await temporary(t),
    q = createOutbox(dir);
  await q.enqueue(input("kill"));
  const release = await acquireWorkerLock(dir);
  await assert.rejects(() => acquireWorkerLock(dir), /Another worker/);
  await release();
  await writeFile(path.join(dir, "KILL"), "");
  let count = 0;
  const worker = createWorker({
    dir,
    providers: {
      ens: {
        lookup: async () => null,
        execute: async () => {
          count++;
          return { mock: true };
        },
      },
    },
  });
  await worker.poll();
  assert.equal(count, 0);
  assert.equal(
    JSON.parse(await readFile(path.join(dir, "heartbeat.json"))).status,
    "killed",
  );
  await rm(path.join(dir, "KILL"));
  await worker.poll();
  assert.equal(count, 1);
  await q.enqueue(input("env-kill"));
  await createWorker({ dir, envKill: "1", providers: {} }).poll();
  assert.equal((await listJobs(dir)).length, 1);
  await q.close();
  await worker.close();
});
test("payloads cannot put secrets or platform currency into the outbox", async (t) => {
  const dir = await temporary(t),
    q = createOutbox(dir);
  for (const key of [
    "privateKey",
    "client_secret",
    "bits",
    "superChat",
    "kicks",
    "gift_amount",
  ])
    await assert.rejects(
      q.enqueue({ ...input(key), payload: { [key]: "forbidden" } }),
      /Outbox write failed/,
    );
  assert.equal((await listJobs(dir)).length, 0);
  await q.close();
});

test("same-clock jobs keep enqueue order", async (t) => {
  const dir = await temporary(t),
    q = createOutbox(dir, { now: () => 100 });
  await Promise.all([
    q.enqueue(input("one")),
    q.enqueue(input("two")),
    q.enqueue(input("three")),
  ]);
  assert.deepEqual(
    (await listJobs(dir)).map((x) => x.job.idempotencyKey),
    ["one", "two", "three"],
  );
  await q.close();
});
