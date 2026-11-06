const { scoreboardKey } = require("../core/scoreboard-key.js");
("use strict");
const { randomBytes, createHash, timingSafeEqual } = require("node:crypto");
const { optionSchema, gameById, matchSetup } = require("../core/catalog.js");
const { SEATS } = require("../core/seats.js");

/** Room administration is delegated independently of simulation ownership. */
function createArcade({
  ns,
  now,
  broadcast,
  start,
  enterLobby,
  persist,
  eventStats,
  remoteReason = () => null,
  web3Reason = () => null,
  authorizeHost = null,
  playerName = (p) => SEATS[p.slot]?.name,
  releasePlayer = () => {},
  pairPromoted = () => {},
}) {
  const budgets = new Map();
  function limit(key, count, window = 60000) {
    const time = now();
    let b = budgets.get(key);
    if (!b || time >= b.until) {
      b = { n: 0, until: time + window };
      budgets.set(key, b);
    }
    if (budgets.size > 5000)
      for (const [k, v] of budgets) if (v.until <= time) budgets.delete(k);
    while (budgets.size > 5000) budgets.delete(budgets.keys().next().value);
    return ++b.n <= count;
  }
  function meter(type, payload) {
    try {
      persist?.({ type, ...payload });
    } catch {}
  }
  function init(room) {
    room.arcade = {
      mode: "party",
      locked: false,
      queue: [],
      bans: new Map(),
      removed: new Map(),
      hostToken: null,
      pending: null,
      denied: new Set(),
      staff: new Set(),
      staffPin: null,
      staffSalt: null,
      countdown: 0,
      idleAt: now(),
      logs: [],
      metrics: { joins: 0, rounds: 0, completed: 0, forfeits: 0 },
      leaderboard: [],
    };
    room.auto = false;
  }
  const playerAnswer = (p) =>
    p.slot == null
      ? {
          queued: true,
          token: p.token,
          slot: null,
          name: "Next up",
          color: "#f7c600",
        }
      : { slot: p.slot, token: p.token, ...SEATS[p.slot], name: playerName(p) };
  function publishQueue(room) {
    const a = room.arcade;
    if (a)
      for (const p of [
        ...room.players.filter(Boolean),
        ...a.queue.map((m) => m.player),
      ])
        if (p.socket)
          ns.to(p.socket).emit("admin.state", {
            host: a.mode === "party" && a.hostToken === p.token && p.ready,
            staff: a.staff.has(p.token),
            seq: p.adminSeq || 0,
          });
    room.arcade?.queue.forEach((m, i) =>
      ns
        .to(m.player.socket)
        .emit("queue", { position: i + 1, total: room.arcade.queue.length }),
    );
  }
  function state(room) {
    const a = room.arcade;
    if (!a) return {};
    const host = room.players.find((p) => p && p.token === a.hostToken);
    return {
      arcade: true,
      operatingMode: a.mode,
      locked: a.locked,
      hostSeat: host?.slot ?? null,
      pendingHost: a.pending
        ? { slot: a.pending.slot, until: a.pending.until }
        : null,
      queueCount: a.queue.length,
      kioskStartsAt: a.countdown,
      options: optionSchema(room.game),
      leaderboard:
        eventStats?.().modeLeaderboards?.[
          scoreboardKey(room.game, room.setup)
        ] ||
        a.leaderboard
          .filter((r) => r.modeKey === scoreboardKey(room.game, room.setup))
          .slice(0, 10),
      startReason: startReason(room),
      staffConfigured: !!a.staffPin,
    };
  }
  function startReason(room) {
    if (!room.host) return "Waiting for the main screen";
    const screenReason = remoteReason(room);
    if (screenReason) return screenReason;
    const partnerReason = web3Reason(room);
    if (partnerReason) return partnerReason;
    const n = room.players.filter((p) => p?.socket && p.ready).length;
    const min = matchSetup(gameById(room.game), room.setup || {}, n).minHumans;
    return n < min
      ? `Waiting for ${min - n} more ready player${min - n === 1 ? "" : "s"}`
      : "Ready to play";
  }
  function admin(m) {
    if (!m) return false;
    if (m.role === "host") return true;
    const a = m.room.arcade,
      p = m.player;
    return !!(
      a &&
      p?.socket &&
      (a.staff.has(p.token) ||
        (m.role === "player" &&
          p.ready &&
          a.mode === "party" &&
          a.hostToken === p.token))
    );
  }
  function log(room, m, cmd) {
    if (!room.arcade) return;
    room.arcade.logs.push({
      at: now(),
      actor: m.role === "host" ? "screen" : `seat:${m.player?.slot ?? "staff"}`,
      cmd,
    });
    if (room.arcade.logs.length > 100) room.arcade.logs.shift();
  }
  function grant(room, slot) {
    const a = room.arcade,
      p = room.players[slot];
    if (!a || a.mode !== "party" || !p?.socket || !p.ready) return false;
    a.hostToken = p.token;
    a.pending = null;
    ns.to(room.code).emit("host.granted", { slot });
    broadcast(room);
    return true;
  }
  function revoke(room) {
    if (!room.arcade) return;
    room.arcade.hostToken = null;
    room.arcade.pending = null;
    broadcast(room);
  }
  function revokePlayer(room, token) {
    const a = room.arcade;
    if (!a) return;
    a.staff.delete(token);
    if (a.hostToken === token || room.players[a.pending?.slot]?.token === token)
      revoke(room);
  }
  function newPlayer(socket, secret = randomBytes(24).toString("base64url")) {
    return {
      slot: null,
      token: secret,
      socket: socket.id,
      ready: false,
      mode: "motion",
      input: { x: 0, y: 0 },
      lastInput: 0,
      lastPulse: 0,
      lost: 0,
    };
  }
  function queue(room, socket, oldMember, assign) {
    const a = room.arcade;
    a.queue = a.queue.filter(
      (m) => m.player.socket || now() - m.player.lost < 30000,
    );
    if (a.queue.length >= 32 && !oldMember)
      return {
        error: "The waiting line is full. Please try after this round.",
      };
    const member = oldMember || {
      room,
      role: "waiting",
      player: newPlayer(socket),
    };
    const p = member.player;
    if (p.socket && p.socket !== socket.id) {
      const old = ns.sockets.get(p.socket);
      old?.emit("replaced");
      old?.disconnect(true);
    }
    member.role = "waiting";
    p.socket = socket.id;
    p.slot = null;
    p.lost = 0;
    assign(member);
    socket.data.arcadeMember = member;
    socket.join(room.code);
    if (!oldMember) {
      a.queue.push(member);
      if (!p.countedJoin) {
        p.countedJoin = true;
        a.metrics.joins++;
        meter("join");
      }
    }
    publishQueue(room);
    broadcast(room);
    return { ...playerAnswer(p), position: a.queue.indexOf(member) + 1 };
  }
  function promote(room) {
    const a = room.arcade;
    if (!a || room.phase !== "lobby") return;
    a.queue = a.queue.filter(
      (m) => m.player.socket || now() - m.player.lost < 30000,
    );
    for (let slot = 0; slot < room.players.length; slot++) {
      if (room.players[slot]) continue;
      const i = a.queue.findIndex((m) => m.player.socket);
      if (i < 0) break;
      const [m] = a.queue.splice(i, 1);
      m.role = "player";
      m.player.slot = slot;
      room.players[slot] = m.player;
      pairPromoted(room, m.player);
      ns.to(m.player.socket).emit("promoted", playerAnswer(m.player));
    }
    publishQueue(room);
  }
  function rotate(room, slots) {
    const a = room.arcade;
    if (!a || a.mode !== "kiosk" || !a.queue.some((m) => m.player.socket))
      return;
    for (const slot of slots) {
      const p = room.players[slot];
      if (!p) continue;
      releasePlayer(p);
      const socket = ns.sockets.get(p.socket),
        m = socket?.data.arcadeMember;
      if (m) {
        m.role = "waiting";
        p.slot = null;
        p.ready = false;
        p.input = { x: 0, y: 0 };
        a.queue.push(m);
        socket.emit("queued", playerAnswer(p));
      }
      room.players[slot] = null;
    }
    promote(room);
  }
  function tick(room, elapsed) {
    const a = room.arcade;
    if (!a) return;
    for (const [key, until] of a.bans) if (until <= now()) a.bans.delete(key);
    for (const [id, removed] of a.removed)
      if (removed.expiresAt <= now()) a.removed.delete(id);
    if (room.paused || !room.host) {
      if (a.countdown) a.countdown += elapsed;
      if (a.pending) a.pending.until += elapsed;
      return;
    }
    const host = room.players.find((p) => p?.token === a.hostToken);
    if (a.hostToken && (!host || (!host.socket && now() - host.lost > 30000)))
      revoke(room);
    if (a.mode === "party" && !a.hostToken) {
      if (a.pending && now() >= a.pending.until) {
        if (
          room.players[a.pending.slot]?.token !== a.pending.token ||
          !grant(room, a.pending.slot)
        )
          a.pending = null;
      } else if (!a.pending) {
        const p = room.players.find(
          (p) => p?.socket && p.ready && !a.denied.has(p.token),
        );
        if (p) {
          a.pending = { slot: p.slot, token: p.token, until: now() + 5000 };
          ns.to(p.socket).emit("host.offer", { until: a.pending.until });
          broadcast(room);
        }
      }
    }
    if (room.phase !== "lobby") {
      a.countdown = 0;
      return;
    }
    promote(room);
    if (a.mode !== "kiosk") return;
    const connected = room.players.filter((p) => p?.socket);
    if (connected.length) a.idleAt = now();
    else if (now() - a.idleAt >= 60000) {
      room.setup = { laps: 1, holes: 1 };
      room.standings = {};
      room.bracket = null;
      a.countdown = 0;
    }
    if (
      connected.some((p) => p.ready) &&
      startReason(room) === "Ready to play"
    ) {
      if (!a.countdown) a.countdown = now() + 10000;
      else if (now() >= a.countdown) {
        a.countdown = 0;
        start(room);
      }
    } else a.countdown = 0;
  }
  function finish(room) {
    const a = room.arcade;
    if (!a) return;
    a.metrics.rounds++;
    if (room.result.status === "completed") a.metrics.completed++;
    meter("round", { result: room.result });
    if (room.result.status !== "completed") return;
    for (const score of room.result.scores) {
      if (score.outcome === "dnf") continue;
      if (score.outcome === "forfeit") {
        a.metrics.forfeits++;
        continue;
      }
      if (score.outcome === "removed") continue;
      if (room.result.verification === "failed") continue;
      a.leaderboard.push({
        modeKey: scoreboardKey(room.game, room.match),
        game: room.game,
        name: SEATS[score.slot]?.name || "Player",
        score: score.score,
        at: now(),
        matchId: room.result.matchId,
      });
    }
    a.leaderboard = a.leaderboard.slice(-100);
    a.leaderboard.sort(
      (x, y) =>
        x.game.localeCompare(y.game) ||
        (gameById(x.game).scoring.direction === "lower"
          ? x.score - y.score
          : y.score - x.score),
    );
  }
  function bind(socket, get, handlers) {
    socket.on("arcade.configure", (data, ack = () => {}) => {
      const m = get();
      if (typeof ack !== "function") return;
      if (m?.role !== "host")
        return ack({ error: "Only the main screen changes room access." });
      const room = m.room;
      if (!["lobby", "results"].includes(room.phase))
        return ack({ error: "Finish the round first." });
      if (data?.enabled === false) {
        if (room.arcade?.queue.length)
          return ack({
            error: "Clear the waiting line before disabling arcade tools.",
          });
        delete room.arcade;
        broadcast(room);
        return ack({ ok: true });
      }
      if (!room.arcade) init(room);
      const a = room.arcade;
      if (data?.pin !== undefined) {
        if (!/^\d{6}$/.test(data.pin))
          return ack({ error: "Use a six-digit staff PIN." });
        a.staffSalt = randomBytes(16).toString("hex");
        a.staffPin = createHash("sha256")
          .update(a.staffSalt + data.pin)
          .digest();
        a.staff.clear();
      }
      if (data?.mode === "kiosk" && !a.staffPin)
        return ack({ error: "Set a six-digit staff PIN first." });
      if (["party", "kiosk"].includes(data?.mode)) a.mode = data.mode;
      revoke(room);
      a.countdown = 0;
      room.auto = false;
      if (a.mode === "kiosk") {
        if (room.remote) {
          room.remote.enabled = false;
          room.remote.seats.clear();
        }
        room.playlist = [
          "star-catch",
          "fruit-ninja",
          "bubble-burst",
          "neon-drift",
        ];
        room.playlistIndex = 0;
        room.game = room.playlist[0];
        room.setup = { laps: 1, holes: 1, variant: "battle" };
      }
      broadcast(room);
      ack({ ok: true });
    });
    socket.on("host.assign", (data, ack = () => {}) => {
      const m = get();
      if (typeof ack !== "function") return;
      if (m?.role !== "host" || !m.room.arcade)
        return ack({ error: "Only the main screen can grant room controls." });
      if (data?.slot === null) {
        const a = m.room.arcade;
        const p =
          m.room.players.find((p) => p?.token === a.hostToken) ||
          m.room.players[a.pending?.slot];
        if (p) a.denied.add(p.token);
        revoke(m.room);
        return ack({ ok: true });
      }
      ack(
        grant(m.room, data?.slot)
          ? { ok: true }
          : { error: "Choose a connected, ready player." },
      );
    });
    socket.on("host.decline", () => {
      const m = get(),
        a = m?.room.arcade;
      if (a && m.player) {
        a.denied.add(m.player.token);
        if (a.hostToken === m.player.token) revoke(m.room);
        else if (a.pending?.token === m.player.token) {
          a.pending = null;
          broadcast(m.room);
        }
      }
    });
    socket.on("staff.unlock", (data, ack = () => {}) => {
      const m = get(),
        a = m?.room.arcade;
      if (typeof ack !== "function") return;
      if (
        !a?.staffPin ||
        !m.player ||
        !limit(
          `pin:${m.room.code}:${socket.data.clientAddress || socket.handshake.address}`,
          5,
        )
      )
        return ack({
          error: "Staff access unavailable. Try again in a minute.",
        });
      if (typeof data?.pin !== "string" || !/^\d{6}$/.test(data.pin))
        return ack({ error: "That PIN is not correct." });
      const supplied = createHash("sha256")
        .update(a.staffSalt + data.pin)
        .digest();
      if (!timingSafeEqual(supplied, a.staffPin))
        return ack({ error: "That PIN is not correct." });
      a.staff.add(m.player.token);
      publishQueue(m.room);
      ack({ ok: true, staff: true });
    });
    socket.on("staff.lock", () => {
      const m = get();
      if (m?.player) {
        m.room.arcade?.staff.delete(m.player.token);
        publishQueue(m.room);
      }
    });
    socket.on("host.cmd", (data, ack = () => {}) => {
      const m = get();
      if (typeof ack !== "function") return;
      if (!admin(m))
        return ack({ error: "Room controls are not assigned to this phone." });
      const holder = m.player || socket.data,
        seq = data?.seq;
      if (!Number.isSafeInteger(seq) || seq < 1)
        return ack({ error: "Invalid command number." });
      if (seq === holder.adminSeq) return ack(holder.adminReply);
      if (seq < (holder.adminSeq || 0))
        return ack({ error: "This command has expired." });
      if (holder.adminPending)
        return ack({ error: "A room command is still being checked." });
      if (!limit(`admin:${socket.id}`, 5, 1000))
        return ack({ error: "Give it a moment." });
      const cmd = data?.cmd,
        room = m.room,
        a = room.arcade;
      if (
        data?.args != null &&
        (typeof data.args !== "object" || Array.isArray(data.args))
      )
        return ack({ error: "Invalid command options." });
      if (
        ["remove", "transfer"].includes(cmd) &&
        (!Number.isInteger(data.args?.slot) ||
          data.args.slot < 0 ||
          data.args.slot >= SEATS.length)
      )
        return ack({ error: "Choose a valid player." });
      if (
        cmd === "select" &&
        !require("../core/catalog.js").games.some(
          (g) => g.id === data.args?.game,
        )
      )
        return ack({ error: "Choose a listed game." });
      const run = () => {
        let reply;
        if (cmd === "lock" && a) {
          a.locked = data.args?.locked === true;
          reply = { ok: true };
          broadcast(room);
        } else if (cmd === "transfer" && a && a.mode === "party")
          reply = grant(room, data.args?.slot)
            ? { ok: true }
            : { error: "That player is not ready." };
        else if (
          cmd === "stats" &&
          (m.role === "host" || a?.staff.has(m.player?.token))
        )
          reply = {
            ok: true,
            metrics: eventStats?.() || a?.metrics,
            log: a?.logs,
          };
        else if (cmd === "status")
          reply = { ok: true, staff: a?.staff.has(m.player?.token) || false };
        else if (
          ["stakes", "predictions", "commerce"].includes(cmd) &&
          handlers.has(cmd)
        ) {
          holder.adminPending = seq;
          const complete = (answer) => {
            holder.adminPending = null;
            holder.adminSeq = seq;
            holder.adminReply = answer;
            if (answer?.ok) log(room, m, cmd);
            ack(answer);
          };
          Promise.resolve(handlers.get(cmd)(data.args || {}, complete)).catch(
            () => complete({ error: "This service is unavailable." }),
          );
          return;
        } else if (handlers.has(cmd)) {
          if (
            ["start", "select", "setup", "next-player"].includes(cmd) &&
            !["lobby", "results"].includes(room.phase)
          )
            reply = { error: "Wait until this round ends." };
          else if (cmd === "start" && startReason(room) !== "Ready to play")
            reply = { error: startReason(room) };
          else if (
            ["lobby", "remove"].includes(cmd) &&
            data.args?.confirmed !== true &&
            m.role !== "host"
          )
            reply = { error: "Hold to confirm this action." };
          else if (cmd === "remove" && data.args?.slot === m.player?.slot)
            reply = { error: "Use Leave to leave your own seat." };
          else {
            handlers.get(cmd)(data.args || {}, (r) => {
              reply = r;
            });
            reply ||= { ok: true };
          }
        } else reply = { error: "That command is not available." };
        holder.adminSeq = seq;
        holder.adminReply = reply;
        if (reply.ok) log(room, m, cmd);
        ack(reply);
      };
      const delegated = m.role === "player" && !a?.staff.has(m.player?.token);
      if (!authorizeHost || !delegated) return run();
      const token = m.player.token;
      holder.adminPending = seq;
      Promise.resolve()
        .then(() => authorizeHost(room, m.player, cmd))
        .then(
          (decision) => {
            holder.adminPending = null;
            if (
              get() !== m ||
              m.player.token !== token ||
              seq <= (holder.adminSeq || 0)
            )
              return ack({
                error: "Room controls changed while checking this command.",
              });
            if (!decision?.allowed) {
              holder.adminSeq = seq;
              holder.adminReply = {
                error:
                  decision?.message || "Host permissions could not be checked.",
              };
              return ack(holder.adminReply);
            }
            if (!admin(m))
              return ack({
                error: "Room controls changed while checking this command.",
              });
            run();
          },
          () => {
            holder.adminPending = null;
            ack({
              error:
                "Host permissions could not be checked. Use the main screen.",
            });
          },
        );
    });
  }
  return {
    init,
    state,
    admin,
    bind,
    tick,
    finish,
    queue,
    promote,
    rotate,
    playerAnswer,
    publishQueue,
    limit,
    revokePlayer,
    meter,
  };
}
module.exports = { createArcade };
