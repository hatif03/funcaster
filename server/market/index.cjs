"use strict";
const express = require("express"),
  path = require("node:path");
const { randomBytes } = require("node:crypto");
const { verifyTypedData } = require("viem");
const { gameById } = require("../../core/catalog.js");
const { hash } = require("../records.cjs");
const { bundleHash } = require("../bundle-hash.cjs");
const { createMarketStore } = require("../../integrations/market/store.mjs");
const { identityData } = require("../../integrations/market/types.mjs");

function createMarkets({
  config,
  now = Date.now,
  verifyRecord,
  changed = () => {},
  onReceipt = () => {},
  outbox,
  readReceipt,
  liveChains,
  requestDrip,
}) {
  const router = express.Router(),
    current = new WeakMap(),
    active = new Set(),
    challenges = new Map(),
    sessions = new Map(),
    limits = new Map();
  const mode = config.MARKETS;
  const enabled = config.PARTNERS !== "off" && ["mock", "on"].includes(mode);
  let store,
    closed = false,
    busy = false,
    namespace;
  const ready = enabled
    ? (mode === "on"
        ? require("./live-store.cjs").createLiveMarketStore({
            config,
            outbox,
            readReceipt,
            chains: liveChains,
            now,
            onReceipt,
            requestDrip,
          })
        : createMarketStore({
            dir: config.WEB3_DATA_DIR,
            now,
            verifyRecord,
            onReceipt,
            livenessSeconds: config.MARKET_LIVENESS_SECONDS || 90,
            guardSeconds: config.MARKET_GUARD_SECONDS || 5,
            resolveSeconds: config.MARKET_RESOLVE_DEADLINE_SECONDS || 1800,
          })
      ).then((s) => (store = s))
    : Promise.resolve(null);
  ready.catch(() => {});
  const roster = (room) =>
    room.players
      .filter((p) => p?.socket && p.ready)
      .map((p) => ({
        slot: p.slot,
        address: p.address,
        label: p.name || p.nickname || `Player ${p.slot + 1}`,
        color: p.color || "blue",
        token: p.token,
      }));
  const context = (room) =>
    hash({
      game: room.game,
      setup: room.setup || {},
      // Assignments survive controller reconnects. Availability and presentation
      // changes do not change the identities bound to an already listed market.
      seats: room.players.filter(Boolean).map((p) => ({
        slot: p.slot,
        token: p.token,
        address: p.address?.toLowerCase(),
      })),
    });
  const attempt = (req, res, next) =>
    Promise.resolve(ready)
      .then(() => {
        if (!enabled)
          return res.status(503).json({
            error:
              config.MARKETS === "on"
                ? "Live predictions await an owner-deployed, verified MatchMarkets contract. Local demo is available with MARKETS=mock."
                : "Predictions are disabled",
            mode: "off",
          });
        return next();
      })
      .catch(() =>
        res.status(503).json({ error: "Prediction storage unavailable" }),
      );
  const wrap = (fn) => (req, res) =>
    Promise.resolve(fn(req, res)).catch((e) =>
      req.method === "GET"
        ? res
            .status(503)
            .json({ error: "Prediction data temporarily unavailable" })
        : res.status(400).json({ error: e.message }),
    );
  router.use(
    ["/matches", "/market"],
    (req, res, next) => {
      res.set("Cache-Control", "no-store");
      const bearer = (req.headers.authorization || "").replace(/^Bearer /, ""),
        session = sessions.get(bearer);
      const k =
          session && session.expiresAt > now()
            ? session.address
            : req.ip || "local",
        t = now(),
        limit = limits.get(k);
      if (!limit || t - limit.at > 60_000) limits.set(k, { at: t, count: 1 });
      else if (++limit.count > 180)
        return res.status(429).json({ error: "Please wait a moment" });
      if (limits.size > 2000)
        for (const [key, value] of limits)
          if (t - value.at > 60_000) limits.delete(key);
      next();
    },
    attempt,
  );
  router.get(
    "/matches",
    wrap(async (req, res) =>
      res.json({
        mode,
        serverTime: now(),
        matches: await store.list(),
      }),
    ),
  );
  router.get("/market/types.mjs", (req, res) =>
    res
      .type("application/javascript")
      .sendFile(path.resolve(__dirname, "../../integrations/market/types.mjs")),
  );
  router.use("/market", express.json({ limit: "12kb" }));
  router.post(
    "/market/challenge",
    wrap(async (req, res) => {
      const nonce = `0x${randomBytes(32).toString("hex")}`,
        expiresAt = now() + 60_000;
      challenges.set(nonce, expiresAt);
      for (const [n, t] of challenges) if (t < now()) challenges.delete(n);
      res.json({ nonce, expiresAt, mode });
    }),
  );
  router.post(
    "/market/session",
    wrap(async (req, res) => {
      const { nonce, expiresAt, address, signature } = req.body || {};
      if (challenges.get(nonce) !== expiresAt || expiresAt < now())
        throw Error("Connection expired; connect again");
      challenges.delete(nonce);
      if (
        !/^0x[\da-f]{40}$/i.test(address) ||
        !(await verifyTypedData({
          ...identityData(nonce, expiresAt),
          address,
          signature,
        }))
      )
        throw Error("Phone identity could not be verified");
      const token = randomBytes(32).toString("hex");
      sessions.set(token, {
        address: address.toLowerCase(),
        expiresAt: now() + 8 * 60 * 60_000,
      });
      const personal = await store.personal(address);
      if (
        mode === "on" &&
        requestDrip &&
        BigInt(personal.balance || 0) < 100_000n
      ) {
        try {
          await store.refill(address, { ip: req.ip });
          personal.bankrollStatus = "queued";
        } catch {
          personal.bankrollStatus = "unavailable";
        }
      }
      res.json({
        token,
        address,
        mode,
        ...personal,
      });
    }),
  );
  router.use("/market", (req, res, next) => {
    if (req.method === "GET" && req.path === "/types.mjs") return next();
    const token = (req.headers.authorization || "").replace(/^Bearer /, ""),
      session = sessions.get(token);
    if (!session || session.expiresAt <= now())
      return res.status(401).json({ error: "Connect this phone to continue" });
    req.spectator = session;
    next();
  });
  router.get(
    "/market/me",
    wrap(async (req, res) =>
      res.json(await store.personal(req.spectator.address)),
    ),
  );
  router.post(
    "/market/quote",
    wrap(async (req, res) => {
      if (mode !== "on" || !store.quote)
        throw Error("Quotes are only needed for Arc predictions");
      res.json(await store.quote(req.spectator.address, req.body));
    }),
  );
  router.post(
    "/market/bet",
    wrap(async (req, res) =>
      res.json(
        await store.bet(
          req.spectator.address,
          req.body.intent,
          req.body.signature,
        ),
      ),
    ),
  );
  router.post(
    "/market/claim",
    wrap(async (req, res) =>
      res.json(await store.claim(req.body.marketId, req.spectator.address)),
    ),
  );
  router.post(
    "/market/refill",
    wrap(async (req, res) =>
      res.json(await store.refill(req.spectator.address, { ip: req.ip })),
    ),
  );
  async function tick() {
    if (closed || busy || !store) return;
    busy = true;
    try {
      const rows = await store.list();
      namespace?.emit("directory", {
        mode,
        serverTime: now(),
        matches: rows,
      });
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(() => tick().catch(() => {}), 2000);
  timer.unref();
  return {
    router,
    ready,
    namespace(io) {
      if (!enabled) return;
      namespace = io.of("/market");
      namespace.on("connection", (socket) => {
        ready
          .then(() => store.list())
          .then((matches) =>
            socket.emit("directory", {
              mode,
              serverTime: now(),
              matches,
            }),
          )
          .catch(() => {});
      });
    },
    async choose(
      room,
      {
        listed = true,
        windowSeconds = config.MARKET_WINDOW_SECONDS || 60,
      } = {},
    ) {
      await ready;
      if (!enabled)
        throw Error("Predictions are off; live contract activation is pending");
      const prior = current.get(room);
      if (prior)
        await store.void(prior.id, "Listing changed; coins are refundable");
      if (!listed) {
        current.delete(room);
        active.delete(room);
        changed(room);
        return { listed: false };
      }
      if (room.phase === "playing" || room.phase === "countdown")
        throw Error("Open predictions in the lobby");
      const game = gameById(room.game);
      if (
        !game ||
        game.verification !== "verifiable" ||
        room.game === "drawing" ||
        (room.game === "fruit-ninja" && room.setup?.mode !== "versus")
      )
        throw Error("This game does not support winner predictions");
      const seats = roster(room);
      if (seats.length !== room.players.filter(Boolean).length)
        throw Error(
          "All seated players must be connected and ready before opening predictions",
        );
      if (seats.some((s) => !/^0x[\da-f]{40}$/i.test(s.address)))
        throw Error("Players must connect their names first");
      const frozenAssignments = context(room);
      const m = await store.create({
        game: game.gameId,
        title: game.title,
        seats,
        windowSeconds,
        context: frozenAssignments,
        frozenContext: {
          gameId: game.gameId,
          bundleHash: bundleHash(game.id),
          slots: seats.map((s) => s.slot),
        },
      });
      current.set(room, { id: m.marketId, context: frozenAssignments });
      active.add(room);
      changed(room);
      return { listed: true, marketId: m.marketId, closesAt: m.closesAt };
    },
    observe(room) {
      const m = current.get(room);
      if (!m || !store) return;
      if (!store.snapshot(m.id)?.started && m.context !== context(room)) {
        current.delete(room);
        active.delete(room);
        store
          .void(m.id, "Player lineup changed; coins are refundable")
          .then(() => changed(room))
          .catch(() => {});
      }
    },
    startReason(room) {
      const m = current.get(room);
      if (!m) return null;
      if (!store) return "Predictions are loading";
      if (store.startReason) return store.startReason(m.id);
      const s = store.snapshot(m.id);
      if (s && !s.started && now() < s.startsAt)
        return `Predictions close before play · ${Math.ceil((s.startsAt - now()) / 1000)}s`;
      return null;
    },
    started(room) {
      const m = current.get(room);
      if (m)
        return ready
          .then(() =>
            store.start(m.id, {
              matchId: room.arcade
                ? `${room.startedAt.toString(36)}.${room.code}.${room.roundId}`
                : `${room.code}.${room.roundId}`,
            }),
          )
          .catch(() => store.void(m.id));
    },
    finish(room, record) {
      const m = current.get(room);
      if (m)
        return ready
          .then(() => store.finish(m.id, record))
          .then(() => changed(room));
    },
    end(room) {
      const m = current.get(room);
      if (m) ready.then(() => store.void(m.id)).catch(() => {});
      current.delete(room);
      active.delete(room);
    },
    view(room) {
      const m = current.get(room),
        s = m && store?.snapshot(m.id);
      return {
        enabled,
        mode: enabled ? mode : "off",
        listed: !!s,
        marketId: s?.marketId || null,
        closesAt: s?.closesAt || null,
        startsAt: s?.startsAt || null,
        phase: s?.phase || null,
        link: "/predict",
      };
    },
    async close() {
      closed = true;
      clearInterval(timer);
      await ready;
      for (const room of active) {
        const m = current.get(room);
        if (m) await store.void(m.id, "Console closed; coins are refundable");
      }
      await store?.close();
    },
  };
}
module.exports = { createMarkets };
