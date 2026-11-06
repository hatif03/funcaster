import test from "node:test";
import assert from "node:assert/strict";
import {
  games,
  gameById,
  optionSchema,
  matchSetup,
} from "../../core/catalog.js";
import {
  OPTION_UI,
  PRESETS,
  optionFields,
  optionGroups,
  coerceChoice,
  optionValue,
  defaultSetup,
  startStatus,
  pairFor,
  createPropertiesModel,
  setupSummary,
} from "../../public/os/option-ui.js";
import { createStorage } from "../../public/os/storage.js";

for (const game of games)
  test(`${game.title}: properties cover every schema field once, retain choice order and match defaults`, () => {
    const schema = optionSchema(game.id),
      fields = optionFields(game.id),
      expected = matchSetup(game, {}, 2);
    for (const source of schema) {
      assert.ok(
        OPTION_UI[source.key],
        `${source.key} needs presentation metadata`,
      );
      const found = fields.filter((field) => field.key === source.key);
      assert.equal(found.length, 1, source.key);
      assert.deepEqual(
        found[0].choices,
        source.choices.filter(
          ([value]) => !OPTION_UI[source.key].hideChoice?.(game.id, value),
        ),
      );
      const value = coerceChoice(game.id, source.key, found[0].value);
      assert.equal(
        matchSetup(game, { [source.key]: value }, 2)[source.key],
        expected[source.key],
      );
    }
    assert.equal(new Set(fields.map((field) => field.key)).size, fields.length);
    assert.ok(
      !fields.some((field) =>
        ["seed", "practice", "ghost"].includes(field.key),
      ),
    );
    assert.deepEqual(matchSetup(game, defaultSetup(game.id), 2), expected);
  });

test("schema fallbacks stay visible in Advanced with their provided value", () => {
  const schema = [
    ...optionSchema("kart"),
    {
      key: "futureRule",
      label: "New rule",
      choices: [
        ["one", "One"],
        ["two", "Two"],
      ],
    },
  ];
  const fields = optionFields("kart", { futureRule: "two" }, 2, schema);
  assert.equal(fields.find((f) => f.key === "futureRule").tab, "advanced");
  assert.equal(fields.find((f) => f.key === "futureRule").value, "two");
  assert.equal(coerceChoice("kart", "futureRule", "two", schema), "two");
});

test("wire coercion keeps auto intent, numeric choices and real booleans", () => {
  assert.equal(coerceChoice("mario-kart", "cpuCount", "auto"), null);
  assert.equal(coerceChoice("mario-kart", "cpuCount", "4"), 4);
  assert.equal(coerceChoice("golf", "wind", "on"), true);
  assert.equal(coerceChoice("golf", "wind", "off"), false);
  assert.equal(optionValue("golf", "wind", { wind: true }), "on");
  assert.equal(optionValue("golf", "wind", { wind: false }), "off");
  assert.equal(coerceChoice("star-catch", "interaction", "false"), false);
  assert.throws(() => coerceChoice("golf", "cpuCount", 7), RangeError);
  assert.throws(() => coerceChoice("mario-kart", "laps", "99"), RangeError);
});

test("dependencies distinguish shared helpers, golf skill and the optional ready-player pair", () => {
  const field = (id, key, setup) =>
    optionFields(id, setup).find((f) => f.key === key);
  for (const id of ["shooting-range", "alien-attack"]) {
    assert.equal(field(id, "bot", { worldMode: "race" }).enabled, false);
    assert.equal(
      field(id, "bot", { worldMode: id === "alien-attack" ? "coop" : "shared" })
        .enabled,
      true,
    );
  }
  assert.equal(
    field("fruit-ninja", "bot", { variant: "battle" }).enabled,
    false,
  );
  assert.equal(field("fruit-ninja", "bot", { variant: "co-op" }).enabled, true);
  assert.equal(field("golf", "skill", { cpuCount: 0 }).enabled, false);
  assert.equal(field("golf", "skill", { cpuCount: 2 }).enabled, true);
  assert.ok(
    !field("golf", "cpuCount", {}).choices.some(([value]) => value === 7),
  );
  assert.ok(!optionFields("island-flyover").some((f) => f.key === "bot"));
  for (const id of ["table-tennis", "swordplay"]) {
    assert.equal(field(id, "pair", { rotation: "winner" }).visible, false);
    assert.equal(field(id, "pair", { rotation: "pick" }).visible, true);
  }
});

test("the non-schema Stakes field keeps Rules available; Advanced remains for records", () => {
  assert.deepEqual(
    optionGroups("kart").map((g) => g.id),
    ["play", "rules", "advanced"],
  );
  assert.deepEqual(
    optionGroups("star-catch").map((g) => g.id),
    ["play", "rules", "advanced"],
  );
  assert.deepEqual(
    optionGroups("swordplay").map((g) => g.id),
    ["play", "rules", "players", "advanced"],
  );
  assert.deepEqual(
    optionGroups("golf").map((g) => g.id),
    ["play", "rules", "players", "advanced"],
  );
  assert.deepEqual(PRESETS.kart, []);
  assert.ok(
    PRESETS["mario-kart"].find((p) => p.id === "third").setup.cpuCount === 7,
  );
  assert.deepEqual(PRESETS.golf.find((p) => p.id === "third").setup, {
    holes: 6,
    wind: true,
    course: "seeded",
  });
});
const players = [0, 1, 2].map((slot) => ({
  slot,
  name: `Player ${slot}`,
  ready: true,
  connected: true,
}));
const room = (setup = {}) => ({
  game: "mario-kart",
  phase: "lobby",
  startReason: "Ready to play",
  setup,
  players,
});

test("server readiness text is preserved verbatim and all local Start restrictions are explicit", () => {
  for (const reason of [
    "Ready to play",
    "Waiting for 1 more ready player",
    "Waiting for Dev's screen to be ready",
    "This game needs WebGL.",
    "Waiting for players",
  ]) {
    const status = startStatus({ ...room(), startReason: reason });
    assert.equal(status.reason, reason);
    assert.equal(status.enabled, reason === "Ready to play");
  }
  assert.equal(startStatus({ ...room(), phase: "playing" }).enabled, false);
  assert.equal(startStatus(null).enabled, false);
  const duel = { ...room(), game: "table-tennis" };
  assert.equal(
    startStatus(duel, { rotation: "pick", pair: [0, 0] }).reason,
    "Pick two different players",
  );
  assert.equal(
    startStatus(duel, { rotation: "pick", pair: [0, 3] }).reason,
    "Pick two ready players",
  );
  assert.equal(
    startStatus(duel, { rotation: "pick", pair: [0, 1] }).enabled,
    true,
  );
  assert.deepEqual(pairFor({}, duel), [0, 1]);
  assert.match(
    setupSummary("mario-kart", { cpuCount: 7, laps: 3 }, room()),
    /8 racers.*3 players.*5 computer/,
  );
});

function modelFixture(
  initial = room({ mode: "auto", laps: 1, playlist: ["golf"] }),
  options = {},
) {
  let current = structuredClone(initial),
    model;
  const calls = [],
    timers = new Map();
  let tick = 0;
  const schedule = (fn, ms) => {
    if (ms === 400) {
      queueMicrotask(fn);
      return ++tick;
    }
    timers.set(++tick, { fn, ms });
    return tick;
  };
  const session = {
    select(id) {
      calls.push(["select", id]);
      current = { ...current, game: id };
    },
    async setup(setup) {
      calls.push(["setup", structuredClone(setup)]);
      current = { ...current, setup: structuredClone(setup) };
      model?.update(current);
      return { ok: true };
    },
    async start() {
      calls.push(["start"]);
      return { ok: true };
    },
    ...options.session,
  };
  const storage = createStorage();
  model = createPropertiesModel({
    gameId: options.gameId || current.game,
    getRoom: () => current,
    session,
    storage,
    schedule,
    unschedule: (id) => timers.delete(id),
    ...options.model,
  });
  return {
    model,
    calls,
    timers,
    storage,
    session,
    getRoom: () => current,
    setRoom(next) {
      current = next;
      model.update(next);
    },
    fire() {
      const jobs = [...timers.values()];
      timers.clear();
      jobs.forEach(({ fn }) => fn());
    },
  };
}

test("a burst is one 150 ms full-object setup; Cancel restores the opening snapshot and retains selected game", async () => {
  const f = modelFixture();
  f.model.change({ laps: 3 });
  f.model.change({ cpuCount: 2 });
  assert.equal(f.timers.size, 1);
  assert.equal([...f.timers.values()][0].ms, 150);
  assert.deepEqual(f.calls, [["select", "mario-kart"]]);
  f.fire();
  await f.model.flush();
  assert.deepEqual(f.calls[1], [
    "setup",
    { mode: "auto", laps: 3, cpuCount: 2, playlist: ["golf"] },
  ]);
  await f.model.cancel();
  assert.deepEqual(f.calls[2], [
    "setup",
    { mode: "auto", laps: 1, playlist: ["golf"] },
  ]);
  assert.equal(f.getRoom().game, "mario-kart");
  f.model.destroy();
});

test("Cancel clears unflushed edits, and a round transition never restores obsolete setup", async () => {
  const f = modelFixture();
  f.model.change({ laps: 3 });
  await f.model.cancel();
  assert.equal(f.timers.size, 0);
  assert.equal(f.calls[1][1].laps, 1);
  f.setRoom({ ...f.getRoom(), phase: "playing" });
  await f.model.cancel();
  assert.equal(f.calls.length, 2);
  f.model.destroy();
});

test("new edits arriving during an acknowledged setup remain visible and serialize in full", async () => {
  let resolve;
  const f = modelFixture(undefined, {
    session: {
      setup(setup) {
        f.calls.push(["setup", setup]);
        return new Promise((r) => {
          resolve = r;
        });
      },
    },
  });
  f.model.change({ laps: 3 });
  const first = f.model.flush();
  assert.equal(f.model.snapshot().setup.laps, 3);
  f.model.change({ cpuCount: 4 });
  assert.equal(f.model.snapshot().setup.laps, 3);
  assert.equal(f.model.snapshot().setup.cpuCount, 4);
  f.setRoom({ ...f.getRoom(), setup: f.calls.at(-1)[1] });
  resolve({ ok: true });
  await first;
  const second = f.model.flush();
  assert.deepEqual(f.calls.at(-1)[1], {
    mode: "auto",
    laps: 3,
    cpuCount: 4,
    playlist: ["golf"],
  });
  resolve({ ok: true });
  await second;
  f.model.destroy();
});

test("a failed in-flight setup prevents Start and does not save preferences", async () => {
  let resolve;
  const f = modelFixture(undefined, {
    session: {
      setup() {
        return new Promise((r) => {
          resolve = r;
        });
      },
    },
  });
  f.model.change({ laps: 3 });
  const flushing = f.model.flush(),
    starting = f.model.start();
  resolve({ error: "Give it a moment." });
  await flushing;
  assert.equal((await starting).error, "Give it a moment.");
  assert.ok(!f.calls.some(([name]) => name === "start"));
  assert.equal(f.storage.read("setup.mario-kart"), null);
  f.model.destroy();
});

test("Start flushes options, checks the latest selected game and saves My settings only on success", async () => {
  const f = modelFixture();
  f.model.change({ laps: 3 });
  const starting = f.model.start();
  assert.equal(f.model.snapshot().busy, true);
  assert.deepEqual(await f.model.start(), { cancelled: true });
  assert.equal((await starting).ok, true);
  assert.deepEqual(
    f.calls.map(([name]) => name),
    ["select", "setup", "start"],
  );
  assert.equal(f.storage.read("setup.mario-kart").laps, 3);
  f.model.change({ laps: 1 });
  f.model.preset("mine");
  assert.equal(f.model.snapshot().setup.laps, 3);
  f.setRoom({ ...f.getRoom(), game: "golf" });
  assert.equal(f.model.snapshot().status.enabled, false);
  assert.ok((await f.model.start()).error);
  f.model.destroy();
});

test("preset patches preserve unrelated settings and selecting pairs starts with two ready seats", async () => {
  const f = modelFixture({
    ...room({ mode: "multiplayer", rotation: "winner", playlist: ["golf"] }),
    game: "table-tennis",
  });
  f.model.change({ rotation: "pick" });
  assert.deepEqual(f.model.snapshot().setup.pair, [0, 1]);
  f.model.preset("third");
  await f.model.flush();
  assert.deepEqual(f.getRoom().setup.playlist, ["golf"]);
  assert.equal(f.getRoom().setup.winScore, 11);
  assert.equal(f.getRoom().setup.rotation, "bracket");
  f.model.destroy();
});
