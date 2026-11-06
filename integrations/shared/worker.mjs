import path from "node:path";
import { unlink, open } from "node:fs/promises";
import { storageFor } from "../storage/runtime.mjs";
import { ensReceiptData } from "../ens/jobs.mjs";
import { EnsError } from "../ens/errors.mjs";
import { arcReceiptData } from "../arc/jobs.mjs";
import { commerceReceiptData } from "../commerce/jobs.mjs";
import {
  atomicJson,
  readJson,
  listJobs,
  validateJob,
  digest,
  killed,
  appendReceipt,
  removeDocument,
} from "./outbox.mjs";
// Fixed public codes only: provider messages can contain RPC URLs or secrets.
const diagnosticCodes = new Set([
  "WRONG_SIGNATURE",
  "STATE_CONFLICT",
  "NONCE_CONFLICT",
  "RPC_UNAVAILABLE",
  "UNAVAILABLE",
  "RATE_LIMIT",
  "INVALID_PROOF",
  "SEAT_UNKNOWN",
  "PARTY_NOT_READY",
  "GRANT_CHANGED",
]);
// Real adapters reconcile the chain in lookup or in every execute stage before
// retrying a write. A local done-set alone cannot close the post-send crash window.
export function createWorker({
  dir,
  providers,
  now = Date.now,
  envKill = "0",
  afterExecute = async () => {},
  heartbeatFile = "heartbeat.json",
  jobsPerProviderPoll = Infinity,
}) {
  if (
    jobsPerProviderPoll !== Infinity &&
    (!Number.isSafeInteger(jobsPerProviderPoll) || jobsPerProviderPoll < 1)
  )
    throw Error("Invalid provider batch limit");
  let running = false,
    closed = false,
    heartbeatWrite = null;
  function pulse() {
    // Liveness only: a long provider operation is still in flight. Concurrent
    // polls may refresh this single write, but never enter another job drain.
    if (!heartbeatWrite) {
      heartbeatWrite = (async () => {
        const stop = await killed(dir, envKill);
        await atomicJson(path.join(dir, heartbeatFile), {
          at: now(),
          status: stop ? "killed" : "running",
        });
        return stop;
      })().finally(() => {
        heartbeatWrite = null;
      });
    }
    return heartbeatWrite;
  }
  async function complete(file, job, receipt, fingerprint) {
    await atomicJson(
      path.join(dir, "done", digest(job.idempotencyKey) + ".json"),
      { fingerprint, receipt },
    );
    await appendReceipt(dir, { ...receipt, id: job.id });
    await removeDocument(file);
  }
  async function processJob({ file, job }) {
    try {
      validateJob(job);
    } catch {
      await atomicJson(path.join(dir, "failed", path.basename(file)), {
        error: "Invalid job",
      });
      await removeDocument(file);
      return true;
    }
    if (job.nextAttemptAt > now()) return false;
    const fingerprint = digest(
      JSON.stringify({
        type: job.type,
        payload: job.payload,
        ...(job.type.startsWith("arc.") ? { room: job.room } : {}),
      }),
    );
    const done = await readJson(
      path.join(dir, "done", digest(job.idempotencyKey) + ".json"),
    );
    if (done) {
      if (done.fingerprint !== fingerprint) {
        await appendReceipt(dir, {
          id: job.id,
          type: job.type,
          status: "failed",
          tx: null,
          explorer: null,
          at: now(),
          error: "Idempotency payload conflict",
        });
        await removeDocument(file);
      } else {
        await appendReceipt(dir, { ...done.receipt, id: job.id });
        await removeDocument(file);
      }
      return true;
    }
    const provider = providers[job.type.split(".")[0]];
    let output;
    try {
      if (!provider?.lookup || !provider?.execute)
        throw new Error("Provider unavailable");
      const prior = await provider.lookup(job.idempotencyKey);
      if (await killed(dir, envKill)) return false;
      output = prior || (await provider.execute(job));
    } catch (error) {
      if (error.simulateCrash) throw error;
      const attempts = job.attempts + 1;
      const diagnostic = diagnosticCodes.has(error.code) ? error.code : null;
      const superseded =
        job.type === "ens.role.grant" &&
        error instanceof EnsError &&
        error.code === "JOB_SUPERSEDED";
      if (
        superseded ||
        attempts >= 8 ||
        (job.type.startsWith("arc.") && error.permanent)
      ) {
        await complete(
          file,
          job,
          {
            id: job.id,
            type: job.type,
            status: "failed",
            tx: null,
            explorer: null,
            at: now(),
            error: superseded
              ? "ENS grant superseded before any transaction (JOB_SUPERSEDED)"
              : job.type.startsWith("arc.") && error.permanent
                ? "Arc job rejected; review the immutable intent"
                : `Provider failed after eight attempts${diagnostic ? ` (${diagnostic})` : ""}`,
          },
          fingerprint,
        );
        return true;
      }
      await atomicJson(file, {
        ...job,
        attempts,
        nextAttemptAt: now() + Math.min(60000, 1000 * 2 ** (attempts - 1)),
      });
      return false;
    }
    // Completion I/O failures must preserve a confirmed external effect.
    // A subsequent poll recovers the done-set or the provider's saved receipt.
    // Simulates process death after external effect but before local done-set.
    await afterExecute(job, output);
    const receipt = {
      id: job.id,
      type: job.type,
      status: "done",
      tx: output.tx ?? null,
      explorer: output.explorer ?? null,
      at: now(),
      ...(output.mock ? { mock: true } : {}),
      ...(output.data && job.type.startsWith("ens.")
        ? { data: ensReceiptData(job.type, job.payload, output.data) }
        : {}),
      ...(output.data && job.type.startsWith("arc.")
        ? { data: arcReceiptData(job.type, job.payload, output.data) }
        : {}),
      ...(output.data && job.type.startsWith("commerce.")
        ? { data: commerceReceiptData(job.type, job.payload, output.data) }
        : {}),
      ...(output.data && /^(market|cheer|verify)\./.test(job.type)
        ? {
            data: Object.fromEntries(
              Object.entries(output.data)
                .filter(
                  ([key, value]) =>
                    [
                      "mode",
                      "marketRef",
                      "marketId",
                      "tableId",
                      "state",
                      "blockNumber",
                      "blockHash",
                      "chainTime",
                      "outcome",
                    ].includes(key) &&
                    ["string", "number", "boolean"].includes(typeof value),
                )
                .concat([["chainVerified", false]]),
            ),
          }
        : {}),
    };
    await complete(file, job, receipt, fingerprint);
    return true;
  }
  return {
    async poll() {
      if (closed) return;
      if (running) {
        await pulse();
        return;
      }
      running = true;
      try {
        const stop = await pulse();
        if (stop) return;
        const groups = new Map();
        for (const item of await listJobs(dir)) {
          const key = item.job?.type?.split(".")[0] || "invalid";
          // Dedicated verifier jobs share the database but not signer keys.
          if (key === "verify" && !providers.verify) continue;
          if (providers.verify && key !== "verify") continue;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(item);
        }
        for (const key of Object.keys(providers))
          if (!groups.has(key)) groups.set(key, []);
        await Promise.all(
          [...groups.entries()].map(async ([key, items]) => {
            let drained = true,
              processed = 0;
            for (const item of items) {
              if (closed || (await killed(dir, envKill))) {
                drained = false;
                break;
              }
              let deferred = false;
              try {
                validateJob(item.job);
                deferred = item.job.nextAttemptAt > now();
              } catch {
                // Invalid jobs still go through processJob's quarantine path.
              }
              if (deferred) {
                drained = false;
                if (!providers[key]?.independentJobs) break;
                continue;
              }
              // A long ENS snapshot must yield so newly queued Arc/commerce
              // jobs can enter the next poll. Per-provider order is unchanged.
              if (processed >= jobsPerProviderPoll) {
                drained = false;
                break;
              }
              processed++;
              if (!(await processJob(item))) {
                drained = false;
                if (!providers[key]?.independentJobs) break;
              }
            }
            if (
              (drained || providers[key]?.independentJobs) &&
              !closed &&
              !(await killed(dir, envKill))
            )
              await providers[key]?.idle?.();
          }),
        );
      } finally {
        running = false;
      }
    },
    async close() {
      closed = true;
      while (running) await new Promise((r) => setTimeout(r, 5));
      // A heartbeat-only poll can outlive the provider drain. Finish it before
      // writing stopped so a late pulse cannot resurrect a closed worker.
      await heartbeatWrite?.catch(() => {});
      await atomicJson(path.join(dir, heartbeatFile), {
        at: now(),
        status: "stopped",
      });
    },
  };
}
export function mockProvider(dir) {
  return {
    async lookup(key) {
      return readJson(path.join(dir, "mock-effects", digest(key) + ".json"));
    },
    async execute(job) {
      const output = { mock: true, tx: null, explorer: null };
      await atomicJson(
        path.join(dir, "mock-effects", digest(job.idempotencyKey) + ".json"),
        output,
      );
      return output;
    },
  };
}
export async function acquireWorkerLock(dir) {
  const db = storageFor(dir);
  if (db) return db.store.acquire(`writer:${db.key}`);
  const file = path.join(dir, "worker.lock");
  for (let i = 0; i < 2; i++)
    try {
      const h = await open(file, "wx", 0o600);
      await h.writeFile(String(process.pid));
      await h.close();
      return async () => unlink(file);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const { readFile } = await import("node:fs/promises");
      let pid;
      try {
        pid = Number(await readFile(file, "utf8"));
      } catch {
        throw new Error("Worker lock needs inspection");
      }
      if (!Number.isInteger(pid) || pid < 1)
        throw new Error("Worker lock needs inspection");
      try {
        process.kill(pid, 0);
        throw new Error("Another worker already owns this volume");
      } catch (check) {
        if (check.code !== "ESRCH") throw check;
        await unlink(file);
      }
    }
  throw new Error("Unable to acquire worker lock");
}
