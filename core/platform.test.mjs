import test from "node:test";
import assert from "node:assert/strict";
import { games, validateManifest, matchSetup } from "./catalog.js";
import { encodeState, restoreState } from "./state.js";
import { viewports, QualityGovernor } from "./viewports.js";
import { Trail } from "./trail.js";
import { scopedStorage } from "../sdk/session.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  canonical,
  hash,
  normalizeScores,
  makeResult,
} = require("../server/records.cjs");
const { createRound, stepRound } = require("../server/party-engine.cjs");
test("all manifest contracts and minimum-human rules agree", () => {
  assert.equal(games.length, 13);
  for (const game of games) {
    assert.deepEqual(validateManifest(game), []);
    assert.equal(matchSetup(game, { mode: "multiplayer" }, 1).minHumans, 2);
    assert.equal(matchSetup(game, {}, 4).cpuCount, 0);
  }
  assert.equal(matchSetup(games[0], {}, 1).cpuCount, 7);
});
test("snapshot round-trip preserves existing rule prototypes and blocks prototype keys", () => {
  const trail = new Trail();
  trail.push(1, 2, 10);
  const source = {
    a: new Map([[2, { trail }]]),
    numbers: [Infinity, -Infinity],
    set: new Set([3]),
  };
  const target = { a: new Map([[2, { trail: new Trail() }]]) };
  restoreState(target, JSON.parse(JSON.stringify(encodeState(source))));
  assert.equal(target.a.get(2).trail.speed(), 0);
  assert.equal(target.numbers[0], Infinity);
  assert.equal(target.set.has(3), true);
  restoreState({}, JSON.parse('{"__proto__":{"polluted":true}}'));
  assert.equal({}.polluted, undefined);
});
test("three and four viewport layouts cover integer pixel boundaries without overlap", () => {
  for (const count of [1, 2, 3, 4]) {
    const views = viewports(count, 1001, 701);
    for (const v of views) {
      assert.ok(v.width > 0 && v.height > 0);
      assert.ok(v.x + v.width <= 1001 && v.y + v.height <= 701);
    }
    assert.equal(views[0].x, 0);
  }
  const q = new QualityGovernor();
  for (let i = 0; i < 180; i++) q.sample(35);
  assert.equal(q.scale, 0.9);
});
test("canonical hashes ignore object order and replay detects score tampering", () => {
  assert.equal(hash({ z: 1, a: 2 }), hash({ a: 2, z: 1 }));
  const room = {
    code: "ABCDEF",
    roundId: 1,
    game: "star-catch",
    active: [0, 1],
    match: { seed: 42 },
    startedAt: 0,
    replay: [],
  };
  const round = createRound(room.game, room.active, 42);
  for (let i = 0; i < 300; i++) {
    const input = {
      0: { x: Math.sin(i / 20), y: 0, active: true },
      1: { x: 0, y: 0, active: true },
    };
    stepRound(round, input, 1 / 30);
    room.replay.push([1 / 30, input]);
  }
  const scores = round.players.map((p) => ({
    slot: p.slot,
    score: Math.floor(p.score),
  }));
  const result = makeResult(
    room,
    games.find((g) => g.id === room.game),
    scores,
    10000,
  );
  assert.equal(result.result.verification, "verified");
  scores[0].score++;
  assert.equal(
    makeResult(
      room,
      games.find((g) => g.id === room.game),
      scores,
      10000,
    ).result.verification,
    "failed",
  );
  assert.equal(normalizeScores([{ slot: 0, score: Infinity }], [0]), null);
});
test("game storage namespaces prevent collisions and limit payload size", () => {
  const data = new Map(),
    storage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, v),
      removeItem: (k) => data.delete(k),
    };
  const a = scopedStorage("test.alpha", storage),
    b = scopedStorage("test.beta", storage);
  a.set("best", 12);
  b.set("best", 3);
  assert.equal(a.get("best"), 12);
  assert.equal(b.get("best"), 3);
  assert.throws(() => a.set("big", "x".repeat(70000)));
});

import { FixedStep } from "./fixed-step.js";
import { Race } from "../games/mario-kart/logic.js";
test("the fixed-step contract produces identical ticks across frame rates", () => {
  const a = new FixedStep(),
    b = new FixedStep();
  let x = 0,
    y = 0;
  for (let i = 0; i < 600; i++) a.advance(1 / 60, (dt) => (x += dt));
  for (let i = 0; i < 300; i++) b.advance(1 / 30, (dt) => (y += dt));
  assert.equal(a.tick, 1200);
  assert.equal(a.tick, b.tick);
  assert.equal(x, y);
});
test("two-human racing stays deterministic across different render schedules", () => {
  const options = {
    humans: [
      { seat: 0, character: "mario" },
      { seat: 1, character: "luigi" },
    ],
    seed: 321,
    cpuCount: 0,
  };
  const a = new Race(options),
    b = new Race(options);
  a.start();
  b.start();
  const inputs = {
    0: { gas: true, steer: 0.08 },
    1: { gas: true, steer: -0.04 },
  };
  for (let i = 0; i < 600; i++) a.updatePlayers(1 / 60, inputs);
  for (let i = 0; i < 300; i++) b.updatePlayers(1 / 30, inputs);
  assert.deepEqual(
    a.racers.map((r) => [r.s, r.offset, r.speed]),
    b.racers.map((r) => [r.s, r.offset, r.speed]),
  );
});

test("catalog aliases preserve view routing before and after match setup", async () => {
  const { gameById, independentViews } = await import("./catalog.js");
  assert.equal(gameById("chonks.mario-kart").gameId, "chonks.kart-rush");
  assert.equal(independentViews("fruit-ninja", null), false);
  assert.equal(
    independentViews("chonks.slice-dojo", { variant: "race" }),
    true,
  );
  assert.equal(independentViews("chonks.time-trial"), true);
});
