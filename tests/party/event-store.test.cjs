const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { createEventStore } = require("../../server/event-store.cjs");
test("event counters and filtered leaderboards persist without identities or raw inputs", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chonks-events-")),
    file = path.join(dir, "stats.json");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const s = createEventStore(file);
  s.record({ type: "join" });
  const event = {
    type: "round",
    result: {
      matchId: "one",
      gameId: "chonks.kart-rush",
      status: "completed",
      verification: "attested",
      endedAt: 100,
      scores: [
        { slot: 0, score: 2, outcome: "finished", token: "must-not-persist" },
        { slot: 1, score: 1, outcome: "forfeit" },
      ],
    },
  };
  s.record(event);
  s.record(event);
  s.close();
  assert.ok(!fs.readFileSync(file, "utf8").includes("must-not-persist"));
  const restored = createEventStore(file);
  t.after(() => restored.close());
  const stats = restored.snapshot();
  assert.equal(stats.joins, 1);
  assert.equal(stats.rounds, 1);
  assert.equal(stats.forfeits, 1);
  assert.equal(stats.leaderboards["mario-kart"].length, 1);
  assert.equal(stats.leaderboards["mario-kart"][0].score, 2);
});
