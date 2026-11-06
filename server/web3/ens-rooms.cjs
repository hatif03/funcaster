"use strict";
const { randomUUID } = require("node:crypto");
const { SEATS } = require("../../core/seats.js");
const { ensReceiptData } = require("../../integrations/ens/jobs.mjs");
const { enforcement } = require("../../integrations/ens/authority.mjs");
const shapes = ["circle", "triangle", "square", "diamond"];
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();

// Relay-side state only: no RPC, disk access or signing in observe/view/finish.
// enqueue schedules persistence in the shared outbox, outside the game tick.
function createEnsRooms({
  config,
  enqueue,
  changed = () => {},
  now = Date.now,
  authority = require("./ens-reader.cjs").createEnsReader(config),
}) {
  const rooms = new WeakMap(),
    bindings = new WeakMap(),
    active = new Set();
  let revokeLocal = () => {},
    closed = false,
    polling = false,
    reader;
  const enabled = config.WEB3_ENS !== "off";
  const isMock = config.WEB3_ENS === "mock";
  function submit(room, model, type, payload, apply) {
    const suffix =
      payload.seatId || payload.grantId || payload.changeId || "party";
    enqueue(
      room,
      { type, idempotencyKey: `${type}:${model.id}:${suffix}`, payload },
      (receipt) => {
        if (model.ended || rooms.get(room) !== model) return;
        try {
          if (receipt.status !== "done" || !!receipt.mock !== isMock)
            throw Error("Unavailable");
          const data = ensReceiptData(type, payload, receipt.data);
          apply?.(data, receipt);
          model.health = "ok";
        } catch {
          model.health = "down";
          apply?.(null, receipt);
        }
        changed(room);
      },
    );
  }
  function ensure(room) {
    if (!enabled) return null;
    let model = rooms.get(room);
    if (!model) {
      model = {
        room,
        id: `room:${room.created}:${room.code}`,
        ended: false,
        seats: new Map(),
        health: "down",
        party: {
          status: isMock ? "ready" : "pending",
          name: isMock ? `MOCK-${room.code.toLowerCase()}` : null,
          expiresAt: null,
          explorer: null,
        },
        game: room.game,
      };
      rooms.set(room, model);
      active.add(model);
      submit(
        room,
        model,
        "ens.party.open",
        {
          partyId: model.id,
          code: room.code,
          game: room.game.startsWith("chonks.")
            ? room.game
            : `chonks.${room.game}`,
        },
        (data, receipt) => {
          if (data) {
            model.proof = data;
            model.party = {
              status: "ready",
              name: isMock ? `MOCK-${data.name}` : data.name,
              expiresAt: Number(data.expiresAt) * 1000,
              explorer: isMock ? null : receipt.explorer || null,
              registrationTx: isMock ? null : data.registrationTx || null,
            };
          } else model.party.status = "failed";
        },
      );
    }
    return model;
  }
  function release(player) {
    const binding = bindings.get(player);
    if (!binding || binding.released) return;
    binding.released = true;
    bindings.delete(player);
    const { room, model } = binding;
    flush(model);
    if (model.host?.binding === binding.id) revokeHost(room, model);
    if (model.seats.get(binding.slot) === binding)
      model.seats.delete(binding.slot);
    submit(room, model, "ens.seat.release", {
      partyId: model.id,
      seatId: binding.id,
    });
  }
  function observe(room) {
    const model = ensure(room);
    if (!model || model.ended) return;
    if (model.game !== room.game) {
      model.game = room.game;
      records(room, {
        "chonks.game": `chonks.${room.game.replace(/^chonks\./, "")}`,
      });
    }
    for (const p of room.players.filter(Boolean)) {
      let binding = bindings.get(p);
      if (
        binding &&
        (binding.token !== p.token ||
          !same(binding.address, p.address) ||
          binding.slot !== p.slot ||
          binding.room !== room)
      ) {
        release(p);
        binding = null;
      }
      if (binding || !/^0x[\da-fA-F]{40}$/.test(p.address || "")) continue;
      // A phone key identifies one seat. Duplicate binds cannot create a roster
      // containing the same address twice; the existing seat remains untouched.
      if ([...model.seats.values()].some((b) => same(b.address, p.address)))
        continue;
      binding = {
        id: randomUUID(),
        room,
        model,
        player: p,
        token: p.token,
        address: p.address,
        slot: p.slot,
        status: "pending",
        name: null,
        released: false,
      };
      bindings.set(p, binding);
      model.seats.set(p.slot, binding);
      submit(
        room,
        model,
        "ens.seat.mint",
        {
          partyId: model.id,
          seatId: binding.id,
          slot: p.slot,
          nickname: p.displayName || SEATS[p.slot].name,
          address: p.address,
          shape: shapes[p.slot],
          color: SEATS[p.slot].color,
        },
        (data) => {
          if (
            binding.released ||
            bindings.get(p) !== binding ||
            room.players[binding.slot] !== p ||
            p.token !== binding.token ||
            !same(p.address, binding.address)
          )
            return;
          binding.status = data ? "ready" : "failed";
          binding.name = data
            ? isMock
              ? `MOCK-${data.name}`
              : data.name
            : null;
        },
      );
    }
    syncHost(room, model);
    if (room.match && model.match !== room.match) {
      model.match = room.match;
      model.matchSeats = new Map(model.seats);
    }
  }
  function flush(model) {
    if (!model?.changes) return;
    clearTimeout(model.recordTimer);
    model.recordTimer = null;
    const changes = model.changes;
    model.changes = null;
    submit(
      model.room,
      model,
      "ens.record.set",
      {
        partyId: model.id,
        changeId: randomUUID(),
        records: changes.records,
        seats: [...changes.seats.values()],
      },
      (data, receipt) => changes.done?.(data, receipt),
    );
  }
  function records(room, values, seats = [], done) {
    const model = ensure(room);
    if (!model || model.ended) return;
    // Preserve every result event even when two matches finish within 2 s.
    if (values["chonks.receipt"] && model.changes?.records["chonks.receipt"])
      flush(model);
    model.changes ||= { records: {}, seats: new Map() };
    Object.assign(model.changes.records, values);
    seats.forEach((s) => model.changes.seats.set(s.seatId, s));
    if (done) model.changes.done = done;
    if (!model.recordTimer) {
      model.recordTimer = setTimeout(() => {
        model.recordTimer = null;
        flush(model);
      }, 2000);
      model.recordTimer.unref?.();
    }
  }
  function finish(room, result, done) {
    const model = ensure(room);
    if (!model) return;
    const seats = result.scores.flatMap((score) => {
      const b = model.match === room.match && model.matchSeats?.get(score.slot);
      return b && !b.released && model.seats.get(score.slot) === b
        ? [
            {
              seatId: b.id,
              last: `${result.matchId}:${result.hash}:${score.rank}`,
            },
          ]
        : [];
    });
    records(room, { "chonks.receipt": result.hash }, seats, done);
  }
  async function reads() {
    if (!enabled || isMock || closed)
      throw Error("Live table reads are unavailable");
    reader = await authority();
    return reader.reads;
  }
  function revokeHost(room, model) {
    const grant = model.host;
    if (!grant) return;
    model.host = null;
    submit(
      room,
      model,
      "ens.role.revoke",
      { partyId: model.id, grantId: grant.id, address: grant.address },
      () => reader?.invalidate(model.proof?.name),
    );
    reader?.invalidate(model.proof?.name);
  }
  function syncHost(room, model) {
    const p =
      room.arcade?.mode === "party"
        ? room.players.find((p) => p && p.token === room.arcade.hostToken)
        : null;
    const binding = p && bindings.get(p);
    if (model.host && (!binding || model.host.binding !== binding.id))
      revokeHost(room, model);
    // Readiness can briefly drop during reconnect or motion recalibration.
    // Keep the same assigned grant; command admission still requires readiness.
    if (
      !binding ||
      model.host ||
      !p.ready ||
      !p.socket ||
      binding.status !== "ready"
    )
      return;
    const grant = {
      id: randomUUID(),
      binding: binding.id,
      token: p.token,
      player: p,
      address: p.address,
      slot: p.slot,
      status: "pending",
      authorised: false,
      source: isMock ? "mock" : "pending",
      message: "Preparing room controls…",
      checked: 0,
      roles: [],
    };
    model.host = grant;
    submit(
      room,
      model,
      "ens.role.grant",
      { partyId: model.id, grantId: grant.id, address: grant.address },
      (data) => {
        if (model.host !== grant) return;
        grant.status = data ? "ready" : "failed";
        grant.message = data
          ? "Checking host permissions…"
          : "Room controls could not be prepared. Use the main screen.";
        reader?.invalidate(model.proof?.name);
      },
    );
  }
  async function authorize(room, player, command, fresh = false) {
    if (!enabled) return { allowed: true, source: "server" };
    if (isMock)
      return {
        allowed: true,
        source: "mock",
        message: "Demo host controls — no chain.",
      };
    const model = rooms.get(room),
      grant = model?.host,
      binding = bindings.get(player);
    if (
      !grant ||
      !player.ready ||
      !player.socket ||
      room.arcade?.mode !== "party" ||
      room.arcade.hostToken !== player.token ||
      room.players[player.slot] !== player ||
      grant.player !== player ||
      grant.token !== player.token ||
      binding?.id !== grant.binding ||
      grant.status !== "ready" ||
      binding.status !== "ready" ||
      !model.proof
    )
      return {
        allowed: false,
        source: "pending",
        message:
          "Preparing room controls. Use the main screen while names are saving.",
      };
    const controls = [
      "start",
      "pause",
      "setup",
      "select",
      "lobby",
      "extend",
      "next-player",
      "results-hold",
      "pointer-mode",
      "stakes",
      "lock",
      "transfer",
      "status",
    ];
    if (command !== "remove" && !controls.includes(command))
      return {
        allowed: false,
        source: "chain",
        message: "That host command is not available.",
      };
    let result;
    try {
      reader = await authority();
      result = await reader.check(
        {
          name: model.proof.name,
          seatName: binding.name,
          address: grant.address,
          capability: command === "remove" ? "kick" : "control",
        },
        { fresh },
      );
    } catch {
      result = { outcome: "unavailable", code: "READER_UNAVAILABLE" };
    }
    if (
      closed ||
      model.ended ||
      model.host !== grant ||
      bindings.get(player) !== binding ||
      player.token !== grant.token ||
      !player.ready ||
      !player.socket ||
      room.arcade?.mode !== "party" ||
      room.arcade.hostToken !== player.token ||
      room.players[player.slot] !== player
    )
      return {
        allowed: false,
        source: "pending",
        message: "Room controls changed while checking this command.",
      };
    const decision = enforcement(result, config.ENS_ENFORCE);
    const capability = command === "remove" ? "kick" : "control";
    grant.roles = grant.roles.filter((r) => r !== capability);
    if (decision.allowed && decision.source === "chain")
      grant.roles.push(capability);
    Object.assign(grant, {
      authorised: decision.allowed,
      source: decision.source,
      message: decision.message,
      checked: now(),
    });
    if (result.outcome === "denied") {
      // Keep a deterministic denial visible even when a later RPC fails. The
      // local token is revoked, so soft mode cannot revive this delegation.
      model.notice = decision.message;
      revokeLocal(room, player);
      revokeHost(room, model);
    }
    changed(room);
    return decision;
  }
  async function pollAuthority() {
    if (closed || polling || !enabled || isMock) return;
    polling = true;
    try {
      if (reader) await reader.poll();
      for (const model of active)
        if (
          model.host?.status === "ready" &&
          now() - model.host.checked >= 5000
        )
          await authorize(model.room, model.host.player, "status", true);
    } finally {
      polling = false;
    }
  }
  return {
    observe,
    records,
    finish,
    reads,
    release,
    authorize,
    pollAuthority,
    setHostRevoker(fn) {
      revokeLocal = fn;
    },
    get: (room) => rooms.get(room),
    binding: (p) => bindings.get(p),
    view(room) {
      const model = rooms.get(room);
      return {
        ...(model ? { party: { ...model.party } } : {}),
        host: {
          slot: model?.host?.slot ?? null,
          authorised: model?.host?.authorised || false,
          roles: model?.host?.roles || [],
          revocable: !!model?.host,
          source: model?.host?.source || "none",
          message: model?.host?.message || model?.notice || "",
        },
        seats: room.players.filter(Boolean).map((p) => {
          const b = bindings.get(p),
            current =
              b &&
              !b.released &&
              b.token === p.token &&
              same(b.address, p.address);
          return {
            slot: p.slot,
            label: p.displayName || null,
            name: current ? b.name : null,
            addr: p.address
              ? `${p.address.slice(0, 6)}…${p.address.slice(-4)}`
              : null,
            named: !!(current && b.status === "ready"),
            status: current ? b.status : "unbound",
          };
        }),
      };
    },
    end(room) {
      const model = rooms.get(room);
      if (!model || model.ended) return;
      flush(model);
      for (const binding of [...model.seats.values()]) release(binding.player);
      submit(room, model, "ens.party.end", { partyId: model.id });
      model.ended = true;
      model.party.status = "ended";
      active.delete(model);
      reader?.forget(model.proof?.name);
    },
    close() {
      closed = true;
      for (const model of active) {
        flush(model);
        clearTimeout(model.recordTimer);
      }
      reader?.close();
      active.clear();
    },
  };
}
module.exports = { createEnsRooms };
