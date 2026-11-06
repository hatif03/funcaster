/**
 * Placing validation, rank normalization and the payout rules, as pure functions.
 *
 * This is an independent TypeScript statement of what ConditionalPot computes, used by the
 * relay adapter and the console. docs/payout-vectors.json holds the contract's own answers
 * for every valid ranking of 2 to 4 seats, and payout.test.ts requires these functions to match.
 */

import type { RuleName } from "./signing";

/** Dense rank order indexed by seat: 1 is best, ties allowed, values 1..k with no gap. */
export function isDensePlacing(places: readonly number[]): boolean {
  const n = places.length;
  if (n < 2 || n > 4) return false;
  const seen = new Set<number>();
  for (const p of places) {
    if (!Number.isInteger(p) || p < 1 || p > n) return false;
    seen.add(p);
  }
  const k = Math.max(...places);
  for (let r = 1; r <= k; r++) if (!seen.has(r)) return false;
  return true;
}

/**
 * Converts competition ranks (1,1,3) into the dense ranks the contract requires (1,1,2).
 * Equal inputs stay tied and order is preserved; it never changes who beat whom.
 */
export function normalizeToDenseRanks(ranks: readonly number[]): number[] {
  for (const r of ranks) {
    if (!Number.isInteger(r) || r < 1)
      throw new RangeError(`Invalid rank: ${r}`);
  }
  const distinct = [...new Set(ranks)].sort((a, b) => a - b);
  return ranks.map((r) => distinct.indexOf(r) + 1);
}

/** Payout per seat, in base units. Floor division, remainder to the lowest-index seat of place 1. */
export function computePayouts(
  rule: RuleName,
  stake: bigint,
  places: readonly number[],
): bigint[] {
  if (!isDensePlacing(places))
    throw new RangeError(`Not a dense placing: ${places.join(",")}`);
  const total = stake * BigInt(places.length);
  const tiers = Math.max(...places);
  const count = (place: number) =>
    BigInt(places.filter((p) => p === place).length);

  let tier1 = total;
  let tier2 = 0n;
  if (rule === "TOP2_70_30" && tiers >= 2) {
    tier1 = (total * 70n) / 100n;
    tier2 = (total * 30n) / 100n;
  }

  const out = places.map((p) =>
    p === 1 ? tier1 / count(1) : p === 2 && tier2 > 0n ? tier2 / count(2) : 0n,
  );
  const paid = out.reduce((a, b) => a + b, 0n);
  const firstTop = places.indexOf(1);
  out[firstTop] = (out[firstTop] ?? 0n) + (total - paid);
  return out;
}
