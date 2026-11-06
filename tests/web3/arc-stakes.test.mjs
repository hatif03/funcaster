import test from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { createStakesAttempt } from "../../integrations/arc/stakes.mjs";
import {
  settleData,
  contestData,
  placesHash,
} from "../../integrations/arc/signatures.mjs";
// Public deterministic keys, offline signatures only. Never fund these accounts.
const accounts = ["11", "22", "33", "44"].map((s) =>
  privateKeyToAccount(`0x${s.repeat(32)}`),
);
const potId = `0x${"aa".repeat(32)}`,
  termsHash = `0x${"bb".repeat(32)}`;
const config = {
  mode: "on",
  chainId: 5042002,
  contract: `0x${"55".repeat(20)}`,
};
function fixture(n = 2, minHumans = 2) {
  let time = 1_800_000_000_000,
    block = 1;
  const roster = accounts.slice(0, n).map((a, slot) => ({
    slot,
    address: a.address,
    binding: `seat-${slot}`,
    kind: "human",
    ready: true,
    connected: true,
  }));
  const terms = {
    stake: "500000",
    rule: "top2",
    fundDeadline: time / 1000 + 180,
    settleDeadline: time / 1000 + 900,
    minPlaySeconds: 60,
    challengeWindow: 120,
  };
  const engine = createStakesAttempt({
    potId,
    config,
    termsHash,
    terms,
    roster,
    gameKey: "kart:rules",
    now: () => time,
    minHumans,
  });
  const context = { gameKey: "kart:rules", roster, workerUp: true };
  const lockedAt = time / 1000;
  const proof = (patch = {}) => ({
    ...config,
    potId,
    termsHash,
    blockNumber: String(block++),
    blockHash: `0x${"cc".repeat(32)}`,
    observedAt: time,
    chainTime: time / 1000,
    state: "Locked",
    fundedBitmap: (1 << n) - 1,
    lockedAt,
    ...patch,
  });
  const result = {
    matchId: "round.ROOMAA.1",
    hash: "dd".repeat(32),
    status: "completed",
    verification: "verified",
    scores: roster.map((r, i) => ({ slot: r.slot, rank: i + 1 })),
  };
  const start = () => {
    assert.equal(engine.observe(proof()), true);
    engine.started(result.matchId, context);
  };
  return {
    engine,
    context,
    proof,
    result,
    start,
    terms,
    advance: (ms) => (time += ms),
    sign: (slot, kind = "settle") =>
      accounts[slot].signTypedData(
        kind === "settle"
          ? settleData(config, {
              potId,
              places: result.scores.map((s) => s.rank),
            })
          : contestData(config, potId),
      ),
  };
}
test("start requires a fresh canonical Locked observation with exactly the same human roster and rules", () => {
  const f = fixture();
  assert.match(f.engine.startReason(f.context), /Checking/);
  f.engine.observe(f.proof({ state: "Funding", fundedBitmap: 1 }));
  assert.match(f.engine.startReason(f.context), /1 of 2/);
  f.engine.observe(f.proof());
  assert.equal(f.engine.startReason(f.context), null);
  for (const patch of [
    { gameKey: "other" },
    { roster: f.context.roster.slice(1) },
    { roster: f.context.roster.map((r) => ({ ...r, binding: "replacement" })) },
    { roster: f.context.roster.map((r) => ({ ...r, connected: false })) },
  ])
    assert.match(f.engine.startReason({ ...f.context, ...patch }), /changed/);
  assert.match(
    f.engine.startReason({ ...f.context, workerUp: false }),
    /Checking/,
  );
  f.advance(5001);
  assert.match(f.engine.startReason(f.context), /Checking/);
});
test("mock, wrong-domain, stale and inconsistent observations cannot unlock a real attempt", () => {
  for (const patch of [
    { mode: "mock" },
    { chainId: 1 },
    { termsHash: potId },
    { potId: termsHash },
    { contract: accounts[0].address },
    { observedAt: 0 },
    { chainTime: 0 },
    { fundedBitmap: 1 },
    { blockHash: "fake" },
  ]) {
    const f = fixture();
    assert.equal(f.engine.observe(f.proof(patch)), false);
    assert.match(f.engine.startReason(f.context), /Checking/);
  }
  const f = fixture(),
    p = f.proof();
  f.engine.observe(p);
  assert.equal(f.engine.observe({ ...p, blockHash: potId }), false);
  assert.match(f.engine.startReason(f.context), /Checking/);
  assert.equal(
    f.engine.observe(f.proof({ state: "Funding", fundedBitmap: 1 })),
    false,
  );
});
test("one pot starts once, binds to the round and cannot settle a different or modified roster", () => {
  const f = fixture();
  f.start();
  assert.throws(() => f.engine.started("other", f.context));
  assert.throws(() => f.engine.cancel());
  assert.equal(
    f.engine.finish({ ...f.result, matchId: "other" }, { humansRemaining: 2 }),
    false,
  );
  assert.equal(
    f.engine.finish(
      {
        ...f.result,
        scores: [
          { slot: 2, rank: 1 },
          { slot: 3, rank: 2 },
        ],
      },
      { humansRemaining: 2 },
    ),
    false,
  );
  assert.equal(f.engine.view().abandoned, true);
  assert.deepEqual(f.engine.commands(), []);
});
test("verified completion waits five seconds, verifies every signature, and emits one ordered cooperative command", async () => {
  const f = fixture();
  f.start();
  const before = structuredClone(f.result);
  assert.equal(f.engine.finish(f.result, { humansRemaining: 2 }), true);
  assert.equal(await f.engine.sign(0, "settle", await f.sign(0)), false);
  f.advance(5000);
  f.engine.observe(f.proof());
  assert.equal(await f.engine.sign(0, "settle", await f.sign(1)), false);
  assert.equal(await f.engine.sign(0, "settle", await f.sign(0)), true);
  assert.deepEqual(f.engine.commands(), []);
  assert.equal(await f.engine.sign(1, "settle", await f.sign(1)), true);
  const command = f.engine.commands()[0];
  assert.equal(command.kind, "settle");
  assert.deepEqual(command.payload.places, [1, 2]);
  assert.deepEqual(command.payload.sigs, [await f.sign(0), await f.sign(1)]);
  assert.deepEqual(f.engine.commands(), [command]);
  assert.deepEqual(f.result, before);
  assert.equal(
    JSON.stringify(f.engine.view()).includes(command.payload.sigs[0]),
    false,
  );
});
test("dispute stops cooperative signing, oracle waits, then contest wins over finalize", async () => {
  const f = fixture();
  f.start();
  f.engine.finish(f.result, { humansRemaining: 2 });
  assert.equal(
    await f.engine.sign(1, "contest", await f.sign(1, "contest")),
    true,
  );
  f.advance(5000);
  f.engine.observe(f.proof());
  assert.equal(await f.engine.sign(0, "settle", await f.sign(0)), false);
  assert.deepEqual(f.engine.commands(), []);
  f.advance(55000);
  f.engine.observe(f.proof());
  assert.equal(f.engine.commands()[0].kind, "propose");
  f.engine.observe(
    f.proof({
      state: "Proposed",
      proposalAt: 1_800_000_060,
      placesHash: placesHash([1, 2]),
    }),
  );
  assert.equal(f.engine.commands()[0].kind, "contest");
  f.engine.observe(f.proof({ state: "Contested" }));
  assert.equal(f.engine.commands()[0].kind, "refund");
});
test("a vanished signer uses oracle only after the minimum play delay and finalizes only the matching matured proposal", () => {
  const f = fixture();
  f.start();
  f.engine.finish(f.result, { humansRemaining: 2 });
  f.advance(60000);
  f.engine.observe(f.proof({ lockedAt: 1_800_000_059 }));
  assert.deepEqual(f.engine.commands(), []);
  f.engine.observe(f.proof());
  assert.equal(f.engine.commands()[0].kind, "propose");
  const proposal = {
    state: "Proposed",
    proposalAt: 1_800_000_060,
    placesHash: placesHash([1, 2]),
  };
  f.engine.observe(f.proof(proposal));
  assert.deepEqual(f.engine.commands(), []);
  f.advance(120000);
  f.engine.observe(f.proof({ ...proposal, placesHash: placesHash([2, 1]) }));
  assert.deepEqual(f.engine.commands(), []);
  f.engine.observe(f.proof(proposal));
  assert.equal(f.engine.commands()[0].kind, "finalize");
});
test("abandoned, unverified or under-minimum-human games never produce settlement or oracle proposals", () => {
  for (const patch of [
    { status: "abandoned" },
    { status: "no-contest" },
    { verification: "unverified" },
    {},
  ]) {
    const f = fixture(3, 3);
    f.start();
    assert.equal(
      f.engine.finish({ ...f.result, ...patch }, { humansRemaining: 2 }),
      false,
    );
    f.advance(60000);
    f.engine.observe(f.proof());
    assert.deepEqual(f.engine.commands(), []);
    f.advance(840000);
    f.engine.observe(f.proof());
    assert.equal(f.engine.commands()[0].kind, "refund");
  }
});
test("cancelling an unstarted pot allows free play but retains a refund obligation until the deadline", () => {
  const f = fixture();
  f.engine.observe(f.proof({ state: "Funding", fundedBitmap: 1 }));
  f.engine.cancel();
  assert.equal(f.engine.startReason(f.context), null);
  assert.deepEqual(f.engine.commands(), []);
  f.advance(180000);
  f.engine.observe(f.proof({ state: "Funding", fundedBitmap: 1 }));
  assert.equal(f.engine.commands()[0].kind, "refund");
  f.engine.observe(f.proof({ state: "Refunded", fundedBitmap: 1 }));
  assert.deepEqual(
    f.engine.commands().map((c) => c.kind),
    ["claim", "claim"],
  );
  assert.equal(f.engine.view().status, "refunded");
});
test("an agreement cannot be silently revoked or replayed across a different pot", async () => {
  const f = fixture();
  f.start();
  f.engine.finish(f.result, { humansRemaining: 2 });
  f.advance(5000);
  f.engine.observe(f.proof());
  const wrong = await accounts[0].signTypedData(
    settleData(config, { potId: termsHash, places: [1, 2] }),
  );
  assert.equal(await f.engine.sign(0, "settle", wrong), false);
  assert.equal(await f.engine.sign(0, "settle", await f.sign(0)), true);
  assert.equal(
    await f.engine.sign(0, "contest", await f.sign(0, "contest")),
    false,
  );
});
