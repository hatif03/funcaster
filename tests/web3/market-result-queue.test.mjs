import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createLiveMarketStore } from "../../server/market/live-store.cjs";

const address = (n) => `0x${n.toString(16).padStart(40, "0")}`;
const record = {
  result: {
    status: "completed",
    verification: "verified",
    hash: "a".repeat(64),
  },
};
async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-market-result-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let clock = 1_000_000;
  const jobs = [],
    state = { marketStatus: 0, cheerStatus: 1, funded: 2, unavailable: false };
  const params = { closeTime: 1070, resolveDeadline: 2000 };
  const store = await createLiveMarketStore({
    config: {
      WEB3_DATA_DIR: dir,
      ARC_USDC: address(6),
      MARKET_OPERATOR_ADDRESS: address(1),
      MARKET_REPORTER_A_ADDRESS: address(2),
      MARKET_VERIFIER_ADDRESS: address(3),
    },
    now: () => clock,
    outbox: {
      async enqueue(job) {
        const saved = { ...job, id: String(jobs.length + 1) };
        jobs.push(saved);
        return saved;
      },
    },
    readReceipt: async (id) => ({
      status: "done",
      mock: false,
      data:
        jobs.find((j) => j.id === id)?.type === "market.create"
          ? { marketId: "1" }
          : {},
    }),
    chains: {
      market: {
        deploymentConfig: { contract: address(4), chainId: 5042002 },
        deployment: async () => ({ timestamp: 1000n }),
        snapshot: async () => {
          if (state.unavailable) throw Error("Temporary RPC outage");
          return {
            status: state.marketStatus,
            chainTime: clock / 1000,
            params,
            pools: ["50000", state.funded > 1 ? "50000" : "0"],
            fundedOutcomes: state.funded,
          };
        },
      },
      cheer: {
        deploymentConfig: { contract: address(5), chainId: 5042002 },
        snapshot: async () => ({
          status: state.cheerStatus,
          chainTime: clock / 1000,
          params,
          total: "50000",
        }),
      },
    },
  });
  t.after(() => store.close());
  const m = await store.create({
    game: "race",
    title: "Race",
    seats: [
      { slot: 0, address: address(10) },
      { slot: 1, address: address(11) },
    ],
    frozenContext: { bundleHash: "b".repeat(64) },
  });
  clock = 1_076_000;
  await store.poll();
  await store.start(m.marketRef, { matchId: "private-match" });
  const reportTypes = () =>
    jobs
      .filter((j) => /^(market\.report|cheer\.report|verify\.)/.test(j.type))
      .map((j) => j.type);
  return {
    store,
    id: m.marketRef,
    state,
    reportTypes,
    advance: () => {
      clock += 3100;
    },
  };
}

test("thin or void prediction pools skip both reporters while open cheers still settle", async (t) => {
  for (const marketStatus of [0, 2]) {
    const f = await fixture(t);
    f.state.marketStatus = marketStatus;
    f.state.funded = 1;
    await f.store.finish(f.id, record);
    assert.deepEqual(f.reportTypes(), ["cheer.report", "verify.cheer"]);
  }
});
test("funded predictions report independently of an already refunded cheer pool", async (t) => {
  const f = await fixture(t);
  f.state.cheerStatus = 3;
  await f.store.finish(f.id, record);
  assert.deepEqual(f.reportTypes(), ["market.report", "verify.market"]);
});
test("temporary proof outage preserves the result and queues it once after fresh readback", async (t) => {
  const f = await fixture(t);
  f.state.unavailable = true;
  await f.store.finish(f.id, record);
  assert.deepEqual(f.reportTypes(), []);
  assert.ok(f.store.snapshot(f.id).pendingResult);
  f.state.unavailable = false;
  f.advance();
  await f.store.poll();
  assert.deepEqual(f.reportTypes(), [
    "market.report",
    "verify.market",
    "cheer.report",
    "verify.cheer",
  ]);
  assert.equal(f.store.snapshot(f.id).pendingResult, undefined);
  f.advance();
  await f.store.poll();
  assert.equal(f.reportTypes().length, 4);
});
