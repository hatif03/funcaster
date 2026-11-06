import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computePayouts,
  isDensePlacing,
  normalizeToDenseRanks,
} from "./payout";
import { RULES, type RuleName } from "./signing";

interface Vector {
  seats: number;
  rule: RuleName;
  stake: string;
  places: number[];
  payouts: string[];
}

// Produced by the Solidity contract itself: bash scripts/dump-vectors.sh
const vectors = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../../docs/payout-vectors.json"),
    "utf8",
  ),
) as Vector[];

describe("payout vectors produced by the contract", () => {
  it("cover every dense ranking of 2, 3 and 4 seats under all three rules", () => {
    const perRule = (n: number) =>
      vectors.filter((v) => v.seats === n && v.rule === "TOP2_70_30").length;
    expect(perRule(2)).toBe(3);
    expect(perRule(3)).toBe(13);
    expect(perRule(4)).toBe(75);
    expect(vectors.length).toBe(91 * RULES.length);
  });

  it("are matched exactly by the TypeScript payout rules", () => {
    for (const v of vectors) {
      const got = computePayouts(v.rule, BigInt(v.stake), v.places).map(String);
      expect(got, `${v.rule} ${v.places.join(",")}`).toEqual(v.payouts);
    }
  });

  it("always sum to the full pot", () => {
    for (const v of vectors) {
      const sum = v.payouts.reduce((a, b) => a + BigInt(b), 0n);
      expect(sum).toBe(BigInt(v.stake) * BigInt(v.seats));
    }
  });

  it("accept exactly the placings the contract accepts", () => {
    for (const v of vectors) expect(isDensePlacing(v.places)).toBe(true);
  });
});

describe("isDensePlacing", () => {
  it.each([
    [[1, 2]],
    [[1, 1]],
    [[2, 1]],
    [[1, 1, 2]],
    [[3, 2, 1]],
    [[1, 2, 2, 3]],
    [[1, 1, 1, 1]],
  ])("accepts %j", (p) => expect(isDensePlacing(p)).toBe(true));

  it.each([
    [[]],
    [[1]],
    [[0, 1]],
    [[2, 2]],
    [[1, 1, 3]],
    [[1, 3, 3]],
    [[1, 2, 4]],
    [[1, 2, 3, 3, 3]],
    [[1.5, 1]],
  ])("rejects %j", (p) => expect(isDensePlacing(p)).toBe(false));
});

describe("normalizeToDenseRanks", () => {
  it("turns competition ranks into the dense ranks the contract needs", () => {
    expect(normalizeToDenseRanks([1, 1, 3])).toEqual([1, 1, 2]);
    expect(normalizeToDenseRanks([1, 2, 2, 4])).toEqual([1, 2, 2, 3]);
    expect(normalizeToDenseRanks([3, 1, 1, 3])).toEqual([2, 1, 1, 2]);
    expect(normalizeToDenseRanks([1, 2, 3])).toEqual([1, 2, 3]);
    expect(normalizeToDenseRanks([5, 5])).toEqual([1, 1]);
  });

  it("always yields a valid placing and keeps the order of results", () => {
    for (const ranks of [
      [1, 1, 3],
      [1, 4, 4, 2],
      [2, 2, 2],
      [4, 3, 2, 1],
      [1, 2],
    ]) {
      const dense = normalizeToDenseRanks(ranks);
      expect(isDensePlacing(dense)).toBe(true);
      for (let i = 0; i < ranks.length; i++) {
        for (let j = 0; j < ranks.length; j++) {
          expect(Math.sign(ranks[i] - ranks[j])).toBe(
            Math.sign(dense[i] - dense[j]),
          );
        }
      }
    }
  });

  it("rejects ranks below one", () => {
    expect(() => normalizeToDenseRanks([0, 1])).toThrow(RangeError);
  });
});

describe("computePayouts", () => {
  it("matches the hand-computed rounding cases", () => {
    expect(computePayouts("WINNER_TAKES_ALL", 1_000_001n, [1, 1, 2])).toEqual([
      1_500_002n,
      1_500_001n,
      0n,
    ]);
    expect(computePayouts("TOP2_70_30", 1_000_001n, [1, 2, 3, 4])).toEqual([
      2_800_003n,
      1_200_001n,
      0n,
      0n,
    ]);
    expect(computePayouts("TOP2_70_30", 1_000_001n, [2, 1, 1, 2])).toEqual([
      600_000n,
      1_400_003n,
      1_400_001n,
      600_000n,
    ]);
  });

  it("refuses a non-dense placing", () => {
    expect(() => computePayouts("WINNER_TAKES_ALL", 1n, [1, 1, 3])).toThrow(
      RangeError,
    );
  });
});
