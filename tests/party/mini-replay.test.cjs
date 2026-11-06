const test = require("node:test"),
  assert = require("node:assert/strict");
const { MiniReplay, TYPES } = require("../../server/mini-replay.cjs");
const { verifyLogic } = require("../../server/logic-replay.cjs");
const { seededRandom } = require("../../core/random.js");
test("all six games replay fixed steps, reject score injection and cannot restart", () => {
  for (const id of Object.keys(TYPES)) {
    const c = new MiniReplay(id, 17, {}, 2);
    assert.equal(
      c.accept(0, [
        ["init"],
        ["update", 2, ...(id === "shooting-range" ? [] : [1 / 120])],
        ["start", 10],
      ]),
      true,
      id,
    );
    const calls = [];
    for (let i = 1; i <= 1800; i++)
      calls.push([
        "update",
        10 + (i * 1000) / 120,
        ...(id === "shooting-range" ? [] : [1 / 120]),
      ]);
    for (let i = 0; i < calls.length; i += 500)
      assert.equal(c.accept(c.sequence, calls.slice(i, i + 500)), true, id);
    assert.ok(
      c.scores().every((s) => Number.isSafeInteger(s.score)),
      id,
    );
    assert.equal(c.accept(c.sequence, [["score", 999]]), false, id);
    const restart = new MiniReplay(id, 17, {}, 1);
    assert.equal(
      restart.accept(0, [["init"], ["start", 0], ["start", 1]]),
      false,
      id,
    );
  }
});
test("a complete shooting round with hits round-trips from two independent boards", () => {
  const boards = [];
  for (let view = 0; view < 2; view++) {
    const r = new TYPES["shooting-range"]({ rng: seededRandom(43) });
    r.start(0);
    const calls = [["init"], ["start", 0]];
    for (let i = 1; i <= 7200; i++) {
      const at = (i * 1000) / 120;
      r.update(at);
      calls.push(["update", at]);
      if (i % 30 === 0 && r.targets[0]) {
        const t = r.targets[0];
        calls.push(["shoot", t.x, t.y, at]);
        r.shoot(t.x, t.y, at);
      }
    }
    boards.push({ view, calls, score: r.score });
  }
  const replay = {
    gameId: "chonks.shooting-range",
    seed: 43,
    setup: {},
    slots: [1, 3],
    logicBoards: boards.map(({ view, calls }) => ({ view, calls })),
  };
  assert.equal(
    verifyLogic(
      replay,
      boards.map((b) => ({ slot: replay.slots[b.view], score: b.score })),
    ),
    true,
  );
  assert.equal(verifyLogic(replay, [{ slot: 1, score: 999999 }]), false);
});
