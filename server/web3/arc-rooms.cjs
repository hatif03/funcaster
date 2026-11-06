"use strict";
const { randomUUID, randomBytes, createHmac } = require("node:crypto");
const path = require("node:path");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const { storageFor } = require("../../integrations/storage/runtime.mjs");
const { parseUnits, verifyTypedData } = require("viem");
const { gameById, matchSetup } = require("../../core/catalog.js");
const { bundleHash } = require("../bundle-hash.cjs");
const { canonical, hash } = require("../records.cjs");
const { createStakesAttempt } = require("../../integrations/arc/stakes.mjs");
const { reservePotIntent } = require("../../integrations/arc/intents.mjs");
const {
  acceptData,
  fundingData,
  settleData,
  contestData,
} = require("../../integrations/arc/signatures.mjs");
const { json } = require("../../integrations/arc/jobs.mjs");
const {
  createMockArcReader,
  MOCK_POT,
  MOCK_ORACLE,
} = require("../../integrations/arc/mock.mjs");

// Room callbacks only update memory. All chain reads run in the background poll
// or an explicit admin/phone request; the durable worker owns every transaction.
function createArcRooms({
  config,
  enqueue,
  resolveRoster,
  binding,
  changed = () => {},
  now = Date.now,
  workerUp = () => false,
  reader,
}) {
  const enabled = config.WEB3_ARC !== "off",
    mock = config.WEB3_ARC === "mock";
  const current = new WeakMap(),
    attempts = new Set(),
    sockets = new WeakMap(),
    dripped = new WeakMap(),
    pending = new Map(),
    creating = new WeakSet();
  const contract = mock ? MOCK_POT : config.ARC_POT_ADDRESS;
  const domain = { chainId: 5042002, contract };
  const getReader =
    reader ||
    (mock
      ? async () => createMockArcReader(config.WEB3_DATA_DIR, { now })
      : require("./arc-reader.cjs").createArcReader(config));
  let closed = false,
    polling = false,
    saltPromise;
  const gameKey = (room) => hash({ game: room.game, setup: room.setup || {} });
  const roster = (room) =>
    room.players
      .filter((p) => p?.socket && p.ready)
      .map((p) => ({
        slot: p.slot,
        address: p.address,
        binding: p.token,
        kind: "human",
        ready: p.ready,
        connected: !!p.socket,
      }));
  const context = (room) => ({
    gameKey: gameKey(room),
    roster: roster(room),
    workerUp: workerUp(),
  });
  const off = () => ({
    rung: 0,
    status: "off",
    playMoney: true,
    mode: config.WEB3_ARC,
  });
  function message(m, text) {
    m.notice = text;
    changed(m.room);
  }
  function submit(m, type, payload, key) {
    if (m.sent.has(key)) return;
    m.sent.add(key);
    enqueue(
      m.room,
      { type, payload: json(payload), idempotencyKey: key },
      (receipt) => {
        if (closed) return;
        if (receipt.status !== "done" || !!receipt.mock !== mock) {
          m.failed = true;
          message(
            m,
            "Stakes service is waiting. Your refund remains available at its deadline.",
          );
          return;
        }
        m.failed = false;
        if (receipt.tx) m.tx[type.split(".").at(-1)] = receipt.tx;
        changed(m.room);
      },
    );
  }
  function emit(m, p, kind, data) {
    const socket = sockets.get(p);
    if (!socket || socket.id !== p.socket) return;
    const key = `${kind}:${p.slot}`,
      previous = m.requests.get(key);
    if (previous && previous.socket === socket.id && previous.expiresAt > now())
      return;
    if (previous) pending.delete(previous.id);
    const expiresAt = Math.min(
      Number(
        m.intent.terms[kind === "terms" ? "fundDeadline" : "settleDeadline"],
      ) * 1000,
      now() + 180000,
    );
    if (expiresAt <= now()) return;
    const request = {
      id: randomUUID(),
      kind,
      expiresAt,
      serverTime: now(),
      ...json(data),
    };
    const item = {
      ...request,
      m,
      p,
      token: p.token,
      socket: socket.id,
      busy: false,
    };
    pending.set(item.id, item);
    m.requests.set(key, item);
    socket.emit("web3.request", request);
  }
  function invalidate(m) {
    for (const r of m.requests.values()) pending.delete(r.id);
    m.requests.clear();
  }
  async function choose(room, data) {
    if (!enabled) return { error: "Stakes are off in this build." };
    if (!["lobby", "results"].includes(room.phase))
      return { error: "Wait until this round ends." };
    if (creating.has(room))
      return { error: "Stakes are already being prepared." };
    const old = current.get(room);
    if (data?.cancel === true || data?.rung === 0) {
      if (old) {
        if (
          old.engine.view().matchId &&
          !["settled", "refunded"].includes(old.engine.view().status)
        )
          return {
            error:
              "This round is still settling. Its signed terms cannot be cancelled.",
          };
        if (!old.engine.view().matchId) old.engine.cancel();
        old.detached = true;
        invalidate(old);
        current.delete(room);
        changed(room);
      }
      return { ok: true };
    }
    if (old && !["settled", "refunded"].includes(old.engine.view().status))
      return { error: "Cancel the current stakes before choosing new terms." };
    if (
      !data ||
      Object.keys(data).some(
        (k) => !["rung", "amount", "rule", "asset"].includes(k),
      ) ||
      data.rung !== 1 ||
      !config.ARC_STAKE_PRESETS.includes(String(data.amount)) ||
      !["winner", "top2", "equal"].includes(data.rule) ||
      !config.WEB3_ASSETS.includes(data.asset || "usdc")
    )
      return { error: "Choose a listed play-money amount and payout rule." };
    const rows = roster(room),
      game = gameById(room.game),
      setup = matchSetup(game, room.setup || {}, rows.length);
    if (
      rows.length < 2 ||
      rows.length > setup.maxHumans ||
      setup.cpuCount ||
      setup.bot ||
      setup.mode === "solo" ||
      game.verification !== "verifiable" ||
      rows.some((r) => !r.address)
    )
      return {
        error:
          "Choose a replay-verifiable game with two to four ready humans, no computer players, and a saved player identity.",
      };
    if (!workerUp())
      return {
        error: "Stakes service is offline. You can play without stakes.",
      };
    creating.add(room);
    const key = gameKey(room);
    try {
      await resolveRoster(
        room,
        rows.map((r) => r.slot),
      );
      if (
        key !== gameKey(room) ||
        canonical(rows) !== canonical(roster(room)) ||
        !["lobby", "results"].includes(room.phase)
      )
        throw Error("Players changed");
      const asset = data.asset || "usdc",
        chain = await getReader();
      const token = await chain.tokenSnapshot(
        asset,
        rows.map((r) => r.address),
      );
      const sec = token.chainTime;
      const intent = await reservePotIntent({
        dir: config.WEB3_DATA_DIR,
        attemptId: randomUUID(),
        room: room.code,
        context: {
          gameId: game.gameId,
          version: game.version,
          bundleHash: bundleHash(game.id),
          slots: rows.map((r) => r.slot),
        },
        terms: {
          asset:
            config[`ARC_${asset.toUpperCase()}`] ||
            (asset === "eurc"
              ? "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a"
              : "0x3600000000000000000000000000000000000000"),
          stake: String(parseUnits(String(data.amount), 6)),
          seats: rows.map((r) => r.address),
          rule: data.rule,
          oracle: mock ? MOCK_ORACLE : config.ARC_ORACLE_ADDRESS,
          fundDeadline: sec + config.ARC_FUND_DEADLINE_SECONDS,
          settleDeadline: sec + config.ARC_SETTLE_DEADLINE_SECONDS,
          challengeWindow: config.ARC_CHALLENGE_WINDOW_SECONDS,
          minPlaySeconds: 60,
        },
      });
      if (
        closed ||
        key !== gameKey(room) ||
        canonical(rows) !== canonical(roster(room))
      )
        throw Error("Players changed");
      const engine = createStakesAttempt({
        potId: intent.potId,
        termsHash: intent.termsHash,
        terms: {
          ...intent.terms,
          fundDeadline: Number(intent.terms.fundDeadline),
          settleDeadline: Number(intent.terms.settleDeadline),
        },
        roster: rows,
        gameKey: key,
        config: { mode: mock ? "mock" : "on", ...domain },
        now,
        proofMaxAgeMs: 5000,
      });
      const m = {
        room,
        intent,
        engine,
        rows,
        asset,
        amount: String(data.amount),
        rule: data.rule,
        sent: new Set(),
        requests: new Map(),
        tx: {},
        notice: "Confirm the stake on each phone.",
        result: null,
        proof: null,
        rosterAt: 0,
      };
      current.set(room, m);
      attempts.add(m);
      submit(
        m,
        "arc.pot.create",
        { potId: intent.potId, terms: intent.terms, context: intent.context },
        `arc.pot.create:${intent.potId}`,
      );
      changed(room);
      return { ok: true };
    } catch {
      return {
        error:
          "Stakes could not be prepared. Check player names and the chain service, then try again.",
      };
    } finally {
      creating.delete(room);
    }
  }
  async function requests(m, chain) {
    const v = m.engine.view();
    if (
      m.detached ||
      m.ended ||
      v.cancelled ||
      v.abandoned ||
      ["Settled", "Refunded"].includes(v.chainState)
    ) {
      invalidate(m);
      return;
    }
    if (v.chainState === "Funding") {
      const needsTerms = m.rows.some((r, i) => {
        const p = m.room.players[r.slot],
          request = m.requests.get(`terms:${r.slot}`);
        return (
          p?.socket &&
          p.token === r.binding &&
          !(v.funded & (1 << i)) &&
          !m.sent.has(`arc.pot.fund:${m.intent.potId}:${r.slot}`) &&
          (!request ||
            request.socket !== p.socket ||
            request.expiresAt <= now())
        );
      });
      if (!needsTerms) return;
      const token = await chain.tokenSnapshot(
        m.asset,
        m.rows.map((r) => r.address),
      );
      for (let i = 0; i < m.rows.length; i++) {
        const r = m.rows[i],
          p = m.room.players[r.slot];
        if (
          !p ||
          p.token !== r.binding ||
          v.funded & (1 << i) ||
          m.sent.has(`arc.pot.fund:${m.intent.potId}:${r.slot}`)
        )
          continue;
        const account = token.accounts[i];
        if (
          !account ||
          account.blocked ||
          BigInt(account.balance) < BigInt(m.intent.terms.stake) + 50000n
        ) {
          message(
            m,
            "Starting play money is arriving. Choose a smaller stake if your balance is low.",
          );
          continue;
        }
        const funding = fundingData(
          {
            chainId: 5042002,
            address: m.intent.terms.asset,
            name: m.asset.toUpperCase(),
            version: "2",
            decimals: 6,
          },
          {
            potId: m.intent.potId,
            seat: r.address,
            contract,
            stake: BigInt(m.intent.terms.stake),
            validAfter: BigInt(token.chainTime - 1),
            validBefore: BigInt(m.intent.terms.fundDeadline),
            fundDeadline: BigInt(m.intent.terms.fundDeadline),
            chainTime: BigInt(token.chainTime),
            balance: BigInt(account.balance),
            floor: 50000n,
          },
        );
        emit(m, p, "terms", {
          potId: m.intent.potId,
          mode: mock ? "mock" : "on",
          contract,
          asset: m.asset.toUpperCase(),
          amount: m.amount,
          rule: m.rule,
          slots: m.rows.map((r) => r.slot),
          terms: m.intent.terms,
          typedData: { accept: acceptData(domain, m.intent), fund: funding },
          game: gameById(m.room.game).title,
        });
      }
    }
    if (v.result && ["Locked", "Proposed"].includes(v.chainState))
      for (const r of m.rows) {
        const p = m.room.players[r.slot];
        if (
          !p ||
          p.token !== r.binding ||
          v.agreed.includes(r.slot) ||
          v.disputed.includes(r.slot)
        )
          continue;
        emit(m, p, "settle", {
          potId: m.intent.potId,
          mode: mock ? "mock" : "on",
          contract,
          asset: m.asset.toUpperCase(),
          amount: m.amount,
          slots: m.rows.map((r) => r.slot),
          result: m.result,
          places: v.result.places,
          payouts: v.result.payouts,
          agreeAt: v.agreeAt,
          typedData: settleData(domain, {
            potId: m.intent.potId,
            places: v.result.places,
          }),
          contestData: contestData(domain, m.intent.potId),
        });
      }
  }
  async function poll() {
    if (closed || polling || !enabled) return;
    polling = true;
    try {
      for (const m of attempts) {
        if (closed) break;
        try {
          const chain = await getReader(),
            proof = await chain.snapshot(m.intent.potId);
          if (!m.engine.observe(proof)) throw Error("Stale proof");
          m.proof = proof;
          const v = m.engine.view();
          if (!m.failed)
            m.notice =
              {
                Locked: "All players funded. Start when ready.",
                Proposed:
                  "A referee proposed the result. Players can dispute during the challenge window.",
                Contested: "Disputed. Refunds are being prepared.",
                Settled: "The result settled. Payouts are being collected.",
                Refunded: "The pot refunded. Stakes are being returned.",
              }[proof.state] || "Confirm the stake on each phone.";
          if (
            !v.matchId &&
            !v.cancelled &&
            !v.abandoned &&
            v.chainState === "Locked"
          ) {
            await resolveRoster(
              m.room,
              m.rows.map((r) => r.slot),
            );
            m.rosterAt = now();
          }
          await requests(m, chain);
          for (const command of m.engine.commands()) {
            const { resultHash, ...payload } = command.payload;
            submit(
              m,
              `arc.pot.${command.kind}`,
              {
                ...payload,
                termsHash: m.intent.termsHash,
                ...(["settle", "propose"].includes(command.kind)
                  ? { result: m.result }
                  : {}),
              },
              command.key,
            );
          }
          if (
            ["Settled", "Refunded"].includes(proof.state) &&
            proof.claimables.every((n) => BigInt(n) === 0n)
          ) {
            m.complete = true;
            attempts.delete(m);
            invalidate(m);
          }
          changed(m.room);
        } catch {
          m.rosterAt = 0;
          message(
            m,
            "Checking stakes. Play without stakes while services recover; refunds remain available at the deadline.",
          );
        }
      }
    } finally {
      polling = false;
    }
  }
  async function drip(room, p, socket) {
    if (!enabled || !p.address || dripped.get(p) === p.address) return;
    dripped.set(p, p.address);
    try {
      saltPromise ||= (async () => {
        const file = path.join(config.WEB3_DATA_DIR, "arc-drip-salt");
        const db = storageFor(file);
        if (db) {
          let salt = await db.store.get(db.key);
          if (!salt) {
            salt = randomBytes(32).toString("hex");
            await db.store.put(db.key, salt);
          }
          if (!/^[a-f0-9]{64}$/.test(salt)) throw Error("INVALID_DRIP_SALT");
          return Buffer.from(salt, "hex");
        }
        await mkdir(config.WEB3_DATA_DIR, { recursive: true, mode: 0o700 });
        try {
          await writeFile(file, randomBytes(32), { flag: "wx", mode: 0o600 });
        } catch (e) {
          if (e.code !== "EEXIST") throw e;
        }
        return readFile(file);
      })();
      const salt = await saltPromise;
      const digest = (s) => createHmac("sha256", salt).update(s).digest("hex");
      for (const asset of config.WEB3_ASSETS)
        enqueue(
          room,
          {
            type: "arc.drip",
            idempotencyKey: `arc.drip:${asset}:${digest(p.address.toLowerCase())}`,
            payload: {
              asset,
              address: p.address,
              device: digest(p.address.toLowerCase()),
              ip: digest(
                socket?.handshake?.address ||
                  socket?.conn?.remoteAddress ||
                  "unknown",
              ),
            },
          },
          () => {},
        );
    } catch {
      dripped.delete(p);
    }
  }
  function view(room) {
    const m = current.get(room);
    if (!m) return off();
    const v = m.engine.view();
    return {
      rung: 1,
      status: v.status,
      mode: v.mode,
      mock,
      playMoney: true,
      potId: v.potId,
      matchId: v.matchId,
      asset: m.asset.toUpperCase(),
      amount: m.amount,
      rule: m.rule,
      funded: [0, 1, 2, 3].map((slot) => {
        const i = m.rows.findIndex((r) => r.slot === slot);
        return i >= 0 && !!(v.funded & (1 << i));
      }),
      acceptedBy: [0, 1, 2, 3].map((slot) =>
        m.sent.has(`arc.pot.fund:${v.potId}:${slot}`),
      ),
      fundDeadline: v.fundDeadline * 1000,
      settleDeadline: v.settleDeadline * 1000,
      agreeAt: v.agreeAt,
      agreed: v.agreed,
      disputed: v.disputed,
      chainState: v.chainState,
      proposalAt: m.proof?.proposalAt ? m.proof.proposalAt * 1000 : null,
      challengeWindow: v.challengeWindow,
      notice: m.notice,
      tx: { ...m.tx },
      explorer: mock ? null : `/pot/?pot=${v.potId}`,
      claimsComplete: !!m.complete,
      slots: m.rows.map((r) => r.slot),
      payouts: v.result?.payouts || null,
      oracle: "relay",
    };
  }
  function startReason(room) {
    if (creating.has(room)) return "Preparing stakes. Please wait.";
    const m = current.get(room);
    if (!m) return null;
    const v = m.engine.view();
    if (v.cancelled || v.abandoned)
      return "Cancel stakes to play without them. Refunds remain available at the deadline.";
    if (["settled", "refunded"].includes(v.status))
      return "Choose new stakes or play without stakes for the next round.";
    const reason = m.engine.startReason(context(room));
    if (reason) return reason;
    if (!v.cancelled && now() - m.rosterAt > 5000)
      return "Checking player ownership before starting.";
    return null;
  }
  function observe(room) {
    if (!enabled) return;
    for (const p of room.players.filter(Boolean))
      if (p.address) void drip(room, p, sockets.get(p));
    const m = current.get(room);
    if (!m) return;
    const v = m.engine.view();
    if (
      v.matchId &&
      !v.result &&
      !v.abandoned &&
      m.rows.filter((r) => {
        const p = room.players[r.slot];
        return p?.socket && p.token === r.binding;
      }).length < 2
    ) {
      m.engine.abandon();
      invalidate(m);
    }
  }
  const api = {
    health: () =>
      !enabled
        ? "off"
        : !workerUp()
          ? "down"
          : mock ||
              [...attempts].some(
                (m) => m.proof && now() - m.proof.observedAt <= 5000,
              )
            ? "ok"
            : "degraded",
    choose,
    poll,
    view,
    observe,
    startReason,
    started(room) {
      const m = current.get(room);
      if (!m) return;
      if (
        canonical([...room.active].sort()) !==
        canonical(m.rows.map((r) => r.slot).sort())
      ) {
        m.engine.abandon();
        return;
      }
      m.engine.started(
        room.arcade
          ? `${room.startedAt.toString(36)}.${room.code}.${room.roundId}`
          : `${room.code}.${room.roundId}`,
        context(room),
      );
    },
    finish(room, record) {
      const m = current.get(room);
      if (!m) return;
      m.result = structuredClone(record.result);
      const humansRemaining = m.rows.filter((r) => {
        const p = room.players[r.slot];
        return (
          p?.socket &&
          p.token === r.binding &&
          !["forfeit", "removed"].includes(room.outcomes?.[r.slot])
        );
      }).length;
      if (!m.engine.finish(record.result, { humansRemaining }))
        m.engine.abandon();
      invalidate(m);
    },
    joined(socket, m) {
      if (m?.role === "player") {
        sockets.set(m.player, socket);
        void drip(m.room, m.player, socket);
      }
    },
    bind(socket, membership, broadcast) {
      let count = 0,
        until = 0;
      socket.on("web3.sign", async (data, ack) => {
        if (typeof ack !== "function") return;
        if (now() >= until) {
          count = 0;
          until = now() + 60000;
        }
        if (++count > 20)
          return ack({ error: "Too many stake responses. Wait a minute." });
        const r = pending.get(data?.id),
          member = membership();
        if (
          !r ||
          r.busy ||
          r.expiresAt <= now() ||
          member?.role !== "player" ||
          member.room !== r.m.room ||
          member.player !== r.p ||
          r.p.token !== r.token ||
          r.p.socket !== socket.id ||
          r.socket !== socket.id ||
          current.get(member.room) !== r.m ||
          !data ||
          Object.keys(data).some(
            (k) => !["id", "signature", "declined", "disputed"].includes(k),
          )
        )
          return ack({
            error: "This stake request expired. Wait for the updated card.",
          });
        r.busy = true;
        try {
          const m = r.m;
          if (data.declined === true && r.kind === "terms") {
            m.engine.cancel();
            invalidate(m);
            message(
              m,
              "A player declined. Cancel stakes to play without them; any funded seats refund at the deadline.",
            );
            return ack({ ok: true });
          }
          if (r.kind === "terms") {
            const signatures = data.signature;
            if (
              !signatures ||
              Object.keys(signatures).sort().join(",") !== "accept,fund"
            )
              throw Error("Invalid signatures");
            for (const key of ["accept", "fund"])
              if (
                !/^0x[\da-f]{130}$/i.test(signatures[key] || "") ||
                !(await verifyTypedData({
                  ...r.typedData[key],
                  address: r.p.address,
                  signature: signatures[key],
                }))
              )
                throw Error("Invalid signatures");
            if (
              r.p.token !== r.token ||
              r.p.socket !== socket.id ||
              m.engine.view().cancelled ||
              m.engine.view().abandoned ||
              r.expiresAt <= now()
            )
              throw Error("Changed seat");
            const f = r.typedData.fund.message;
            submit(
              m,
              "arc.pot.fund",
              {
                potId: m.intent.potId,
                termsHash: m.intent.termsHash,
                seat: r.p.address,
                acceptSig: signatures.accept,
                authSig: signatures.fund,
                validAfter: f.validAfter,
                validBefore: f.validBefore,
                nonce: f.nonce,
              },
              `arc.pot.fund:${m.intent.potId}:${r.p.slot}`,
            );
          } else if (
            !(await m.engine.sign(
              r.p.slot,
              data.disputed === true ? "contest" : "settle",
              data.signature,
            ))
          )
            throw Error("Agreement unavailable");
          pending.delete(r.id);
          broadcast(member.room);
          ack({ ok: true });
        } catch {
          ack({
            error:
              "Stake response could not be accepted. Your funds remain covered by the refund deadline.",
          });
        } finally {
          r.busy = false;
        }
      });
    },
    end(room) {
      const m = current.get(room);
      if (m) {
        m.ended = true;
        if (!m.result) m.engine.abandon();
        invalidate(m);
        current.delete(room);
      }
    },
    close() {
      closed = true;
      pending.clear();
      attempts.clear();
    },
  };
  return api;
}
module.exports = { createArcRooms };
