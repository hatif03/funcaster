"use strict";
const {
  createOutbox,
  createReceiptReader,
  readJobReceipt,
  readJson,
  atomicJson,
} = require("../../integrations/shared/outbox.mjs");
const { loadConfig } = require("../../integrations/shared/config.mjs");
function createWeb3({
  config = loadConfig(),
  now = Date.now,
  ensAuthority,
  demoWrite,
} = {}) {
  if (config.PARTNERS === "off") return null;
  const demoLog = require("./demo-log.cjs").createDemoLog({
    mode: config.PARTNERS,
    now,
    write: demoWrite,
  });
  const mock =
    config.PARTNERS === "mock"
      ? require("./mock.cjs").createMockProviders()
      : null;
  const identity = require("./identity.cjs").createIdentity({
    config,
    now,
    onBound: (room, player) => {
      ens.observe(room);
      demoLog.walletConnected(player);
    },
  });
  const names = require("./names.cjs").createNames({ config, now });
  const states = new WeakMap(),
    results = new Map();
  let closed = false,
    workerUp = false,
    outboxDepth = 0;
  const rooms = new Map(),
    pending = new Map(),
    earlyReceipts = new Map();
  const outbox = createOutbox(config.WEB3_DATA_DIR, { now });
  const localRecords = require("../local-records/index.cjs").createLocalRecords(
    {
      dataDir: config.WEB3_DATA_DIR,
      isRoomActive: (code) => rooms.has(code),
      verificationRpcUrls: {
        ...(config.WEB3_ARC === "on"
          ? { arc: config.ARC_RPC_URLS.slice(0, 2) }
          : {}),
        ...(config.WEB3_ENS === "on"
          ? { ens: config.ENS_RPC_URLS.slice(0, 2) }
          : {}),
      },
    },
  );
  const community = require("./community.cjs").createCommunity({
    directory: config.WEB3_DATA_DIR,
    rooms: () => [...rooms.values()].map((entry) => entry.room),
    ensView: (room) => ens.view(room),
    championEnabled:
      config.WEB3_ENS === "on" && config.WEB3_ENS_CHAMPION === "on",
    championParent: config.ENS_PARENT,
    enqueue: (input) => outbox.enqueue(input),
    readReceipt: (id) => readJobReceipt(config.WEB3_DATA_DIR, id),
    now,
  });
  let spectatorSalt;
  const markets = require("../market/index.cjs").createMarkets({
    config,
    now,
    changed: (room) => rooms.get(room.code)?.broadcast?.(room),
    onReceipt: (receipt) => localRecords.recordReceipt(receipt),
    outbox,
    readReceipt: (id) => readJobReceipt(config.WEB3_DATA_DIR, id),
    requestDrip: async (address, meta = {}) => {
      const { createHmac, randomBytes } = require("node:crypto");
      const file = require("node:path").join(
        config.WEB3_DATA_DIR,
        "spectator-drip-salt.json",
      );
      spectatorSalt ||= (async () => {
        let salt = await readJson(file);
        if (!salt) {
          salt = randomBytes(32).toString("hex");
          await atomicJson(file, salt);
        }
        return salt;
      })().catch((error) => {
        spectatorSalt = null;
        throw error;
      });
      const salt = await spectatorSalt;
      const hash = (value) =>
        createHmac("sha256", salt).update(value).digest("hex");
      return outbox.enqueue({
        type: "arc.drip",
        room: "spectators",
        idempotencyKey: `spectator-drip:${hash(address.toLowerCase())}`,
        payload: {
          asset: "usdc",
          address,
          device: hash(address.toLowerCase()),
          ip: hash(meta.ip || "unknown"),
        },
      });
    },
  });
  const commerceSelections = new WeakMap();
  let commerce;
  const commerceReady =
    config.COMMERCE !== "off"
      ? (async () => {
          const ports =
            config.COMMERCE === "on"
              ? await (
                  await import("../../integrations/shared/live-ports.mjs")
                ).commercePorts(config)
              : {};
          return require("../commerce/index.cjs").createCommerce({
            ...ports,
            dataDir: config.WEB3_DATA_DIR,
            outbox,
            readJobReceipt,
            directory: require("node:path").join(
              config.WEB3_DATA_DIR,
              "commerce",
            ),
            mode: config.COMMERCE,
            now,
            platformAddress:
              config.ARC_RELAYER_ADDRESS ||
              "0x5555555555555555555555555555555555555555",
            onReceipt: (receipt) => {
              // Live receipts replay from the durable worker stream using its
              // job ID. The operation callback would duplicate the same payment.
              if (receipt.mode === "on") return;
              return localRecords.recordReceipt({
                id: `commerce:${receipt.id}`,
                type: `commerce.${receipt.action}`,
                status: receipt.mode === "on" ? "done" : "posted",
                mock: receipt.mode !== "on",
                tx: receipt.tx || null,
                explorer: receipt.explorer || null,
                at: receipt.at,
                data: {
                  amount: receipt.amount,
                  asset: receipt.asset,
                  mode: receipt.mode,
                },
              });
            },
            firstPartyGames: require("../../core/catalog.js").games.map(
              (g) => ({
                id: g.id,
                title: g.title,
                path: `/games/${g.id}/`,
                bundleHash: require("../bundle-hash.cjs").bundleHash(g.id),
              }),
            ),
          });
        })().then((value) => {
          commerce = value;
          return value;
        })
      : Promise.resolve(null);
  commerceReady.catch(() => {});
  function commerceView(room) {
    const choice = commerceSelections.get(room);
    if (!choice || choice.game !== room.game)
      return { mode: config.COMMERCE, selected: false };
    return {
      mode: config.COMMERCE,
      selected: true,
      versionId: choice.versionId,
      title: choice.title,
      link: `/commerce/?commerceVersion=${choice.versionId}&commerceRoom=${room.code}`,
    };
  }
  function commerceReason(room, active = false) {
    const choice = commerceView(room);
    if (!choice.selected) return null;
    if (!commerce) return "Creator passes are loading";
    const seats = active
      ? room.active.map((s) => room.players[s]).filter(Boolean)
      : room.players.filter((p) => p?.ready && p.socket);
    for (const player of seats) {
      if (!player.address)
        return "Connect each phone's identity before choosing a pass";
      try {
        if (
          !commerce.service.access({
            versionId: choice.versionId,
            roomCode: room.code,
            buyer: player.address,
          }).allowed
        )
          return active
            ? "Creator demo ended. Choose a pass to play again."
            : "This table needs a free demo or a creator pass";
      } catch {
        return "Creator pass is unavailable";
      }
    }
    return null;
  }
  const ens = require("./ens-rooms.cjs").createEnsRooms({
    config,
    now,
    ...(ensAuthority ? { authority: ensAuthority } : {}),
    enqueue: (room, input, apply) => enqueue(room, input, null, apply),
    changed: (room) => rooms.get(room.code)?.broadcast?.(room),
  });
  async function resolveRoster(room, slots) {
    const names = slots.map((slot) => ens.binding(room.players[slot]));
    if (
      names.some(
        (b, i) =>
          !b ||
          b.status !== "ready" ||
          b.released ||
          b.token !== room.players[slots[i]]?.token ||
          b.address.toLowerCase() !==
            room.players[slots[i]]?.address?.toLowerCase(),
      )
    )
      throw Error("Player names are still saving");
    if (config.WEB3_ARC === "mock" && config.WEB3_ENS === "mock")
      return {
        seats: names.map((b) => ({ address: b.address })),
        mode: "mock",
      };
    const snapshot = await (await ens.reads()).roster(names.map((b) => b.name));
    if (
      slots.some((slot, i) => ens.binding(room.players[slot]) !== names[i]) ||
      snapshot.seats.some(
        (seat, i) =>
          seat.address.toLowerCase() !== names[i].address.toLowerCase(),
      )
    )
      throw Error("Player ownership changed on chain");
    return snapshot;
  }
  const arc = require("./arc-rooms.cjs").createArcRooms({
    config,
    now,
    resolveRoster,
    binding: ens.binding,
    workerUp: () => workerUp,
    enqueue: (room, input, apply) => enqueue(room, input, null, apply),
    changed(room) {
      const state = states.get(room),
        stakes = arc.view(room);
      const tx = stakes.tx?.settle || stakes.tx?.finalize || stakes.tx?.refund;
      if (state && stakes.matchId && tx)
        state.receipts[stakes.matchId] = {
          ...(state.receipts[stakes.matchId] || { ens: null, arkiv: null }),
          arc: { tx, explorer: `${config.ARC_EXPLORER_URL}/tx/${tx}` },
          state: "posted",
        };
      rooms.get(room.code)?.broadcast?.(room);
    },
  });
  const authorityTimer = setInterval(() => {
    void ens.pollAuthority().catch(() => {});
  }, 1000);
  authorityTimer.unref();
  const arcTimer = setInterval(() => void arc.poll().catch(() => {}), 3000);
  arcTimer.unref();
  const commerceTimer = setInterval(
    () => void commerce?.service.poll?.().catch(() => {}),
    5000,
  );
  commerceTimer.unref();
  function acceptReceipt(receipt) {
    const item = pending.get(receipt.id);
    if (closed) return;
    community.acceptReceipt?.(receipt);
    if (!item) {
      earlyReceipts.set(receipt.id, receipt);
      if (earlyReceipts.size > 512)
        earlyReceipts.delete(earlyReceipts.keys().next().value);
      return;
    }
    pending.delete(receipt.id);
    item.apply?.(receipt);
    const state = states.get(item.room);
    if (state && item.matchId)
      state.receipts[item.matchId] = {
        arc: null,
        arkiv: null,
        ens: null,
        state: "local",
        ...(receipt.mock ? { mock: true } : {}),
      };
    rooms.get(item.room.code)?.broadcast?.(item.room);
  }
  const reader = createReceiptReader(config.WEB3_DATA_DIR, {
    now,
    async onReceipt(receipt) {
      if (closed) return;
      if (!localRecords.recordReceipt(receipt))
        throw Error("LOCAL_RECORD_QUEUE_FULL");
      await localRecords.flush({ includeVerification: false });
      demoLog.receipt(receipt);
      acceptReceipt(receipt);
    },
    onHealth(value) {
      if (closed) return;
      workerUp = value.up;
      outboxDepth = value.depth;
      for (const { room, broadcast } of rooms.values()) {
        const state = states.get(room);
        if (state) state.health = health();
        broadcast?.(room);
      }
    },
  });
  function enqueue(room, input, matchId = null, apply = null) {
    outbox
      .enqueue({ ...input, room: room.code })
      .then((job) => {
        if (!closed) {
          pending.set(job.id, { room, matchId, apply });
          if (earlyReceipts.has(job.id)) {
            const receipt = earlyReceipts.get(job.id);
            earlyReceipts.delete(job.id);
            acceptReceipt(receipt);
          }
        }
      })
      .catch(() => {
        apply?.({ status: "failed" });
        const state = states.get(room);
        if (state && matchId)
          state.receipts[matchId] = {
            arc: null,
            arkiv: null,
            ens: null,
            state: "local",
          };
        rooms.get(room.code)?.broadcast?.(room);
      });
  }
  const health = () =>
    Object.fromEntries(
      ["ens", "arc", "arkiv"].map((p) => [
        p,
        config[`WEB3_${p.toUpperCase()}`] === "off"
          ? "off"
          : config[`WEB3_${p.toUpperCase()}`] === "mock"
            ? workerUp
              ? "ok"
              : "down"
            : p === "arc"
              ? arc.health()
              : p === "ens" &&
                  workerUp &&
                  [...rooms.values()].some(
                    ({ room }) => ens.get(room)?.health === "ok",
                  )
                ? "ok"
                : "down",
      ]),
    );
  function initial(room) {
    return {
      mode: config.PARTNERS,
      health: health(),
      party: { status: "pending", name: null, expiresAt: null, explorer: null },
      seats: [],
      host: { slot: null, authorised: false, roles: [], revocable: false },
      stakes: mock?.pot.initial() || {
        rung: 0,
        status: "off",
        playMoney: true,
      },
      receipts: {},
    };
  }
  function view(room) {
    const state = states.get(room) || initial(room);
    const stakes = arc.view(room);
    return {
      web3: {
        ...structuredClone(state),
        health: health(),
        ...ens.view(room),
        stakes,
        predictions: markets.view(room),
        commerce: commerceView(room),
      },
    };
  }
  function tick(room, time, broadcast) {
    if (closed) return;
    rooms.set(room.code, { room, broadcast });
    if (!states.has(room)) {
      const state = initial(room);
      if (mock && config.WEB3_ENS === "mock")
        state.party = mock.naming.party(room);
      states.set(room, state);
      broadcast?.(room);
    }
    ens.observe(room);
    arc.observe(room);
    markets.observe(room);
  }
  function finish(room, record) {
    if (closed) return;
    localRecords.finish(room, record);
    void community.finish(room, record).catch(() => {});
    arc.finish(room, record);
    void markets.finish(room, record)?.catch(() => {});
    const state = states.get(room) || initial(room);
    states.set(room, state);
    // Keep canonical game data separate: never mutate the record or its hash.
    if (record?.result?.hash) {
      results.set(record.result.hash, record.result);
      if (results.size > 2000) results.delete(results.keys().next().value);
      state.receipts[record.result.matchId] = mock?.records.finish() || {
        arc: null,
        arkiv: null,
        ens: null,
        state: "local",
      };
      ens.finish(room, record.result, (data, receipt) => {
        const row = state.receipts[record.result.matchId];
        if (row && data && !receipt.mock && receipt.tx) {
          row.ens = { tx: receipt.tx, explorer: receipt.explorer || null };
          row.state = "posted"; // Independent Ledger verification is separate.
        }
      });
    }
  }
  const { router, potRouter } = require("./router.cjs").createRouter({
    config,
    health: () => ({
      ok:
        config.WEB3_KILL !== "1" &&
        workerUp &&
        Object.values(health()).every((status) =>
          ["off", "ok"].includes(status),
        ),
      providers: health(),
      worker: workerUp ? "up" : "down",
      outboxDepth: outboxDepth + outbox.pending,
    }),
    getResult: (value) => results.get(value),
    getEnsReads: ens.reads,
    getArcReads:
      config.WEB3_ARC === "on"
        ? require("./arc-reader.cjs").createArcReader(config)
        : undefined,
    getPot: (id) => {
      for (const { room } of rooms.values()) {
        const stakes = arc.view(room);
        if (stakes?.potId?.toLowerCase() === id.toLowerCase())
          return structuredClone(stakes);
      }
      return null;
    },
  });
  router.use(community.router);
  router.use(markets.router);
  router.get("/live-config", (_req, res) =>
    res.json({
      mode: config.PARTNERS,
      records: "local",
      ens: config.WEB3_ENS,
      arc: config.WEB3_ARC,
      markets: config.MARKETS,
      commerce: config.COMMERCE,
      arkiv: "retired",
      swarm: "retired",
    }),
  );
  return {
    router,
    recordsRouter: localRecords.router,
    commerceRouter(req, res, next) {
      commerceReady
        .then((value) =>
          value
            ? value.router(req, res, next)
            : res.status(503).json({ error: "Creator passes are disabled" }),
        )
        .catch(() =>
          res.status(503).json({ error: "Creator passes are unavailable" }),
        );
    },
    namespace: markets.namespace,
    async predictions(room, input) {
      try {
        return { ok: true, ...(await markets.choose(room, input)) };
      } catch (error) {
        return { error: error.message || "Predictions unavailable" };
      }
    },
    async commerce(room, input) {
      if (!["lobby", "results"].includes(room.phase))
        return { error: "Choose passes between rounds" };
      if (!input?.versionId) {
        commerceSelections.delete(room);
        return { ok: true };
      }
      try {
        await commerceReady;
        const version = commerce?.service
          .catalog()
          .versions.find(
            (v) => v.id === input.versionId && v.gameId === room.game,
          );
        if (!version)
          return { error: "Choose a published version of this game" };
        commerceSelections.set(room, {
          game: room.game,
          versionId: version.id,
          title: version.title,
        });
        return { ok: true };
      } catch {
        return { error: "Creator passes are unavailable" };
      }
    },
    potRouter,
    view,
    authorizeHost: ens.authorize,
    resolveRoster,
    stakes: arc.choose,
    started(room) {
      arc.started(room);
      markets.started(room);
      void community.started(room).catch(() => {});
    },
    setHostRevoker: ens.setHostRevoker,
    bind(socket, membership, broadcast) {
      identity.bind(socket, membership, broadcast);
      names.bind(socket, membership, broadcast);
      arc.bind(socket, membership, broadcast);
    },
    joined(socket, membership) {
      identity.joined(socket, membership);
      arc.joined(socket, membership);
      if (membership?.role === "player") ens.observe(membership.room);
    },
    release(p) {
      ens.release(p);
      identity.release(p);
      names.release(p);
    },
    tick,
    finish,
    end(room) {
      arc.end(room);
      markets.end(room);
      ens.end(room);
      rooms.delete(room.code);
      for (const [id, item] of pending)
        if (item.room === room) pending.delete(id);
      states.delete(room);
    },
    startReason: (room) =>
      arc.startReason(room) ||
      markets.startReason(room) ||
      commerceReason(room),
    stopReason: (room) => commerceReason(room, true),
    close() {
      closed = true;
      clearInterval(authorityTimer);
      clearInterval(arcTimer);
      clearInterval(commerceTimer);
      arc.close();
      ens.close();
      reader.close();
      rooms.clear();
      pending.clear();
      earlyReceipts.clear();
      results.clear();
      return Promise.all([
        outbox.close(),
        localRecords.close(),
        community.close(),
        markets.close(),
        commerceReady.then((c) => c?.service.close?.()),
      ]);
    },
  };
}
module.exports = { createWeb3 };
