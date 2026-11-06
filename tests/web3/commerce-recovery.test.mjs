import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createLiveCommerce } from "../../integrations/commerce/live.mjs";
import {
  createOutbox,
  atomicJson,
  readJson,
  listJobs,
  removeDocument,
  digest,
} from "../../integrations/shared/outbox.mjs";
import {
  hash,
  commerceTransactionId,
} from "../../integrations/commerce/jobs.mjs";

const actor = "0x" + "11".repeat(20),
  deployment = {
    chainId: 5042002,
    address: "0x" + "22".repeat(20),
    operator: "0x" + "33".repeat(20),
    platform: "0x" + "44".repeat(20),
    runtimeHash: "0x" + "55".repeat(32),
    blockNumber: 1,
  };
async function fixture(t, variant = "valid") {
  const dir = await mkdtemp(path.join(tmpdir(), "commerce-recovery-")),
    queue = createOutbox(dir),
    stateFile = path.join(dir, "commerce", "live-state.json");
  let service,
    reads = 0,
    crash = false;
  const options = {
    dataDir: dir,
    deployment,
    pollMs: 0,
    firstPartyGames: [{ id: "star-catch", title: "Star Catch" }],
    chain: {
      snapshot: async ({ fresh }) => {
        reads++;
        assert.equal(fresh, true);
        if (variant === "rpc-down") throw Error("RPC_UNAVAILABLE");
        return {
          height: 10n,
          block: { hash: "0x" + "66".repeat(32) },
          versionExists: async (versionId) => {
            assert.equal(versionId, "0x" + manifest.versionId);
            return variant === "chain-existing";
          },
        };
      },
    },
    outbox: {
      enqueue: async (job) => {
        const result = await queue.enqueue(job);
        if (crash) {
          crash = false;
          throw Error("fixture-post-enqueue-crash");
        }
        return result;
      },
    },
  };
  t.after(async () => {
    await service?.close();
    await queue.close();
    await rm(dir, { recursive: true, force: true });
  });
  service = await createLiveCommerce(options);
  await service.register(
    {
      operationId: "accept-fixture-register",
      gameId: "star-catch",
      creator: actor,
      price: "500000",
    },
    actor,
  );
  await service.close();
  const state = await readJson(stateFile),
    o = state.operations[0],
    queued = (await listJobs(dir))[0];
  o.job.payload.version.recipients = o.job.payload.version.recipients.map(
    ({ address, bps }) => ({ bps, address }),
  );
  o.status = "failed";
  o.error = "WORKER_REVIEW_REQUIRED";
  const original = structuredClone(o),
    doneFile = path.join(dir, "done", digest(o.job.idempotencyKey) + ".json"),
    terminal = {
      id: o.jobId,
      type: "commerce.register",
      status: "failed",
      tx: null,
      explorer: null,
      at: 1,
      error: "Provider failed after eight attempts",
    },
    fingerprint = hash({ type: o.job.type, payload: o.job.payload }),
    manifest = {
      version: 1,
      reason: "jsonb-registration-v1",
      operationId: o.id,
      originalJobId: o.jobId,
      originalIdempotencyKey: o.job.idempotencyKey,
      fingerprint,
      versionId: o.job.payload.version.id,
    },
    manifestFile = path.join(dir, "commerce-recovery", digest(o.id) + ".json"),
    journalFile = path.join(dir, "arc-relayer-transactions", "journal.json"),
    journal = {
      version: 1,
      chainId: 5042002,
      owner: deployment.operator,
      entries: [],
    };
  if (variant === "wrong-fingerprint") manifest.fingerprint = "0".repeat(64);
  if (variant === "wrong-version") manifest.versionId = "0".repeat(64);
  if (variant === "wrong-receipt") terminal.tx = "0x" + "77".repeat(32);
  if (variant === "admitted")
    journal.entries.push({
      id: commerceTransactionId(o.job),
      hash: "0x" + "77".repeat(32),
    });
  if (variant === "recovery-admitted")
    journal.entries.push({
      id: commerceTransactionId({
        ...o.job,
        idempotencyKey: o.job.idempotencyKey + ":jsonb-recovery-v1",
      }),
      hash: "0x" + "77".repeat(32),
    });
  if (variant === "pay") {
    o.action = "pay";
    o.job.type = "commerce.pay";
  }
  if (variant === "not-jsonb-bug")
    o.job.payload.version.recipients = o.job.payload.version.recipients.map(
      ({ address, bps }) => ({ address, bps }),
    );
  await atomicJson(stateFile, state);
  await atomicJson(doneFile, { fingerprint, receipt: terminal });
  await atomicJson(journalFile, journal);
  if (variant === "provider-started")
    await atomicJson(
      path.join(dir, "commerce-worker", digest(o.job.idempotencyKey) + ".json"),
      { fingerprint, job: o.job },
    );
  if (variant !== "no-manifest") await atomicJson(manifestFile, manifest);
  await removeDocument(queued.file);
  const oldDone = await readFile(doneFile, "utf8"),
    oldJournal = await readFile(journalFile, "utf8");
  service = await createLiveCommerce(options);
  return {
    dir,
    stateFile,
    doneFile,
    journalFile,
    manifestFile,
    original,
    oldDone,
    oldJournal,
    get service() {
      return service;
    },
    get reads() {
      return reads;
    },
    crashNextEnqueue() {
      crash = true;
    },
    async reopen() {
      await service.close();
      service = await createLiveCommerce(options);
    },
  };
}

test("only an owner manifest recovers the exact pre-admission JSONB registration failure, once", async (t) => {
  const f = await fixture(t);
  await f.service.poll();
  const state = await readJson(f.stateFile),
    op = state.operations[0],
    jobs = await listJobs(f.dir);
  assert.equal(jobs.length, 1);
  assert.equal(op.status, "queued");
  assert.equal(op.error, null);
  assert.equal(op.id, f.original.id);
  assert.equal(op.fingerprint, f.original.fingerprint);
  assert.equal(
    op.job.idempotencyKey,
    f.original.job.idempotencyKey + ":jsonb-recovery-v1",
  );
  assert.deepEqual(op.job.payload, f.original.job.payload);
  assert.deepEqual(op.recovery.original.job, f.original.job);
  assert.equal(op.recovery.original.failure.status, "failed");
  assert.equal(op.jobId, jobs[0].job.id);
  assert.equal(f.reads, 1);
  await f.service.poll();
  await f.reopen();
  await f.service.poll();
  assert.equal((await listJobs(f.dir)).length, 1);
  assert.equal(f.reads, 1);
  assert.equal(await readFile(f.doneFile, "utf8"), f.oldDone);
  assert.equal(await readFile(f.journalFile, "utf8"), f.oldJournal);
  const failure = { ...op.recovery.original.failure, id: op.jobId };
  await atomicJson(
    path.join(f.dir, "done", digest(op.job.idempotencyKey) + ".json"),
    {
      fingerprint: hash({ type: op.job.type, payload: op.job.payload }),
      receipt: failure,
    },
  );
  await removeDocument(jobs[0].file);
  await f.service.poll();
  assert.equal(f.service.operation(op.id).status, "failed");
  await f.service.poll();
  assert.equal(
    (await listJobs(f.dir)).length,
    0,
    "the same manifest cannot authorize a second recovery",
  );
});

test("recovery resumes a crash after enqueue without a second job or another absence check", async (t) => {
  const f = await fixture(t);
  f.crashNextEnqueue();
  await assert.rejects(f.service.poll(), /fixture-post-enqueue-crash/);
  const existing = (await listJobs(f.dir))[0];
  assert.equal((await readJson(f.stateFile)).operations[0].jobId, null);
  await f.reopen();
  await f.service.poll();
  assert.equal((await listJobs(f.dir)).length, 1);
  assert.equal(
    (await readJson(f.stateFile)).operations[0].jobId,
    existing.job.id,
  );
  assert.equal(f.reads, 1);
  assert.equal(await readFile(f.doneFile, "utf8"), f.oldDone);
});

for (const variant of [
  "no-manifest",
  "wrong-fingerprint",
  "wrong-version",
  "wrong-receipt",
  "admitted",
  "recovery-admitted",
  "provider-started",
  "chain-existing",
  "rpc-down",
  "pay",
  "not-jsonb-bug",
])
  test(`registration recovery never requeues ${variant}`, async (t) => {
    const f = await fixture(t, variant);
    if (["no-manifest", "pay"].includes(variant)) await f.service.poll();
    else
      await assert.rejects(
        f.service.poll(),
        /COMMERCE_RECOVERY_BLOCKED|RPC_UNAVAILABLE/,
      );
    assert.equal((await listJobs(f.dir)).length, 0);
    assert.equal(f.service.operation(f.original.id).status, "failed");
    if (!["no-manifest", "pay"].includes(variant))
      assert.deepEqual(
        f.service.operation(f.original.id).recovery,
        variant === "rpc-down"
          ? { status: "waiting", code: "RECOVERY_CHECK_UNAVAILABLE" }
          : { status: "blocked", code: "COMMERCE_RECOVERY_BLOCKED" },
      );
    assert.equal(
      (await readJson(f.stateFile)).operations[0].recovery,
      undefined,
    );
    assert.equal(await readFile(f.doneFile, "utf8"), f.oldDone);
    assert.equal(await readFile(f.journalFile, "utf8"), f.oldJournal);
  });
