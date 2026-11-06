import test from "node:test";
import assert from "node:assert/strict";
import {
  payoutVector,
  placesFromResult,
  validatePlaces,
} from "../../integrations/arc/payouts.mjs";
test("payout rules handle tier ties and put all rounding dust in the first winning seat", () => {
  assert.deepEqual(payoutVector(100n, [1, 2], "top2"), [140n, 60n]);
  assert.deepEqual(payoutVector(100n, [1, 1, 2], "top2"), [105n, 105n, 90n]);
  assert.deepEqual(payoutVector(101n, [2, 1, 2], "top2"), [45n, 213n, 45n]);
  assert.deepEqual(payoutVector(1n, [2, 1, 2], "top2"), [0n, 3n, 0n]);
  assert.deepEqual(payoutVector(1n, [1, 1, 2], "winner"), [2n, 1n, 0n]);
  assert.deepEqual(payoutVector(7n, [1, 1, 1], "top2"), [7n, 7n, 7n]);
});
test("every dense two-to-four-seat placing conserves the exact pot for every rule and boundary stake", () => {
  let count = 0;
  for (let size = 2; size <= 4; size++)
    for (let n = 0; n < size ** size; n++) {
      const places = Array.from(
        { length: size },
        (_, i) => (Math.floor(n / size ** i) % size) + 1,
      );
      try {
        validatePlaces(places);
      } catch {
        continue;
      }
      for (const stake of [
        1n,
        2n,
        7n,
        99n,
        100n,
        101n,
        500000n,
        ((1n << 256n) - 1n) / BigInt(size),
      ])
        for (const rule of [0, 1, 2]) {
          const payouts = payoutVector(stake, places, rule);
          assert.equal(
            payouts.reduce((a, b) => a + b),
            stake * BigInt(size),
          );
          assert.ok(payouts.every((p) => p >= 0n));
          for (let i = 0; i < size; i++)
            if (places[i] > (rule === 1 ? 2 : 1)) assert.equal(payouts[i], 0n);
          count++;
        }
    }
  assert.equal(count, (3 + 13 + 75) * 8 * 3);
});
test("only the pot vector is normalized; competition ranks and game hash stay unchanged", () => {
  const result = {
    status: "completed",
    verification: "verified",
    hash: "fixture",
    scores: [
      { slot: 0, rank: 1 },
      { slot: 2, rank: 1 },
      { slot: 1, rank: 3 },
    ],
  };
  const before = structuredClone(result);
  assert.deepEqual(placesFromResult(result, [2, 1, 0]), [1, 2, 1]);
  assert.deepEqual(result, before);
  for (const patch of [
    { status: "abandoned" },
    { status: "no-contest" },
    { verification: "failed" },
    { scores: [...result.scores, result.scores[0]] },
  ])
    assert.throws(() => placesFromResult({ ...result, ...patch }, [2, 1, 0]));
  assert.throws(() => placesFromResult(result, [0, 1, 3]));
});
test("malformed places, unknown rules and oversized or noninteger stakes fail closed", () => {
  for (const places of [[1], [1, 3], [0, 1], [2, 2], [1, 1.1], [1, 2, 3, 4, 5]])
    assert.throws(() => payoutVector(1n, places, 0));
  for (const stake of [0n, -1n, 1, (1n << 256n) - 1n])
    assert.throws(() => payoutVector(stake, [1, 2], 0));
  assert.throws(() => payoutVector(1n, [1, 2], "forged"));
});
