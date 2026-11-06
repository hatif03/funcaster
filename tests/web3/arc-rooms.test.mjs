import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createArcRooms } from "../../server/web3/arc-rooms.cjs";
import { loadConfig } from "../../integrations/shared/config.mjs";
import { createMockArcProvider } from "../../integrations/arc/mock.mjs";
import { hash } from "../../server/records.cjs";
import { createOutbox, listJobs } from "../../integrations/shared/outbox.mjs";
import { createWorker } from "../../integrations/shared/worker.mjs";
async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "chonks-a56-"));
  let time = Date.now(),
    up = true;
  const now = () => time,
    accounts = [0, 1].map(() => privateKeyToAccount(generatePrivateKey()));
  const config = loadConfig({ PARTNERS: "mock", WEB3_DATA_DIR: dir });
  const room = {
    code: "ABCD23",
    game: "star-catch",
    phase: "lobby",
    created: time,
    setup: { mode: "multiplayer", cpuCount: 0, bot: false },
    players: accounts.map((a, slot) => ({
      slot,
      address: a.address,
      token: `token${slot}`,
      socket: `socket${slot}`,
      ready: true,
    })),
    roundId: 1,
    active: [0, 1],
  };
  const jobs = [],
    queue = [],
    provider = createMockArcProvider(dir, { now });
  const arc = createArcRooms({
    config,
    now,
    workerUp: () => up,
    resolveRoster: async () => ({
      seats: accounts.map((a) => ({ address: a.address })),
    }),
    enqueue: (room, input, apply) => {
      const j = { ...input, room: room.code };
      jobs.push(j);
      queue.push({ j, apply });
    },
  });
  const phones = room.players.map((p) => {
    const handlers = {},
      out = [];
    const socket = {
      id: p.socket,
      handshake: { address: "127.0.0.1" },
      on: (event, fn) => (handlers[event] = fn),
      emit: (event, value) => out.push({ event, value }),
    };
    const m = { role: "player", room, player: p };
    arc.bind(
      socket,
      () => m,
      () => {},
    );
    arc.joined(socket, m);
    return {
      out,
      send: (data) =>
        new Promise((resolve) => handlers["web3.sign"](data, resolve)),
      request: (kind) => out.filter((v) => v.value.kind === kind).at(-1)?.value,
    };
  });
  async function flush() {
    while (queue.length) {
      const { j, apply } = queue.shift();
      const result = await provider.execute(j);
      apply({ status: "done", ...result });
    }
  }
  async function fund() {
    assert.deepEqual(
      await arc.choose(room, { rung: 1, amount: "0.50", rule: "winner" }),
      { ok: true },
    );
    assert.ok(arc.startReason(room));
    await flush();
    await arc.poll();
    for (let i = 0; i < 2; i++) {
      const r = phones[i].request("terms");
      assert.ok(r);
      const signature = {
        accept: await accounts[i].signTypedData(r.typedData.accept),
        fund: await accounts[i].signTypedData(r.typedData.fund),
      };
      assert.deepEqual(await phones[i].send({ id: r.id, signature }), {
        ok: true,
      });
    }
    await flush();
    time += 1000;
    await arc.poll();
    assert.equal(arc.startReason(room), null);
    assert.equal(arc.view(room).status, "locked");
  }
  function finish(status = "completed") {
    room.startedAt = time;
    room.phase = "playing";
    arc.started(room);
    time += 61000;
    const base = {
      matchId: `${room.code}.${room.roundId}`,
      gameId: "chonks.star-catch",
      version: "1.1.0",
      bundleHash: "a".repeat(64),
      startedAt: room.startedAt,
      endedAt: time,
      status,
      verification: "verified",
      scores: [
        { slot: 0, rank: 1 },
        { slot: 1, rank: 2 },
      ],
    };
    const result = { ...base, hash: hash(base) };
    room.result = result;
    room.phase = "results";
    arc.finish(room, { result });
    return result;
  }
  t.after(async () => {
    arc.close();
    await new Promise((r) => setTimeout(r, 30));
    await rm(dir, { recursive: true, force: true });
  });
  return {
    arc,
    room,
    phones,
    accounts,
    jobs,
    flush,
    fund,
    finish,
    advance: (ms) => (time += ms),
    offline: () => (up = false),
  };
}
test("A6 mock bankroll uses the production outbox/worker receipt interface", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "chonks-arc-worker-"));
  const outbox = createOutbox(dir),
    worker = createWorker({
      dir,
      providers: { arc: createMockArcProvider(dir) },
    });
  t.after(async () => {
    await outbox.close();
    await worker.close();
    await rm(dir, { recursive: true, force: true });
  });
  await outbox.enqueue({
    type: "arc.drip",
    room: "ABCD23",
    idempotencyKey: "mock-drip",
    payload: {
      asset: "usdc",
      address: privateKeyToAccount(generatePrivateKey()).address,
      device: "a".repeat(64),
      ip: "b".repeat(64),
    },
  });
  await worker.poll();
  assert.equal((await listJobs(dir)).length, 0);
});
test("A5/A6: confirmed funding gates start, two real signatures settle and both claims complete", async (t) => {
  const f = await fixture(t);
  await f.fund();
  f.finish();
  await f.arc.poll();
  f.advance(5001);
  for (let i = 0; i < 2; i++) {
    const r = f.phones[i].request("settle");
    assert.ok(r);
    assert.deepEqual(
      await f.phones[i].send({
        id: r.id,
        signature: await f.accounts[i].signTypedData(r.typedData),
      }),
      { ok: true },
    );
  }
  await f.arc.poll();
  await f.flush();
  f.advance(1000);
  await f.arc.poll();
  await f.flush();
  f.advance(1000);
  await f.arc.poll();
  assert.equal(f.arc.view(f.room).status, "settled");
  assert.equal(f.arc.view(f.room).claimsComplete, true);
  assert.equal(f.jobs.filter((j) => j.type === "arc.pot.settle").length, 1);
  assert.equal(f.jobs.filter((j) => j.type === "arc.pot.claim").length, 2);
  assert.ok(
    !JSON.stringify(f.arc.view(f.room)).includes(f.accounts[0].address),
  );
});
test("A6: dispute blocks agreement; delayed oracle proposal is contested and refunded", async (t) => {
  const f = await fixture(t);
  await f.fund();
  f.finish();
  await f.arc.poll();
  const r = f.phones[0].request("settle");
  assert.deepEqual(
    await f.phones[0].send({
      id: r.id,
      disputed: true,
      signature: await f.accounts[0].signTypedData(r.contestData),
    }),
    { ok: true },
  );
  f.advance(60001);
  await f.arc.poll();
  await f.flush();
  f.advance(1000);
  await f.arc.poll();
  await f.flush();
  f.advance(1000);
  await f.arc.poll();
  await f.flush();
  f.advance(1000);
  await f.arc.poll();
  await f.flush();
  f.advance(1000);
  await f.arc.poll();
  assert.equal(f.arc.view(f.room).status, "refunded");
  assert.equal(f.arc.view(f.room).claimsComplete, true);
  assert.equal(
    f.jobs.filter(
      (j) => j.type === "arc.pot.settle" || j.type === "arc.pot.finalize",
    ).length,
    0,
  );
});
test("A5: abandoned round never settles and refunds at its deadline", async (t) => {
  const f = await fixture(t);
  await f.fund();
  f.finish("no-contest");
  await f.arc.poll();
  assert.equal(f.arc.view(f.room).status, "refund-pending");
  f.advance(901000);
  await f.arc.poll();
  await f.flush();
  f.advance(1000);
  await f.arc.poll();
  assert.equal(f.arc.view(f.room).status, "refunded");
  assert.ok(
    !f.jobs.some((j) =>
      ["arc.pot.settle", "arc.pot.propose", "arc.pot.finalize"].includes(
        j.type,
      ),
    ),
  );
});
test("A5: stale worker and changed rules prevent start; cancellation restores unstaked play", async (t) => {
  const f = await fixture(t);
  await f.fund();
  f.room.setup.interaction = true;
  assert.match(f.arc.startReason(f.room), /changed/);
  f.room.setup.interaction = false;
  f.offline();
  assert.ok(f.arc.startReason(f.room));
  assert.deepEqual(await f.arc.choose(f.room, { cancel: true }), { ok: true });
  assert.equal(f.arc.startReason(f.room), null);
});
test("A6: a different seat cannot reply to a private terms request", async (t) => {
  const f = await fixture(t);
  await f.arc.choose(f.room, { rung: 1, amount: "0.50", rule: "winner" });
  await f.flush();
  await f.arc.poll();
  const r = f.phones[0].request("terms");
  assert.ok((await f.phones[1].send({ id: r.id, declined: true })).error);
  assert.deepEqual(await f.phones[0].send({ id: r.id, declined: true }), {
    ok: true,
  });
  assert.match(f.arc.startReason(f.room), /Cancel stakes/);
});
