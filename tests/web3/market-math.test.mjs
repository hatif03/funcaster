import test from "node:test";
import assert from "node:assert/strict";
import {
  payoutVector,
  projectedPayout,
  claimPayout,
  resolveMarket,
  units,
} from "../../integrations/market/math.mjs";
test("winner and projected payouts match the locked plan vectors", () => {
  const p = [60, 30, 10, 0].map(units);
  assert.equal(payoutVector(p, 4, 0n, 200).payouts[2], units("98.20"));
  assert.equal(
    claimPayout(units(20), p[0], payoutVector(p, 1, 0n, 200).slices[0]),
    units("33.066666"),
  );
  assert.equal(projectedPayout(p, 2, units(10), 0n, 200), units("54.10"));
  assert.equal(projectedPayout(p, 0, units(10), 0n, 200), units("15.60"));
  assert.equal(projectedPayout(p, 3, units(10), 0n, 200), units("108"));
});
test("ties protect stakes, empty winners void, and cumulative floors conserve every unit", () => {
  assert.deepEqual(payoutVector([60, 20, 20].map(units), 3, 0n, 200).payouts, [
    units("69.80"),
    units("29.80"),
    0n,
  ]);
  assert.equal(payoutVector([units(40), 0n], 2, units(10), 200).void, true);
  const p = [33333333n, 66666667n],
    slice = payoutVector(p, 1, 10000000n).slices[0];
  let claimed = 0n;
  const paid = [10000001n, 10000001n, 13333331n].map((s) => {
    const value = claimPayout(s, p[0], slice, claimed);
    claimed += s;
    return value;
  });
  assert.deepEqual(paid, [33000003n, 33000004n, 43999993n]);
  assert.equal(
    paid.reduce((a, b) => a + b),
    110000000n,
  );
});
test("only complete verified human results produce winner masks", () => {
  const result = {
    status: "completed",
    verification: "verified",
    scores: [
      { slot: 1, rank: 1, outcome: "finished" },
      { slot: 3, rank: 1, outcome: "finished" },
    ],
  };
  assert.equal(resolveMarket([1, 3], result), 3);
  assert.equal(resolveMarket([1, 3], { ...result, status: "abandoned" }), 0);
  assert.equal(
    resolveMarket([1, 3], {
      ...result,
      scores: [result.scores[0], { slot: 3, rank: 2, outcome: "forfeit" }],
    }),
    0,
  );
});
