import path from "node:path";
import { atomicJson, readJson, digest } from "../shared/outbox.mjs";
import { createEnsJobProvider } from "./jobs.mjs";
import { seatLabel } from "./labels.mjs";

// Offline fixture provider. It never imports an RPC client or a signer and every
// output carries mock:true. The same receipt contract is used as the real lane.
export async function createMockEnsProvider(dir) {
  const file = path.join(dir, "mock-effects", "ens-state.json");
  const state = (await readJson(file)) || { parties: {} };
  const save = () => atomicJson(file, state);
  const address = (text) => `0x${digest(text).slice(0, 40)}`;
  const find = (id) => {
    const p = state.parties[id];
    if (!p) throw Error("Mock party missing");
    return p;
  };
  const partyView = (p) => ({
    name: p.name,
    registry: p.registry,
    resolver: p.resolver,
    expiresAt: p.expiresAt,
    status: p.status,
  });
  const lifecycle = {
    refill: async () => {},
    async open(input) {
      let p = state.parties[input.partyId];
      if (!p) {
        p = {
          code: input.code,
          name: `table-${digest(input.partyId).slice(0, 8)}.play.mock.eth`,
          registry: address(input.partyId),
          resolver: address(`resolver:${input.partyId}`),
          expiresAt: String(Math.floor(Date.now() / 1000) + 14400),
          status: "ready",
          seats: {},
          grants: {},
        };
        state.parties[input.partyId] = p;
        await save();
      }
      if (p.code !== input.code || p.status !== "ready")
        throw Error("Mock party conflict");
      return partyView(p);
    },
    async mint(input) {
      const p = find(input.partyId);
      if (p.status !== "ready") throw Error("Mock party ended");
      let seat = p.seats[input.seatId];
      const fingerprint = digest(JSON.stringify(input));
      if (!seat) {
        const current = Object.values(p.seats).filter(
          (s) => s.status === "ready",
        );
        if (
          current.some(
            (s) =>
              s.slot === input.slot ||
              s.address.toLowerCase() === input.address.toLowerCase(),
          )
        )
          throw Error("Mock occupied seat");
        let label,
          attempt = 0;
        do {
          label = seatLabel(input.nickname, input.slot, attempt++);
        } while (current.some((s) => s.name === `${label}.${p.name}`));
        seat = {
          fingerprint,
          name: `${label}.${p.name}`,
          address: input.address,
          slot: input.slot,
          expiresAt: p.expiresAt,
          status: "ready",
        };
        p.seats[input.seatId] = seat;
        await save();
      }
      if (seat.fingerprint !== fingerprint || seat.status !== "ready")
        throw Error("Mock seat conflict");
      return {
        name: seat.name,
        address: seat.address,
        slot: seat.slot,
        expiresAt: seat.expiresAt,
        status: seat.status,
      };
    },
    async release(partyId, seatId) {
      const p = find(partyId);
      if (!p.seats[seatId]) throw Error("Mock seat missing");
      p.seats[seatId].status = "released";
      await save();
      return { status: "released" };
    },
    async end(partyId) {
      find(partyId).status = "ended";
      await save();
      return { status: "ended" };
    },
    async grant(p) {
      find(p.partyId).grants[p.grantId] = { ...p, status: "granted" };
      await save();
      return { ...p, status: "granted" };
    },
    async revoke(p) {
      find(p.partyId).grants[p.grantId] = { ...p, status: "revoked" };
      await save();
      return { ...p, status: "revoked" };
    },
    async records(p) {
      find(p.partyId);
      return { changeId: p.changeId, status: "written" };
    },
  };
  return createEnsJobProvider({ lifecycle, mock: true });
}
