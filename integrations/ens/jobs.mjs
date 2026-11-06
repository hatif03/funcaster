import { validateJob, digest } from "../shared/outbox.mjs";
import { requireEns } from "./errors.mjs";

const id = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9:_-]{1,160}$/.test(value);
const address = (value) =>
  typeof value === "string" && /^0x[\da-fA-F]{40}$/.test(value);
const name = (value) =>
  typeof value === "string" && /^[a-z0-9.-]{3,253}$/.test(value);
const expiry = (value) => typeof value === "string" && /^\d{1,20}$/.test(value);

// The shared worker stores only this explicit receipt schema, never a provider's
// arbitrary response. These are internal receipts; the relay redacts addresses.
export function ensReceiptData(type, input, data) {
  requireEns(
    id(input.partyId) && data?.partyId === input.partyId,
    "INVALID_RECEIPT",
    "ENS receipt party differs from its job",
  );
  const result = { partyId: input.partyId };
  if (type === "ens.champion.claim") {
    requireEns(
      id(input.claimId) &&
        data.claimId === input.claimId &&
        address(data.address) &&
        data.address.toLowerCase() === input.address?.toLowerCase() &&
        data.handle === input.handle &&
        name(data.name) &&
        data.name.startsWith(`${input.handle}.players.`) &&
        address(data.registry) &&
        address(data.resolver) &&
        expiry(data.expiresAt) &&
        data.status === "ready" &&
        data.mode === "on" &&
        data.chainVerified === false &&
        /^[a-f0-9]{64}$/.test(data.resultHash) &&
        data.resultHash === input.resultHash,
      "INVALID_RECEIPT",
      "Invalid real Champion ownership receipt",
    );
    Object.assign(result, {
      claimId: input.claimId,
      address: data.address,
      handle: data.handle,
      name: data.name,
      registry: data.registry,
      resolver: data.resolver,
      expiresAt: data.expiresAt,
      resultHash: data.resultHash,
      status: "ready",
      mode: "on",
      chainId: 11155111,
      chainVerified: false,
    });
  } else if (type === "ens.party.open") {
    requireEns(
      data.status === "ready" &&
        name(data.name) &&
        address(data.registry) &&
        address(data.resolver) &&
        expiry(data.expiresAt),
      "INVALID_RECEIPT",
      "Invalid party receipt",
    );
    Object.assign(result, {
      status: "ready",
      name: data.name,
      registry: data.registry,
      resolver: data.resolver,
      expiresAt: data.expiresAt,
    });
    if (data.registrationTx !== undefined) {
      requireEns(
        /^0x[\da-f]{64}$/i.test(data.registrationTx) &&
          /^\d+$/.test(data.registrationBlock),
        "INVALID_RECEIPT",
        "Invalid party creation reference",
      );
      result.registrationTx = data.registrationTx;
      result.registrationBlock = data.registrationBlock;
    }
  } else if (type === "ens.seat.mint") {
    requireEns(
      id(input.seatId) &&
        data.seatId === input.seatId &&
        data.slot === input.slot &&
        address(data.address) &&
        data.address.toLowerCase() === input.address.toLowerCase() &&
        name(data.name) &&
        expiry(data.expiresAt) &&
        data.status === "ready",
      "INVALID_RECEIPT",
      "Invalid seat receipt",
    );
    Object.assign(result, {
      seatId: input.seatId,
      slot: data.slot,
      address: data.address,
      status: "ready",
      name: data.name,
      expiresAt: data.expiresAt,
    });
  } else if (type === "ens.seat.release") {
    requireEns(
      id(input.seatId) &&
        data.seatId === input.seatId &&
        data.status === "released",
      "INVALID_RECEIPT",
      "Invalid release receipt",
    );
    Object.assign(result, { seatId: input.seatId, status: "released" });
  } else if (type === "ens.party.end") {
    requireEns(
      data.status === "ended",
      "INVALID_RECEIPT",
      "Invalid end receipt",
    );
    result.status = "ended";
  } else if (["ens.role.grant", "ens.role.revoke"].includes(type)) {
    requireEns(
      id(input.grantId) &&
        data.grantId === input.grantId &&
        address(data.address) &&
        data.address.toLowerCase() === input.address.toLowerCase() &&
        data.status === (type.endsWith("grant") ? "granted" : "revoked"),
      "INVALID_RECEIPT",
      "Invalid authority receipt",
    );
    Object.assign(result, {
      grantId: input.grantId,
      address: data.address,
      status: data.status,
    });
  } else if (type === "ens.record.set") {
    requireEns(
      id(input.changeId) &&
        data.changeId === input.changeId &&
        data.status === "written",
      "INVALID_RECEIPT",
      "Invalid record receipt",
    );
    Object.assign(result, { changeId: input.changeId, status: "written" });
  } else throw new Error("Unsupported ENS receipt");
  return result;
}

export function createEnsJobProvider({
  lifecycle,
  champion,
  mock = false,
  transactions,
  explorer,
  queuedJobs,
}) {
  async function supersededGrant(job) {
    const p = job.payload;
    if (
      mock ||
      !queuedJobs ||
      !lifecycle.hasGrant ||
      !transactions?.hasAdmission ||
      !id(p.grantId) ||
      !address(p.address) ||
      !Number.isSafeInteger(job.createdAt)
    )
      return false;
    const paired = (await queuedJobs()).some(({ job: later }) => {
      try {
        validateJob(later);
      } catch {
        return false;
      }
      return (
        later.type === "ens.role.revoke" &&
        later.room === job.room &&
        Number.isSafeInteger(later.createdAt) &&
        later.createdAt > job.createdAt &&
        later.payload.partyId === p.partyId &&
        later.payload.grantId === p.grantId &&
        address(later.payload.address) &&
        later.payload.address.toLowerCase() === p.address.toLowerCase()
      );
    });
    if (!paired || (await lifecycle.hasGrant(p.partyId, p.grantId)))
      return false;
    return !(await transactions.hasAdmission(
      `grant:${digest(p.partyId)}:${digest(p.grantId)}:`,
    ));
  }
  return {
    // Reconciliation belongs to each durable lifecycle stage. Always execute
    // that state machine on retry, rather than trusting a provider-local done bit.
    lookup: async () => null,
    async execute(job) {
      validateJob(job);
      const p = job.payload;
      requireEns(id(p.partyId), "INVALID_JOB", "Missing party identity");
      let value;
      switch (job.type) {
        case "ens.champion.claim": {
          requireEns(
            champion && !mock,
            "CHAMPION_DISABLED",
            "Real Champion issuance is not enabled",
          );
          value = await champion.claim({
            id: p.claimId,
            address: p.address,
            handle: p.handle,
            resultHash: p.resultHash,
            recoveryAcknowledged: p.recoveryAcknowledged,
          });
          return {
            tx: value.tx,
            explorer:
              value.tx && explorer
                ? `${explorer.replace(/\/$/, "")}/tx/${value.tx}`
                : null,
            data: ensReceiptData(job.type, p, {
              ...value,
              claimId: p.claimId,
              partyId: p.partyId,
            }),
          };
        }
        case "ens.party.open":
          value = await lifecycle.open(p);
          break;
        case "ens.seat.mint":
          value = { ...(await lifecycle.mint(p)), seatId: p.seatId };
          break;
        case "ens.seat.release":
          value = {
            ...(await lifecycle.release(p.partyId, p.seatId)),
            seatId: p.seatId,
          };
          break;
        case "ens.party.end":
          value = await lifecycle.end(p.partyId);
          break;
        case "ens.role.grant":
          requireEns(
            !(await supersededGrant(job)),
            "JOB_SUPERSEDED",
            "Grant was revoked in the queue before any lifecycle or transaction admission",
          );
          value = await lifecycle.grant(p);
          break;
        case "ens.role.revoke":
          value = await lifecycle.revoke(p);
          break;
        case "ens.record.set":
          value = await lifecycle.records(p);
          break;
        default:
          throw new Error("Unsupported ENS job");
      }
      let receipts = [];
      if (transactions && !mock) {
        const party = digest(p.partyId);
        const filters = {
          "ens.party.open": {
            prefix: `party:${party}:`,
            suffixes: [":register"],
          },
          "ens.party.end": { prefix: `party:${party}:`, suffixes: [":end"] },
          "ens.seat.mint": {
            prefix: `seat:${party}:${digest(p.seatId || "")}:`,
            suffixes: [":register", ":records"],
          },
          "ens.seat.release": {
            prefix: `seat:${party}:${digest(p.seatId || "")}:`,
            suffixes: [":clear", ":release"],
          },
          "ens.role.grant": {
            prefix: `grant:${party}:${digest(p.grantId || "")}:`,
          },
          "ens.role.revoke": {
            prefix: `revoke:${party}:${digest(p.grantId || "")}:`,
          },
          "ens.record.set": {
            prefix: `record:${party}:${digest(p.changeId || "")}`,
          },
        };
        receipts = await transactions.receipts(filters[job.type]);
        if (job.type === "ens.party.open" && receipts.length)
          Object.assign(value, {
            registrationTx: receipts.at(-1).hash,
            registrationBlock: receipts.at(-1).blockNumber,
          });
      }
      const tx = receipts.at(-1)?.hash || null;
      return {
        tx,
        explorer:
          tx && explorer ? `${explorer.replace(/\/$/, "")}/tx/${tx}` : null,
        ...(mock ? { mock: true } : {}),
        data: ensReceiptData(job.type, p, { ...value, partyId: p.partyId }),
      };
    },
    idle: () => lifecycle.refill(),
  };
}
