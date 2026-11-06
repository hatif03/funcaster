import test from "node:test";
import assert from "node:assert/strict";
import {
  guardMarketQuote,
  guardCommercePayment,
  assertSuccessfulMarket,
  admittedOnce,
  confirmIndependentPositions,
} from "../../scripts/market-hosted-acceptance.mjs";
import { commerceId } from "../../integrations/commerce/signatures.mjs";
import { main } from "../../scripts/web3-hosted-market.mjs";
const address = (n) => `0x${n.toString(16).padStart(40, "0")}`;
test("a void or refund never passes the hosted settlement success check", () => {
  assert.doesNotThrow(() =>
    assertSuccessfulMarket({ phase: "final", cheersPhase: "paid" }),
  );
  assert.throws(
    () => assertSuccessfulMarket({ phase: "void", cheersPhase: "refund" }),
    /success path/,
  );
  assert.throws(
    () => assertSuccessfulMarket({ phase: "final", cheersPhase: "refund" }),
    /human seats/,
  );
});
test("hosted acceptance refuses public execution without explicit confirmation and pinned origin", async () => {
  await assert.rejects(main([]));
  await assert.rejects(
    main([
      "--apply",
      "--confirm-funcaster-testnet",
      "--url",
      "https://example.com",
    ]),
    /pinned/,
  );
});
test("hosted market quote binds reviewed contracts, actor, exact 0.05 amount and testnet", () => {
  const pins = {
    MARKET_POT_ADDRESS: address(1),
    MARKET_SPLIT_ADDRESS: address(2),
  };
  const expected = {
    marketId: "0x" + "ab".repeat(32),
    kind: "prediction",
    outcome: 1,
    address: address(3),
  };
  const q = {
    ...expected,
    marketRef: expected.marketId,
    bettor: expected.address,
    contract: address(1),
    asset: "0x3600000000000000000000000000000000000000",
    chainId: 5042002,
    chainMarketId: "1",
    symbol: "USDC",
    amount: "50000",
    minPayout: "0",
    validAfter: "0",
    validBefore: "110",
    salt: "0x" + "cd".repeat(32),
  };
  assert.equal(
    guardMarketQuote(q, expected, pins, 100000).message.value,
    50000n,
  );
  for (const change of [
    { amount: "50001" },
    { contract: address(9) },
    { bettor: address(8) },
    { chainId: 1 },
    { outcome: 0 },
  ])
    assert.throws(() =>
      guardMarketQuote({ ...q, ...change }, expected, pins, 100000),
    );
});
test("uncertain acceptance action reconciles only and never silently submits again", async () => {
  const journal = {};
  let submissions = 0,
    saves = 0;
  const options = {
    save: async () => saves++,
    reconcile: async () => null,
    submit: async () => {
      submissions++;
      throw Error("Lost acknowledgement");
    },
  };
  await assert.rejects(admittedOnce(journal, "bet", options), /Lost/);
  await assert.rejects(
    admittedOnce(journal, "bet", options),
    /No automatic resend/,
  );
  assert.equal(submissions, 1);
  assert.deepEqual(
    await admittedOnce(journal, "bet", {
      ...options,
      reconcile: async () => ({ confirmed: true }),
    }),
    { confirmed: true },
  );
  assert.deepEqual(await admittedOnce(journal, "bet", options), {
    confirmed: true,
  });
  assert.equal(submissions, 1);
  assert.equal(saves, 2);
});
test("hosted creator pass authorization caps 0.50 and binds exact payer, room, operation and router", () => {
  const expected = {
    router: address(1),
    buyer: address(2),
    operationId: "accept-pass",
    versionId: "ab".repeat(32),
    roomCode: "ROOM01",
  };
  const prepared = {
    config: { chainId: 5042002, contract: expected.router },
    expiresAt: 400000,
    input: {
      versionId: "0x" + expected.versionId,
      paymentId: commerceId(expected.operationId),
      payer: expected.buyer,
      roomCode: expected.roomCode,
      price: "500000",
      attribution: false,
      referred: false,
      atVenue: false,
      chainTime: "100",
      balance: "1100000",
    },
  };
  assert.equal(
    guardCommercePayment(prepared, expected, 100000).authorization.message
      .value,
    500000n,
  );
  for (const change of [
    { price: "1000000" },
    { payer: address(3) },
    { roomCode: "OTHER1" },
    { paymentId: commerceId("other") },
  ])
    assert.throws(() =>
      guardCommercePayment(
        { ...prepared, input: { ...prepared.input, ...change } },
        expected,
        100000,
      ),
    );
});

test("prediction/cheer confirmations start together and fully settle before reporting a failed branch", async () => {
  const events = [],
    release = [];
  const work = confirmIndependentPositions(
    [0, 1, 2].map((i) => async () => {
      events.push(`start${i}`);
      await new Promise((resolve) => (release[i] = resolve));
      events.push(`end${i}`);
      if (i === 0) throw Error("fixture-read-failed");
      return i;
    }),
  );
  assert.deepEqual(events, ["start0", "start1", "start2"]);
  release[0]();
  let finished = false;
  work.catch(() => {
    finished = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    finished,
    false,
    "a pause cannot start while other submissions are in flight",
  );
  release[1]();
  release[2]();
  await assert.rejects(work, /fixture-read-failed/);
  assert.deepEqual(events.slice(3).sort(), ["end0", "end1", "end2"]);
});
