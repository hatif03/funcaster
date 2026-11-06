const test = require("node:test"),
  assert = require("node:assert/strict");
const { SharedRound, verifyShared } = require("../../server/shared-round.cjs");
const { fixture, emit, FakePhone, wait } = require("./harness.cjs");
const ids = {
  "mario-kart": "chonks.kart-rush",
  "table-tennis": "chonks.table-tennis",
  swordplay: "chonks.foam-fencers",
};
test("shared rounds reproduce scores and reject malformed journals", () => {
  for (const id of Object.keys(ids)) {
    const r = new SharedRound(id, { seed: 82, laps: 1, cpuCount: 0 }, 2);
    r.action(0, "right");
    r.action(0, "confirm");
    r.action(1, "confirm");
    for (let i = 0; i < 1800 && !r.done; i++) {
      if (i % 61 === 0) {
        r.action(0, "primary");
        r.action(1, "primary");
      }
      r.advance(1 / 60, [
        { x: Math.sin(i / 80), y: 0, gas: true, active: true },
        { x: 0, y: 0.5, active: false },
      ]);
    }
    const replay = {
        gameId: ids[id],
        setup: r.setup,
        seed: 82,
        slots: [1, 3],
        sharedFrames: r.frames,
      },
      scores = r.scores().map((s) => ({ ...s, slot: [1, 3][s.slot] }));
    assert.equal(verifyShared(replay, scores), true, id);
    assert.equal(
      verifyShared(
        replay,
        scores.map((s) => ({ ...s, score: s.score + 1 })),
      ),
      false,
    );
    assert.equal(
      verifyShared(
        {
          ...replay,
          sharedFrames: [
            [
              [
                [0, 0, 16],
                [0, 0, 1],
              ],
              [],
            ],
          ],
        },
        scores,
      ),
      false,
    );
    assert.ok(JSON.stringify(r.snapshot()).length < 250000);
  }
});
async function room(t, game = "mario-kart") {
  const f = await fixture(t, { arcade: true, remoteViews: true });
  const host = await f.connect(),
    h = await emit(host, "host");
  await emit(host, "remote.configure", { enabled: true });
  const display = await f.connect(),
    d = await emit(display, "display", { code: h.code, token: h.displayToken });
  await emit(display, "display.ready", { ready: true });
  const phones = [];
  for (let i = 0; i < 2; i++) {
    const p = new FakePhone(f, h.code);
    await p.join();
    p.ready();
    phones.push(p);
  }
  await f.advance(20);
  await emit(host, "assign-seat", { slot: 1, ref: d.ref });
  host.emit("select", { game });
  await f.advance(20);
  host.emit("start");
  await f.advance(20);
  const state = f.party.rooms.get(h.code),
    local = await f.connect();
  const details = { code: h.code, game, roundId: state.roundId };
  const ack = await emit(local, "screen", { ...details, token: h.token });
  assert.equal(ack.authority, false);
  assert.equal(ack.setup.serverSimulation, true);
  const connectView = async (key = d.resumeKey) => {
    const s = await f.connect();
    await emit(s, "watch-game", {
      ...details,
      token: h.displayToken,
      resumeKey: key,
    });
    return s;
  };
  return { ...f, host, h, display, d, phones, room: state, local, connectView };
}
test("online Kart waits for paired views; viewers cannot forge scores and reload resumes the same race", async (t) => {
  const f = await room(t);
  await f.advance(500);
  assert.equal(f.room.shared.tick, 0);
  const impostor = await f.connectView("wrong");
  await f.advance(200);
  assert.equal(f.room.shared.tick, 0);
  const remote = await f.connectView();
  await f.advance(100);
  assert.ok(f.room.shared.tick > 0);
  const game = f.room.shared.game;
  assert.ok(
    (await emit(f.local, "replay-chunk", { sequence: 0, calls: [["init"]] }))
      .error,
  );
  assert.ok(
    (
      await emit(f.local, "match.finish", {
        scores: [
          { slot: 0, score: 1 },
          { slot: 1, score: 2 },
        ],
      })
    ).error,
  );
  f.local.emit("snapshot", { clock: 999, state: { state: "results" } });
  f.local.emit("score", {
    scores: [
      { slot: 0, score: 999 },
      { slot: 1, score: 999 },
    ],
  });
  await emit(f.local, "ping-check");
  await f.advance(100);
  assert.notEqual(f.room.progress[0], 999);
  assert.notEqual(f.room.shared.game.state, "results");
  for (const p of f.phones) p.socket.emit("action", { action: "confirm" });
  // Acknowledge each ordered socket stream before advancing the fake clock.
  // Otherwise a busy CI runner can tick before either confirm is delivered.
  await Promise.all(f.phones.map((p) => emit(p.socket, "ping-check")));
  await f.advance(100);
  assert.equal(f.room.shared.game.state, "countdown");
  remote.disconnect();
  await wait(10);
  await f.advance(100);
  const tick = f.room.shared.tick;
  assert.ok(f.room.sharedWaiting);
  await f.advance(2000);
  assert.equal(f.room.shared.tick, tick);
  const replacement = await f.connectView();
  await f.advance(100);
  assert.equal(f.room.shared.game, game);
  assert.ok(f.room.shared.tick > tick);
  assert.equal(f.room.outcomes[1], undefined);
  replacement.disconnect();
  await wait(10);
  await f.advance(10001);
  assert.equal(f.room.outcomes[1], "forfeit");
  assert.equal(f.room.phase, "results");
  assert.equal(f.room.result.verification, "verified");
  assert.equal(f.room.result.simulation, "server");
});
test("online duel uses server scores; host pause freezes simulation", async (t) => {
  for (const game of ["table-tennis", "swordplay"]) {
    const f = await room(t, game);
    await f.connectView();
    await f.advance(100);
    assert.ok(f.room.shared.tick > 0);
    f.host.emit("pause", { paused: true });
    await wait(10);
    await f.advance(100);
    const before = f.room.shared.tick;
    await f.advance(1000);
    assert.equal(f.room.shared.tick, before);
    f.host.emit("pause", { paused: false });
    await wait(10);
    await f.advance(100);
    assert.ok(f.room.shared.tick > before);
  }
});

test("four-player shared Kart completes a race and its journal replays", () => {
  const r = new SharedRound(
    "mario-kart",
    { seed: 391, laps: 1, cpuCount: 2 },
    4,
  );
  for (let i = 0; i < 4; i++) r.action(i, "confirm");
  const input = Array.from({ length: 4 }, () => ({
    active: false,
    x: 0,
    y: 0,
  }));
  for (let i = 0; i < 36000 && !r.done; i++) r.advance(1 / 60, input);
  assert.ok(r.done);
  assert.equal(
    verifyShared(
      {
        gameId: ids["mario-kart"],
        seed: 391,
        setup: r.setup,
        slots: [0, 1, 2, 3],
        sharedFrames: r.frames,
      },
      r.scores(),
    ),
    true,
  );
});
test("loss of the main game frame is bounded and ends without inventing a winner", async (t) => {
  const f = await room(t);
  await f.connectView();
  await f.advance(100);
  f.local.disconnect();
  await wait(10);
  await f.advance(100);
  assert.ok(f.room.sharedWaiting);
  await f.advance(10001);
  assert.equal(f.room.phase, "results");
  assert.equal(f.room.result.status, "no-contest");
});

test("a host pause freezes the main frame recovery deadline", async (t) => {
  const f = await room(t);
  await f.connectView();
  await f.advance(100);
  f.local.disconnect();
  await wait(10);
  await f.advance(100);
  f.host.emit("pause", { paused: true });
  await wait(10);
  await f.advance(20000);
  assert.equal(f.room.phase, "classic");
  f.host.emit("pause", { paused: false });
  await wait(10);
  await f.advance(10001);
  assert.equal(f.room.result.status, "no-contest");
});
