// Local-only Arc simulation. No network, private key or transaction hash.
import path from "node:path";
import { atomicJson, readJson, digest } from "../shared/outbox.mjs";
import { validateArcJob, json } from "./jobs.mjs";
import { termsHash, placesHash } from "./signatures.mjs";
import { payoutVector } from "./payouts.mjs";
export const MOCK_POT = `0x${"55".repeat(20)}`;
export const MOCK_ORACLE = `0x${"66".repeat(20)}`;
export function createMockArcReader(dir, { now = Date.now } = {}) {
  const file = (id) => path.join(dir, "arc-mock", `${id}.json`);
  return {
    file,
    async snapshot(id) {
      const p = await readJson(file(id));
      if (!p) throw Error("MOCK pot is still being created");
      return {
        ...p,
        mode: "mock",
        chainId: 5042002,
        contract: MOCK_POT,
        blockNumber: String(now()),
        blockHash: `0x${digest(String(now()))}`,
        observedAt: now(),
        chainTime: Math.floor(now() / 1000),
        chainVerified: false,
      };
    },
    async tokenSnapshot(symbol, addresses) {
      return {
        chainTime: Math.floor(now() / 1000),
        accounts: addresses.map((address) => ({
          address,
          balance: 10_000_000n,
          blocked: false,
        })),
      };
    },
  };
}
export function createMockArcProvider(dir, { now = Date.now } = {}) {
  const reader = createMockArcReader(dir, { now });
  return {
    async lookup(key) {
      return readJson(
        path.join(dir, "arc-mock-effects", `${digest(key)}.json`),
      );
    },
    async execute(job) {
      const p = validateArcJob(job),
        sec = Math.floor(now() / 1000);
      let data;
      if (job.type === "arc.drip") {
        data = {
          mode: "mock",
          chainId: 5042002,
          blockNumber: String(now()),
          blockHash: `0x${digest(String(now()))}`,
          chainTime: sec,
          observedAt: now(),
          chainVerified: false,
          outcome: "applied",
          asset: p.asset,
          address: p.address,
          amount: "3000000",
        };
      } else {
        let s = await readJson(reader.file(p.potId));
        if (job.type === "arc.pot.create")
          s ||= {
            potId: p.potId,
            terms: p.terms,
            termsHash: termsHash(p.potId, p.terms),
            state: "Funding",
            fundedBitmap: 0,
            lockedAt: 0,
            proposalAt: 0,
            placesHash: `0x${"00".repeat(32)}`,
            claimables: p.terms.seats.map(() => "0"),
          };
        if (!s) throw Error("MOCK pot missing");
        const seat = s.terms.seats.findIndex(
          (a) => a.toLowerCase() === p.seat?.toLowerCase(),
        );
        if (job.type === "arc.pot.fund" && s.state === "Funding") {
          if (seat < 0) throw Error("MOCK seat missing");
          s.fundedBitmap |= 1 << seat;
          if (s.fundedBitmap === (1 << s.terms.seats.length) - 1) {
            s.state = "Locked";
            s.lockedAt = sec;
          }
        }
        if (job.type === "arc.pot.propose" && s.state === "Locked") {
          s.state = "Proposed";
          s.proposalAt = sec;
          s.placesHash = placesHash(p.places);
        }
        if (job.type === "arc.pot.contest" && s.state === "Proposed")
          s.state = "Contested";
        if (
          job.type === "arc.pot.refund" &&
          (s.state === "Contested" ||
            (s.state === "Funding" && sec >= Number(s.terms.fundDeadline)) ||
            (s.state === "Locked" && sec >= Number(s.terms.settleDeadline)))
        ) {
          s.state = "Refunded";
          s.claimables = s.terms.seats.map((_, i) =>
            s.fundedBitmap & (1 << i) ? s.terms.stake : "0",
          );
        }
        if (
          (job.type === "arc.pot.settle" && s.state === "Locked") ||
          (job.type === "arc.pot.finalize" &&
            s.state === "Proposed" &&
            sec >= s.proposalAt + s.terms.challengeWindow)
        ) {
          s.state = "Settled";
          s.claimables = payoutVector(
            BigInt(s.terms.stake),
            p.places,
            s.terms.rule,
          ).map(String);
        }
        if (
          job.type === "arc.pot.claim" &&
          ["Settled", "Refunded"].includes(s.state) &&
          seat >= 0
        )
          s.claimables[seat] = "0";
        await atomicJson(reader.file(p.potId), s);
        data = { ...(await reader.snapshot(p.potId)), outcome: "applied" };
      }
      const output = { mock: true, tx: null, explorer: null, data: json(data) };
      await atomicJson(
        path.join(
          dir,
          "arc-mock-effects",
          `${digest(job.idempotencyKey)}.json`,
        ),
        output,
      );
      return output;
    },
  };
}
