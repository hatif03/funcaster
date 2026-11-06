import test from "node:test";
import assert from "node:assert/strict";
import {
  activeRound,
  localViews,
  frameKey,
  gameFrameUrl,
  trustedGameMessage,
  createGameHost,
} from "../../public/os/game-host.js";
import { resultPresentation } from "../../public/os/result-data.js";
import { createStore } from "../../public/os/util/store.js";
import { createStorage } from "../../public/os/storage.js";
const classic = (patch = {}) => ({
  code: "ABCDEF",
  game: "shooting-range",
  phase: "classic",
  roundId: 4,
  active: [0, 1, 2, 3],
  match: { worldMode: "race" },
  players: [0, 1, 2, 3].map((slot) => ({
    slot,
    name: `Name ${slot}`,
    connected: true,
    ready: true,
  })),
  ...patch,
});

test("independent local views exclude only assigned remote screens and keep their original seat indices", () => {
  const room = classic({
    seatViews: [
      { view: 1, slot: 1, where: "remote", label: "Dev's laptop" },
      { view: 2, slot: 2, where: "host" },
    ],
  });
  assert.deepEqual(localViews(room), [0, 2, 3]);
  assert.equal(frameKey(room), "shooting-range:4:0,2,3");
  assert.deepEqual(
    localViews({ ...room, match: { worldMode: "shared" } }),
    [0],
  );
  assert.deepEqual(localViews(classic({ game: "mario-kart" })), [0]);
  assert.deepEqual(
    localViews(
      classic({ active: [0], seatViews: [{ view: 0, where: "remote" }] }),
    ),
    [],
  );
});

test("round URLs preserve the established game authority contract and include local pixel-budget count", () => {
  const room = classic();
  assert.equal(
    gameFrameUrl(room, 2),
    "/games/shooting-range/?party=ABCDEF&round=4&view=2&views=4&shell=os",
  );
  assert.equal(
    gameFrameUrl(
      { ...room, match: { worldMode: "shared", serverSimulation: true } },
      0,
    ),
    "/games/shooting-range/shared.html?party=ABCDEF&round=4&view=0&views=1&shell=os&shared=1",
  );
  const a = frameKey(room),
    b = frameKey({ ...room, roundId: 5 });
  assert.notEqual(a, b);
  assert.equal(frameKey({ ...room, players: [...room.players].reverse() }), a);
  assert.throws(
    () => gameFrameUrl({ ...room, game: "../controller" }, 0),
    RangeError,
  );
  assert.throws(() => gameFrameUrl(room, -1), RangeError);
  assert.ok(!gameFrameUrl(room, 0).includes("token"));
});

test("iframe messages need same origin, a current frame source, and a known message type", () => {
  const source = {},
    foreign = {},
    origin = "https://console.test",
    frames = [{ contentWindow: source }];
  for (const type of ["chonks:loaded", "chonks:home", "chonks:error"])
    assert.equal(
      trustedGameMessage({ source, origin, data: { type } }, origin, frames),
      true,
    );
  for (const event of [
    { source: foreign, origin, data: { type: "chonks:home" } },
    { source, origin: "https://other.test", data: { type: "chonks:home" } },
    { source, origin, data: { type: "host.cmd" } },
    { source, origin, data: null },
  ])
    assert.equal(trustedGameMessage(event, origin, frames), false);
  assert.equal(
    trustedGameMessage(
      { source, origin, data: { type: "chonks:loaded" } },
      origin,
      [],
    ),
    false,
  );
});

test("Results preserves ranks, outcomes, stat values and server verification while formatting golf units", () => {
  const room = classic({
    game: "golf",
    match: { golfMode: "closest" },
    result: {
      status: "completed",
      verification: "attested",
      views: [{ source: "remote" }],
      scores: [
        {
          slot: 1,
          rank: 1,
          score: 1234,
          stats: { bestPutt: 2, ignore: "text" },
        },
        { slot: 0, rank: 2, score: 99999, outcome: "forfeit" },
      ],
    },
    standings: { 1: 4, 0: 0 },
  });
  const result = resultPresentation(room);
  assert.equal(result.winner, "Name 1 takes it!");
  assert.equal(result.unit, "m from pin");
  assert.equal(result.ranked[0].displayScore, "1.23");
  assert.equal(result.ranked[0].score, 1234);
  assert.equal(result.ranked[1].outcomeLabel, "Forfeit");
  assert.equal(result.ranked[0].statsLine, "best putt: 2");
  assert.match(
    result.verification,
    /Scores reported.*Includes remotely reported views/,
  );
  assert.equal(
    resultPresentation({ ...room, match: { golfMode: "skins" } }).ranked[0]
      .displayScore,
    -1234,
  );
  assert.equal(
    resultPresentation({
      ...room,
      result: { status: "no-contest", scores: [] },
    }).winner,
    "Round cancelled · no contest",
  );
  assert.equal(
    resultPresentation({
      ...room,
      result: {
        scores: [
          { slot: 0, rank: 1, score: 1 },
          { slot: 1, rank: 1, score: 1 },
        ],
      },
    }).winner,
    "A perfect tie!",
  );
});

function fakeElement() {
  return {
    children: [],
    dataset: {},
    style: {},
    addEventListener() {},
    removeEventListener() {},
    setAttribute(key, value) {
      this[key] = value;
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    remove() {},
    closest() {
      return null;
    },
  };
}
const settle = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
function fixture(t, initial) {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: fakeElement,
    addEventListener() {},
    removeEventListener() {},
  };
  const store = createStore({
      room: initial,
      connection: "connected",
      serverOffset: 0,
    }),
    storage = createStorage(),
    handles = new Map(),
    definitions = new Map(),
    calls = [],
    phases = [],
    callbacks = new Map(),
    root = fakeElement();
  let modalChoice = "resume";
  const wm = {
    register(entry) {
      definitions.set(entry.id, entry);
    },
    list: () =>
      [...handles.entries()].map(([id, handle]) => ({ id, kind: handle.kind })),
    async open(id) {
      calls.push(["open", id]);
      const handle = {
        kind: definitions.get(id)?.kind || "tool",
        content: {
          update() {},
          setFrame(frame) {
            calls.push(["frame", frame]);
          },
          setPointerShield(on) {
            calls.push(["shield", on]);
          },
          retry() {
            calls.push(["retry"]);
          },
        },
      };
      handles.set(id, handle);
      return handle;
    },
    async close(id) {
      if (handles.has(id)) calls.push(["close", id]);
      handles.delete(id);
    },
    async modal(props) {
      calls.push(["modal", props]);
      return modalChoice;
    },
    update() {},
  };
  const session = {
    on(name, fn) {
      callbacks.set(name, fn);
      return () => callbacks.delete(name);
    },
    async pause() {
      calls.push(["pause"]);
      store.set({
        room: { ...store.get().room, paused: !store.get().room.paused },
      });
      return { ok: true };
    },
    async lobby() {
      calls.push(["lobby"]);
      return { ok: true };
    },
    async cmd(name) {
      calls.push(["cmd", name]);
      return { ok: true };
    },
    async extend() {
      calls.push(["extend"]);
      return { ok: true };
    },
    async nextPlayer() {
      calls.push(["next-player"]);
      return { ok: true };
    },
  };
  const host = createGameHost({
    wm,
    store,
    getSession: () => session,
    storage,
    root,
    onPhase: (phase) => phases.push(phase),
  });
  t.after(() => {
    host.destroy();
    globalThis.document = previous;
  });
  return {
    host,
    wm,
    store,
    storage,
    calls,
    callbacks,
    definitions,
    handles,
    phases,
    setChoice(value) {
      modalChoice = value;
    },
  };
}

test("round lifecycle opens one surface, forwards frames, opens Results once and records completed rounds", async (t) => {
  const f = fixture(t, classic({ phase: "lobby" }));
  await settle();
  assert.equal(f.handles.size, 0);
  f.store.set({ room: classic() });
  await settle();
  assert.ok(f.handles.has("game-window"));
  f.store.set({ room: { ...f.store.get().room, paused: true } });
  await settle();
  assert.equal(
    f.calls.filter(([kind, id]) => kind === "open" && id === "game-window")
      .length,
    1,
  );
  f.callbacks.get("frame")({ game: "shooting-range", players: [] });
  assert.equal(f.calls.at(-1)[0], "frame");
  const results = {
    ...classic(),
    phase: "results",
    result: {
      status: "completed",
      matchId: "round-4",
      verification: "verified",
      scores: [{ slot: 0, rank: 1, score: 80, outcome: "finished" }],
    },
  };
  f.store.set({ room: results });
  await settle();
  assert.ok(!f.handles.has("game-window"));
  assert.ok(f.handles.has("results"));
  assert.equal(f.storage.read("records.ABCDEF").length, 1);
  assert.deepEqual(
    { ...f.storage.read("last-score.shooting-range"), at: 0 },
    { score: 80, unit: "points", at: 0 },
  );
  f.store.set({ room: { ...results, serverTime: 99 } });
  await settle();
  assert.equal(f.storage.read("records.ABCDEF").length, 1);
  assert.equal(
    f.calls.filter(([kind, id]) => kind === "open" && id === "results").length,
    1,
  );
  f.store.set({ room: { ...results, phase: "lobby" } });
  await settle();
  assert.ok(!f.handles.has("results"));
  assert.deepEqual(f.phases, ["lobby", "game", "results", "lobby"]);
});

test("home opens Pause without ending the round; End is a separate confirmed session action", async (t) => {
  const f = fixture(t, classic());
  await settle();
  await f.host.openPause();
  assert.equal(f.calls.filter(([kind]) => kind === "pause").length, 2);
  assert.ok(!f.calls.some(([kind]) => kind === "lobby"));
  const modal = f.calls.find(([kind]) => kind === "modal")[1];
  assert.equal(modal.cancelButton, "resume");
  f.setChoice("end");
  await f.host.openPause();
  assert.equal(f.calls.filter(([kind]) => kind === "lobby").length, 1);
  assert.ok(activeRound(f.store.get().room));
  assert.deepEqual(
    f.host.gameActions().map((entry) => entry.id),
    ["pause", "extend", "end-game"],
  );
  f.store.set({ room: { ...f.store.get().room, match: { maxHumans: 1 } } });
  assert.ok(
    !f.host.gameActions().some((entry) => entry.id === "next-player"),
    "automatic one-player mode is not the explicit solo queue",
  );
  f.store.set({ room: { ...f.store.get().room, setup: { mode: "solo" } } });
  assert.ok(f.host.gameActions().some((entry) => entry.id === "next-player"));
});

test("loading offers recovery after 20 seconds and Retry delegates to the current surface", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(t, classic());
  await settle();
  f.host.setLoading({ gameId: "shooting-range", ready: 1, total: 2 });
  await settle();
  assert.ok(f.handles.has("loading"));
  t.mock.timers.tick(19999);
  assert.ok(!f.host.loading().slow);
  t.mock.timers.tick(1);
  assert.equal(f.host.loading().slow, true);
  await f.host.retry();
  assert.ok(f.calls.some(([name]) => name === "retry"));
  f.host.setLoading(null);
  await settle();
  assert.ok(!f.handles.has("loading"));
  assert.equal(f.phases.at(-1), "loaded");
  f.host.setLoading(null);
  assert.equal(f.phases.filter((phase) => phase === "loaded").length, 1);
});

test("solo forfeits and no-contests are neutral; legacy demo results remain readable", () => {
  for (const outcome of ["forfeit", "dnf", "removed"]) {
    const result = resultPresentation(
      classic({
        result: {
          status: "completed",
          scores: [{ slot: 0, rank: 1, score: 99, outcome }],
        },
      }),
    );
    assert.equal(result.winner, "Round ended");
    assert.equal(result.subtitle, "Ready for another go?");
  }
  const cancelled = resultPresentation(
    classic({
      result: {
        status: "no-contest",
        scores: [{ slot: 0, rank: 1, score: 99 }],
      },
    }),
  );
  assert.equal(cancelled.winner, "Round cancelled · no contest");
  assert.equal(cancelled.subtitle, "Ready for another go?");
  const demo = resultPresentation(
    classic({ result: { verified: true, scores: [{ slot: 0, score: 10 }] } }),
  );
  assert.equal(demo.ranked[0].displayScore, 10);
  assert.equal(
    demo.verification,
    "",
    "legacy demo booleans must not imply server verification",
  );
});

test("stored last score preserves server order for lower-scoring games and ignores unfinished winners", async (t) => {
  const f = fixture(
    t,
    classic({
      game: "golf",
      phase: "results",
      result: {
        status: "completed",
        matchId: "golf-1",
        scores: [
          { slot: 0, score: 4 },
          { slot: 1, score: 7 },
        ],
      },
    }),
  );
  await settle();
  assert.deepEqual(
    { ...f.storage.read("last-score.golf"), at: 0 },
    { score: 4, unit: "strokes", at: 0 },
  );
  f.store.set({
    room: classic({
      game: "golf",
      phase: "results",
      result: {
        status: "completed",
        matchId: "golf-2",
        scores: [{ slot: 0, score: 999, outcome: "forfeit" }],
      },
    }),
  });
  await settle();
  assert.equal(f.storage.read("last-score.golf").score, 4);
});
