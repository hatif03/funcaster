import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEnsLifecycle } from "../../integrations/ens/lifecycle.mjs";
import {
  createEnsAuthority,
  enforcement,
} from "../../integrations/ens/authority.mjs";
import { chainFixture, address } from "./fixtures/ens-chain.mjs";
import { createEnsRooms } from "../../server/web3/ens-rooms.cjs";

const room = { partyId: "party:one", code: "ROOMAA", game: "chonks.golf" };
const phone = {
  partyId: room.partyId,
  seatId: "seat:one",
  slot: 0,
  nickname: "asha",
  address: address(23),
  shape: "circle",
  color: "#ffffff",
};
const grant = {
  partyId: room.partyId,
  grantId: "grant:one",
  address: phone.address,
};
async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-ens-authority-")),
    f = chainFixture();
  let lifecycle = await createEnsLifecycle({ dir, ...f });
  t.after(async () => {
    await lifecycle.close();
    await rm(dir, { recursive: true, force: true });
  });
  const party = await lifecycle.open(room),
    seat = await lifecycle.mint(phone);
  let clock = Number((await f.client.getBlock()).timestamp) * 1000,
    walks = 0,
    events = [];
  const hierarchy = {
    async walk(name) {
      walks++;
      assert.equal(name, seat.name);
      const b = await f.client.getBlock();
      const node = {
        name: party.name,
        owner: f.owner,
        subregistry: party.registry,
        resolver: party.resolver,
      };
      return {
        name,
        nodes: [node],
        leaf: { owner: phone.address, resolver: party.resolver },
        blockNumber: b.number,
        blockHash: b.hash,
        chainTime: b.timestamp,
        expiresAt: BigInt(party.expiresAt),
      };
    },
  };
  f.client.getLogs = async () => {
    const value = events;
    events = [];
    return value;
  };
  const authority = createEnsAuthority({
    client: f.client,
    protocol: f.protocol,
    parent: f.config.ENS_PARENT,
    owner: f.owner,
    hierarchy,
    now: () => clock,
  });
  t.after(() => authority.close());
  return {
    ...f,
    party,
    seat,
    get lifecycle() {
      return lifecycle;
    },
    authority,
    restart: async () => {
      await lifecycle.close();
      lifecycle = await createEnsLifecycle({ dir, ...f });
    },
    input: {
      name: party.name,
      seatName: seat.name,
      address: phone.address,
      capability: "control",
    },
    walks: () => walks,
    advance(n) {
      clock += n * 1000;
      f.advance(n);
    },
    event() {
      events.push({ eventName: "EACRolesChanged" });
    },
  };
}
test("host grants are scoped, idempotent, revoked on release and cannot be restored by stale jobs", async (t) => {
  const f = await fixture(t),
    before = f.calls.length;
  assert.equal((await f.authority.check(f.input)).outcome, "denied");
  assert.equal(await f.lifecycle.hasGrant(room.partyId, grant.grantId), false);
  await f.lifecycle.grant(grant);
  assert.equal(await f.lifecycle.hasGrant(room.partyId, grant.grantId), true);
  assert.equal(f.calls.length, before + 3);
  await f.lifecycle.grant(grant);
  assert.equal(f.calls.length, before + 3);
  assert.equal(
    (await f.authority.check(f.input, { fresh: true })).outcome,
    "allowed",
  );
  await f.lifecycle.mint(phone); // Root UNREGISTER does not make a seat transferable.
  await f.lifecycle.release(room.partyId, phone.seatId);
  assert.equal(await f.lifecycle.hasGrant(room.partyId, grant.grantId), true);
  assert.equal(f.calls.length, before + 8);
  assert.equal(
    (await f.authority.check(f.input, { fresh: true })).outcome,
    "denied",
  );
  await assert.rejects(
    f.lifecycle.grant(grant),
    (e) => e.code === "GRANT_CHANGED",
  );
});
for (const suffix of [":kick", ":control", ":record"])
  test(`host grant reconciles a crash after ${suffix}`, async (t) => {
    const f = await fixture(t),
      before = f.calls.length;
    f.crashAfter(suffix);
    await assert.rejects(f.lifecycle.grant(grant), /post-send crash/);
    assert.equal(await f.lifecycle.hasGrant(room.partyId, grant.grantId), true);
    await f.restart();
    await f.lifecycle.grant(grant);
    assert.equal(f.calls.length, before + 3);
  });
test("host transfer requires revoke first; early revoke tombstones a delayed grant", async (t) => {
  const f = await fixture(t);
  await f.lifecycle.grant(grant);
  await f.lifecycle.mint({
    ...phone,
    seatId: "seat:two",
    slot: 1,
    address: address(24),
  });
  const next = { ...grant, grantId: "grant:two", address: address(24) };
  await assert.rejects(
    f.lifecycle.grant(next),
    (e) => e.code === "HOST_OCCUPIED",
  );
  await f.lifecycle.revoke(grant);
  await f.lifecycle.grant(next);
  const absent = { ...next, grantId: "never-apply" };
  await f.lifecycle.revoke(absent);
  await assert.rejects(
    f.lifecycle.grant(absent),
    (e) => e.code === "GRANT_CHANGED",
  );
});
test("a resumed host grant refuses a seat externally revoked during the crash", async (t) => {
  const f = await fixture(t);
  f.crashAfter(":kick");
  await assert.rejects(f.lifecycle.grant(grant), /post-send crash/);
  f.occupy(f.party.registry, f.seat.name.split(".")[0], { status: 0 });
  const before = f.calls.length;
  await f.restart();
  await assert.rejects(
    f.lifecycle.grant(grant),
    (e) => e.code === "SEAT_CHANGED",
  );
  assert.equal(f.calls.length, before);
});
test("role cache expires within five seconds and a watched event invalidates it sooner", async (t) => {
  const f = await fixture(t);
  await f.lifecycle.grant(grant);
  assert.equal((await f.authority.check(f.input)).outcome, "allowed");
  const before = f.walks();
  assert.equal((await f.authority.check(f.input)).cached, true);
  assert.equal(f.walks(), before);
  f.advance(5);
  await f.authority.check(f.input);
  assert.equal(f.walks(), before + 1);
  await f.lifecycle.revoke(grant);
  f.advance(1);
  f.event();
  await f.authority.poll();
  assert.equal((await f.authority.check(f.input)).outcome, "denied");
});
test("soft mode permits only RPC unavailability, never a denial or invalidated proof", async (t) => {
  const f = await fixture(t);
  await f.lifecycle.grant(grant);
  f.client.readContract = async () => {
    throw Error("Transport offline");
  };
  const unavailable = await f.authority.check(f.input);
  assert.equal(unavailable.outcome, "unavailable");
  assert.equal(enforcement(unavailable, "soft").source, "server");
  assert.equal(enforcement(unavailable, "strict").allowed, false);
  assert.equal(enforcement({ outcome: "denied" }, "soft").allowed, false);
  assert.equal(
    enforcement({ outcome: "unavailable", code: "INVALIDATED" }, "soft")
      .allowed,
    false,
  );
});
test("record changes enforce allowed keys, immutable payloads and bounded bundles", async (t) => {
  const f = await fixture(t),
    job = {
      partyId: room.partyId,
      changeId: "result:one",
      records: { "chonks.receipt": "a".repeat(64) },
      seats: [
        { seatId: phone.seatId, last: `loyw.ROOMAA.1:${"a".repeat(64)}:1` },
      ],
    };
  const before = f.calls.length;
  await f.lifecycle.records(job);
  await f.lifecycle.records(job);
  assert.equal(f.calls.length, before + 1);
  await assert.rejects(
    f.lifecycle.records({
      ...job,
      records: { "chonks.receipt": "b".repeat(64) },
    }),
    (e) => e.code === "IDEMPOTENCY_CONFLICT",
  );
  await assert.rejects(
    f.lifecycle.records({
      ...job,
      changeId: "forged",
      records: { "chonks.host": phone.address },
    }),
    (e) => e.code === "INVALID_JOB",
  );
});
test("relay closes revoked host controls and a later outage cannot resurrect them", async () => {
  const jobs = [];
  let outcome = "allowed",
    revocations = 0;
  const p = {
    slot: 0,
    token: "local-only",
    address: phone.address,
    ready: true,
    socket: "p",
  };
  const r = {
    code: "ROOMAA",
    created: 1,
    game: "golf",
    players: [p],
    arcade: { mode: "party", hostToken: p.token },
  };
  const reader = {
    check: async () => ({
      outcome,
      code: outcome === "unavailable" ? "RPC_UNAVAILABLE" : "ROLES",
    }),
    invalidate() {},
    close() {},
    poll: async () => {},
  };
  const relay = createEnsRooms({
    config: { WEB3_ENS: "on", ENS_ENFORCE: "soft" },
    authority: async () => reader,
    enqueue: (r, job, accept) => jobs.push({ job, accept }),
  });
  relay.setHostRevoker(() => {
    revocations++;
    r.arcade.hostToken = null;
  });
  relay.observe(r);
  jobs[0].accept({
    status: "done",
    data: {
      ...jobs[0].job.payload,
      name: "table.play.fixture.eth",
      registry: address(3),
      resolver: address(4),
      expiresAt: "1900000000",
      status: "ready",
    },
  });
  jobs[1].accept({
    status: "done",
    data: {
      ...jobs[1].job.payload,
      name: "asha.table.play.fixture.eth",
      expiresAt: "1900000000",
      status: "ready",
    },
  });
  relay.observe(r);
  jobs[2].accept({
    status: "done",
    data: { ...jobs[2].job.payload, status: "granted" },
  });
  assert.equal((await relay.authorize(r, p, "start")).allowed, true);
  outcome = "denied";
  assert.equal((await relay.authorize(r, p, "start")).allowed, false);
  assert.equal(revocations, 1);
  outcome = "unavailable";
  assert.equal((await relay.authorize(r, p, "start")).allowed, false);
  assert.equal(relay.view(r).host.authorised, false);
  assert.match(relay.view(r).host.message, /chain says no/i);
  relay.close();
});

test("relay retains one assigned grant through readiness/reconnect changes and waits for a confirmed seat before granting", async (t) => {
  const jobs = [],
    p = {
      slot: 0,
      token: "retained-token",
      address: phone.address,
      ready: true,
      socket: "first-socket",
    },
    r = {
      code: "ROOMAA",
      created: 1,
      game: "golf",
      players: [p],
      arcade: { mode: "party", hostToken: p.token },
    };
  let checks = 0,
    resolveCheck;
  const reader = {
    check: async () => {
      checks++;
      return resolveCheck
        ? new Promise((resolve) => resolveCheck(resolve))
        : { outcome: "allowed", code: "ROLES" };
    },
    invalidate() {},
    close() {},
  };
  const relay = createEnsRooms({
    config: { WEB3_ENS: "on", ENS_ENFORCE: "soft" },
    authority: async () => reader,
    enqueue: (_room, job, accept) => jobs.push({ job, accept }),
  });
  t.after(() => relay.close());
  relay.observe(r);
  assert.deepEqual(
    jobs.map(({ job }) => job.type),
    ["ens.party.open", "ens.seat.mint"],
    "a pending seat must not enqueue a role grant",
  );
  for (const [index, fields] of [
    [
      0,
      {
        name: "table.play.fixture.eth",
        registry: address(3),
        resolver: address(4),
      },
    ],
    [1, { name: "asha.table.play.fixture.eth" }],
  ])
    jobs[index].accept({
      status: "done",
      data: {
        ...jobs[index].job.payload,
        ...fields,
        expiresAt: "1900000000",
        status: "ready",
      },
    });
  relay.observe(r);
  assert.equal(jobs[2].job.type, "ens.role.grant");
  jobs[2].accept({
    status: "done",
    data: { ...jobs[2].job.payload, status: "granted" },
  });
  const grant = relay.get(r).host;
  assert.equal((await relay.authorize(r, p, "start")).allowed, true);
  for (const change of [
    { ready: false, socket: "first-socket" },
    { ready: true, socket: null },
    { ready: false, socket: "second-socket" },
  ]) {
    Object.assign(p, change);
    relay.observe(r);
    assert.equal(relay.get(r).host, grant);
    assert.equal(jobs.length, 3, "transient readiness must not churn grants");
    assert.equal((await relay.authorize(r, p, "start")).allowed, false);
    assert.equal(checks, 1, "unready/disconnected controls do not read RPC");
  }
  p.ready = true;
  relay.observe(r);
  assert.equal(relay.get(r).host, grant);
  assert.equal((await relay.authorize(r, p, "start")).allowed, true);
  let finishRead;
  const reading = new Promise((resolve) => {
    resolveCheck = (finish) => {
      finishRead = finish;
      resolve();
    };
  });
  const pending = relay.authorize(r, p, "start");
  await reading;
  p.ready = false;
  finishRead({ outcome: "allowed", code: "ROLES" });
  assert.equal((await pending).allowed, false);
  assert.equal(relay.get(r).host, grant);
  r.arcade.hostToken = null;
  relay.observe(r);
  assert.equal(relay.get(r).host, null);
  assert.equal(jobs.length, 4);
  assert.equal(jobs[3].job.type, "ens.role.revoke");
  assert.equal(jobs[3].job.payload.grantId, grant.id);
});
