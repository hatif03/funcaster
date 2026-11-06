import { getAddress, zeroAddress } from "viem";
import { validateJob, digest } from "../shared/outbox.mjs";
import { normalizeTerms, termsHash } from "./signatures.mjs";
import { validatePlaces } from "./payouts.mjs";

export const same = (a, b) =>
  typeof a === "string" && a.toLowerCase() === b?.toLowerCase();
export const hex32 = (s) => typeof s === "string" && /^0x[\da-f]{64}$/i.test(s);
export const json = (value) =>
  JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? String(v) : v)),
  );
export function requireArc(condition, code, message) {
  if (!condition)
    throw Object.assign(Error(message), {
      code,
      permanent: [
        "INVALID_JOB",
        "CONFLICT",
        "WRONG_SIGNATURE",
        "REVERTED",
      ].includes(code),
    });
}
const fields = (value, keys) =>
  requireArc(
    value &&
      !Array.isArray(value) &&
      typeof value === "object" &&
      Object.keys(value).every((k) => keys.includes(k)) &&
      keys.every((k) => value[k] !== undefined),
    "INVALID_JOB",
    "Arc payload fields do not match the job schema",
  );
const address = (s) => {
  requireArc(
    typeof s === "string" &&
      /^0x[\da-f]{40}$/i.test(s) &&
      !same(s, zeroAddress),
    "INVALID_JOB",
    "Invalid seat address",
  );
  return getAddress(s);
};
const signature = (s) =>
  requireArc(
    typeof s === "string" && /^0x(?:[\da-f]{2}){1,4096}$/i.test(s),
    "INVALID_JOB",
    "Invalid signature bytes",
  );
const uint = (s) =>
  requireArc(
    typeof s === "string" &&
      /^(0|[1-9]\d{0,77})$/.test(s) &&
      BigInt(s) < 1n << 256n,
    "INVALID_JOB",
    "Authorization timestamps must be exact uint256 strings",
  );

export function validateArcJob(job) {
  validateJob(job);
  requireArc(
    Buffer.byteLength(JSON.stringify(job.payload)) <= 65536,
    "INVALID_JOB",
    "Arc job exceeds 64 KB",
  );
  const p = job.payload;
  if (job.type === "arc.drip") {
    fields(p, ["asset", "address", "device", "ip"]);
    requireArc(
      ["usdc", "eurc"].includes(p.asset) &&
        [p.device, p.ip].every(
          (v) => typeof v === "string" && /^[\da-f]{64}$/.test(v),
        ),
      "INVALID_JOB",
      "Drip requires private salted device/IP identities",
    );
    address(p.address);
    return p;
  }
  requireArc(hex32(p.potId), "INVALID_JOB", "Invalid pot ID");
  const extra = {
    "arc.pot.create": ["terms", "context"],
    "arc.pot.fund": [
      "termsHash",
      "seat",
      "acceptSig",
      "validAfter",
      "validBefore",
      "nonce",
      "authSig",
    ],
    "arc.pot.settle": ["termsHash", "places", "sigs", "result"],
    "arc.pot.propose": ["termsHash", "places", "result"],
    "arc.pot.contest": ["termsHash", "seat", "signature"],
    "arc.pot.finalize": ["termsHash", "places"],
    "arc.pot.claim": ["termsHash", "seat"],
    "arc.pot.refund": ["termsHash"],
  }[job.type];
  requireArc(extra, "INVALID_JOB", "Unsupported Arc job");
  fields(p, ["potId", ...extra]);
  if (job.type === "arc.pot.create") {
    fields(p.terms, [
      "asset",
      "stake",
      "seats",
      "rule",
      "oracle",
      "fundDeadline",
      "settleDeadline",
      "challengeWindow",
      "minPlaySeconds",
      "metadataHash",
    ]);
    normalizeTerms(p.terms);
    fields(p.context, ["gameId", "version", "bundleHash", "slots"]);
    requireArc(
      typeof p.context.gameId === "string" &&
        /^chonks\.[a-z0-9-]{1,64}$/.test(p.context.gameId) &&
        typeof p.context.version === "string" &&
        p.context.version.length < 64 &&
        /^[\da-f]{64}$/.test(p.context.bundleHash) &&
        Array.isArray(p.context.slots) &&
        p.context.slots.length === p.terms.seats.length &&
        new Set(p.context.slots).size === p.context.slots.length &&
        p.context.slots.every((s) => Number.isInteger(s) && s >= 0 && s < 4),
      "INVALID_JOB",
      "Frozen game and seat context required",
    );
    requireArc(
      same(p.terms.metadataHash, contextHash(p.context)),
      "INVALID_JOB",
      "Pot metadata must bind its game and ordered slots",
    );
  } else
    requireArc(
      hex32(p.termsHash),
      "INVALID_JOB",
      "Missing canonical terms hash",
    );
  if (p.seat !== undefined) address(p.seat);
  if (p.places !== undefined) validatePlaces(p.places);
  if (p.signature !== undefined) signature(p.signature);
  if (p.sigs !== undefined) {
    requireArc(
      Array.isArray(p.sigs) && p.sigs.length === p.places.length,
      "INVALID_JOB",
      "One signature per seat required",
    );
    p.sigs.forEach(signature);
  }
  if (job.type === "arc.pot.fund") {
    signature(p.acceptSig);
    signature(p.authSig);
    uint(p.validAfter);
    uint(p.validBefore);
    requireArc(hex32(p.nonce), "INVALID_JOB", "Invalid authorization nonce");
  }
  return p;
}

export function contextHash(c) {
  // Explicit field order, independent of JSON input key order.
  return `0x${digest(JSON.stringify([c.gameId, c.version, c.bundleHash, c.slots]))}`;
}

// Explicit whitelist: private authorization bytes, IP/device identifiers and
// arbitrary provider responses never become public receipt metadata.
export function arcReceiptData(type, input, data) {
  requireArc(
    data &&
      data.chainVerified === false &&
      ["on", "mock"].includes(data.mode) &&
      [5042002, 31337].includes(data.chainId) &&
      /^\d+$/.test(data.blockNumber) &&
      hex32(data.blockHash) &&
      Number.isSafeInteger(data.chainTime) &&
      Number.isSafeInteger(data.observedAt) &&
      ["applied", "reconciled", "waiting", "skipped"].includes(data.outcome),
    "INVALID_RECEIPT",
    "Invalid Arc observation",
  );
  const base = Object.fromEntries(
    [
      "mode",
      "chainId",
      "blockNumber",
      "blockHash",
      "chainTime",
      "observedAt",
      "outcome",
      "chainVerified",
    ].map((k) => [k, data[k]]),
  );
  if (type === "arc.drip") {
    requireArc(
      data.asset === input.asset &&
        same(data.address, input.address) &&
        /^\d+$/.test(data.amount),
      "INVALID_RECEIPT",
      "Drip receipt differs from its job",
    );
    return {
      ...base,
      asset: data.asset,
      address: data.address,
      amount: data.amount,
    };
  }
  requireArc(
    same(data.potId, input.potId) &&
      same(
        data.termsHash,
        type === "arc.pot.create"
          ? termsHash(input.potId, input.terms)
          : input.termsHash,
      ) &&
      hex32(data.termsHash) &&
      /^0x[\da-f]{40}$/i.test(data.contract) &&
      [
        "Funding",
        "Locked",
        "Proposed",
        "Contested",
        "Settled",
        "Refunded",
      ].includes(data.state) &&
      Number.isInteger(data.fundedBitmap) &&
      data.fundedBitmap >= 0 &&
      data.fundedBitmap < 16 &&
      Array.isArray(data.claimables) &&
      data.claimables.length >= 2 &&
      data.claimables.length <= 4 &&
      data.claimables.every((n) => /^\d+$/.test(n)),
    "INVALID_RECEIPT",
    "Pot receipt differs from its job",
  );
  for (const key of ["lockedAt", "proposalAt"])
    requireArc(
      Number.isSafeInteger(data[key]) && data[key] >= 0,
      "INVALID_RECEIPT",
      "Invalid pot times",
    );
  requireArc(
    hex32(data.placesHash),
    "INVALID_RECEIPT",
    "Invalid proposal hash",
  );
  return {
    ...base,
    ...Object.fromEntries(
      [
        "contract",
        "potId",
        "termsHash",
        "state",
        "fundedBitmap",
        "lockedAt",
        "proposalAt",
        "placesHash",
        "claimables",
      ].map((k) => [k, data[k]]),
    ),
  };
}
