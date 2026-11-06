"use strict";
const { Race, CHARACTERS } = require("./../games/mario-kart/logic.js");
const { Rally } = require("./../games/table-tennis/logic.js");
const { Duel } = require("./../games/swordplay/logic.js");
const { seededRandom } = require("../core/random.js");
const { encodeState } = require("../core/state.js");
const SHARED_GAMES = new Set(["mario-kart", "table-tennis", "swordplay"]);
const ACTIONS = ["confirm", "left", "right", "primary"];
const quantize = (v) =>
  Math.round(Math.max(-1, Math.min(1, Number(v) || 0)) * 10000) / 10000;

// One fixed-step authority for every screen. The compact input journal is also
// the replay format; clients can never upload state, rules calls or scores.
class SharedRound {
  constructor(id, setup, seats, { journal = true } = {}) {
    if (
      !SHARED_GAMES.has(id) ||
      !Number.isInteger(seats) ||
      seats < 1 ||
      seats > (id === "mario-kart" ? 4 : 2)
    )
      throw Error("Invalid shared round");
    Object.assign(this, {
      id,
      setup,
      seats,
      tick: 0,
      frames: [],
      journal,
      pending: [],
      events: [],
      accumulator: 0,
    });
    this.choices = Array.from({ length: seats }, (_, i) => i);
    this.confirmed = new Set();
    this.struck = Array(seats).fill(-2000);
    this.build();
  }
  build() {
    const onEvent = (event) => {
      if (this.events.length < 40) this.events.push(event);
    };
    if (this.id === "mario-kart")
      this.game = new Race({
        seed: this.setup.seed,
        laps: this.setup.laps,
        cpuCount: this.setup.cpuCount,
        humans: this.choices.map((c, seat) => ({
          seat,
          character: CHARACTERS[c].id,
        })),
        onEvent,
      });
    else {
      this.game = new (this.id === "table-tennis" ? Rally : Duel)({
        rng: seededRandom(this.setup.seed),
        winScore: this.setup.winScore || 7,
        coop: this.setup.tennisMode === "coop",
        onEvent,
      });
      this.game.humanOpponent = this.seats > 1 && !this.game.coop;
      this.game.start(0);
    }
  }
  action(seat, action) {
    if (
      !Number.isInteger(seat) ||
      seat < 0 ||
      seat >= this.seats ||
      !ACTIONS.includes(action) ||
      this.pending.length >= 16
    )
      return false;
    this.pending.push([seat, ACTIONS.indexOf(action)]);
    return true;
  }
  advance(seconds, inputs) {
    this.accumulator += Math.max(0, Math.min(0.1, seconds));
    while (
      this.accumulator + 1e-9 >= 1 / 60 &&
      this.tick < 45000 &&
      !this.done
    ) {
      this.accumulator -= 1 / 60;
      const row = inputs.map((p) => [
        quantize(p.x),
        quantize(p.y),
        (p.active ? 1 : 0) |
          (p.gas ? 2 : 0) |
          (p.brake ? 4 : 0) |
          (p.boost ? 8 : 0),
      ]);
      const frame = [row, this.pending.splice(0)];
      this.apply(frame);
      if (this.journal) this.frames.push(frame);
    }
  }
  apply(frame) {
    if (
      !Array.isArray(frame) ||
      frame.length !== 2 ||
      !Array.isArray(frame[0]) ||
      frame[0].length !== this.seats ||
      !Array.isArray(frame[1]) ||
      frame[1].length > 16
    )
      throw Error("Invalid shared frame");
    const [rows, actions] = frame;
    for (const r of rows)
      if (
        !Array.isArray(r) ||
        r.length !== 3 ||
        !r.slice(0, 2).every((v) => Number.isFinite(v) && Math.abs(v) <= 1) ||
        !Number.isInteger(r[2]) ||
        r[2] < 0 ||
        r[2] > 15
      )
        throw Error("Invalid shared input");
    const now = (this.tick * 1000) / 60,
      g = this.game;
    for (const a of actions) {
      if (
        !Array.isArray(a) ||
        a.length !== 2 ||
        !Number.isInteger(a[0]) ||
        a[0] < 0 ||
        a[0] >= this.seats ||
        !Number.isInteger(a[1]) ||
        !ACTIONS[a[1]]
      )
        throw Error("Invalid shared action");
      const [seat, code] = a,
        action = ACTIONS[code];
      if (this.id === "mario-kart" && this.game.state === "ready") {
        if (["left", "right"].includes(action)) {
          this.choices[seat] =
            (this.choices[seat] + (action === "right" ? 1 : 7)) % 8;
          this.confirmed.delete(seat);
          this.build();
        }
        if (action === "confirm") this.confirmed.add(seat);
      } else if (action === "primary" && now - this.struck[seat] >= 850) {
        this.struck[seat] = now;
        if (this.id === "table-tennis") {
          if (seat === 0 || g.coop) g.swing(350);
          else g.swingOpponent(0.7);
        }
        if (this.id === "swordplay") {
          const angle = Math.atan2(rows[seat][1], rows[seat][0]);
          if (g.humanOpponent) g.humanStrike(seat, now, angle);
          else g.swing({ angle, peak: 300 }, now);
        }
      }
    }
    if (this.id === "mario-kart") {
      if (
        this.game.state === "ready" &&
        (this.confirmed.size === this.seats || this.tick >= 1800)
      )
        this.game.start();
      const input = Object.fromEntries(
        rows.map(([x, y, b], seat) => [
          seat,
          {
            steer: x,
            gas: !!(b & 2),
            brake: !!(b & 4),
            nitro: !!(b & 8),
            item: !!this.game.humans[seat].item,
            autopilot: !(b & 1),
          },
        ]),
      );
      this.game.stepPlayers(1 / 120, input);
      this.game.stepPlayers(1 / 120, input);
    } else {
      if (this.id === "table-tennis") {
        g.setPaddle(0.5 + rows[0][0] / 2, 0.5 + rows[0][1] / 2);
        if (this.seats > 1)
          g[g.coop ? "setPartner" : "setOpponent"](
            0.5 +
              (rows[1][0] / 2) *
                (!g.coop && this.setup.remoteIndices?.includes(1) ? -1 : 1),
            0.5 + rows[1][1] / 2,
          );
      } else {
        g.setBlade(
          Math.atan2(rows[0][1], rows[0][0]),
          now - this.struck[0] < 180,
        );
        if (this.seats > 1) g.setOpponent(Math.atan2(rows[1][1], rows[1][0]));
      }
      g.update(now + 1000 / 120, 1 / 120);
      g.update(now + 1000 / 60, 1 / 120);
    }
    this.tick++;
  }
  get done() {
    return this.id === "mario-kart"
      ? this.game.state === "results"
      : this.game.state === "over";
  }
  scores() {
    const g = this.game;
    if (this.id === "mario-kart")
      return g.humans.map((p) => ({
        slot: p.seat,
        score: g.position(p),
        ...(p.dnf ? { outcome: "dnf" } : {}),
        stats: {
          finishMs: Math.round((p.finishTime || 0) * 1000),
          boostsUsed: 3 - p.nitroRemaining,
        },
      }));
    return Array.from({ length: this.seats }, (_, slot) => ({
      slot,
      score:
        this.id === "table-tennis"
          ? slot && !g.coop
            ? g.score.ai
            : g.score.player
          : slot
            ? g.ai.points
            : g.player.points,
    }));
  }
  snapshot() {
    return {
      clock: (this.tick * 1000) / 60,
      tick: this.tick,
      state: encodeState(this.game),
      shared: true,
    };
  }
}
function verifyShared(replay, scores) {
  try {
    const id = {
      "chonks.kart-rush": "mario-kart",
      "chonks.table-tennis": "table-tennis",
      "chonks.foam-fencers": "swordplay",
    }[replay.gameId];
    if (
      !id ||
      !Array.isArray(replay.sharedFrames) ||
      replay.sharedFrames.length > 45000 ||
      JSON.stringify(replay.sharedFrames).length > 12000000
    )
      return false;
    const r = new SharedRound(
      id,
      { ...replay.setup, seed: replay.seed },
      replay.slots.length,
      { journal: false },
    );
    for (const frame of replay.sharedFrames) {
      if (r.done) return false;
      r.apply(frame);
    }
    const actual = r.scores();
    return (
      scores.length === actual.length &&
      scores.every(
        (s) =>
          actual.find((a) => replay.slots[a.slot] === s.slot)?.score ===
          s.score,
      )
    );
  } catch {
    return false;
  }
}
module.exports = { SharedRound, SHARED_GAMES, verifyShared };
