import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { arcFixture, account } from "./fixtures/arc-chain.mjs";
import { createArcLifecycle } from "../../integrations/arc/lifecycle.mjs";
import { createArcJobProvider } from "../../integrations/arc/provider.mjs";
import { createDripBudget } from "../../integrations/arc/drip-budget.mjs";
import { reservePotIntent } from "../../integrations/arc/intents.mjs";
import {
  validateArcJob,
  arcReceiptData,
  json,
} from "../../integrations/arc/jobs.mjs";
import {
  acceptData,
  fundingData,
  settleData,
  contestData,
  termsHash,
} from "../../integrations/arc/signatures.mjs";
import { createOutbox, listJobs } from "../../integrations/shared/outbox.mjs";
import { createWorker } from "../../integrations/shared/worker.mjs";
import records from "../../server/records.cjs";
const seats = [account(10), account(11)],
  room = "ROOMAA";
async function fixture(t) {
  const f = arcFixture(),
    dir = await mkdtemp(path.join(tmpdir(), "chonks-a4-"));
  const limits = Object.fromEntries(
    ["usdc", "eurc"].map((a) => [
      a,
      {
        perDevice: 550000n,
        perIpHour: 1100000n,
        perRoom: 1100000n,
        total: 2200000n,
        bankroll: 550000n,
        floor: 50000n,
      },
    ]),
  );
  const budget = await createDripBudget({ dir, limits });
  let lifecycle,
    stopped = false;
  const start = async () =>
    (lifecycle = await createArcLifecycle({
      dir,
      chain: f.chain,
      relayer: f.relayer,
      oracle: f.oracle,
      transactions: f.transactions,
      dripBudget: budget,
      dripLimits: limits,
      now: f.now,
      killed: async () => stopped,
    }));
  await start();
  t.after(async () => {
    await lifecycle.close();
    await budget.close();
    await rm(dir, { recursive: true, force: true });
  });
  const context = {
    gameId: "chonks.star-catch",
    version: "1.0.0",
    bundleHash: "a".repeat(64),
    slots: [0, 1],
  };
  const terms = {
    asset: f.assets[0].address,
    stake: "500000",
    seats: seats.map((a) => a.address),
    rule: 1,
    oracle: f.oracle,
    fundDeadline: "1180",
    settleDeadline: "1900",
    challengeWindow: 120,
    minPlaySeconds: 60,
  };
  const intent = await reservePotIntent({
    dir,
    attemptId: "round1",
    room,
    terms,
    context,
  });
  const job = (kind, extra = {}, key = kind) => ({
    type: `arc.pot.${kind}`,
    room,
    idempotencyKey: `${intent.potId}:${key}`,
    payload: {
      potId: intent.potId,
      ...(kind === "create"
        ? { terms: intent.terms, context }
        : { termsHash: intent.termsHash }),
      ...extra,
    },
  });
  const domain = { chainId: 5042002, contract: f.contract };
  const funding = async (i) => {
    const a = seats[i],
      typed = fundingData(
        {
          name: "USDC",
          version: "2",
          decimals: 6,
          address: terms.asset,
          chainId: 5042002,
        },
        {
          potId: intent.potId,
          seat: a.address,
          contract: f.contract,
          stake: 500000n,
          validAfter: 0n,
          validBefore: 1180n,
          fundDeadline: 1180n,
          chainTime: BigInt(f.time()),
          balance: f.balance(terms.asset, a.address),
          floor: 50000n,
        },
      );
    return job(
      "fund",
      {
        seat: a.address,
        acceptSig: await a.signTypedData(acceptData(domain, intent)),
        validAfter: "0",
        validBefore: "1180",
        nonce: typed.message.nonce,
        authSig: await a.signTypedData(typed),
      },
      `fund:${i}`,
    );
  };
  const lock = async () => {
    await lifecycle.execute(job("create"));
    for (let i = 0; i < 2; i++) await lifecycle.execute(await funding(i));
  };
  const result = (patch = {}) => {
    const value = {
      gameId: context.gameId,
      version: context.version,
      bundleHash: context.bundleHash,
      matchId: "one-match",
      startedAt: 1000000,
      endedAt: 1001000,
      status: "completed",
      verification: "verified",
      scores: [
        { slot: 0, score: 2, rank: 1 },
        { slot: 1, score: 1, rank: 2 },
      ],
      ...patch,
    };
    return { ...value, hash: records.hash(value) };
  };
  const settle = async (patch = {}) =>
    job("settle", {
      places: [1, 2],
      sigs: await Promise.all(
        seats.map((a) =>
          a.signTypedData(
            settleData(domain, { potId: intent.potId, places: [1, 2] }),
          ),
        ),
      ),
      result: result(),
      ...patch,
    });
  return {
    ...f,
    dir,
    intent,
    job,
    funding,
    lock,
    result,
    settle,
    context,
    terms,
    domain,
    get lifecycle() {
      return lifecycle;
    },
    restart: async () => {
      await lifecycle.close();
      return start();
    },
    stop: () => (stopped = true),
  };
}
test("A4 outbox completes create, two gasless funds, cooperative settle and independent claims", async (t) => {
  const f = await fixture(t),
    queue = createOutbox(f.dir),
    provider = createArcJobProvider({ lifecycle: f.lifecycle, now: f.now }),
    worker = createWorker({
      dir: f.dir,
      providers: { arc: provider },
      now: f.now,
    });
  t.after(async () => {
    await worker.close();
    await queue.close();
  });
  await queue.enqueue(f.job("create"));
  await worker.poll();
  for (let i = 0; i < 2; i++) await queue.enqueue(await f.funding(i));
  await worker.poll();
  assert.equal((await f.chain.snapshot(f.intent.potId)).state, "Locked");
  f.advance(10);
  await queue.enqueue(await f.settle());
  await worker.poll();
  assert.equal((await listJobs(f.dir)).length, 0);
  const s = await f.chain.snapshot(f.intent.potId);
  assert.equal(s.state, "Settled");
  assert.deepEqual(s.claimables, [0n, 0n]);
  assert.equal(f.balance(f.terms.asset, seats[0].address), 750000n);
  assert.equal(f.balance(f.terms.asset, seats[1].address), 350000n);
  // Paid pots still get a fresh state read, but must not re-walk the entire
  // historical transaction journal on every idle poll.
  const oldReceipts = f.transactions.relayer.receipts;
  let reconciliations = 0;
  f.transactions.relayer.receipts = async (...args) => {
    reconciliations++;
    return oldReceipts(...args);
  };
  await f.lifecycle.recover();
  await f.restart();
  await f.lifecycle.recover();
  assert.equal(reconciliations, 0);
  const receipts = (await readFile(path.join(f.dir, "receipts.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert(
    receipts.some(
      (r) => r.type === "arc.pot.settle" && r.data.state === "Settled" && r.tx,
    ),
  );
  assert(receipts.every((r) => r.data.chainVerified === false));
  assert.equal(
    (await stat(path.join(f.dir, "arc-lifecycle/journal.json"))).mode & 0o777,
    0o600,
  );
});
test("post-send timeout and restart reconcile the same ID and preserve the transaction reference", async (t) => {
  const f = await fixture(t);
  f.failOnce();
  await assert.rejects(f.lifecycle.execute(f.job("create")), /timeout/);
  await f.restart();
  const value = await f.lifecycle.execute(f.job("create"));
  assert(value.tx);
  assert.equal(f.calls.length, 1);
  const before = f.calls.length;
  await assert.rejects(
    f.lifecycle.execute({ ...f.job("create"), room: "OTHER" }),
    /changed/,
  );
  assert.equal(f.calls.length, before);
});
test("unpredictable intent survives restart; changed terms and occupied IDs require fresh acceptance", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(
    await reservePotIntent({
      dir: f.dir,
      attemptId: "round1",
      room,
      terms: f.terms,
      context: f.context,
    }),
    f.intent,
  );
  await assert.rejects(
    reservePotIntent({
      dir: f.dir,
      attemptId: "round1",
      room,
      terms: { ...f.terms, stake: "500001" },
      context: f.context,
    }),
    /fresh acceptance/,
  );
  const other = await reservePotIntent({
    dir: f.dir,
    attemptId: "round2",
    room,
    terms: f.terms,
    context: f.context,
  });
  assert.notEqual(other.potId, f.intent.potId);
  await f.lifecycle.execute(f.job("create"));
  f.pots.get(f.intent.potId).termsHash = termsHash(f.intent.potId, {
    ...f.intent.terms,
    rule: 0,
  });
  await assert.rejects(f.lifecycle.execute(f.job("create")), /different terms/);
  assert.equal(f.calls.length, 1);
});
test("deadline obligation persists without the relay; partially funded pot refunds and pays", async (t) => {
  const f = await fixture(t);
  await f.lifecycle.execute(f.job("create"));
  await f.lifecycle.execute(await f.funding(0));
  assert.equal(
    (await f.lifecycle.execute(f.job("refund"))).data.outcome,
    "waiting",
  );
  await f.restart();
  f.setTime(1180);
  await f.lifecycle.recover();
  assert.equal((await f.chain.snapshot(f.intent.potId)).state, "Refunded");
  assert.equal(f.balance(f.terms.asset, seats[0].address), 550000n);
  const count = f.calls.length;
  await f.lifecycle.recover();
  assert.equal(f.calls.length, count);
});
test("locked expiry refunds; oracle recovery reads canonical reveal and finalizes after the window", async (t) => {
  const f = await fixture(t);
  await f.lock();
  f.setTime(1900);
  await f.lifecycle.recover();
  assert.equal((await f.chain.snapshot(f.intent.potId)).state, "Refunded");
  const g = await fixture(t);
  await g.lock();
  g.advance(61);
  await g.lifecycle.execute(
    g.job("propose", { places: [1, 2], result: g.result() }),
  );
  assert.equal(g.calls.filter((c) => c.role === "oracle").length, 1);
  await g.restart();
  g.advance(120);
  await g.lifecycle.recover();
  assert.equal((await g.chain.snapshot(g.intent.potId)).state, "Settled");
  assert.deepEqual((await g.chain.snapshot(g.intent.potId)).claimables, [
    0n,
    0n,
  ]);
});
test("signed contest refunds at idle; early finalization waits and late contest fails", async (t) => {
  const f = await fixture(t);
  await f.lock();
  f.advance(61);
  await f.lifecycle.execute(
    f.job("propose", { places: [1, 2], result: f.result() }),
  );
  assert.equal(
    (await f.lifecycle.execute(f.job("finalize", { places: [1, 2] }))).data
      .outcome,
    "waiting",
  );
  const signature = await seats[0].signTypedData(
    contestData(f.domain, f.intent.potId),
  );
  await f.lifecycle.execute(
    f.job("contest", { seat: seats[0].address, signature }),
  );
  await f.lifecycle.recover();
  assert.equal((await f.chain.snapshot(f.intent.potId)).state, "Refunded");
  assert.equal(f.balance(f.terms.asset, seats[1].address), 550000n);
});
test("blocked winner cannot prevent another payout and resumes when token unblocks", async (t) => {
  const f = await fixture(t);
  await f.lock();
  f.advance(10);
  f.blocked.add(seats[0].address.toLowerCase());
  await f.lifecycle.execute(await f.settle());
  assert.deepEqual((await f.chain.snapshot(f.intent.potId)).claimables, [
    700000n,
    0n,
  ]);
  await f.restart();
  f.blocked.clear();
  await f.lifecycle.recover();
  assert.deepEqual((await f.chain.snapshot(f.intent.potId)).claimables, [
    0n,
    0n,
  ]);
});
test("funding rejects substituted signatures, wrong nonce and drained balances before sending", async (t) => {
  for (const patch of [
    { acceptSig: "0x00" },
    { authSig: "0x00" },
    { nonce: `0x${"aa".repeat(32)}` },
    { validBefore: "1181" },
  ]) {
    const f = await fixture(t);
    await f.lifecycle.execute(f.job("create"));
    const job = await f.funding(0);
    Object.assign(job.payload, patch);
    await assert.rejects(f.lifecycle.execute(job));
    assert.equal(f.calls.length, 1);
  }
  const f = await fixture(t);
  await f.lifecycle.execute(f.job("create"));
  const j = await f.funding(0);
  f.setBalance(f.terms.asset, seats[0].address, 549999n);
  await assert.rejects(f.lifecycle.execute(j), /floor/);
  assert.equal(f.calls.length, 1);
});
test("oracle refuses unverified, abandoned, wrong-roster, altered and early results", async (t) => {
  for (const change of [
    { verification: "unverified" },
    { status: "abandoned" },
    { gameId: "chonks.other" },
    {
      scores: [
        { slot: 3, rank: 1 },
        { slot: 1, rank: 2 },
      ],
    },
    { startedAt: 999000 },
  ]) {
    const f = await fixture(t);
    await f.lock();
    f.advance(61);
    await assert.rejects(
      f.lifecycle.execute(
        f.job("propose", { places: [1, 2], result: f.result(change) }),
      ),
    );
    assert.equal(f.calls.filter((c) => c.role === "oracle").length, 0);
  }
  const f = await fixture(t);
  await f.lock();
  f.advance(60);
  await assert.rejects(
    f.lifecycle.execute(
      f.job("propose", { places: [1, 2], result: f.result() }),
    ),
    /waiting/,
  );
});
test("per-asset drips persist amount across a timeout, never refill on retry, and redact identity hashes", async (t) => {
  const f = await fixture(t),
    address = seats[0].address;
  f.setBalance(f.terms.asset, address, 0n);
  const job = {
    type: "arc.drip",
    room,
    idempotencyKey: "drip-one",
    payload: {
      asset: "usdc",
      address,
      device: "b".repeat(64),
      ip: "c".repeat(64),
    },
  };
  f.failOnce();
  await assert.rejects(f.lifecycle.execute(job), /timeout/);
  await f.restart();
  const value = await f.lifecycle.execute(job);
  assert(value.tx);
  assert.equal(value.data.amount, "550000");
  assert.equal(f.calls.length, 1);
  assert(!JSON.stringify(value).includes("b".repeat(64)));
  assert(!JSON.stringify(value).includes("c".repeat(64)));
  f.setBalance(f.terms.asset, address, 0n);
  await f.lifecycle.execute(job);
  assert.equal(f.calls.length, 1);
  await assert.rejects(
    f.lifecycle.execute({
      ...job,
      idempotencyKey: "second-room",
      room: "OTHER",
    }),
    /budget/,
  );
  const eurc = {
    ...job,
    idempotencyKey: "eurc",
    payload: { ...job.payload, asset: "eurc" },
  };
  f.setBalance(f.assets[1].address, address, 0n);
  assert.equal((await f.lifecycle.execute(eurc)).data.amount, "550000");
});
test("kill switch stops create, drips and idle without losing pending obligations", async (t) => {
  const f = await fixture(t);
  await f.lock();
  f.setTime(1900);
  const count = f.calls.length;
  f.stop();
  await f.lifecycle.recover();
  assert.equal(f.calls.length, count);
  await assert.rejects(f.lifecycle.execute(f.job("refund")), /stopped/);
});
test("job and receipt schemas reject unexpected calls, wrong pot observations and strip extra data", async (t) => {
  const f = await fixture(t),
    job = f.job("create");
  assert.throws(() =>
    validateArcJob({ ...job, payload: { ...job.payload, target: f.relayer } }),
  );
  const value = await f.lifecycle.execute(job);
  assert.throws(() =>
    arcReceiptData(job.type, job.payload, {
      ...value.data,
      potId: `0x${"ee".repeat(32)}`,
    }),
  );
  assert.throws(() =>
    arcReceiptData(job.type, job.payload, {
      ...value.data,
      chainVerified: true,
    }),
  );
  assert(
    !JSON.stringify(
      arcReceiptData(job.type, job.payload, {
        ...value.data,
        signature: "do-not-leak",
      }),
    ).includes("do-not-leak"),
  );
});
test("confirmed sends without the expected event never become successful observations", async (t) => {
  const f = await fixture(t);
  f.omitEvents();
  await assert.rejects(
    f.lifecycle.execute(f.job("create")),
    /expected pot event/,
  );
  await f.restart();
  await assert.rejects(
    f.lifecycle.execute(f.job("create")),
    /expected pot event/,
  );
  assert.equal(f.calls.length, 1);
});
test("paid claims with unavailable event proof remain recoverable across restart without another send", async (t) => {
  const f = await fixture(t);
  await f.lock();
  f.advance(10);
  const receipt = f.chain.receipt;
  f.chain.receipt = async (hash) => {
    const value = await receipt(hash);
    return {
      ...value,
      events: value.events.filter((event) => event.eventName !== "Claimed"),
    };
  };
  await f.lifecycle.execute(await f.settle());
  assert.deepEqual((await f.chain.snapshot(f.intent.potId)).claimables, [
    0n,
    0n,
  ]);
  const sent = f.calls.length;
  await f.restart();
  await f.lifecycle.recover();
  assert.equal(f.calls.length, sent);
  f.chain.receipt = receipt;
  await f.lifecycle.recover();
  const observations = (
    await readFile(path.join(f.dir, "receipts.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(
    observations.filter((r) => r.type === "arc.pot.claim" && r.tx).length,
    2,
  );
  assert.equal(f.calls.length, sent);
});
test("invalid cooperative signatures cannot spend and a second result cannot reuse a pot", async (t) => {
  const f = await fixture(t);
  await f.lock();
  f.advance(10);
  const j = await f.settle({ sigs: ["0x00", "0x00"] });
  await assert.rejects(f.lifecycle.execute(j));
  assert.equal(f.calls.length, 3);
  const valid = await f.settle();
  valid.idempotencyKey += ":valid";
  await f.lifecycle.execute(valid);
  const second = await f.settle({
    result: f.result({ matchId: "other-match" }),
  });
  second.idempotencyKey += ":second";
  await assert.rejects(f.lifecycle.execute(second), /another match/);
});
test("late contest and changed finalization placing are rejected without another send", async (t) => {
  const f = await fixture(t);
  await f.lock();
  f.advance(61);
  await f.lifecycle.execute(
    f.job("propose", { places: [1, 2], result: f.result() }),
  );
  const before = f.calls.length;
  await assert.rejects(
    f.lifecycle.execute(f.job("finalize", { places: [2, 1] })),
    /differs/,
  );
  f.advance(120);
  const signature = await seats[0].signTypedData(
    contestData(f.domain, f.intent.potId),
  );
  await assert.rejects(
    f.lifecycle.execute(
      f.job("contest", { seat: seats[0].address, signature }),
    ),
    /closed/,
  );
  assert.equal(f.calls.length, before);
});
test("Arc backoff cannot starve another pot's refund or background deadline recovery", async (t) => {
  const f = await fixture(t);
  await f.lock();
  f.setTime(1900);
  const queue = createOutbox(f.dir),
    provider = createArcJobProvider({
      lifecycle: f.lifecycle,
      now: f.now,
      intervalMs: 0,
    });
  const worker = createWorker({
    dir: f.dir,
    now: f.now,
    providers: {
      arc: {
        ...provider,
        execute(job) {
          if (job.idempotencyKey === "unavailable")
            throw Error("RPC unavailable for another job");
          return provider.execute(job);
        },
      },
    },
  });
  t.after(async () => {
    await worker.close();
    await queue.close();
  });
  await queue.enqueue({ ...f.job("refund"), idempotencyKey: "unavailable" });
  await queue.enqueue(f.job("refund"));
  await worker.poll();
  assert.equal((await f.chain.snapshot(f.intent.potId)).state, "Refunded");
  assert.equal((await listJobs(f.dir)).length, 1);
});
