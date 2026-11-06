import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEnsLifecycle } from "../../integrations/ens/lifecycle.mjs";
import { partyLabel, seatLabel } from "../../integrations/ens/labels.mjs";
import { sanitizeName } from "../../server/web3/names.cjs";
import { readRecord } from "../../integrations/ens/lifecycle-calls.mjs";
import { zeroAddress } from "viem";
import { chainFixture, address } from "./fixtures/ens-chain.mjs";

const room = { partyId: "round:1", code: "ABCDEF", game: "chonks.golf" };
const player = {
  partyId: room.partyId,
  seatId: "binding:1",
  slot: 0,
  nickname: "Asha",
  address: address(20),
  shape: "circle",
  color: "#FFCC00",
};
async function fixture(t, config = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-ens-lifecycle-")),
    f = chainFixture();
  Object.assign(f.config, config);
  let adapter;
  const start = async () => {
    adapter = await createEnsLifecycle({ dir, ...f });
    return adapter;
  };
  t.after(async () => {
    await adapter?.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { ...f, dir, start, adapter: await start() };
}
test("warm pool reserves unique pairs, refills, opens three transactions and reopens with zero writes", async (t) => {
  const f = await fixture(t);
  await f.adapter.refill();
  assert.equal(f.calls.length, 4);
  const p = await f.adapter.open(room);
  assert.equal(f.calls.length, 7);
  assert.deepEqual(await f.adapter.open(room), p);
  assert.equal(f.calls.length, 7);
  await f.adapter.refill();
  assert.equal(f.calls.length, 9);
  const p2 = await f.adapter.open({
    ...room,
    partyId: "round:2",
    code: "UVWXYZ",
  });
  assert.notEqual(p.registry, p2.registry);
  assert.notEqual(p.resolver, p2.resolver);
  assert.equal(
    (await stat(path.join(f.dir, "ens/lifecycle.json"))).mode & 0o777,
    0o600,
  );
});
test("cold open works at zero pool size and serializes concurrent callers", async (t) => {
  const f = await fixture(t, { ENS_WARM_POOL: 0 });
  const [a, b] = await Promise.all([
    f.adapter.open(room),
    f.adapter.open(room),
  ]);
  assert.deepEqual(a, b);
  assert.equal(f.calls.length, 5);
});
test("second process cannot share the ENS lifecycle store", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    createEnsLifecycle({ ...f, dir: f.dir }),
    /already owns/,
  );
});
test("invalid protocol configuration does not strand a process lock", async (t) => {
  const f = await fixture(t);
  await f.adapter.close();
  await assert.rejects(
    createEnsLifecycle({ ...f, protocol: { ...f.protocol, chainId: 1 } }),
    (e) => e.code === "WRONG_CHAIN",
  );
  const adapter = await f.start();
  assert.equal((await adapter.open(room)).status, "ready");
});
test("party collision picks another label without replacing an existing name", async (t) => {
  const f = await fixture(t);
  f.occupy(f.playRegistry, partyLabel(room.code));
  const p = await f.adapter.open(room);
  assert.equal(p.name.split(".")[0], partyLabel(room.code, 1));
});
test("changed idempotency payload is rejected without a write", async (t) => {
  const f = await fixture(t);
  await f.adapter.open(room);
  const count = f.calls.length;
  await assert.rejects(
    f.adapter.open({ ...room, code: "ZZZZZZ" }),
    (e) => e.code === "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(f.calls.length, count);
});
for (const suffix of [
  ":registry",
  ":resolver",
  ":parent",
  ":records",
  ":register",
])
  test(`restart reconciles party crash after ${suffix} without repeated effects`, async (t) => {
    const f = await fixture(t);
    f.crashAfter(suffix);
    await assert.rejects(f.adapter.open(room), /post-send crash/);
    await f.adapter.close();
    const adapter = await f.start();
    assert.equal((await adapter.open(room)).status, "ready");
    assert.equal(f.calls.length, 5);
  });
test("a mismatched proxy is rejected instead of reinitialized", async (t) => {
  const f = await fixture(t);
  await f.adapter.refill();
  f.proxies.values().next().value.implementation = address(999);
  await assert.rejects(
    f.adapter.open(room),
    (e) => e.code === "UNTRUSTED_REGISTRY",
  );
});
test("seat mint is soulbound, bounded by party expiry and idempotent", async (t) => {
  const f = await fixture(t);
  const p = await f.adapter.open(room),
    s = await f.adapter.mint(player);
  const registration = f.calls
    .filter((x) => x.functionName === "register")
    .at(-1);
  assert.equal(registration.args[4], 0n);
  assert.equal(String(registration.args[5]), p.expiresAt);
  assert.equal(s.address, player.address);
  assert.equal(s.name, `asha.${p.name}`);
  const count = f.calls.length;
  assert.deepEqual(await f.adapter.mint(player), s);
  assert.equal(f.calls.length, count);
});
test("seat collisions, shared keys and occupied slots cannot overwrite another seat", async (t) => {
  const f = await fixture(t);
  const p = await f.adapter.open(room);
  f.occupy(p.registry, "asha");
  assert.equal((await f.adapter.mint(player)).name, `asha-2.${p.name}`);
  const count = f.calls.length;
  for (const input of [
    { ...player, seatId: "second", slot: 1 },
    { ...player, seatId: "second", address: address(21) },
  ])
    await assert.rejects(
      f.adapter.mint(input),
      (e) => e.code === "SEAT_OCCUPIED",
    );
  assert.equal(f.calls.length, count);
});
test("seat release is idempotent and a new binding may reuse the label", async (t) => {
  const f = await fixture(t);
  await f.adapter.open(room);
  const first = await f.adapter.mint(player);
  await f.adapter.release(room.partyId, player.seatId);
  const count = f.calls.length;
  await f.adapter.release(room.partyId, player.seatId);
  assert.equal(f.calls.length, count);
  await assert.rejects(
    f.adapter.mint(player),
    (e) => e.code === "SEAT_RELEASED",
  );
  const second = await f.adapter.mint({
    ...player,
    seatId: "binding:2",
    address: address(22),
  });
  assert.equal(first.name, second.name);
  await f.adapter.release(room.partyId, player.seatId);
  assert.equal(f.calls.at(-1).functionName, "multicall");
});
for (const suffix of [":clear", ":release"])
  test(`seat release resumes after ${suffix} without duplicate effects or stale address records`, async (t) => {
    const f = await fixture(t);
    const p = await f.adapter.open(room),
      seat = await f.adapter.mint(player);
    f.crashAfter(suffix);
    await assert.rejects(
      f.adapter.release(room.partyId, player.seatId),
      /post-send crash/,
    );
    await f.adapter.close();
    const adapter = await f.start();
    assert.deepEqual(await adapter.release(room.partyId, player.seatId), {
      status: "released",
    });
    assert.equal(f.calls.length, 9);
    assert.equal(
      await readRecord(f.client, p.resolver, seat.name),
      zeroAddress,
    );
    assert.equal(
      await readRecord(f.client, p.resolver, seat.name, "chonks.seat"),
      "",
    );
    assert.equal(
      await readRecord(f.client, p.resolver, seat.name, "chonks.last"),
      "",
    );
  });
test("a partially minted seat must reconcile its registration before release", async (t) => {
  const f = await fixture(t);
  await f.adapter.open(room);
  f.crashAfter(":register");
  await assert.rejects(f.adapter.mint(player), /post-send crash/);
  const count = f.calls.length;
  await assert.rejects(
    f.adapter.release(room.partyId, player.seatId),
    (e) => e.code === "SEAT_CHANGED",
  );
  assert.equal(f.calls.length, count);
  await f.adapter.mint(player);
  await f.adapter.release(room.partyId, player.seatId);
  assert.equal(f.calls.length, 9);
});
test("registrar cannot be a soulbound phone seat", async (t) => {
  const f = await fixture(t);
  await f.adapter.open(room);
  const count = f.calls.length;
  await assert.rejects(
    f.adapter.mint({ ...player, address: f.owner }),
    (e) => e.code === "INVALID_JOB",
  );
  assert.equal(f.calls.length, count);
});
test("host-side unregister still clears the released seat's wildcard address", async (t) => {
  const f = await fixture(t);
  const p = await f.adapter.open(room),
    seat = await f.adapter.mint(player);
  f.occupy(p.registry, "asha", { status: 0 });
  assert.equal(
    await readRecord(f.client, p.resolver, seat.name),
    player.address,
  );
  const count = f.calls.length;
  await f.adapter.release(room.partyId, player.seatId);
  assert.equal(f.calls.length, count + 1);
  assert.equal(await readRecord(f.client, p.resolver, seat.name), zeroAddress);
  assert.equal(f.calls.at(-1).functionName, "multicall");
});
test("a lifecycle store cannot silently change its namespace, signer or origin", async (t) => {
  const f = await fixture(t);
  await f.adapter.open(room);
  await f.adapter.close();
  const saved = await readFile(path.join(f.dir, "ens/lifecycle.json"), "utf8");
  for (const override of [
    { ENS_PARENT: "another.eth" },
    { ENS_REGISTRAR_ADDRESS: address(44) },
    { PUBLIC_ORIGIN: "https://changed.example" },
  ]) {
    await assert.rejects(
      createEnsLifecycle({ ...f, config: { ...f.config, ...override } }),
      (e) => e.code === "STATE_CONFLICT",
    );
    assert.equal(
      await readFile(path.join(f.dir, "ens/lifecycle.json"), "utf8"),
      saved,
    );
  }
});
test("ENS lifecycle resumes PostgreSQL JSONB-reordered context without repeating writes", async (t) => {
  const f = await fixture(t),
    opened = await f.adapter.open(room),
    writes = f.calls.length;
  await f.adapter.close();
  const file = path.join(f.dir, "ens/lifecycle.json"),
    saved = JSON.parse(await readFile(file, "utf8"));
  saved.context = Object.fromEntries(Object.entries(saved.context).reverse());
  await writeFile(file, JSON.stringify(saved));
  const resumed = await f.start();
  assert.deepEqual(await resumed.open(room), opened);
  assert.equal(f.calls.length, writes);
});
test("a revoked seat is not silently reminted and a new registration is not released", async (t) => {
  const f = await fixture(t);
  const p = await f.adapter.open(room);
  await f.adapter.mint(player);
  f.occupy(p.registry, "asha", { status: 0 });
  await assert.rejects(
    f.adapter.mint(player),
    (e) => e.code === "SEAT_CHANGED",
  );
  f.occupy(p.registry, "asha", { latestOwner: player.address });
  await assert.rejects(
    f.adapter.release(room.partyId, player.seatId),
    (e) => e.code === "SEAT_CHANGED",
  );
});
for (const suffix of [":register", ":records"])
  test(`seat mint survives a post-send crash after ${suffix}`, async (t) => {
    const f = await fixture(t);
    await f.adapter.open(room);
    f.crashAfter(suffix);
    await assert.rejects(f.adapter.mint(player), /post-send crash/);
    await f.adapter.close();
    const a = await f.start();
    assert.equal((await a.mint(player)).status, "ready");
    assert.equal(f.calls.length, 7);
  });
test("end is idempotent, never recycles a used resolver and prevents reopening", async (t) => {
  const f = await fixture(t);
  const p = await f.adapter.open(room);
  await f.adapter.end(room.partyId);
  const count = f.calls.length;
  await f.adapter.end(room.partyId);
  assert.equal(f.calls.length, count);
  await assert.rejects(f.adapter.open(room), (e) => e.code === "PARTY_ENDED");
  await assert.rejects(
    f.adapter.mint(player),
    (e) => e.code === "PARTY_NOT_READY",
  );
  const next = await f.adapter.open({ ...room, partyId: "round:2" });
  assert.notEqual(p.resolver, next.resolver);
});
test("expiry uses chain time, refuses new seats and ends without another transaction", async (t) => {
  const f = await fixture(t);
  await f.adapter.open(room);
  f.advance(14401);
  const count = f.calls.length;
  await assert.rejects(
    f.adapter.mint(player),
    (e) => e.code === "PARTY_CHANGED",
  );
  await f.adapter.end(room.partyId);
  assert.equal(f.calls.length, count);
});
test("party end reconciles a crash after unregister without a second effect", async (t) => {
  const f = await fixture(t);
  await f.adapter.open(room);
  f.crashAfter(":end");
  await assert.rejects(f.adapter.end(room.partyId), /post-send crash/);
  const count = f.calls.length;
  await f.adapter.close();
  const adapter = await f.start();
  assert.deepEqual(await adapter.end(room.partyId), { status: "ended" });
  assert.equal(f.calls.length, count);
  await assert.rejects(adapter.open(room), (e) => e.code === "PARTY_ENDED");
});
test("200 hostile nicknames deterministically produce safe non-reserved seat labels", () => {
  const hostile = [
    "",
    "a",
    "..",
    "<script>",
    "👾",
    "עברית",
    "rаvi",
    "a".repeat(100),
    "Admin",
    "www",
    "play",
    "players",
    "legends",
    "fans",
    "booth",
    "hall",
    "games",
    "agents",
    "host",
    "tv",
  ];
  for (let i = 0; i < 200; i++) {
    const input = hostile[i % hostile.length],
      output = seatLabel(input, i % 4, i % 7);
    assert.match(output, /^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$/);
    assert.equal(output, seatLabel(input, i % 4, i % 7));
  }
  for (const name of ["players", "legends", "fans", "booth", "hall", "www"])
    assert.equal(sanitizeName(name), null);
});
