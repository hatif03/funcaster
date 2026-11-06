import path from "node:path";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { atomicJson, readJson, digest } from "../shared/outbox.mjs";
import { acquireWorkerLock } from "../shared/worker.mjs";
import { validateArcJob, contextHash, json, requireArc } from "./jobs.mjs";
import { normalizeTerms, termsHash } from "./signatures.mjs";

// The relay reserves an unpredictable ID BEFORE displaying/signing terms. A
// retry loads the same intent. A conflict requires a new attempt and acceptance;
// IDs are never silently replaced (randomness does not prevent front-running).
export async function reservePotIntent({
  dir,
  attemptId,
  room,
  terms,
  context,
}) {
  requireArc(
    typeof attemptId === "string" && /^[a-zA-Z0-9:_-]{1,160}$/.test(attemptId),
    "INVALID_JOB",
    "Invalid attempt identity",
  );
  const folder = path.join(dir, "arc-intents");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const release = await acquireWorkerLock(folder);
  try {
    const file = path.join(folder, `${digest(attemptId)}.json`);
    const fixed = json(
      normalizeTerms({ ...terms, metadataHash: contextHash(context) }),
    );
    const fingerprint = digest(JSON.stringify({ room, terms: fixed, context }));
    const prior = await readJson(file);
    if (prior) {
      requireArc(
        prior.fingerprint === fingerprint,
        "CONFLICT",
        "Attempt terms changed; fresh acceptance is required",
      );
      return prior.intent;
    }
    const potId = `0x${randomBytes(32).toString("hex")}`;
    const intent = {
      potId,
      termsHash: termsHash(potId, fixed),
      terms: fixed,
      context,
    };
    validateArcJob({
      type: "arc.pot.create",
      room,
      idempotencyKey: attemptId,
      payload: { potId, terms: fixed, context },
    });
    await atomicJson(file, { fingerprint, intent });
    return intent;
  } finally {
    await release();
  }
}
