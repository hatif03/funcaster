"use strict";
const { randomBytes, randomInt, timingSafeEqual } = require("node:crypto");
const proxyaddr = require("proxy-addr"),
  trustProxy = proxyaddr.compile("loopback");
const {
  GAMES,
  createRound,
  stepRound,
  snapshot,
} = require("./party-engine.cjs");
const { SharedRound, SHARED_GAMES } = require("./shared-round.cjs");
const { createRemote } = require("./remote.cjs");
const { createArcade } = require("./arcade.cjs");
const {
  pointerMode,
  pointerSample,
  shellButton,
  deviceInfo,
} = require("./shell-input.cjs");
const { SketchVote } = require("./sketch-vote.cjs");
const { SketchRound } = require("./sketch-round.cjs");
const { LogicReplay, SUPPORTED: REPLAY_GAMES } = require("./logic-replay.cjs");
const { SliceReplay } = require("./slice-replay.cjs");
const { normalizeScores, makeResult } = require("./records.cjs");
const {
  games,
  gameById,
  matchSetup,
  independentViews,
} = require("../core/catalog.js");
const CLASSICS = Object.fromEntries(
  games.filter((g) => g.classic).map((g) => [g.id, g.maxPlayers]),
);
const independent = (room) => independentViews(room.game, room.match);
const SUPPORTED = games.map((g) => g.id);
const { SEATS } = require("../core/seats.js");
const COLORS = SEATS.map((s) => s.color);
const NAMES = SEATS.map((s) => s.name);
const token = () => randomBytes(24).toString("base64url");
const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
function attachParty(
  io,
  {
    now = Date.now,
    tickMs = 1000 / 30,
    buildId = null,
    arcade: launch = false,
    persist = null,
    eventStats = null,
    remoteViews = false,
    web3 = null,
  } = {},
) {
  const ns = io.of("/party"),
    rooms = new Map();
  const code = () =>
    Array.from(
      { length: 6 },
      () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)],
    ).join("");
  const view = (room, hostDetails = false) => ({
    ...arcade.state(room),
    ...remote.state(room),
    ...(web3?.view(room, hostDetails) || {}),
    code: room.code,
    ...(hostDetails
      ? {
          createdAt: room.created,
          ...(room.arcade
            ? {
                removedPlayers: [...room.arcade.removed]
                  .filter(([, p]) => p.expiresAt > now())
                  .map(([restoreId, p]) => ({
                    restoreId,
                    slot: p.slot,
                    name: NAMES[p.slot],
                    expiresAt: p.expiresAt,
                  })),
              }
            : {}),
        }
      : {}),
    buildId: room.buildId,
    game: room.game,
    autoStart: room.auto,
    setup: room.setup || {},
    match: room.match || null,
    phase: room.phase,
    endsAt: room.endsAt,
    resultsHeld: !!room.resultsHeld,
    resultsRemainingMs: room.resultsHeld ? room.resultsRemainingMs : null,
    serverTime: now(),
    hostConnected: !!room.host,
    pointerMode: pointerMode(room),
    screenConnected: !!room.screen,
    sharedWaiting: room.sharedWaiting || null,
    displays: room.displays?.size || 0,
    active: room.active,
    roundId: room.roundId,
    result: room.result || null,
    sketch: room.sketch?.publicState() || null,
    voting: room.voting?.publicState() || null,
    standings: room.standings || {},
    bracket: room.bracket || null,
    playlist: room.playlist || [],
    playlistIndex: room.playlistIndex || 0,
    paused: !!room.paused || !!room.dropPaused,
    extensions: room.extensions || 0,
    maxPlayers: CLASSICS[room.game] || 4,
    players: room.players.filter(Boolean).map((p) => ({
      slot: p.slot,
      ...(room.arcade
        ? {
            shape: SEATS[p.slot].shape,
            status:
              room.outcomes?.[p.slot] ||
              (!p.socket || p.away
                ? "away"
                : room.active.includes(p.slot)
                  ? "active"
                  : p.ready
                    ? "ready"
                    : "joined"),
          }
        : {}),
      name: (web3 && p.displayName) || NAMES[p.slot],
      color: COLORS[p.slot],
      connected: !!p.socket,
      ready: p.ready,
      mode: p.mode,
      ...(hostDetails && p.device ? { device: p.device } : {}),
      boostIn:
        room.round?.players.find((r) => r.slot === p.slot)?.cooldown || 0,
      boostsLeft:
        room.round?.players.find((r) => r.slot === p.slot)?.boostsLeft ?? null,
      score: Math.floor(
        room.result?.scores.find((r) => r.slot === p.slot)?.score ??
          room.round?.players.find((r) => r.slot === p.slot)?.score ??
          0,
      ),
    })),
  });
  const presence = (room, view = -1) => ({
    controller: room.active.filter(
      (s) => room.host && room.players[s]?.socket && room.players[s].ready,
    ).length,
    setup: room.match || {},
    sketch: room.sketch
      ? {
          ...room.sketch.publicState(),
          drawer: room.active.indexOf(room.sketch.drawer),
        }
      : null,
    slots: room.active
      .map((s, i) => ({
        slot: i,
        name: (web3 && room.players[s]?.displayName) || NAMES[s],
        color: COLORS[s],
        occupied: !!(
          room.host &&
          room.players[s]?.socket &&
          room.players[s].ready
        ),
      }))
      .filter((s) => view < 0 || s.slot === view)
      .map((s) => ({ ...s, slot: view < 0 ? s.slot : 0 })),
  });
  const broadcast = (room) => {
    let publicRecipients = ns.to(room.code);
    if (room.host) publicRecipients = publicRecipients.except(room.host);
    publicRecipients.emit("state", view(room));
    // Only the main shell needs device diagnostics. Never include them in the
    // shared room broadcast received by other players, queued phones or displays.
    if (room.host) ns.to(room.host).emit("state", view(room, true));
    arcade.publishQueue(room);
    remote.publish(room);
    if (room.sketch && room.phase === "classic")
      for (const p of room.players.filter(Boolean))
        if (p.socket)
          ns.to(p.socket).emit("sketch-turn", room.sketch.privateState(p.slot));
    if (!room.remote?.gate)
      for (const [view, id] of room.screens || [])
        ns.to(id).emit("presence", presence(room, view));
    for (const [id, v] of room.viewers || [])
      ns.to(id).emit("presence", presence(room, v));
  };
  function closeScreen(room) {
    remote.close(room);
    const old = [...(room.screens?.values() || [])];
    room.screens = new Map();
    room.screen = null;
    old.forEach((id) => ns.sockets.get(id)?.disconnect(true));
    for (const id of room.viewers?.keys() || [])
      ns.sockets.get(id)?.disconnect(true);
    room.viewers?.clear();
    room.snapshots?.clear();
  }
  function classicEmit(room, event, data, index) {
    for (const [view, id] of room.screens || []) {
      if (view < 0 || view === index)
        ns.to(id).emit(event, { ...data, slot: view < 0 ? index : 0 });
    }
  }
  function relayClassic(room, time) {
    room.active.forEach((slot, index) => {
      const p = room.players[slot],
        live = !!(
          room.host &&
          !room.paused &&
          p?.socket &&
          p.ready &&
          !room.outcomes?.[slot] &&
          !room.voting?.voting &&
          time - p.lastInput < 500
        );
      classicEmit(
        room,
        "orientation",
        {
          party: live
            ? {
                ...p.input,
                active: true,
                ageMs: Math.min(200, time - (p.sampledAt || p.lastInput)),
              }
            : {
                x: 0,
                y: 0,
                gas: false,
                brake: false,
                boost: false,
                active: false,
              },
        },
        index,
      );
    });
  }
  function phase(room, next, seconds = 0) {
    room.phase = next;
    room.resultsHeld = false;
    room.resultsRemainingMs = null;
    room.endsAt = room.remote?.gate ? 0 : seconds ? now() + seconds * 1000 : 0;
    broadcast(room);
  }
  function finish(room, scores, abandoned = false) {
    if (
      room.result ||
      !["classic", "playing", "countdown", "practice"].includes(room.phase)
    )
      return;
    const game = gameById(room.game);
    if (room.arcade)
      for (const score of scores)
        if (!room.outcomes[score.slot] && score.outcome === "dnf")
          room.outcomes[score.slot] = "dnf";
    const record = makeResult(room, game, scores, now(), { abandoned });
    room.result = record.result;
    if (
      room.game === "kart" &&
      room.result.verification === "verified" &&
      !abandoned
    ) {
      const winner = room.result.scores.find(
          (s) => !s.outcome || s.outcome === "finished",
        ),
        run = winner && room.ghostRuns?.get(room.active.indexOf(winner.slot));
      if (run?.poses.length)
        room.previousGhost = { slot: winner.slot, poses: run.poses };
    }
    room.history ||= [];
    room.history.push(record);
    let retainedBytes = room.history.reduce(
      (sum, r) => sum + JSON.stringify(r).length,
      0,
    );
    while (
      room.history.length > 1 &&
      (room.history.length > 20 || retainedBytes > 24000000)
    )
      retainedBytes -= JSON.stringify(room.history.shift()).length;
    room.standings ||= {};
    if (
      !abandoned &&
      !(room.game === "drawing" && !room.sketch && !room.voting)
    )
      for (const s of room.result.scores)
        room.standings[s.slot] =
          (room.standings[s.slot] || 0) +
          (["forfeit", "removed"].includes(s.outcome)
            ? 0
            : Math.max(1, 5 - s.rank));
    if (
      game.maxPlayers === 2 &&
      room.active.length === 2 &&
      room.players.filter((p) => p?.ready && p.socket).length > 2
    ) {
      const [winner, loser] = room.result.scores;
      const waiting = room.players
        .filter((p) => p?.ready && p.socket && !room.active.includes(p.slot))
        .map((p) => p.slot);
      if (room.match.rotation === "bracket" && room.bracket) {
        const b = room.bracket;
        if (b.stage === "final") {
          b.champion = winner.slot;
          room.auto = false;
          room.nextSeats = null;
        } else {
          b.winners.push(winner.slot);
          if (b.field.length === 4 && b.winners.length === 1)
            room.nextSeats = b.field.slice(2);
          else {
            b.stage = "final";
            room.nextSeats =
              b.field.length === 3
                ? [winner.slot, b.field[2]]
                : b.winners.slice();
          }
        }
      } else
        room.nextSeats =
          room.match.rotation === "bracket"
            ? [...waiting, winner.slot, loser.slot]
            : room.match.rotation === "winner"
              ? [winner.slot, ...waiting, loser.slot]
              : null;
    }
    arcade.finish(room);
    web3?.finish(room, record);
    ns.to(room.code).emit("match.finish", room.result);
    phase(room, "results", room.arcade?.mode === "kiosk" ? 10 : 12);
  }
  function endRoom(room) {
    if (rooms.get(room.code) !== room) return;
    // Explicit shutdown and expiry use the same no-contest record and teardown.
    if (room.arcade && room.active.length && !room.result)
      finish(
        room,
        room.active.map((slot) => ({
          slot,
          score: room.progress?.[slot] || 0,
        })),
        true,
      );
    ns.to(room.code).emit("ended");
    web3?.end(room);
    rooms.delete(room.code);
    ns.in(room.code).disconnectSockets();
  }
  function enterLobby(room) {
    if (room.active.length && !room.result && room.match)
      finish(
        room,
        room.active.map((slot) => ({
          slot,
          score:
            room.progress?.[slot] ??
            Math.floor(
              room.round?.players.find((p) => p.slot === slot)?.score || 0,
            ),
        })),
        true,
      );
    closeScreen(room);
    room.round = null;
    room.shared = null;
    room.sharedWaiting = null;
    room.sketch = null;
    room.voting = null;
    room.active = [];
    room.paused = false;
    phase(room, "lobby");
  }
  function start(room, firstSlot = null) {
    room.extensions = 0;
    room.ghostRuns = new Map();
    if (web3?.startReason(room) || remote.reason(room)) {
      room.auto = false;
      broadcast(room);
      return;
    }
    let eligible = room.players.filter((p) => p?.socket && p.ready);
    if (firstSlot !== null)
      eligible.sort(
        (a, b) =>
          ((a.slot - firstSlot + 4) % 4) - ((b.slot - firstSlot + 4) % 4),
      );
    if (room.nextSeats) {
      const order = room.nextSeats;
      eligible.sort(
        (a, b) =>
          (order.includes(a.slot) ? order.indexOf(a.slot) : 10 + a.slot) -
          (order.includes(b.slot) ? order.indexOf(b.slot) : 10 + b.slot),
      );
      room.nextSeats = null;
    }
    if (!eligible.length || !room.host) return;
    const setup = matchSetup(
      gameById(room.game),
      room.setup || {},
      eligible.length,
    );
    if (eligible.length < setup.minHumans) {
      room.auto = false;
      broadcast(room);
      return;
    }
    if (
      gameById(room.game).maxPlayers === 2 &&
      setup.rotation === "bracket" &&
      eligible.length > 2 &&
      (!room.bracket || room.bracket.champion !== null)
    )
      room.bracket = {
        field: eligible.map((p) => p.slot),
        winners: [],
        stage: "semifinal",
        champion: null,
      };
    if (
      gameById(room.game).maxPlayers === 2 &&
      setup.rotation === "pick" &&
      room.setup?.pair?.length === 2
    ) {
      const pair = room.setup.pair;
      if (!pair.every((slot) => eligible.some((p) => p.slot === slot))) {
        room.auto = false;
        broadcast(room);
        return;
      }
      eligible.sort(
        (a, b) =>
          (pair.includes(a.slot) ? pair.indexOf(a.slot) : 10 + a.slot) -
          (pair.includes(b.slot) ? pair.indexOf(b.slot) : 10 + b.slot),
      );
    }
    room.pointerMode = false;
    room.match = { ...setup, seed: randomInt(2147483647) };
    room.result = null;
    room.outcomes = {};
    room.firstFinishAt = 0;
    room.replay = [];
    room.startedAt = now();
    room.finishedViews = {};
    room.sliceReplays = new Map();
    room.logicReplay = null;
    room.logicReplays = new Map();
    room.classicStage = "ready";
    closeScreen(room);
    room.roundId++;
    room.active = eligible
      .slice(0, Math.min(CLASSICS[room.game] || 4, setup.maxHumans))
      .map((p) => p.slot);
    web3?.started?.(room);
    room.lastSoloSlot =
      room.setup?.mode === "solo" && room.active.length === 1
        ? room.active[0]
        : null;
    room.voting =
      room.game === "drawing" && setup.drawing === "vote"
        ? new SketchVote(room.active)
        : null;
    room.sketch =
      room.game === "drawing" &&
      setup.drawing === "guess" &&
      room.active.length > 1
        ? new SketchRound(room.active, randomInt(2147483647), setup)
        : null;
    room.shared = null;
    room.sharedWaiting = null;
    if (
      room.arcade &&
      SHARED_GAMES.has(room.game) &&
      room.remote?.enabled &&
      room.active.some((s) => room.remote.seats.has(s))
    ) {
      room.match.serverSimulation = true;
      room.match.remoteIndices = room.active
        .map((s, i) => (room.remote.seats.has(s) ? i : -1))
        .filter((i) => i >= 0);
      room.shared = new SharedRound(room.game, room.match, room.active.length);
      room.sharedPeers = new Map();
      room.sharedLost = new Map();
      room.sharedStarted = false;
      room.sharedHostLost = 0;
      room.sharedGateUntil = now() + 20000;
      room.sharedWaiting = "Getting every screen ready…";
    }
    if (CLASSICS[room.game]) {
      remote.prepare(room);
      room.round = null;
      room.progress = {};
      phase(
        room,
        "classic",
        room.arcade
          ? gameById(room.game).roundPolicy.hardCapMs / 1000
          : room.game === "mario-kart"
            ? 600
            : room.game === "golf"
              ? 480
              : room.game === "drawing"
                ? 180
                : 120,
      );
      return;
    }
    room.round = createRound(
      room.game,
      room.active,
      room.match.seed,
      room.match,
    );
    phase(room, "practice", 6);
  }
  const remote = createRemote({
    ns,
    now,
    buildId,
    equal,
    token,
    broadcast,
    presence,
    independent,
  });
  const arcade = createArcade({
    ns,
    now,
    broadcast,
    start,
    enterLobby,
    persist,
    eventStats,
    remoteReason: remote.reason,
    web3Reason: (room) => web3?.startReason(room),
    authorizeHost: web3?.authorizeHost,
    playerName: (p) => (web3 && p.displayName) || NAMES[p.slot],
    releasePlayer: (p) => web3?.release(p),
    pairPromoted: (room, p) => {
      if (p.screenRef) remote.pair(room, p.slot, p.screenRef);
      delete p.screenRef;
      web3?.joined(ns.sockets.get(p.socket), {
        room,
        role: "player",
        player: p,
      });
    },
  });
  web3?.setHostRevoker?.((room, player) => {
    if (room.arcade?.hostToken !== player.token) return;
    room.arcade.denied.add(player.token);
    arcade.revokePlayer(room, player.token);
    arcade.publishQueue(room);
  });
  ns.on("connection", (socket) => {
    socket.data.clientAddress = proxyaddr(socket.request, trustProxy);
    let membership = null;
    let denied = 0;
    socket.use((packet, next) => {
      if (
        !["host", "join", "display", "watch-game", "screen"].includes(packet[0])
      )
        return next();
      const ack = packet.at(-1);
      if (
        denied >= 5 ||
        !arcade.limit(`access:${socket.data.clientAddress}`, 180)
      ) {
        if (typeof ack === "function")
          ack({
            error: "Too many connection attempts. Wait a minute, then reload.",
          });
        return;
      }
      if (typeof ack === "function")
        packet[packet.length - 1] = (result) => {
          if (result?.error && !result?.update) denied++;
          else if (result?.ok || result?.token) denied = 0;
          ack(result);
        };
      next();
    });
    const adminHandlers = new Map();
    function onAdmin(name, handler) {
      adminHandlers.set(name, handler);
      socket.on(name, (...args) => {
        if (membership?.role === "host") handler(...args);
      });
    }
    arcade.bind(socket, () => membership, adminHandlers);
    remote.bind(socket, () => membership);
    web3?.bind(socket, () => membership, broadcast);
    if (web3)
      for (const command of ["stakes", "predictions", "commerce"])
        onAdmin(command, async (data, ack = () => {}) => {
          if (typeof ack !== "function" || !arcade.admin(membership)) return;
          const room = membership.room;
          const answer = await web3[command](room, data);
          ack(answer);
          broadcast(room);
        });
    socket.on("host", (data, ack = () => {}) => {
      if (typeof ack !== "function") return;
      if (buildId && data?.buildId !== buildId)
        return ack({
          error: "This page has an older version. Reload to join.",
          update: true,
        });
      if (membership) return ack({ error: "This tab has already joined." });
      let room;
      if (data?.code) {
        room = rooms.get(data.code);
        if (!room || !equal(room.hostToken, data.token))
          return ack({ error: "Session expired. Start a new party." });
        if (room.host && room.host !== socket.id)
          ns.sockets.get(room.host)?.disconnect(true);
      } else {
        if (!arcade.limit(`create:${socket.data.clientAddress}`, 10))
          return ack({ error: "Too many new parties. Try again in a minute." });
        if (rooms.size >= 100)
          return ack({ error: "The party server is busy. Please try again." });
        let id;
        do {
          id = code();
        } while (rooms.has(id));
        room = {
          code: id,
          buildId,
          hostToken: token(),
          displayToken: token(),
          displays: new Set(),
          viewers: new Map(),
          snapshots: new Map(),
          host: null,
          hostLost: 0,
          pointerMode: false,
          players: Array(4).fill(null),
          phase: "lobby",
          auto: true,
          game: GAMES[0],
          endsAt: 0,
          active: [],
          round: null,
          roundId: 0,
          setup: {},
          match: null,
          screen: null,
          screens: new Map(),
          created: now(),
        };
        if (launch || data?.arcade === true) arcade.init(room);
        if (remoteViews) remote.init(room);
        rooms.set(id, room);
      }
      membership = { room, role: "host" };
      room.host = socket.id;
      socket.join(room.code);
      ack({
        code: room.code,
        token: room.hostToken,
        displayToken: room.displayToken,
      });
      broadcast(room);
    });
    // Display invites grant read access only. They can never become a game authority.
    socket.on("display", (data, ack = () => {}) => {
      if (typeof ack !== "function" || membership) return;
      const room = rooms.get(data?.code);
      if (!room || !equal(room.displayToken, data?.token))
        return ack({ error: "Display invite expired." });
      if (room.displays.size >= 8)
        return ack({ error: "Eight displays are already watching." });
      const answer = remote.register(room, socket, data);
      if (answer.error) return ack(answer);
      membership = { room, role: "display" };
      room.displays.add(socket.id);
      socket.join(room.code);
      ack(answer);
      socket.emit("state", view(room));
    });
    socket.on("watch-game", (data, ack = () => {}) => {
      if (typeof ack !== "function" || membership) return;
      if (buildId && data?.buildId !== buildId)
        return ack({
          error: "Reload this screen to update the game.",
          update: true,
        });
      const room = rooms.get(data?.code),
        v = Number(data?.view);
      if (
        !room ||
        !equal(room.displayToken, data?.token) ||
        room.phase !== "classic" ||
        data.roundId !== room.roundId ||
        data.game !== room.game ||
        room.viewers.size >= 32
      )
        return ack({ error: "Game invite expired." });
      const view = independent(room) ? v : -1;
      if (view >= room.active.length || view < -1 || !Number.isInteger(view))
        return ack({ error: "Invalid view." });
      let sharedSeat = null;
      if (room.shared && data.resumeKey) {
        const d = [...room.remote.records.values()].find((d) =>
          equal(d.resumeKey, data.resumeKey),
        );
        if (d)
          sharedSeat =
            [...room.remote.seats].find(([, ref]) => ref === d.ref)?.[0] ??
            null;
        if (sharedSeat !== null && !room.outcomes[sharedSeat]) {
          const old = room.sharedPeers.get(sharedSeat);
          if (old) ns.sockets.get(old)?.disconnect(true);
          room.sharedPeers.set(sharedSeat, socket.id);
          room.sharedLost.delete(sharedSeat);
        }
      }
      membership = { room, role: "viewer", sharedSeat };
      room.viewers.set(socket.id, view);
      socket.join(room.code);
      ack({
        ok: true,
        setup: room.match,
        authority: false,
        snapshot: room.shared?.snapshot() || room.snapshots.get(view) || null,
      });
      socket.emit("presence", presence(room, view));
    });
    socket.on("golf.stroke", (data) => {
      if (membership?.role !== "screen") return;
      const { room, view } = membership;
      if (
        room.game !== "golf" ||
        room.phase !== "classic" ||
        view !== -1 ||
        room.screens.get(-1) !== socket.id ||
        room.paused ||
        now() - (membership.lastStroke || 0) < 100
      )
        return;
      if (
        !data ||
        !Number.isInteger(data.slot) ||
        data.slot < 0 ||
        data.slot > 7 ||
        !Number.isInteger(data.hole) ||
        data.hole < 0 ||
        data.hole > 5 ||
        ![data.clock, data.roundTime, data.aim, data.power].every(
          Number.isFinite,
        ) ||
        Math.abs(data.aim) > 0.5 ||
        data.power < 0 ||
        data.power > 1
      )
        return;
      for (const [key, axes, limit] of [
        ["ball", ["x", "y", "z", "vx", "vy", "vz"], 1000],
        ["pin", ["x", "z"], 1000],
        ["wind", ["x", "z"], 10],
      ])
        if (
          !axes.every(
            (k) =>
              Number.isFinite(data[key]?.[k]) &&
              Math.abs(data[key][k]) <= limit,
          )
        )
          return;
      membership.lastStroke = now();
      const event = {
        slot: data.slot,
        hole: data.hole,
        seq: Number.isSafeInteger(data.seq) ? data.seq : null,
        clock: data.clock,
        roundTime: data.roundTime,
        aim: data.aim,
        power: data.power,
        ball: Object.fromEntries(
          ["x", "y", "z", "vx", "vy", "vz"].map((k) => [k, data.ball[k]]),
        ),
        pin: { x: data.pin.x, z: data.pin.z },
        wind: { x: data.wind.x, z: data.wind.z },
      };
      for (const [id, v] of room.viewers)
        if (v === -1) ns.to(id).emit("golf.stroke", event);
    });
    socket.on("snapshot", (data) => {
      if (membership?.role !== "screen") return;
      const { room, view } = membership;
      if (
        room.phase !== "classic" ||
        room.shared ||
        room.screens.get(view) !== socket.id ||
        now() - (membership.lastSnapshot || 0) < 40
      )
        return;
      if (
        !data ||
        !Number.isFinite(data.clock) ||
        !data.state ||
        JSON.stringify(data).length > 250000
      )
        return;
      membership.lastSnapshot = now();
      room.snapshots.set(view, data);
      if (
        room.game === "kart" &&
        view >= 0 &&
        data.state.state === "racing" &&
        now() - (membership.lastRecordedGhost || 0) >= 100
      ) {
        membership.lastRecordedGhost = now();
        const s = data.state;
        if (
          [s.x, s.z, s.heading].every(
            (v) => Number.isFinite(v) && Math.abs(v) < 10000,
          )
        ) {
          let run = room.ghostRuns.get(view);
          if (!run) {
            run = { start: data.clock, poses: [] };
            room.ghostRuns.set(view, run);
          }
          if (run.poses.length < 3000)
            run.poses.push({
              t: data.clock - run.start,
              x: s.x,
              y: 0,
              z: s.z,
              heading: s.heading,
            });
        }
      }
      if (
        view >= 0 &&
        ["kart", "island-flyover", "alien-attack"].includes(room.game) &&
        now() - (membership.lastGhost || 0) >= 100
      ) {
        membership.lastGhost = now();
        const s = data.state,
          pose = s.pos || { x: s.x, y: 0, z: s.z };
        if ([pose.x, pose.z].every(Number.isFinite))
          for (const [other, id] of room.screens)
            if (other !== view)
              ns.to(id).emit("ghost", {
                slot: room.active[view],
                pose: {
                  x: pose.x,
                  y: Number.isFinite(pose.y) ? pose.y : 0,
                  z: pose.z,
                  heading: Number.isFinite(s.heading) ? s.heading : 0,
                },
                at: now(),
              });
      }
      for (const [id, v] of room.viewers)
        if (v === view) ns.to(id).emit("snapshot", data);
    });
    // Only the host's same-origin game frame can receive this room's inputs.
    // The host token is read from tab storage; it is never in a QR or URL.
    socket.on("screen", (data, ack = () => {}) => {
      if (typeof ack !== "function" || membership) return;
      if (buildId && data?.buildId !== buildId)
        return ack({
          error: "Reload this screen to update the game.",
          update: true,
        });
      const room = rooms.get(data?.code);
      if (
        !room ||
        (!data?.viewToken && !equal(room.hostToken, data?.token)) ||
        room.phase !== "classic" ||
        data.game !== room.game ||
        data.roundId !== room.roundId
      )
        return ack({ error: "Game session expired. Return to the game room." });
      const authorized = remote.authorize(room, data);
      if (authorized.error) return ack(authorized);
      const view = authorized.view;
      if (
        independent(room) &&
        (!Number.isInteger(view) || view < 0 || view >= room.active.length)
      )
        return ack({ error: "Invalid player view." });
      const old = room.screens.get(view);
      if (old) ns.sockets.get(old)?.disconnect(true);
      room.screens.set(view, socket.id);
      room.screen = room.screens.values().next().value;
      membership = { room, role: "screen", view };
      socket.join(room.code);
      ack({
        ok: true,
        setup: room.match,
        active: room.active,
        authority: !room.shared,
        snapshot: room.shared?.snapshot(),
        ...(room.game === "kart" && room.previousGhost
          ? { previousGhost: room.previousGhost }
          : {}),
      });
      if (!room.remote?.gate) socket.emit("presence", presence(room, view));
      remote.registered(room, view, authorized.remote);
    });
    socket.on("match.finish", (data, ack = () => {}) => {
      if (typeof ack !== "function") return;
      if (
        membership?.role !== "screen" ||
        ![...membership.room.screens.values()].includes(socket.id)
      )
        return ack({ error: "Only the active game can finish." });
      const room = membership.room;
      if (room.shared)
        return ack({ error: "The server owns this round’s result." });
      if (room.phase !== "classic" || room.result)
        return ack({ error: "Round already ended." });
      const view = membership.view;
      const scores = normalizeScores(
        data?.scores,
        view < 0 ? room.active.map((_, i) => i) : [0],
      );
      if (!scores) return ack({ error: "Invalid scores." });
      if (view >= 0) {
        room.finishedViews[view] = scores[0].score;
        if (
          room.arcade &&
          gameById(room.game).roundPolicy.kind === "untilDone" &&
          !room.firstFinishAt
        ) {
          room.firstFinishAt = now();
          room.endsAt = Math.min(
            room.endsAt,
            now() + gameById(room.game).roundPolicy.finishWindowMs,
          );
        }
        if (Object.keys(room.finishedViews).length === room.active.length)
          finish(
            room,
            room.active.map((slot, i) => ({
              slot,
              score: room.finishedViews[i],
            })),
          );
      } else
        finish(
          room,
          scores.map((s) => ({ ...s, slot: room.active[s.slot] })),
        );
      ack({ ok: true, result: room.result });
    });
    socket.on("replay-chunk", (data, ack = () => {}) => {
      if (typeof ack !== "function") return;
      if (membership?.role !== "screen")
        return ack({ error: "Register the view first." });
      const { room, view } = membership;
      if (
        room.shared ||
        (room.game !== "fruit-ninja" && !REPLAY_GAMES.has(room.game)) ||
        room.phase !== "classic" ||
        room.screens.get(view) !== socket.id
      )
        return ack({ error: "Replay is not active." });
      if (REPLAY_GAMES.has(room.game)) {
        room.logicReplays ||= new Map();
        if (!room.logicReplays.has(view))
          room.logicReplays.set(
            view,
            new LogicReplay(
              room.game,
              room.match.seed,
              room.match,
              view < 0 ? room.active.length : 1,
            ),
          );
        const replay = room.logicReplays.get(view);
        if (view < 0) room.logicReplay = replay;
        if (
          Number.isSafeInteger(data?.sequence) &&
          data.sequence >= 0 &&
          data.sequence < replay.sequence
        )
          return ack({ ok: true, sequence: data.sequence });
        if (!replay.accept(data?.sequence, data?.calls))
          return ack({ error: "Invalid replay chunk." });
        for (const score of replay.scores())
          room.progress[room.active[view < 0 ? score.slot : view]] =
            score.score;
        return ack({ ok: true, sequence: data.sequence });
      }
      let replay = room.sliceReplays.get(view);
      if (!replay) {
        replay = new SliceReplay(room.match.seed, {
          ...room.match,
          seats: view >= 0 ? 1 : room.active.length,
        });
        room.sliceReplays.set(view, replay);
      }
      if (
        Number.isSafeInteger(data?.sequence) &&
        data.sequence >= 0 &&
        data.sequence < replay.sequence
      )
        return ack({ ok: true, sequence: data.sequence });
      if (!replay.accept(data?.sequence, data?.calls))
        return ack({ error: "Invalid replay chunk." });
      ack({ ok: true, sequence: data.sequence });
      if (view >= 0) room.progress[room.active[view]] = replay.score(0);
      else
        room.active.forEach(
          (slot, i) =>
            (room.progress[slot] = replay.score(
              i,
              room.match.variant === "co-op",
            )),
        );
    });
    socket.on("vote", (data, ack = () => {}) => {
      if (typeof ack !== "function") return;
      const m = membership,
        r = m?.room;
      if (
        m?.role !== "player" ||
        r.phase !== "classic" ||
        r.paused ||
        !m.player.ready ||
        !r.voting
      )
        return ack({ error: "Wait for voting." });
      const ok = r.voting.vote(m.player.slot, data?.slot);
      ack(
        ok ? { ok: true } : { error: "Choose another player, once per round." },
      );
      broadcast(r);
    });
    socket.on("guess", (data, ack = () => {}) => {
      if (typeof ack !== "function") return;
      if (membership?.role !== "player")
        return ack({ error: "Join the game to guess." });
      const { room, player } = membership;
      if (
        room.phase !== "classic" ||
        !room.sketch ||
        room.paused ||
        !room.host ||
        !player.ready
      )
        return ack({ error: "Wait for the next drawing." });
      if (now() - (player.guessAt || 0) < 500)
        return ack({ error: "Give it a moment." });
      player.guessAt = now();
      const correct = room.sketch.guess(player.slot, data?.text);
      room.progress = { ...room.sketch.scores };
      ack({ correct });
      broadcast(room);
    });
    socket.on("score", (data) => {
      if (membership?.role !== "screen" || membership.room.phase !== "classic")
        return;
      const room = membership.room,
        view = membership.view;
      if (
        room.shared ||
        room.game === "fruit-ninja" ||
        room.sketch ||
        room.voting ||
        (REPLAY_GAMES.has(room.game) && room.logicReplays?.has(view))
      )
        return;
      const scores = normalizeScores(
        data?.scores,
        view < 0 ? room.active.map((_, i) => i) : [0],
      );
      if (scores)
        for (const s of scores)
          room.progress[room.active[view < 0 ? s.slot : view]] = s.score;
    });
    // The owner can end a removal timeout; the opaque handle never identifies
    // a phone credential and this authority is not delegated through host.cmd.
    socket.on("restore-player", (data, ack = () => {}) => {
      if (typeof ack !== "function") return;
      const room = membership?.room;
      if (
        membership?.role !== "host" ||
        !room ||
        room.host !== socket.id ||
        rooms.get(room.code) !== room
      )
        return ack({
          error: "Only the main screen can restore a removed phone.",
        });
      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data) ||
        Object.keys(data).length !== 2 ||
        data.confirmed !== true ||
        typeof data.restoreId !== "string" ||
        !/^[A-Za-z0-9_-]{32}$/.test(data.restoreId)
      )
        return ack({ error: "Confirm which phone to restore." });
      const removed = room.arcade?.removed.get(data.restoreId);
      if (
        !removed ||
        removed.expiresAt <= now() ||
        room.arcade.bans.get(removed.token) !== removed.expiresAt
      )
        return ack({
          error: "This removal timeout has ended or is no longer available.",
        });
      if (!arcade.limit(`restore:${room.code}`, 10, 10000))
        return ack({ error: "Give it a moment." });
      room.arcade.bans.delete(removed.token);
      room.arcade.removed.delete(data.restoreId);
      broadcast(room);
      ack({ ok: true });
    });
    socket.on("record", (data, ack = () => {}) => {
      if (typeof ack !== "function" || membership?.role !== "host") return;
      const record = membership.room.history?.find(
        (r) => r.result.matchId === data?.matchId,
      );
      ack(record || { error: "Record not found." });
    });
    socket.on("feedback", (data) => {
      if (
        membership?.role !== "screen" ||
        ![...membership.room.screens.values()].includes(socket.id) ||
        !data
      )
        return;
      const room = membership.room;
      if (room.shared) return;
      if (
        ![
          "rumble",
          "controller-profile",
          "race-status",
          "play-status",
          "slice",
          "bomb",
          "hit",
        ].includes(data.type)
      )
        return;
      // Feedback is bounded and addressed by the game's local player index.
      let safe;
      if (data.type === "play-status")
        safe = {
          type: data.type,
          active: data.active === true,
          caption: String(data.caption || "").slice(0, 140),
          action: String(data.action || "Play").slice(0, 32),
          score: Math.max(0, Math.min(100000, Number(data.score) || 0)),
        };
      else if (data.type === "race-status") {
        if (data.slot === 0) room.classicStage = data.stage;
        safe = {
          type: data.type,
          stage: ["ready", "countdown", "racing", "results", "paused"].includes(
            data.stage,
          )
            ? data.stage
            : "ready",
          confirmed: data.confirmed === true,
          waiting: data.waiting === true,
          boostIn: Math.max(0, Math.min(8, Number(data.boostIn) || 0)),
          boostsLeft: Number.isInteger(data.boostsLeft)
            ? Math.max(0, Math.min(3, data.boostsLeft))
            : null,
          driver: String(data.driver || "").slice(0, 32),
        };
      } else if (data.type === "rumble")
        safe = {
          type: data.type,
          pattern: (Array.isArray(data.pattern) ? data.pattern : [15])
            .slice(0, 6)
            .map((v) => Math.max(0, Math.min(150, Number(v) || 0))),
        };
      else
        safe = {
          type: data.type,
          profile: data.profile === "wheel" ? "wheel" : "default",
        };
      const slots = Number.isInteger(data.slot)
        ? [room.active[membership.view < 0 ? data.slot : membership.view]]
        : membership.view < 0
          ? room.active
          : [room.active[membership.view]];
      for (const slot of slots)
        if (room.players[slot]?.socket)
          ns.to(room.players[slot].socket).emit("feedback", safe);
    });
    socket.on("action", (data) => {
      if (membership?.role !== "player") return;
      const { room, player: p } = membership;
      const index = room.active.indexOf(p.slot);
      if (
        !room.host ||
        !room.screen ||
        room.paused ||
        room.dropPaused ||
        room.phase !== "classic" ||
        room.outcomes?.[p.slot] ||
        room.voting?.voting ||
        !p.ready ||
        index < 0 ||
        (now() - (p.lastAction || 0) < 100 &&
          !["release", "cancel"].includes(data?.action))
      )
        return;
      const actions =
        room.game === "mario-kart"
          ? { confirm: "2", left: "left", right: "right" }
          : room.game === "golf"
            ? {
                primary: "A",
                address: "address",
                cancel: "cancel",
                release: "release",
              }
            : { primary: "A" };
      const button = actions[data?.action];
      if (!button) return;
      p.lastAction = now();
      if (room.shared) {
        if (!room.sharedWaiting) room.shared.action(index, data.action);
        return;
      }
      classicEmit(
        room,
        "command",
        {
          type: ["address", "release", "cancel"].includes(button)
            ? button
            : "button",
          seq: Number.isSafeInteger(data?.seq) ? data.seq : null,
          aim: Math.max(-1, Math.min(1, Number(data?.aim) || 0)),
          button,
          pressed: true,
          power: Math.max(0.12, Math.min(1, Number(data?.power) || 0.6)),
          ageMs: Number.isFinite(data?.sampledAt)
            ? Math.max(0, Math.min(150, now() - data.sampledAt))
            : 0,
          slot: index,
        },
        index,
      );
    });
    onAdmin("extend", (_data, ack = () => {}) => {
      const room = membership.room;
      if (room.phase !== "classic" || room.paused || room.extensions >= 2)
        return ack({ error: "Extra time is available twice during a round." });
      room.extensions = (room.extensions || 0) + 1;
      if (room.endsAt) room.endsAt += 60000;

      if (room.game === "golf")
        classicEmit(room, "command", { type: "extend", seconds: 30 });
      broadcast(room);
      ack({ ok: true });
    });
    onAdmin("next-player", () => {
      if (!arcade.admin(membership)) return;
      const room = membership.room;
      if (
        ["lobby", "results", "classic"].includes(room.phase) &&
        room.setup?.mode === "solo"
      ) {
        const next = ((room.active[0] ?? room.lastSoloSlot ?? 0) + 1) % 4;
        if (room.phase === "classic") enterLobby(room);
        start(room, next);
      }
    });
    socket.on("join", (data, ack = () => {}) => {
      if (typeof ack !== "function") return;
      if (buildId && data?.buildId !== buildId)
        return ack({
          error: "This page has an older version. Reload to join.",
          update: true,
        });
      if (membership) return ack({ error: "This phone has already joined." });
      const room = rooms.get(String(data?.code || "").toUpperCase());
      if (!room)
        return ack({
          error: "This party has ended. Scan the QR on the big screen.",
        });
      let p = room.players.find((p) => p && equal(p.token, data?.token));
      if (data?.screen) {
        const error = remote.pairError(room, p?.slot ?? null, data.screen);
        if (error) return ack({ error });
      }
      if (room.arcade) {
        if (!p && !arcade.limit(`join:${socket.data.clientAddress}`, 60))
          return ack({
            error: "Too many join attempts. Please wait a minute.",
          });
        if (room.arcade.bans.get(data?.token) > now())
          return ack({ error: "This phone was removed. Please ask the host." });
        const queued = room.arcade.queue.find((m) =>
          equal(m.player.token, data?.token),
        );
        if (!p && !queued && room.arcade.locked)
          return ack({
            error: "The room is locked. Ask the host to unlock it.",
          });
        if (
          p &&
          room.outcomes?.[p.slot] &&
          !["lobby", "results"].includes(room.phase)
        )
          return ack(
            arcade.queue(room, socket, null, (m) => {
              membership = m;
              if (data?.screen) m.player.screenRef = data.screen;
            }),
          );
        if (
          !p &&
          (queued ||
            room.players.every(Boolean) ||
            !["lobby", "results"].includes(room.phase))
        ) {
          return ack(
            arcade.queue(room, socket, queued, (m) => {
              membership = m;
              if (data?.screen) m.player.screenRef = data.screen;
            }),
          );
        }
        if (!p && room.arcade.locked)
          return ack({
            error: "The room is locked. Ask the host to unlock it.",
          });
      }
      if (p?.socket) {
        const old = ns.sockets.get(p.socket);
        old?.emit("replaced");
        old?.disconnect(true);
      }
      if (!p) {
        // A disconnected active slot stays reserved until the end of the round.
        const slot = room.players.findIndex(
          (p) =>
            !p ||
            (!p.socket &&
              now() - p.lost > (room.arcade ? 30000 : 20000) &&
              !room.active.includes(p.slot)),
        );
        if (slot < 0)
          return ack({
            full: true,
            error:
              "Four players are in. Your turn is up next — keep this page open.",
          });
        p = {
          slot,
          token: token(),
          socket: null,
          ready: false,
          mode: "motion",
          input: { x: 0, y: 0 },
          lastInput: 0,
          lastPulse: 0,
          lost: 0,
        };
        room.players[slot] = p;
      }
      p.socket = socket.id;
      p.away = false;
      p.awayAt = 0;
      p.lastInput = 0;
      p.inputSeq = -1;
      p.pointerSeq = -1;
      p.lastPointer = null;
      p.lastShellButton = null;
      p.lastDevice = null;
      p.ready = false;
      p.unreadyAt = now();
      membership = { room, role: "player", player: p };
      if (data?.screen) {
        const error = remote.pair(room, p.slot, data.screen);
        if (error) {
          p.socket = null;
          membership = null;
          return ack({ error });
        }
      }
      socket.data.arcadeMember = membership;
      if (room.arcade && !p.countedJoin) {
        p.countedJoin = true;
        room.arcade.metrics.joins++;
        arcade.meter("join");
      }
      socket.join(room.code);
      ack({
        slot: p.slot,
        token: p.token,
        name: (web3 && p.displayName) || NAMES[p.slot],
        color: COLORS[p.slot],
      });
      web3?.joined(socket, membership);
      broadcast(room);
    });
    socket.on("ready", (data) => {
      if (membership?.role === "waiting") {
        membership.player.ready = data?.ready === true;
        membership.player.mode = data?.mode === "touch" ? "touch" : "motion";
        return;
      }
      if (membership?.role !== "player") return;
      const { room, player: p } = membership;
      p.ready = data?.ready === true;
      p.unreadyAt = p.ready ? 0 : p.unreadyAt || now();
      p.mode = data?.mode === "touch" ? "touch" : "motion";
      if (!p.ready) p.input = { x: 0, y: 0 };
      if (
        !room.arcade &&
        p.ready &&
        room.phase === "classic" &&
        room.game === "fruit-ninja" &&
        room.match.variant !== "race" &&
        room.active.length < room.match.maxHumans &&
        !room.active.includes(p.slot)
      )
        room.active.push(p.slot);
      broadcast(room);
    });
    socket.on("away", (data) => {
      if (membership?.role !== "player") return;
      const p = membership.player;
      p.away = data?.away === true;
      if (p.away) {
        p.awayAt ||= now();
        p.input = { x: 0, y: 0 };
      } else p.awayAt = 0;
      broadcast(membership.room);
    });
    // Intentionally outside adminHandlers: staff/delegated phones cannot end a room.
    socket.on("end-room", (data, ack = () => {}) => {
      if (typeof ack !== "function") return;
      const room = membership?.room;
      if (
        membership?.role !== "host" ||
        room.host !== socket.id ||
        rooms.get(room.code) !== room
      )
        return ack({ error: "Only the main screen can end this room." });
      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data) ||
        Object.keys(data).length !== 1 ||
        data.confirmed !== true
      )
        return ack({ error: "Confirm before ending the room for everyone." });
      ack({ ok: true });
      endRoom(room);
    });
    let phoneTextPending = false;
    // This is a TV-to-phone UI prompt, never a delegated administration command.
    socket.on("phone-text", (data, ack = () => {}) => {
      if (typeof ack !== "function") return;
      const room = membership?.room;
      if (
        membership?.role !== "host" ||
        room.host !== socket.id ||
        rooms.get(room.code) !== room
      )
        return ack({
          error: "Only the main screen can open the phone editor.",
        });
      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data) ||
        Object.keys(data).length !== 1 ||
        data.field !== "customWords"
      )
        return ack({ error: "Choose the custom word editor." });
      if (
        room.arcade?.mode !== "party" ||
        room.game !== "drawing" ||
        !["lobby", "results"].includes(room.phase)
      )
        return ack({
          error: "Open custom words before a Drawing round in Party mode.",
        });
      const grant = room.arcade.hostToken;
      const player = room.players.find((p) => p && p.token === grant);
      const target = player?.socket && ns.sockets.get(player.socket);
      if (!player?.ready || player.away || !target?.connected)
        return ack({ error: "Choose a connected, ready host phone first." });
      if (
        phoneTextPending ||
        !arcade.limit(`phone-text:${room.code}`, 4, 10000)
      )
        return ack({
          error: "Give the host phone a moment before trying again.",
        });
      phoneTextPending = true;
      const stillAuthorized = () =>
        socket.connected &&
        room.host === socket.id &&
        rooms.get(room.code) === room &&
        room.arcade?.mode === "party" &&
        room.arcade.hostToken === grant &&
        room.players[player.slot] === player &&
        player.token === grant &&
        player.socket === target.id &&
        target.connected &&
        player.ready &&
        !player.away &&
        room.game === "drawing" &&
        ["lobby", "results"].includes(room.phase);
      target
        .timeout(2000)
        .emit("phone-text", { field: "customWords" }, (error, response) => {
          phoneTextPending = false;
          if (!stillAuthorized())
            return ack({
              error: "The host phone or room changed. Open the editor again.",
            });
          if (error)
            return ack({
              error: "The host phone did not respond. Wake it and try again.",
            });
          // Only the confirmation crosses back. Never echo phone text or credentials.
          ack(
            response?.ok === true && !response.error
              ? { ok: true }
              : { error: "The host phone could not open the word editor." },
          );
        });
    });
    onAdmin("results-hold", (data, ack = () => {}) => {
      if (typeof ack !== "function") return;
      const room = membership?.room;
      if (membership?.role !== "host" || room?.host !== socket.id)
        return ack({
          error: "Only the main screen controls the results countdown.",
        });
      if (typeof data?.on !== "boolean" || !Number.isInteger(data?.roundId))
        return ack({
          error: "Results hold needs an on/off value and current round.",
        });
      if (room.phase !== "results" || data.roundId !== room.roundId)
        return ack({ error: "That results screen is no longer current." });
      if (room.arcade?.mode === "kiosk")
        return ack({
          ok: true,
          on: false,
          remainingMs: Math.max(0, room.endsAt - now()),
        });
      if (data.on && !room.resultsHeld) {
        room.resultsRemainingMs = Math.max(0, room.endsAt - now());
        room.resultsHeld = true;
        room.endsAt = 0;
      } else if (!data.on && room.resultsHeld) {
        room.endsAt = now() + room.resultsRemainingMs;
        room.resultsHeld = false;
        room.resultsRemainingMs = null;
      }
      broadcast(room);
      ack({
        ok: true,
        on: !!room.resultsHeld,
        remainingMs: room.resultsHeld
          ? room.resultsRemainingMs
          : Math.max(0, room.endsAt - now()),
      });
    });
    onAdmin("pointer-mode", (data, ack = () => {}) => {
      // host.cmd also dispatches admin handlers; a delegated phone must not
      // be able to change the shell's input mode through that path.
      if (membership?.role !== "host") {
        if (typeof ack === "function")
          ack({ error: "Only the main screen controls pointer mode." });
        return;
      }
      if (typeof data?.on !== "boolean") {
        if (typeof ack === "function")
          ack({ error: "Pointer mode must be on or off." });
        return;
      }
      const room = membership.room;
      room.pointerMode = data.on && ["lobby", "results"].includes(room.phase);
      broadcast(room);
      if (typeof ack === "function") ack({ ok: true, on: pointerMode(room) });
    });
    const shellPlayer = () => {
      if (membership?.role !== "player") return null;
      const { room, player } = membership;
      return pointerMode(room) && player.socket === socket.id && !player.away
        ? membership
        : null;
    };
    socket.on("pointer", (data) => {
      const m = shellPlayer();
      if (!m) return;
      const sample = pointerSample(data);
      if (!sample) return;
      const p = m.player,
        time = now();
      if (data.seq !== undefined) {
        if (
          !Number.isSafeInteger(data.seq) ||
          data.seq < 0 ||
          data.seq <= (p.pointerSeq ?? -1)
        )
          return;
        p.pointerSeq = data.seq;
      }
      if (p.lastPointer != null && time - p.lastPointer < 8) return;
      p.lastPointer = time;
      ns.to(m.room.host).emit("pointer", { slot: p.slot, ...sample, t: time });
    });
    socket.on("shell-button", (data) => {
      const m = shellPlayer();
      if (!m) return;
      const button = shellButton(data);
      if (!button) return;
      const p = m.player,
        time = now();
      if (p.lastShellButton != null && time - p.lastShellButton < 30) return;
      p.lastShellButton = time;
      ns.to(m.room.host).emit("shell-button", { slot: p.slot, ...button });
    });
    socket.on("device", (data) => {
      if (!["player", "waiting"].includes(membership?.role)) return;
      const p = membership.player,
        info = deviceInfo(data),
        time = now();
      if (
        !info ||
        p.socket !== socket.id ||
        (p.lastDevice != null && time - p.lastDevice < 1000)
      )
        return;
      p.device = info;
      p.lastDevice = time;
      broadcast(membership.room);
    });
    socket.on("input", (data) => {
      if (
        membership?.role !== "player" ||
        !data ||
        !Number.isFinite(data.x) ||
        !Number.isFinite(data.y)
      )
        return;
      const p = membership.player,
        time = now();
      if (data.seq !== undefined) {
        if (!Number.isSafeInteger(data.seq) || data.seq <= (p.inputSeq || -1))
          return;
        p.inputSeq = data.seq;
      }
      if (time - p.lastInput < 12) return;
      p.input = {
        x: Math.max(-1, Math.min(1, data.x)),
        y: Math.max(-1, Math.min(1, data.y)),
        gas: data.gas === true,
        brake: data.brake === true,
        boost: data.boost === true,
        pulse:
          p.input.pulse || (data.pulse === true && time - p.lastPulse > 900),
      };
      if (data.pulse && p.input.pulse) p.lastPulse = time;
      p.lastInput = time;
      p.sampledAt = Number.isFinite(data.sampledAt)
        ? Math.max(time - 150, Math.min(time, data.sampledAt))
        : time;
    });
    onAdmin("setup", (data, ack = () => {}) => {
      if (!arcade.admin(membership)) return;
      const room = membership.room;
      if (!["lobby", "results"].includes(room.phase)) return;
      room.setup = {
        ...matchSetup(
          gameById(room.game),
          data || {},
          room.players.filter((p) => p?.ready).length,
        ),
        mode: ["solo", "multiplayer"].includes(data?.mode) ? data.mode : "auto",
        cpuCount: Number.isInteger(data?.cpuCount)
          ? Math.max(0, Math.min(7, data.cpuCount))
          : undefined,
        drawing: ["free", "vote"].includes(data?.drawing)
          ? data.drawing
          : "guess",
        laps: data?.laps === 3 ? 3 : 1,
        holes: [1, 3, 6].includes(data?.holes) ? data.holes : 3,
        pair:
          Array.isArray(data?.pair) &&
          data.pair.length === 2 &&
          data.pair[0] !== data.pair[1] &&
          data.pair.every((s) => Number.isInteger(s) && s >= 0 && s < 4)
            ? data.pair
            : undefined,
        rotation: ["pick", "winner", "bracket"].includes(data?.rotation)
          ? data.rotation
          : "winner",
        variant: ["co-op", "battle", "race"].includes(data?.variant)
          ? data.variant
          : "co-op",
      };
      if (room.setup.mode !== "solo") room.lastSoloSlot = null;
      room.playlist = Array.isArray(data?.playlist)
        ? [
            ...new Set(data.playlist.filter((id) => SUPPORTED.includes(id))),
          ].slice(0, 8)
        : room.playlist || [];
      room.playlistIndex = 0;
      room.auto = false;
      broadcast(room);
      if (typeof ack === "function") ack({ ok: true });
    });
    onAdmin("select", (data) => {
      if (!arcade.admin(membership) || !SUPPORTED.includes(data?.game)) return;
      const room = membership.room;
      if (room.phase !== "lobby" && room.phase !== "results") return;
      room.game = data.game;
      room.lastSoloSlot = null;
      room.bracket = null;
      room.nextSeats = null;
      room.auto = !room.arcade && !CLASSICS[room.game];
      enterLobby(room);
    });
    onAdmin("pause", () => {
      if (!arcade.admin(membership)) return;
      const room = membership.room;
      if (!["classic", "playing", "practice", "countdown"].includes(room.phase))
        return;
      room.paused = !room.paused;
      ns.to(room.code).emit("pause", { paused: room.paused });
      broadcast(room);
    });
    onAdmin("start", () => {
      if (
        arcade.admin(membership) &&
        ["lobby", "results"].includes(membership.room.phase)
      ) {
        membership.room.auto = true;
        enterLobby(membership.room);
        start(membership.room);
      }
    });
    onAdmin("lobby", () => {
      if (arcade.admin(membership)) {
        const room = membership.room;
        room.auto = false;
        enterLobby(room);
      }
    });
    onAdmin("remove", (data) => {
      if (!arcade.admin(membership)) return;
      const room = membership.room;
      if (
        !Number.isInteger(data?.slot) ||
        data.slot < 0 ||
        data.slot >= room.players.length
      )
        return;
      const p = room.players[data.slot];
      if (!p) return;
      if (room.arcade) {
        const expiresAt = now() + 600000;
        room.arcade.bans.set(p.token, expiresAt);
        room.arcade.removed.set(token(), {
          token: p.token,
          slot: p.slot,
          expiresAt,
        });
        room.arcade.staff.delete(p.token);
        if (room.active.includes(p.slot)) room.outcomes[p.slot] = "removed";
      }
      const s = ns.sockets.get(p.socket);
      if (s) {
        s.emit("removed");
        s.disconnect(true);
      }
      web3?.release(p);
      room.players[p.slot] = null;
      if (room.active.includes(p.slot) && !room.arcade) {
        room.auto = false;
        enterLobby(room);
      }
      if (room.arcade) arcade.revokePlayer(room, p.token);
      remote.revoke(room, p.slot);
      broadcast(room);
    });
    socket.on("leave", () => {
      if (membership?.role === "waiting") {
        const room = membership.room;
        room.arcade.queue = room.arcade.queue.filter((m) => m !== membership);
        socket.leave(room.code);
        membership = null;
        broadcast(room);
        return;
      }
      if (membership?.role !== "player") return;
      const { room, player: p } = membership;
      if (room.arcade) {
        arcade.revokePlayer(room, p.token);
        if (room.active.includes(p.slot)) room.outcomes[p.slot] = "forfeit";
      }
      remote.revoke(room, p.slot, "forfeit");
      p.socket = null;
      p.lost = now() - 30001;
      p.ready = false;
      web3?.release(p);
      p.token = token();
      if (!room.active.includes(p.slot)) room.players[p.slot] = null;
      membership = null;
      socket.leave(room.code);
      broadcast(room);
    });
    socket.on("ping-check", (_, ack) => {
      if (typeof ack === "function") ack(now());
    });
    socket.on("disconnect", () => {
      if (!membership) return;
      const { room, role, player: p } = membership;
      remote.disconnect(room, role, socket, membership.view);
      if (role === "host" && room.host === socket.id) {
        room.host = null;
        if (room.resultsHeld) {
          room.endsAt = now() + room.resultsRemainingMs;
          room.resultsHeld = false;
          room.resultsRemainingMs = null;
        }
        room.pointerMode = false;
        room.hostLost = now();
      }
      if (role === "screen") {
        if (room.screens.get(membership.view) === socket.id)
          room.screens.delete(membership.view);
        room.screen = room.screens.values().next().value || null;
      }
      if (role === "display") room.displays.delete(socket.id);
      if (role === "viewer") {
        room.viewers.delete(socket.id);
        if (room.sharedPeers?.get(membership.sharedSeat) === socket.id) {
          room.sharedPeers.delete(membership.sharedSeat);
          room.sharedLost.set(membership.sharedSeat, now());
        }
      }
      if (["player", "waiting"].includes(role) && p.socket === socket.id) {
        p.socket = null;
        p.lost = now();
        p.input = { x: 0, y: 0 };
      }
      broadcast(room);
    });
  });
  let previous = now(),
    count = 0;
  const timer = setInterval(() => {
    const time = now(),
      elapsed = Math.max(0, time - previous),
      dt = Math.min(0.1, elapsed / 1000);
    previous = time;
    count++;
    for (const room of rooms.values()) {
      if (
        (!room.host && time - room.hostLost > 120000) ||
        time - room.created > 14400000
      ) {
        endRoom(room);
        continue;
      }
      if (room.shared && room.phase === "classic") {
        if (room.paused || !room.host) {
          room.sharedGateUntil += elapsed;
          if (room.sharedHostLost) room.sharedHostLost += elapsed;
          for (const [slot, since] of room.sharedLost)
            room.sharedLost.set(slot, since + elapsed);
        }
        if (room.screen) room.sharedHostLost = 0;
        else room.sharedHostLost ||= time;
        if (
          room.sharedStarted &&
          !room.screen &&
          time - room.sharedHostLost > 10000
        ) {
          finish(
            room,
            room.shared
              .scores()
              .map((s) => ({ ...s, slot: room.active[s.slot] })),
            true,
          );
        }
        let waiting = !room.screen ? "Waiting for the main game screen…" : null;
        for (const slot of room.active) {
          if (!room.remote.seats.has(slot) || room.outcomes[slot]) continue;
          if (!room.sharedPeers.has(slot)) {
            const since =
              room.sharedLost.get(slot) ??
              (room.sharedStarted ? time : room.sharedGateUntil - 10000);
            room.sharedLost.set(slot, since);
            if (time - since >= 10000) room.outcomes[slot] = "forfeit";
            else
              waiting = `Waiting for ${NAMES[slot]}’s screen · reconnecting…`;
          }
        }
        if (
          !room.screen &&
          time > room.sharedGateUntil &&
          !room.sharedStarted
        ) {
          finish(
            room,
            room.active.map((slot) => ({ slot, score: 0 })),
            true,
          );
          waiting = null;
        }
        if (waiting !== room.sharedWaiting) {
          room.sharedWaiting = waiting;
          broadcast(room);
        }
        if (!waiting) room.sharedStarted = true;
      }
      web3?.tick(room, time, broadcast);
      if (
        ["playing", "classic", "countdown"].includes(room.phase) &&
        web3?.stopReason?.(room)
      ) {
        finish(
          room,
          room.active.map((slot) => ({ slot, score: 0 })),
          true,
        );
      }
      remote.tick(room, elapsed);
      arcade.tick(room, elapsed);
      if (!room.host || room.paused || room.remote?.gate) {
        relayClassic(room, time);
        if (room.endsAt) room.endsAt += elapsed;
        continue;
      }
      if (room.arcade && room.active.length && !room.result) {
        for (const slot of room.active) {
          const p = room.players[slot];
          if (
            p &&
            ((!p.socket && time - p.lost > 30000) ||
              (p.away && time - p.awayAt > 30000) ||
              (!p.ready && p.unreadyAt && time - p.unreadyAt > 30000)) &&
            !room.outcomes[slot]
          )
            room.outcomes[slot] = "forfeit";
        }
        const alive = room.active.filter(
          (slot) => !["forfeit", "removed"].includes(room.outcomes[slot]),
        );
        if (alive.length < (room.match?.minHumans || 1))
          finish(
            room,
            room.active.map((slot) => ({
              slot,
              score:
                room.progress?.[slot] ??
                Math.floor(
                  room.round?.players.find((p) => p.slot === slot)?.score || 0,
                ),
            })),
            alive.length === 0,
          );
      }
      const dropPause = !!(
        room.arcade &&
        room.phase === "classic" &&
        ["table-tennis", "swordplay"].includes(room.game) &&
        room.active.some((slot) => {
          const p = room.players[slot];
          return p && (!p.socket || p.away || !p.ready) && !room.outcomes[slot];
        })
      );
      if (dropPause !== !!room.dropPaused) {
        room.dropPaused = dropPause;
        ns.to(room.code).emit("pause", { paused: room.paused || dropPause });
        broadcast(room);
      }
      if (dropPause) {
        if (room.endsAt) room.endsAt += elapsed;
        continue;
      }
      room.players.forEach((p, i) => {
        if (
          p &&
          !p.socket &&
          time - p.lost > (room.arcade ? 30000 : 20000) &&
          !room.active.includes(i)
        ) {
          web3?.release(p);
          room.players[i] = null;
        }
      });
      const connected = room.players.filter((p) => p?.socket);
      if (
        room.phase === "lobby" &&
        !room.arcade &&
        room.auto &&
        connected.length &&
        connected.every((p) => p.ready)
      )
        start(room);
      if (room.phase === "classic") {
        if (room.shared) {
          if (room.sharedWaiting) {
            if (room.endsAt) room.endsAt += elapsed;
            continue;
          }
          const inputs = room.active.map((slot) => {
            const p = room.players[slot];
            return {
              ...(p?.input || {}),
              active:
                !!p?.socket &&
                p.ready &&
                !p.away &&
                !room.outcomes[slot] &&
                time - p.lastInput < 500,
            };
          });
          room.shared.advance(dt, inputs);
          for (const s of room.shared.scores())
            room.progress[room.active[s.slot]] = s.score;
          if (time - (room.sharedSent || 0) >= 50) {
            room.sharedSent = time;
            const packet = room.shared.snapshot();
            room.snapshots.set(-1, packet);
            for (const id of [...room.screens.values(), ...room.viewers.keys()])
              ns.to(id).volatile.emit("snapshot", packet);
            const events = room.shared.events.splice(0);
            if (events.length)
              for (const id of [
                ...room.screens.values(),
                ...room.viewers.keys(),
              ])
                ns.to(id).emit("shared-events", events);
          }
          if (room.game === "mario-kart" && count % 5 === 0) {
            const g = room.shared.game;
            room.classicStage = g.state;
            for (const p of g.humans) {
              const sid = room.players[room.active[p.seat]]?.socket;
              if (sid)
                ns.to(sid).emit("feedback", {
                  type: "race-status",
                  stage: g.state === "finishing" ? "racing" : g.state,
                  driver: p.character.name,
                  confirmed: room.shared.confirmed.has(p.seat),
                  waiting:
                    g.state === "ready" && room.shared.confirmed.has(p.seat),
                  boostsLeft: p.nitroRemaining,
                  boostIn: p.nitroCooldown,
                });
            }
          }
          if (room.shared.done)
            finish(
              room,
              room.shared
                .scores()
                .map((s) => ({ ...s, slot: room.active[s.slot] })),
            );
        }
        if (room.voting) {
          room.voting.step(dt);
          room.progress = { ...room.voting.scores };
          if (room.voting.finished)
            finish(
              room,
              room.active.map((slot) => ({
                slot,
                score: room.voting.scores[slot],
                stats: { votes: room.voting.scores[slot] / 100 },
              })),
            );
        }
        relayClassic(room, time);
        if (room.sketch) {
          room.sketch.step(dt);
          room.progress = { ...room.sketch.scores };
          if (room.sketch.finished)
            finish(
              room,
              room.active.map((slot) => ({
                slot,
                score: room.sketch.scores[slot],
              })),
            );
        }
      }
      if (room.phase === "practice" && room.setup.mode !== "solo") {
        for (const p of connected.filter(
          (p) => p.ready && !room.active.includes(p.slot),
        )) {
          room.active.push(p.slot);
          room.round.players.push(createRound(room.game, [p.slot]).players[0]);
          broadcast(room);
        }
      }
      if (room.phase === "practice" || room.phase === "playing") {
        const inputs = Object.fromEntries(
          room.players.filter(Boolean).map((p) => [
            p.slot,
            {
              ...p.input,
              active:
                !!p.socket &&
                p.ready &&
                !room.outcomes?.[p.slot] &&
                time - p.lastInput < 500,
            },
          ]),
        );
        if (room.round) {
          stepRound(room.round, inputs, dt);
          if (room.phase === "playing" && room.replay.length < 6000)
            room.replay.push([dt, JSON.parse(JSON.stringify(inputs))]);
          ns.to(room.host).emit("frame", snapshot(room.round));
          for (const id of room.displays)
            ns.to(id).emit("frame", snapshot(room.round));
        }
        room.players.filter(Boolean).forEach((p) => {
          p.input.pulse = false;
        });
      }
      if (
        !room.arcade &&
        room.active.length &&
        !connected.some((p) => room.active.includes(p.slot)) &&
        (room.phase !== "classic" ||
          room.active.every(
            (slot) =>
              !room.players[slot] || time - room.players[slot].lost > 20000,
          ))
      )
        enterLobby(room);
      if (room.endsAt && time >= room.endsAt) {
        if (room.phase === "classic") {
          if (
            room.arcade &&
            independent(room) &&
            gameById(room.game).roundPolicy.kind === "untilDone"
          )
            for (const [i, slot] of room.active.entries())
              if (room.finishedViews[i] === undefined && !room.outcomes[slot])
                room.outcomes[slot] = "dnf";
          finish(
            room,
            room.active.map((slot) => ({
              slot,
              score:
                room.finishedViews[room.active.indexOf(slot)] ??
                room.progress[slot] ??
                0,
            })),
          );
        } else if (room.phase === "practice") {
          room.match = {
            ...matchSetup(gameById(room.game), room.setup, room.active.length),
            seed: room.match.seed,
          };
          room.round = createRound(
            room.game,
            room.active,
            room.match.seed,
            room.match,
          );
          phase(room, "countdown", 3);
        } else if (room.phase === "countdown") phase(room, "playing", 60);
        else if (room.phase === "playing")
          finish(
            room,
            room.round.players.map((p) => ({
              slot: p.slot,
              score: Math.floor(p.score),
            })),
          );
        else if (room.phase === "results") {
          const previousSeats = room.active.slice();
          if (room.playlist?.length) {
            room.playlistIndex =
              ((room.playlistIndex || 0) + 1) % room.playlist.length;
            room.game = room.playlist[room.playlistIndex];
          }
          enterLobby(room);
          arcade.rotate(room, previousSeats);
        }
      }
      if (count % 12 === 0) broadcast(room);
    }
  }, tickMs);
  timer.unref();
  return { rooms, view, close: () => clearInterval(timer) };
}
module.exports = { attachParty };
