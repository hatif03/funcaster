import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { address, registration } from "./math.mjs";
export const commerceJobTypes = [
  "commerce.register",
  "commerce.pay",
  "commerce.claim",
];
export const json = (value) =>
  JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? String(v) : v)),
  );
export const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const check = (ok) => {
  if (!ok)
    throw Object.assign(Error("INVALID_COMMERCE_JOB"), {
      code: "INVALID_COMMERCE_JOB",
      permanent: true,
    });
};
export function validateCommerceJob(job) {
  check(
    commerceJobTypes.includes(job?.type) &&
      typeof job.idempotencyKey === "string" &&
      job.idempotencyKey.length < 256 &&
      /^[\w-]{1,64}$/.test(job.room || ""),
  );
  const p = job.payload;
  check(
    p &&
      typeof p === "object" &&
      /^[\w-]{6,100}$/.test(p.operationId || "") &&
      JSON.stringify(p).length < 20000,
  );
  address(p.actor);
  if (job.type === "commerce.register") {
    const v = p.version;
    check(v && /^[a-f0-9]{64}$/.test(v.id || "") && v.creator === p.actor);
    const normalized = registration(
      {
        creator: v.creator,
        price: v.price,
        collaborators: v.recipients,
        referralAddress: v.referral,
        referralBps: v.referralBps,
      },
      { platformAddress: v.platform, venueAddress: v.venue },
    );
    check(
      Object.keys(normalized).every(
        // PostgreSQL JSONB reorders object keys, including recipient fields.
        // Preserve strict values/types/array order without depending on keys' order.
        (k) => isDeepStrictEqual(normalized[k], v[k]),
      ),
    );
  } else if (job.type === "commerce.pay") {
    const r = p.request;
    check(
      r &&
        /^0x[\da-f]{64}$/i.test(r.paymentId || "") &&
        /^0x[\da-f]{64}$/i.test(r.versionId || "") &&
        /^0x[\da-f]{64}$/i.test(r.roomHash || ""),
    );
    check(
      /^[\w-]{6,64}$/.test(p.roomCode || "") &&
        job.room === p.roomCode &&
        /^[0-9]{1,12}$/.test(p.price || "") &&
        BigInt(p.price) > 0n,
    );
    check(
      address(r.payer) === p.actor &&
        ["attribution", "referred", "atVenue"].every(
          (k) => typeof r[k] === "boolean",
        ) &&
        [r.validAfter, r.validBefore].every((v) => /^[0-9]{1,20}$/.test(v)),
    );
    check(
      [p.permitSignature, p.authorizationSignature].every((v) =>
        /^0x[\da-f]{130}$/i.test(v || ""),
      ),
    );
  } else {
    check(
      address(p.recipient) === p.actor &&
        [p.nonce, p.deadline].every((v) => /^[0-9]{1,20}$/.test(v)) &&
        /^0x[\da-f]{130}$/i.test(p.signature || ""),
    );
  }
  return p;
}
export const commerceTransactionId = (job) =>
  `room:${createHash("sha256").update(job.room).digest("hex")}:commerce:${job.type.split(".")[1]}:${hash(job.idempotencyKey)}`;
export function commerceReceiptData(type, payload, data) {
  check(commerceJobTypes.includes(type));
  const result = {
    operationId: payload.operationId,
    action: type.split(".")[1],
    actor: payload.actor,
    asset: "USDC",
  };
  for (const key of [
    "versionId",
    "roomCode",
    "buyer",
    "recipient",
    "amount",
    "nonce",
    "expiresAt",
    "credits",
    "blockNumber",
    "blockHash",
  ])
    if (data?.[key] !== undefined) result[key] = json(data[key]);
  if (type === "commerce.register") result.versionId = payload.version.id;
  return result;
}
