const test = require("node:test"),
  assert = require("node:assert/strict");
const { LogicReplay, verifyLogic } = require("../../server/logic-replay.cjs");
const { Race } = require("../../games/mario-kart/logic.js");
test("Kart replay follows the fixed-step race and rejects tampered input", () => {
  const setup = { laps: 1, cpuCount: 0 },
    r = new Race({
      seed: 18,
      laps: 1,
      cpuCount: 0,
      humans: [
        { seat: 0, character: "mario" },
        { seat: 1, character: "luigi" },
      ],
    });
  r.start();
  const calls = [["init", { characters: ["mario", "luigi"] }], ["start"]];
  for (let i = 0; i < 1200; i++) {
    const input = {
      0: { gas: true, steer: Math.sin(i / 60) * 0.3 },
      1: { autopilot: true },
    };
    r.stepPlayers(1 / 120, input);
    calls.push(["stepPlayers", 1 / 120, input]);
  }
  const c = new LogicReplay("mario-kart", 18, setup, 2);
  for (let i = 0; i < calls.length; i += 1000)
    assert.equal(c.accept(c.sequence, calls.slice(i, i + 1000)), true);
  assert.deepEqual(
    c.scores().map((s) => s.score),
    r.humans.map((p) => r.position(p)),
  );
  const replay = {
    gameId: "chonks.kart-rush",
    seed: 18,
    setup,
    slots: [1, 3],
    logicCalls: calls,
  };
  const scores = c.scores().map((s) => ({ ...s, slot: replay.slots[s.slot] }));
  assert.equal(verifyLogic(replay, scores), true);
  assert.equal(
    verifyLogic(
      replay,
      scores.map((s) => ({ ...s, score: 99 })),
    ),
    false,
  );
  assert.equal(
    c.accept(c.sequence, [["stepPlayers", 1 / 120, { 7: { gas: true } }]]),
    false,
  );
});
test("Golf replay accepts sequenced address and simulates flight; cannot reset or score directly", () => {
  const c = new LogicReplay(
    "golf",
    22,
    { holes: 1, cpuCount: 0, course: "seeded", wind: true },
    2,
  );
  assert.equal(
    c.accept(0, [
      ["init", {}],
      ["address", 0, 0.2, 1791979200123],
      ["release", 0, 0.5, 1791979200123],
      ...Array.from({ length: 900 }, () => ["step", 1 / 120]),
    ]),
    true,
  );
  assert.equal(c.game.players[0].hole.strokes, 1);
  assert.ok(c.game.time > 7);
  assert.equal(c.accept(1, [["score", 999]]), false);
  const other = new LogicReplay("golf", 22, { holes: 1 }, 2);
  assert.equal(
    other.accept(0, [
      ["init", {}],
      ["init", {}],
    ]),
    false,
  );
});
