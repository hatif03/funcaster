import test from "node:test";
import assert from "node:assert/strict";
import { createEnsRooms } from "../../server/web3/ens-rooms.cjs";
test("record updates coalesce for two seconds, preserve every result and flush before a seat is released", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const jobs = [],
    p = { slot: 0, token: "private", address: `0x${"12".repeat(20)}` },
    room = {
      code: "ROOMAA",
      created: 1,
      game: "golf",
      players: [p],
      match: {},
    };
  const ens = createEnsRooms({
    config: { WEB3_ENS: "mock" },
    enqueue: (_room, input) => jobs.push(input),
  });
  t.after(() => ens.close());
  ens.observe(room);
  const binding = ens.binding(p);
  for (let i = 0; i < 100; i++) ens.observe(room);
  assert.equal(jobs.length, 2);
  room.game = "pong";
  ens.observe(room);
  t.mock.timers.tick(1000);
  room.game = "golf";
  ens.observe(room);
  assert.equal(jobs.length, 2);
  const result = {
    matchId: "round-1",
    hash: "a".repeat(64),
    scores: [{ slot: 0, rank: 1 }],
  };
  ens.finish(room, result);
  t.mock.timers.tick(1000);
  assert.equal(jobs.length, 3);
  assert.equal(jobs[2].payload.records["chonks.game"], "chonks.golf");
  assert.equal(jobs[2].payload.records["chonks.receipt"], result.hash);
  assert.deepEqual(jobs[2].payload.seats, [
    { seatId: binding.id, last: `${result.matchId}:${result.hash}:1` },
  ]);
  ens.finish(room, { ...result, hash: "b".repeat(64) });
  ens.finish(room, { ...result, hash: "c".repeat(64) });
  ens.release(p);
  assert.deepEqual(
    jobs.slice(3).map((j) => j.type),
    ["ens.record.set", "ens.record.set", "ens.seat.release"],
  );
  assert.deepEqual(
    jobs
      .filter((j) => j.type === "ens.record.set")
      .map((j) => j.payload.records["chonks.receipt"]),
    ["a".repeat(64), "b".repeat(64), "c".repeat(64)],
  );
});
test("a replacement player never receives the previous player's last-match record", (t) => {
  const jobs = [],
    p = { slot: 0, token: "old", address: `0x${"12".repeat(20)}` },
    room = {
      code: "ROOMAA",
      created: 1,
      game: "golf",
      players: [p],
      match: {},
    };
  const ens = createEnsRooms({
    config: { WEB3_ENS: "mock" },
    enqueue: (_room, input) => jobs.push(input),
  });
  t.after(() => ens.close());
  ens.observe(room);
  ens.release(p);
  room.players[0] = { ...p, token: "new", address: `0x${"34".repeat(20)}` };
  ens.observe(room);
  ens.finish(room, {
    matchId: "round",
    hash: "a".repeat(64),
    scores: [{ slot: 0, rank: 1 }],
  });
  ens.end(room);
  assert.deepEqual(
    jobs.find((j) => j.type === "ens.record.set").payload.seats,
    [],
  );
});
