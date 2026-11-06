"use strict";
const { Race, CHARACTERS } = require("../games/mario-kart/logic.js");
const { GolfRound, golfScores } = require("../games/golf/round.js");
const { MiniReplay, TYPES } = require("./mini-replay.cjs");
const SUPPORTED = new Set(["mario-kart", "golf", ...Object.keys(TYPES)]);
function safe(value, depth = 0) {
  if (depth > 6) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number")
    return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
  if (typeof value === "string") return value.length < 80;
  if (Array.isArray(value))
    return value.length <= 12 && value.every((v) => safe(v, depth + 1));
  if (typeof value === "object")
    return (
      Object.keys(value).length <= 16 &&
      Object.entries(value).every(
        ([k, v]) =>
          !["__proto__", "constructor", "prototype"].includes(k) &&
          safe(v, depth + 1),
      )
    );
  return false;
}
class LogicReplay {
  constructor(id, seed, setup, seats) {
    if (TYPES[id]) return new MiniReplay(id, seed, setup, seats);
    this.id = id;
    this.seed = seed;
    this.setup = setup;
    this.seats = seats;
    this.calls = [];
    this.sequence = 0;
    this.valid = true;
    this.steps = 0;
    this.bytes = 0;
  }
  accept(sequence, calls) {
    if (
      !this.valid ||
      sequence !== this.sequence ||
      !Array.isArray(calls) ||
      calls.length > 1000
    )
      return (this.valid = false);
    const bytes = JSON.stringify(calls).length;
    if (this.bytes + bytes > 12000000) return (this.valid = false);
    try {
      for (const call of calls) {
        if (!Array.isArray(call) || call.length > 6 || !safe(call))
          throw Error("Invalid call");
        const [method, ...args] = call;
        if (method === "init") {
          if (this.game) throw Error("Cannot reset a run");
          if (this.id === "golf")
            this.game = new GolfRound({
              players: [
                ...Array.from({ length: this.seats }, (_, slot) => ({ slot })),
                ...Array.from({ length: this.setup.cpuCount || 0 }, (_, i) => ({
                  slot: 4 + i,
                  ai: true,
                })),
              ],
              seed: this.seed,
              holes: this.setup.holes,
              course: this.setup.course,
              wind: this.setup.wind,
              skill: this.setup.skill,
              mode: this.setup.golfMode,
              turnSeconds: this.setup.turnSeconds ?? 45,
              readyGolf: this.setup.readyGolf,
            });
          else if (this.id === "mario-kart") {
            const chars = args[0]?.characters;
            if (
              !Array.isArray(chars) ||
              chars.length !== this.seats ||
              chars.some((c) => !CHARACTERS.some((x) => x.id === c))
            )
              throw Error("Invalid grid");
            this.game = new Race({
              seed: this.seed,
              laps: this.setup.laps,
              cpuCount: this.setup.cpuCount,
              humans: chars.map((character, seat) => ({ seat, character })),
            });
          } else throw Error("Unknown game");
        } else if (!this.game) throw Error("Missing init");
        else if (this.id === "mario-kart") {
          if (method === "start" && args.length === 0) this.game.start();
          else if (
            method === "stepPlayers" &&
            args.length === 2 &&
            Math.abs(args[0] - 1 / 120) < 1e-10 &&
            ++this.steps <= 75000
          ) {
            const inputs = args[1];
            if (!inputs || Array.isArray(inputs)) throw Error("Invalid input");
            for (const [slot, input] of Object.entries(inputs)) {
              if (
                !/^\d$/.test(slot) ||
                Number(slot) >= this.seats ||
                !input ||
                typeof input !== "object"
              )
                throw Error("Invalid seat");
              if (input.steer !== undefined && Math.abs(input.steer) > 1)
                throw Error("Invalid steering");
            }
            this.game.stepPlayers(...args);
          } else if (
            method === "showResults" &&
            args.length === 0 &&
            ["finishing", "results"].includes(this.game.state)
          )
            this.game.showResults();
          else throw Error("Invalid race call");
        } else {
          if (
            method === "step" &&
            args.length === 1 &&
            Math.abs(args[0] - 1 / 120) < 1e-10 &&
            ++this.steps <= 220000
          )
            this.game.step(...args);
          else if (
            method === "presence" &&
            args.length === 1 &&
            Array.isArray(args[0]) &&
            args[0].every(
              (p) =>
                Number.isInteger(p.slot) && p.slot >= 0 && p.slot < this.seats,
            )
          )
            this.game.presence(args[0]);
          else if (
            ["address", "release", "cancelAddress", "strike"].includes(
              method,
            ) &&
            Number.isInteger(args[0]) &&
            args[0] >= 0 &&
            args[0] < this.seats
          ) {
            if (
              (method === "address" && args.length !== 3) ||
              (method === "release" && args.length !== 3) ||
              (method === "cancelAddress" && args.length !== 1) ||
              (method === "strike" && ![3, 4].includes(args.length))
            )
              throw Error("Invalid shot");
            if (
              method === "address" &&
              (!Number.isFinite(args[1]) ||
                Math.abs(args[1]) > Math.PI ||
                !Number.isSafeInteger(args[2]) ||
                args[2] < 0)
            )
              throw Error("Invalid address");
            if (
              method === "release" &&
              (!Number.isFinite(args[1]) ||
                args[1] < 0 ||
                args[1] > 1 ||
                !Number.isSafeInteger(args[2]) ||
                args[2] < 0)
            )
              throw Error("Invalid release");
            if (
              method === "strike" &&
              (!Number.isFinite(args[1]) ||
                Math.abs(args[1]) > 0.5 ||
                !Number.isFinite(args[2]) ||
                args[2] < 0 ||
                args[2] > 1 ||
                (args[3] != null &&
                  (!Number.isSafeInteger(args[3]) || args[3] < 0)))
            )
              throw Error("Invalid strike");
            this.game[method](...args);
          } else if (
            method === "extendTurn" &&
            args.length === 1 &&
            args[0] === 30 &&
            this.game.extensions < 2
          )
            this.game.extendTurn(30);
          else throw Error("Invalid golf call");
        }
      }
    } catch {
      return (this.valid = false);
    }
    this.calls.push(...calls);
    this.bytes += bytes;
    this.sequence++;
    return true;
  }
  scores() {
    if (!this.game) return [];
    if (this.id === "mario-kart")
      return this.game.humans.map((p) => ({
        slot: p.seat,
        score: this.game.position(p),
        ...(p.dnf ? { outcome: "dnf" } : {}),
        stats: {
          finishMs: Math.round((p.finishTime || 0) * 1000),
          boostsUsed: 3 - p.nitroRemaining,
        },
      }));
    if (this.game.phase === "results")
      return golfScores(this.game.players, this.game.mode).filter(
        (p) => p.slot < this.seats,
      );
    return this.game.players
      .filter((p) => !p.ai)
      .map((p) => ({
        slot: p.slot,
        score:
          this.game.total(p) +
          (p.complete ? 0 : p.hole.strokes + 9) +
          (this.game.holes - this.game.index - 1) * 9,
        stats: {
          strokes: this.game.total(p) + p.hole.strokes,
          holes: p.card.length,
        },
      }));
  }
}
function verifyLogic(replay, scores) {
  const id = {
    "chonks.kart-rush": "mario-kart",
    "chonks.pocket-greens": "golf",
    "chonks.table-tennis": "table-tennis",
    "chonks.foam-fencers": "swordplay",
    "chonks.time-trial": "kart",
    "chonks.cloud-cruise": "island-flyover",
    "chonks.shooting-range": "shooting-range",
    "chonks.alien-attack": "alien-attack",
  }[replay.gameId];
  if (!id) return false;
  if (replay.logicBoards?.length) {
    const actual = [];
    for (const b of replay.logicBoards) {
      if (
        !Number.isInteger(b.view) ||
        b.view < 0 ||
        b.view >= replay.slots.length
      )
        return false;
      const c = new LogicReplay(id, replay.seed, replay.setup, 1);
      for (let i = 0; i < b.calls.length; i += 1000)
        if (!c.accept(c.sequence, b.calls.slice(i, i + 1000))) return false;
      actual.push({ ...c.scores()[0], slot: replay.slots[b.view] });
    }
    return scores.every(
      (s) => actual.find((x) => x.slot === s.slot)?.score === s.score,
    );
  }
  if (!replay.logicCalls?.length) return false;
  const checker = new LogicReplay(
    id,
    replay.seed,
    replay.setup,
    replay.slots.length,
  );
  for (let i = 0; i < replay.logicCalls.length; i += 1000)
    if (!checker.accept(checker.sequence, replay.logicCalls.slice(i, i + 1000)))
      return false;
  const actual = checker.scores();
  return scores.every(
    (s) =>
      actual.find((x) => replay.slots[x.slot] === s.slot)?.score === s.score,
  );
}
module.exports = { LogicReplay, verifyLogic, SUPPORTED };
