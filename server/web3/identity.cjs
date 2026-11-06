"use strict";
const { randomBytes } = require("node:crypto");
const { verifyTypedData, getAddress } = require("viem");
const { bindData } = require("../../integrations/shared/bind-types.mjs");
function createIdentity({ config, now, onBound = () => {} }) {
  const challenges = new WeakMap(),
    budgets = new WeakMap(),
    boundTokens = new WeakMap();
  const domain = {
    name: "Funcaster",
    version: "1",
    chainId: config.ARC_CHAIN_ID,
    salt: "0x" + randomBytes(32).toString("hex"),
  };
  function current(socket, m) {
    return (
      m?.role === "player" &&
      m.player?.socket === socket.id &&
      m.room.players[m.player.slot] === m.player
    );
  }
  return {
    joined(socket, m) {
      if (!socket || !current(socket, m)) return;
      const p = m.player;
      if (boundTokens.get(p) !== p.token) {
        delete p.address;
        boundTokens.delete(p);
      }
      const publicChallenge = {
        nonce: "0x" + randomBytes(32).toString("hex"),
        domain,
        expiresAt: now() + config.WEB3_BIND_TTL_SECONDS * 1000,
      };
      challenges.set(p, {
        ...publicChallenge,
        token: p.token,
        socket: socket.id,
        busy: false,
        used: false,
      });
      socket.emit("web3.challenge", publicChallenge);
    },
    bind(socket, getMembership, broadcast) {
      socket.on("web3.bind", async (data, ack) => {
        if (typeof ack !== "function") return;
        const m = getMembership();
        if (!current(socket, m))
          return ack({ error: "Join a player seat first." });
        const p = m.player;
        let budget = budgets.get(p);
        if (!budget || now() >= budget.until) {
          budget = { until: now() + 60000, count: 0 };
          budgets.set(p, budget);
        }
        if (++budget.count > config.WEB3_BIND_MAX_PER_MINUTE)
          return ack({
            error: "Too many identity attempts. Try again in a minute.",
          });
        if (
          !data ||
          typeof data !== "object" ||
          Array.isArray(data) ||
          Object.keys(data).sort().join(",") !== "address,signature" ||
          typeof data.address !== "string" ||
          !/^0x[\da-f]{40}$/i.test(data.address) ||
          typeof data.signature !== "string" ||
          !/^0x[\da-f]{130}$/i.test(data.signature)
        )
          return ack({ error: "Invalid identity response." });
        const c = challenges.get(p),
          token = p.token;
        if (
          !c ||
          c.used ||
          c.busy ||
          c.token !== token ||
          c.socket !== socket.id ||
          now() >= c.expiresAt
        )
          return ack({
            error: "Identity challenge expired. Rejoin to try again.",
          });
        if (
          p.address &&
          boundTokens.get(p) === token &&
          p.address.toLowerCase() !== data.address.toLowerCase()
        )
          return ack({ error: "This seat already has an identity." });
        c.busy = true;
        let valid = false;
        try {
          valid = await verifyTypedData({
            ...bindData(c, { room: m.room.code, slot: p.slot }),
            address: data.address,
            signature: data.signature,
          });
        } catch {}
        c.busy = false;
        if (
          !valid ||
          getMembership() !== m ||
          !current(socket, m) ||
          p.token !== token ||
          challenges.get(p) !== c ||
          now() >= c.expiresAt
        )
          return ack({ error: "Identity signature rejected." });
        c.used = true;
        p.address = getAddress(data.address);
        boundTokens.set(p, token);
        onBound(m.room, p);
        ack({ ok: true });
        broadcast(m.room);
      });
    },
    release(p) {
      challenges.delete(p);
      budgets.delete(p);
      boundTokens.delete(p);
      delete p.address;
    },
  };
}
module.exports = { createIdentity };
