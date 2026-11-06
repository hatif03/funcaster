"use strict";
const express = require("express");
const { randomBytes, randomUUID, createHash } = require("node:crypto");
const {
  readJson,
  atomicJson,
} = require("../../integrations/shared/outbox.mjs");
const path = require("node:path");
const { verifyTypedData } = require("viem");

// Local coordination replaces Arkiv, not ENS ownership. Room admission secrets
// stay private; an accepted challenge reveals its join link only to its peers.
function createCommunity({
  directory,
  rooms,
  ensView,
  now = Date.now,
  championEnabled = false,
  championParent,
  enqueue,
  readReceipt,
}) {
  const file = path.join(directory, "community.json");
  let state = { offers: [], handles: {}, eligible: {}, earned: {} },
    queue = Promise.resolve();
  const ready = readJson(file).then((s) => {
    if (s) state = { ...state, ...s };
  });
  const challenges = new Map(),
    rates = new Map();
  const domain = {
    name: "Funcaster Live",
    version: "1",
    chainId: 5042002,
    salt: "0x" + randomBytes(32).toString("hex"),
  };
  const types = {
    Action: [
      { name: "action", type: "string" },
      { name: "body", type: "string" },
      { name: "nonce", type: "bytes32" },
      { name: "expiresAt", type: "uint64" },
    ],
  };
  function change(fn) {
    const result = queue.then(async () => {
      await ready;
      const value = await fn();
      state.offers = state.offers
        .filter((o) => o.expiresAt > now() - 86400000)
        .slice(-500);
      await atomicJson(file, state);
      return value;
    });
    queue = result.catch(() => {});
    return result;
  }
  function activeRoom(code) {
    return [...rooms()].find((r) => r.code === code);
  }
  function playerRoom(address) {
    return [...rooms()].find((r) =>
      r.players.some((p) => p?.socket && p.address?.toLowerCase() === address),
    );
  }
  function publicOffer(o) {
    return {
      id: o.id,
      game: o.game,
      title: o.title,
      challenger: state.handles[o.owner]?.handle || o.nickname,
      expiresAt: o.expiresAt,
      status: o.expiresAt <= now() ? "expired" : o.status,
      resultHash: o.resultHash || null,
    };
  }
  function applyReceipt(receipt) {
    if (receipt?.type !== "ens.champion.claim") return false;
    const entry = Object.entries(state.handles).find(
      ([, row]) => row.jobId === receipt.id,
    );
    if (!entry) return false;
    const [address, row] = entry,
      data = receipt.data;
    if (row.status === "issued") return true;
    if (receipt.status === "failed") {
      row.status = "failed";
      row.message =
        "ENS issuance stopped. Your local handle is saved; contact the console host.";
      return true;
    }
    if (
      receipt.status !== "done" ||
      receipt.mock ||
      !/^0x[\da-f]{64}$/i.test(receipt.tx) ||
      data?.claimId !== row.claimId ||
      data.address?.toLowerCase() !== address ||
      data.handle !== row.handle ||
      data.resultHash !== row.proof ||
      data.name !== `${row.handle}.players.${championParent}` ||
      data.status !== "ready" ||
      data.mode !== "on" ||
      data.chainVerified !== false ||
      data.chainId !== 11155111 ||
      !/^0x[\da-f]{40}$/i.test(data.registry) ||
      !/^0x[\da-f]{40}$/i.test(data.resolver) ||
      !/^\d{1,20}$/.test(data.expiresAt)
    )
      return false;
    Object.assign(row, {
      status: "issued",
      name: data.name,
      tx: receipt.tx,
      registry: data.registry,
      resolver: data.resolver,
      expiresAt: data.expiresAt,
      chainVerified: false,
      message: "ENS name issued to this phone. Keep your recovery key safe.",
    });
    return true;
  }
  async function refreshReceipt(row) {
    if (row?.jobId && row.status === "pending" && readReceipt) {
      const receipt = await readReceipt(row.jobId);
      if (receipt) applyReceipt(receipt);
    }
  }
  async function act(address, action, body) {
    address = address.toLowerCase();
    return change(async () => {
      if (action === "offer") {
        const room = playerRoom(address);
        if (!room || !["lobby", "results"].includes(room.phase))
          throw Error("Join a waiting table on this phone first.");
        if (
          state.offers.some(
            (o) =>
              o.owner === address && o.status === "open" && o.expiresAt > now(),
          )
        )
          throw Error("You already have an open challenge.");
        if (
          state.offers.filter((o) => o.status === "open" && o.expiresAt > now())
            .length >= 40
        )
          throw Error("Challenge board is full. Try again shortly.");
        const p = room.players.find(
          (p) => p?.address?.toLowerCase() === address,
        );
        const o = {
          id: randomUUID(),
          owner: address,
          room: room.code,
          game: room.game,
          title:
            require("../../core/catalog.js").gameById(room.game)?.title ||
            String(room.game).slice(0, 50),
          nickname: String(p?.displayName || p?.name || "Player").slice(0, 24),
          expiresAt: now() + 600000,
          status: "open",
        };
        state.offers.push(o);
        return publicOffer(o);
      }
      if (["take", "cancel", "invite"].includes(action)) {
        const o = state.offers.find((o) => o.id === body.id);
        if (!o || o.expiresAt <= now()) throw Error("Challenge expired.");
        const room = activeRoom(o.room);
        if (action === "cancel") {
          if (o.owner !== address || o.status !== "open")
            throw Error("Only the challenger can cancel an open offer.");
          o.status = "cancelled";
          return { ok: true };
        }
        if (!room || !["lobby", "results"].includes(room.phase))
          throw Error("The table is no longer waiting.");
        if (action === "take") {
          if (o.owner === address)
            throw Error("Choose another player's challenge.");
          if (o.status !== "open" && o.claimant !== address)
            throw Error("Challenge already taken.");
          if (room.players.filter((p) => p?.socket).length >= 4)
            throw Error("The table is full.");
          o.claimant = address;
          o.status = "taken";
        }
        if (o.owner !== address && o.claimant !== address)
          throw Error("Join link is private to these players.");
        return {
          ...publicOffer(o),
          join: `/controller?room=${encodeURIComponent(o.room)}`,
        };
      }
      if (action === "handle") {
        const wanted = String(body.handle || "").toLowerCase();
        if (
          !/^[a-z][a-z0-9-]{2,19}$/.test(wanted) ||
          /^(play|players|legends|fans|booth|games|agents|host|tv|admin|chonks|www)$/.test(
            wanted,
          )
        )
          throw Error(
            "Use 3–20 letters, numbers or hyphens; choose a personal handle.",
          );
        if (!state.eligible[address])
          throw Error(
            "Finish a verified match on this phone before saving a handle.",
          );
        if (body.backupConfirmed !== true)
          throw Error("Save this phone's key before keeping a handle.");
        if (
          Object.entries(state.handles).some(
            ([a, h]) => a !== address && h.handle === wanted,
          )
        )
          throw Error(
            `Taken. Try ${wanted.slice(0, 15)}-${address.slice(-4)}.`,
          );
        const prior = state.handles[address];
        if (prior?.claimId) {
          if (prior.handle !== wanted)
            throw Error("This phone already requested its persistent handle.");
          await refreshReceipt(prior);
          if (prior.jobId) return { ...prior };
        }
        if (championEnabled) {
          if (!enqueue || !/^[a-z0-9-]+\.eth$/.test(championParent || ""))
            throw Error("ENS Champion setup is not ready.");
          const proof = prior?.proof || state.eligible[address];
          const claimId = createHash("sha256")
            .update(`${championParent}:${address}:${wanted}:${proof}`)
            .digest("hex");
          const row = prior?.claimId
            ? prior
            : {
                handle: wanted,
                proof,
                claimId,
                savedAt: now(),
                status: "pending",
                message:
                  "ENS issuance queued. This is a local handle until confirmed.",
              };
          state.handles[address] = row;
          // Persist intent before admission. A crash retries the same claim and
          // idempotency key, never a second independent name issuance.
          await atomicJson(file, state);
          const job = await enqueue({
            type: "ens.champion.claim",
            room: `handle_${claimId.slice(0, 24)}`,
            idempotencyKey: `ens.champion.claim:${claimId}`,
            payload: {
              partyId: `handle:${claimId}`,
              claimId,
              address,
              handle: wanted,
              resultHash: proof,
              recoveryAcknowledged: true,
            },
          });
          row.jobId = job.id;
          return { ...row };
        }
        state.handles[address] = {
          handle: wanted,
          proof: state.eligible[address],
          savedAt: now(),
          status: "local",
        };
        return {
          ...state.handles[address],
          message:
            "Handle saved on this console. ENS Champion issuance is pending; this is not an ENS name.",
        };
      }
      if (action === "profile") {
        await refreshReceipt(state.handles[address]);
        return {
          address,
          championAvailable: championEnabled,
          handle: state.handles[address] || null,
          eligible: !!state.eligible[address],
          offers: state.offers
            .filter((o) => o.owner === address || o.claimant === address)
            .map(publicOffer),
        };
      }
      throw Error("Unknown community action.");
    });
  }
  const router = express.Router();
  router.use(express.json({ limit: "4kb" }), (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.get("/community", async (_req, res) => {
    try {
      await ready;
      const names = [...rooms()].flatMap((room) => {
        if (
          !state.offers.some(
            (o) =>
              o.room === room.code &&
              o.expiresAt > now() &&
              ["open", "taken", "playing"].includes(o.status),
          )
        )
          return [];
        const data = ensView(room)?.web3 || ensView(room);
        return [
          data?.party?.name,
          ...(data?.seats || []).map((p) => p.name),
        ].filter(Boolean);
      });
      res.json({
        storage: "local",
        names: [...new Set(names)].slice(0, 40),
        offers: state.offers
          .filter(
            (o) =>
              o.expiresAt > now() &&
              ["open", "taken"].includes(o.status) &&
              activeRoom(o.room),
          )
          .map(publicOffer),
      });
    } catch {
      res.status(503).json({ error: "Community storage is unavailable." });
    }
  });
  router.post("/community/challenge", (req, res) => {
    for (const [id, c] of challenges)
      if (c.message.expiresAt <= now()) challenges.delete(id);
    for (const [ip, b] of rates) if (b.until <= now()) rates.delete(ip);
    const b = rates.get(req.ip) || { count: 0, until: now() + 60000 };
    rates.set(req.ip, b);
    if (++b.count > 30 || challenges.size >= 1000 || rates.size > 2000)
      return res.status(429).json({ error: "Please wait a minute." });
    const { action, body = {} } = req.body || {};
    if (
      !["offer", "take", "cancel", "invite", "handle", "profile"].includes(
        action,
      ) ||
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    )
      return res.status(400).json({ error: "Invalid action." });
    const message = {
      action,
      body: JSON.stringify(body),
      nonce: "0x" + randomBytes(32).toString("hex"),
      expiresAt: now() + 60000,
    };
    const challenge = { domain, types, primaryType: "Action", message };
    challenges.set(message.nonce, challenge);
    res.json(challenge);
  });
  router.post("/community/action", async (req, res) => {
    const { nonce, address, signature } = req.body || {},
      c = challenges.get(nonce);
    challenges.delete(nonce);
    if (
      !c ||
      c.message.expiresAt <= now() ||
      !/^0x[\da-f]{40}$/i.test(address) ||
      !/^0x[\da-f]{130}$/i.test(signature)
    )
      return res
        .status(400)
        .json({ error: "Session request expired. Try again." });
    try {
      if (!(await verifyTypedData({ ...c, address, signature })))
        throw Error("Identity signature rejected.");
      res.json(
        await act(address, c.message.action, JSON.parse(c.message.body)),
      );
    } catch (e) {
      res
        .status(400)
        .json({ error: e.message?.slice(0, 200) || "Action unavailable." });
    }
  });
  return {
    router,
    act,
    acceptReceipt(receipt) {
      return change(() => applyReceipt(receipt)).catch(() => false);
    },
    started(room) {
      return change(() => {
        for (const o of state.offers)
          if (o.room === room.code && o.status === "taken") {
            const seats = room.active.map((s) =>
              room.players[s]?.address?.toLowerCase(),
            );
            if (seats.includes(o.owner) && seats.includes(o.claimant)) {
              o.status = "playing";
              o.matchId = room.arcade
                ? `${room.startedAt.toString(36)}.${room.code}.${room.roundId}`
                : `${room.code}.${room.roundId}`;
            }
          }
      });
    },
    finish(room, record) {
      return change(() => {
        if (
          record?.result?.verification === "verified" &&
          record.result.status === "completed"
        ) {
          const addresses = [];
          for (const slot of room.active) {
            const a = room.players[slot]?.address?.toLowerCase();
            if (a) {
              state.eligible[a] = record.result.hash;
              addresses.push(a);
            }
          }
          state.earned[record.result.hash] = {
            addresses: [...new Set(addresses)],
          };
        }
        for (const o of state.offers)
          if (o.matchId === record?.result?.matchId) {
            o.status = "finished";
            o.resultHash = record.result.hash;
          }
      });
    },
    close: () => queue,
  };
}
module.exports = { createCommunity };
