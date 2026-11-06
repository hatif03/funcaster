// Integer-only stake-protected pari-mutuel accounting. Six decimal play coins.
export const units = (value) => {
  if (!/^\d+(\.\d{1,6})?$/.test(String(value))) throw Error("Invalid amount");
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
};
export function payoutVector(pools, winMask, bonus = 0n, feeBps = 0) {
  pools = pools.map(BigInt);
  bonus = BigInt(bonus);
  if (
    pools.length < 2 ||
    pools.length > 4 ||
    pools.some((p) => p < 0n) ||
    bonus < 0n ||
    !Number.isInteger(feeBps) ||
    feeBps < 0 ||
    feeBps > 1000 ||
    !Number.isInteger(winMask) ||
    winMask < 0 ||
    winMask >= 1 << pools.length
  )
    throw Error("Invalid payout terms");
  const total = pools.reduce((a, b) => a + b, 0n);
  const winners = pools
    .map((p, i) => (p > 0n && winMask & (1 << i) ? i : -1))
    .filter((i) => i >= 0);
  if (!winners.length)
    return {
      void: true,
      fee: 0n,
      slices: pools.map(() => 0n),
      payouts: pools,
      sponsorRefund: bonus,
    };
  const winning = winners.reduce((sum, i) => sum + pools[i], 0n),
    losing = total - winning;
  const fee = (losing * BigInt(feeBps)) / 10_000n,
    profit = losing - fee + bonus;
  const slices = pools.map(() => 0n);
  winners.forEach((i, k) => {
    slices[i] =
      profit / BigInt(winners.length) +
      (k === 0 ? profit % BigInt(winners.length) : 0n);
  });
  return {
    void: false,
    fee,
    slices,
    payouts: pools.map((p, i) => (winners.includes(i) ? p + slices[i] : 0n)),
    sponsorRefund: 0n,
  };
}
export function claimPayout(stake, pool, slice, claimed = 0n) {
  [stake, pool, slice, claimed] = [stake, pool, slice, claimed].map(BigInt);
  if (pool <= 0n || stake < 0n || claimed < 0n || claimed + stake > pool)
    throw Error("Invalid claim");
  return stake + (slice * (claimed + stake)) / pool - (slice * claimed) / pool;
}
export function projectedPayout(
  pools,
  outcome,
  amount,
  bonus = 0n,
  feeBps = 0,
) {
  pools = pools.map(BigInt);
  amount = BigInt(amount);
  bonus = BigInt(bonus);
  if (
    !Number.isInteger(outcome) ||
    outcome < 0 ||
    outcome >= pools.length ||
    amount <= 0n
  )
    throw Error("Invalid prediction");
  payoutVector(pools, 1 << outcome, bonus, feeBps);
  const losing = pools.reduce(
    (sum, p, i) => sum + (i === outcome ? 0n : p),
    0n,
  );
  return (
    amount +
    ((losing - (losing * BigInt(feeBps)) / 10_000n + bonus) * amount) /
      (pools[outcome] + amount)
  );
}
export function resolveMarket(slots, result) {
  if (
    result?.status !== "completed" ||
    result.verification !== "verified" ||
    !Array.isArray(result.scores) ||
    result.scores.length !== slots.length ||
    new Set(result.scores.map((s) => s.slot)).size !== slots.length ||
    result.scores.some(
      (s) =>
        !slots.includes(s.slot) ||
        ["forfeit", "removed", "abandoned", "idle"].includes(s.outcome),
    )
  )
    return 0;
  return result.scores.reduce(
    (mask, s) =>
      s.rank === 1 && (!s.outcome || s.outcome === "finished")
        ? mask | (1 << slots.indexOf(s.slot))
        : mask,
    0,
  );
}
