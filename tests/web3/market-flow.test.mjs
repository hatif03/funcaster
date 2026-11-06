import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createMarketStore } from "../../integrations/market/store.mjs";
import { betData, reportData } from "../../integrations/market/types.mjs";
import { hash, makeResult } from "../../server/records.cjs";
import { gameById } from "../../core/catalog.js";
const accounts = Array.from({ length: 5 }, () =>
  privateKeyToAccount(generatePrivateKey()),
);
let seq = 0;
async function fixture(t, options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "market-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let time = 1_800_000_000_000;
  const now = () => time;
  const verifyRecord = async ({ marketId, record, key }) => {
    const account = privateKeyToAccount(key),
      winMask = 1;
    return {
      address: account.address,
      resultHash: record.result.hash,
      winMask,
      replayed: true,
      signature: await account.signTypedData(
        reportData(marketId, record.result.hash, winMask),
      ),
    };
  };
  const store = await createMarketStore({
    dir,
    now,
    verifyRecord,
    livenessSeconds: 60,
    ...options,
  });
  const seats = [0, 1].map((slot) => ({
    slot,
    address: accounts[slot].address,
    label: `Player ${slot + 1}`,
  }));
  const market = await store.create({
    game: "chonks.star-catch",
    title: "Star Catch",
    seats,
    context: "private",
    windowSeconds: 30,
  });
  return {
    store,
    market,
    dir,
    now,
    advance: (ms) => {
      time += ms;
    },
    seats,
  };
}
async function bet(f, who, outcome, amount = "50000", extra = {}) {
  const intent = {
    marketId: f.market.marketId,
    outcome,
    amount,
    minPayout: "0",
    kind: "prediction",
    nonce: `0x${(++seq).toString(16).padStart(64, "0")}`,
    expiresAt: f.market.closesAt,
    ...extra,
  };
  const signature = await accounts[who].signTypedData(betData(intent));
  return f.store.bet(accounts[who].address, intent, signature);
}
const result = {
  gameId: "chonks.star-catch",
  hash: "ab".repeat(32),
  status: "completed",
  verification: "verified",
  scores: [
    { slot: 0, rank: 1, outcome: "finished" },
    { slot: 1, rank: 2, outcome: "finished" },
  ],
};
test("signed predictions, start gate, distinct reports, liveness, winner pull claim, and equal cheers", async (t) => {
  const f = await fixture(t);
  await bet(f, 2, 0);
  await bet(f, 3, 1);
  await bet(f, 4, 0, "50000", { kind: "cheer" });
  await assert.rejects(f.store.start(f.market.marketId), /close/);
  f.advance(35000);
  await f.store.start(f.market.marketId);
  await f.store.finish(f.market.marketId, { result });
  assert.equal(f.store.snapshot(f.market.marketId).phase, "resolving");
  assert.equal(
    (await f.store.claim(f.market.marketId, accounts[2].address)).amount,
    "0",
  );
  f.advance(60001);
  assert.equal(
    (await f.store.claim(f.market.marketId, accounts[2].address)).amount,
    "100000",
  );
  assert.equal(
    (await f.store.claim(f.market.marketId, accounts[2].address)).amount,
    "0",
  );
  assert.equal(
    (await f.store.claim(f.market.marketId, accounts[0].address)).amount,
    "25000",
  );
  assert.equal(
    (await f.store.claim(f.market.marketId, accounts[1].address)).amount,
    "25000",
  );
  const publicRow = (await f.store.list())[0];
  assert.equal(publicRow.chainVerified, false);
  const text = JSON.stringify(publicRow);
  for (const denied of [
    accounts[0].address.toLowerCase(),
    "private",
    "reporterA",
    "verifierB",
    "token",
    "seed",
    "roomCode",
  ])
    assert.ok(!text.includes(denied));
});
test("seated players, modified signatures, caps, exact close and stale payout are rejected", async (t) => {
  const f = await fixture(t);
  await assert.rejects(bet(f, 0, 0), /playing/);
  await bet(f, 2, 0, "1000000");
  await assert.rejects(bet(f, 2, 0), /limit|Not enough/);
  await assert.rejects(
    bet(f, 3, 0, "50000", { minPayout: "20000000" }),
    /Odds moved/,
  );
  const intent = {
    marketId: f.market.marketId,
    outcome: 0,
    amount: "50000",
    minPayout: "0",
    nonce: `0x${"99".repeat(32)}`,
    expiresAt: f.market.closesAt,
  };
  const signature = await accounts[3].signTypedData(betData(intent));
  await assert.rejects(
    f.store.bet(accounts[3].address, { ...intent, outcome: 1 }, signature),
    /signature/,
  );
  f.advance(30000);
  await assert.rejects(bet(f, 3, 1), /closed/);
});
test("one-sided, abandoned and failed-verifier matches refund exact stakes and cheers", async (t) => {
  const f = await fixture(t, {
    verifyRecord: async () => {
      throw Error("mismatch");
    },
  });
  await bet(f, 2, 0);
  await bet(f, 3, 1);
  await bet(f, 4, 0, "50000", { kind: "cheer" });
  f.advance(35000);
  await f.store.start(f.market.marketId);
  await f.store.finish(f.market.marketId, { result });
  assert.equal(f.store.snapshot(f.market.marketId).phase, "void");
  assert.equal(
    (await f.store.claim(f.market.marketId, accounts[2].address)).amount,
    "50000",
  );
  assert.equal(
    (await f.store.claim(f.market.marketId, accounts[4].address)).amount,
    "50000",
  );
  const second = await fixture(t);
  await bet(second, 2, 0);
  second.advance(30000);
  assert.equal((await second.store.list())[0].phase, "void");
  assert.equal(
    (await second.store.claim(second.market.marketId, accounts[2].address))
      .amount,
    "50000",
  );
});
test("restart turns interrupted rounds into durable pull refunds without resetting balances", async (t) => {
  const f = await fixture(t);
  await bet(f, 2, 0);
  const resumed = await createMarketStore({ dir: f.dir, now: f.now });
  assert.equal((await resumed.personal(accounts[2].address)).balance, "950000");
  assert.equal(
    (await resumed.claim(f.market.marketId, accounts[2].address)).amount,
    "50000",
  );
  const again = await createMarketStore({ dir: f.dir, now: f.now });
  assert.equal(
    (await again.claim(f.market.marketId, accounts[2].address)).amount,
    "0",
  );
});
test("separate verifier process actually replays a canonical pinned game result", async (t) => {
  const f = await fixture(t, { verifyRecord: undefined });
  await bet(f, 2, 0);
  await bet(f, 3, 1);
  f.advance(35000);
  await f.store.start(f.market.marketId);
  const game = gameById("star-catch"),
    room = {
      code: "ABC234",
      roundId: 1,
      active: [0, 1],
      match: { seed: 77 },
      replay: [],
      game: "star-catch",
      startedAt: f.now() - 1000,
    };
  const record = makeResult(
    room,
    game,
    [
      { slot: 0, score: 0 },
      { slot: 1, score: 0 },
    ],
    f.now(),
  );
  assert.equal(record.result.verification, "verified");
  await f.store.finish(f.market.marketId, record);
  const snapshot = f.store.snapshot(f.market.marketId);
  assert.equal(snapshot.replayVerified, true);
  assert.notEqual(snapshot.reports[0].address, snapshot.reports[1].address);
  assert.equal(snapshot.winMask, 3);
});
