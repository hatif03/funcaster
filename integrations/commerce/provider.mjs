import path from "node:path";
import { atomicJson, readJson, digest } from "../shared/outbox.mjs";
import {
  validateCommerceJob,
  commerceTransactionId,
  commerceReceiptData,
  hash,
} from "./jobs.mjs";
export function createCommerceJobProvider({ chain, dir }) {
  const file = (key) =>
    path.join(dir, "commerce-worker", digest(key) + ".json");
  return {
    independentJobs: true,
    async lookup(key) {
      const saved = await readJson(file(key));
      if (!saved) return null;
      // Reconcile only the already admitted hash. Never sign/resend in lookup.
      const result = await chain.reconcile(
        saved.job,
        commerceTransactionId(saved.job),
      );
      return result
        ? {
            ...result,
            data: commerceReceiptData(
              saved.job.type,
              saved.job.payload,
              result.data,
            ),
          }
        : null;
    },
    async execute(job) {
      const payload = validateCommerceJob(job),
        fingerprint = hash({ type: job.type, room: job.room, payload });
      const saved = await readJson(file(job.idempotencyKey));
      if (saved && saved.fingerprint !== fingerprint)
        throw Object.assign(Error("COMMERCE_INTENT_CONFLICT"), {
          permanent: true,
        });
      if (!saved)
        await atomicJson(file(job.idempotencyKey), { fingerprint, job });
      const result = await chain.execute(job, commerceTransactionId(job));
      return {
        ...result,
        data: commerceReceiptData(job.type, payload, result.data),
      };
    },
  };
}
