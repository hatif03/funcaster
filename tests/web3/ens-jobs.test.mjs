import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createOutbox,
  listJobs,
  digest,
} from "../../integrations/shared/outbox.mjs";
import { createWorker } from "../../integrations/shared/worker.mjs";
import { EnsError } from "../../integrations/ens/errors.mjs";
import { createEnsLifecycle } from "../../integrations/ens/lifecycle.mjs";
import {
  createEnsJobProvider,
  ensReceiptData,
} from "../../integrations/ens/jobs.mjs";
import { createMockEnsProvider } from "../../integrations/ens/mock.mjs";
import { chainFixture, address } from "./fixtures/ens-chain.mjs";
import { createEnsRooms } from "../../server/web3/ens-rooms.cjs";

const party = { partyId: "room:1", code: "ROOMAA", game: "chonks.golf" };
const seat = {
  partyId: party.partyId,
  seatId: "binding:1",
  slot: 0,
  nickname: "Asha",
  address: address(23),
  shape: "circle",
  color: "#ffffff",
};
const input = (type, payload) => ({
  type,
  room: "ROOMAA",
  idempotencyKey: `${type}:${payload.seatId || payload.partyId}`,
  payload,
});
test("queued revocation supersedes only an untouched grant and leaves revoke/new grant processing intact", async (t) => {
  const dir = await temp(t),
    chain = chainFixture(),
    lifecycle = await createEnsLifecycle({ dir, ...chain }),
    queue = createOutbox(dir);
  await lifecycle.open(party);
  await lifecycle.mint(seat);
  const provider = createEnsJobProvider({
    lifecycle,
    transactions: {
      hasAdmission: async (prefix) =>
        chain.calls.some((c) => c.id.startsWith(prefix)),
      receipts: async () => [],
    },
    queuedJobs: () => listJobs(dir),
  });
  const worker = createWorker({
    dir,
    providers: { ens: { ...provider, idle: async () => {} } },
  });
  t.after(async () => {
    await worker.close();
    await queue.close();
    await lifecycle.close();
    await rm(dir, { force: true, recursive: true });
  });
  const old = { partyId: party.partyId, grantId: "old", address: seat.address },
    current = { ...old, grantId: "current" },
    before = chain.calls.length;
  for (const [type, payload] of [
    ["ens.role.grant", old],
    ["ens.role.revoke", old],
    ["ens.role.grant", current],
  ])
    await queue.enqueue({
      ...input(type, payload),
      idempotencyKey: `${type}:${payload.grantId}`,
    });
  await worker.poll();
  const receipts = (await readFile(path.join(dir, "receipts.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(receipts.length, 3);
  assert.equal(receipts[0].status, "failed");
  assert.match(receipts[0].error, /JOB_SUPERSEDED/);
  assert.equal(receipts[0].tx, null);
  assert.equal(receipts[0].data, undefined);
  assert.equal(receipts[1].data.status, "revoked");
  assert.equal(receipts[2].data.status, "granted");
  assert.equal((await listJobs(dir)).length, 0);
  assert.equal(chain.calls.length, before + 3);
  assert.ok(
    chain.calls
      .slice(before)
      .every((c) =>
        c.id.startsWith(
          `grant:${digest(party.partyId)}:${digest(current.grantId)}:`,
        ),
      ),
  );
  assert.equal(
    await lifecycle.hasGrant(party.partyId, old.grantId),
    true,
    "normal revoke creates its durable tombstone without a chain send",
  );
});
test("supersession refuses partial lifecycle/admitted grants and mismatched or earlier revokes", async () => {
  const payload = {
      partyId: party.partyId,
      grantId: "one",
      address: seat.address,
    },
    grantJob = { ...input("ens.role.grant", payload), createdAt: 10 },
    revokeJob = { ...input("ens.role.revoke", payload), createdAt: 11 };
  for (const scenario of [
    { state: true },
    { admission: true },
    { revoke: null },
    { revoke: { ...revokeJob, createdAt: 9 } },
    { revoke: { ...revokeJob, room: "OTHER" } },
    { revoke: { ...revokeJob, payload: { ...payload, grantId: "different" } } },
    { revoke: { ...revokeJob, payload: { ...payload, partyId: "different" } } },
    { revoke: { ...revokeJob, payload: { ...payload, address: address(99) } } },
  ]) {
    let calls = 0;
    const provider = createEnsJobProvider({
      lifecycle: {
        hasGrant: async () => !!scenario.state,
        grant: async () => {
          calls++;
          return { ...payload, status: "granted" };
        },
      },
      transactions: {
        hasAdmission: async () => !!scenario.admission,
        receipts: async () => [],
      },
      queuedJobs: async () =>
        scenario.revoke === null ? [] : [{ job: scenario.revoke || revokeJob }],
    });
    assert.equal((await provider.execute(grantJob)).data.status, "granted");
    assert.equal(calls, 1);
  }
});
test("worker retries untrusted superseded codes and non-grant ENS errors normally", async (t) => {
  for (const [type, error] of [
    [
      "ens.role.grant",
      Object.assign(Error("untrusted"), {
        code: "JOB_SUPERSEDED",
        permanent: true,
      }),
    ],
    ["ens.role.grant", new EnsError("OTHER_ERROR", "not superseded")],
    ["ens.seat.mint", new EnsError("JOB_SUPERSEDED", "wrong job type")],
  ]) {
    const dir = await temp(t),
      queue = createOutbox(dir);
    const worker = createWorker({
      dir,
      providers: {
        ens: {
          lookup: async () => null,
          execute: async () => {
            throw error;
          },
        },
      },
    });
    t.after(async () => {
      await worker.close();
      await queue.close();
      await rm(dir, { force: true, recursive: true });
    });
    await queue.enqueue(input(type, party));
    await worker.poll();
    const remaining = await listJobs(dir);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].job.attempts, 1);
  }
});
test("Champion worker emits only a real ownership receipt and refuses disabled/mock issuance", async () => {
  const p = {
    partyId: "handle:one",
    claimId: "claim:one",
    address: address(24),
    handle: "asha",
    resultHash: "a".repeat(64),
    recoveryAcknowledged: true,
  };
  const job = input("ens.champion.claim", p),
    calls = [];
  const champion = {
    claim: async (claim) => {
      calls.push(claim);
      return {
        ...p,
        name: "asha.players.funcaster.eth",
        registry: address(25),
        resolver: address(26),
        expiresAt: "1800000000",
        status: "ready",
        mode: "on",
        chainVerified: false,
        tx: "0x" + "f".repeat(64),
      };
    },
  };
  const result = await createEnsJobProvider({ champion }).execute(job);
  assert.deepEqual(calls[0], {
    id: p.claimId,
    address: p.address,
    handle: p.handle,
    resultHash: p.resultHash,
    recoveryAcknowledged: true,
  });
  assert.equal(result.data.chainVerified, false);
  assert.equal(result.data.name, "asha.players.funcaster.eth");
  assert.equal(result.data.recoveryAcknowledged, undefined);
  await assert.rejects(createEnsJobProvider({}).execute(job), {
    code: "CHAMPION_DISABLED",
  });
  await assert.rejects(
    createEnsJobProvider({ champion, mock: true }).execute(job),
    { code: "CHAMPION_DISABLED" },
  );
  assert.throws(
    () =>
      ensReceiptData(job.type, p, {
        ...result.data,
        resultHash: "b".repeat(64),
      }),
    { code: "INVALID_RECEIPT" },
  );
});
async function temp(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-ens-jobs-"));
  return dir;
}
test("real lifecycle crosses the outbox/worker boundary and returns validated receipt metadata", async (t) => {
  const dir = await temp(t),
    chain = chainFixture();
  const lifecycle = await createEnsLifecycle({ dir, ...chain });
  const provider = createEnsJobProvider({ lifecycle });
  const queue = createOutbox(dir),
    worker = createWorker({ dir, providers: { ens: provider } });
  t.after(async () => {
    await worker.close();
    await queue.close();
    await lifecycle.close();
    await rm(dir, { force: true, recursive: true });
  });
  await queue.enqueue(input("ens.party.open", party));
  await queue.enqueue(input("ens.seat.mint", seat));
  await worker.poll();
  const receipts = (await readFile(path.join(dir, "receipts.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(receipts.length, 2);
  assert.equal(receipts[0].data.status, "ready");
  assert.equal(receipts[1].data.address, seat.address);
  assert.equal(receipts[1].data.seatId, seat.seatId);
  assert.equal((await listJobs(dir)).length, 0);
  await queue.enqueue(input("ens.seat.release", seat));
  await queue.enqueue(input("ens.party.end", party));
  await worker.poll();
  assert.equal((await listJobs(dir)).length, 0);
});
test("post-effect worker crash resumes the lifecycle without duplicate chain effects", async (t) => {
  const dir = await temp(t),
    chain = chainFixture();
  const lifecycle = await createEnsLifecycle({ dir, ...chain }),
    provider = createEnsJobProvider({ lifecycle });
  t.after(() => lifecycle.close());
  const q = createOutbox(dir);
  t.after(() => q.close());
  t.after(() => rm(dir, { force: true, recursive: true }));
  await q.enqueue(input("ens.party.open", party));
  const crashing = createWorker({
    dir,
    providers: { ens: provider },
    afterExecute() {
      throw Object.assign(Error("Crash"), { simulateCrash: true });
    },
  });
  await assert.rejects(crashing.poll(), /Crash/);
  await crashing.close();
  const after = chain.calls.length;
  const resumed = createWorker({
    dir,
    providers: { ens: { ...provider, idle: async () => {} } },
  });
  await resumed.poll();
  await resumed.close();
  assert.equal(chain.calls.length, after);
  assert.equal((await listJobs(dir)).length, 0);
});
test("mock provider satisfies lifecycle receipt contract without fake transaction hashes", async (t) => {
  const dir = await temp(t);
  t.after(() => rm(dir, { force: true, recursive: true }));
  let provider = await createMockEnsProvider(dir);
  const created = await provider.execute(input("ens.party.open", party));
  assert.equal(created.mock, true);
  assert.equal(created.tx, null);
  const minted = await provider.execute(input("ens.seat.mint", seat));
  provider = await createMockEnsProvider(dir);
  assert.deepEqual(
    await provider.execute(input("ens.seat.mint", seat)),
    minted,
  );
  assert.equal(
    (await provider.execute(input("ens.seat.release", seat))).data.status,
    "released",
  );
  assert.equal(
    (await provider.execute(input("ens.party.end", party))).data.status,
    "ended",
  );
});
test("receipt schema strips arbitrary provider data and refuses a different seat/address", () => {
  const result = {
    ...seat,
    name: "asha.table.play.fixture.eth",
    expiresAt: "1900000000",
    status: "ready",
    secret: "must not escape",
  };
  assert.ok(
    !JSON.stringify(ensReceiptData("ens.seat.mint", seat, result)).includes(
      "must not escape",
    ),
  );
  for (const change of [
    { seatId: "other" },
    { address: address(99) },
    { slot: 3 },
    { status: "verified" },
  ])
    assert.throws(() =>
      ensReceiptData("ens.seat.mint", seat, { ...result, ...change }),
    );
});
test("relay ignores stale seat receipts after replacement and never exposes tokens/full addresses", () => {
  const jobs = [],
    room = { code: "ROOMAA", created: 1, game: "golf", players: [] };
  const relay = createEnsRooms({
    config: { WEB3_ENS: "on" },
    enqueue: (r, job, accept) => jobs.push({ job, accept }),
  });
  const p = { slot: 0, token: "private-seat-token", address: address(31) };
  room.players[0] = p;
  relay.observe(room);
  relay.observe(room);
  assert.equal(jobs.length, 2);
  const old = jobs[1];
  p.token = "replacement-token";
  p.address = address(32);
  relay.observe(room);
  assert.deepEqual(
    jobs.map((x) => x.job.type),
    ["ens.party.open", "ens.seat.mint", "ens.seat.release", "ens.seat.mint"],
  );
  old.accept({
    status: "done",
    data: {
      ...old.job.payload,
      name: "asha.table.play.fixture.eth",
      expiresAt: "1900000000",
      status: "ready",
    },
  });
  assert.equal(relay.view(room).seats[0].named, false);
  const latest = jobs[3];
  latest.accept({
    status: "done",
    data: {
      ...latest.job.payload,
      name: "new.table.play.fixture.eth",
      expiresAt: "1900000000",
      status: "ready",
    },
  });
  const view = relay.view(room);
  assert.equal(view.seats[0].named, true);
  for (const hidden of [p.token, p.address, "private-seat-token"])
    assert.ok(!JSON.stringify(view).includes(hidden));
  assert.ok(!JSON.stringify(jobs.map((x) => x.job)).includes("token"));
  relay.end(room);
  assert.deepEqual(
    jobs.slice(-2).map((x) => x.job.type),
    ["ens.seat.release", "ens.party.end"],
  );
});
test("an on-mode relay cannot present a mock provider receipt as a live ENS name", () => {
  const jobs = [],
    room = { code: "ROOMAA", created: 1, game: "golf", players: [] };
  const relay = createEnsRooms({
    config: { WEB3_ENS: "on" },
    enqueue: (r, job, accept) => jobs.push({ job, accept }),
  });
  relay.observe(room);
  jobs[0].accept({ status: "done", mock: true, data: {} });
  assert.equal(relay.view(room).party.status, "failed");
  assert.equal(relay.view(room).party.name, null);
});
