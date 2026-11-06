// Integer-only payout contract shared by relay and phone. Canonical game ranks
// remain untouched; only the pot's dense placing vector is derived from them.
export const PAYOUT_RULES = Object.freeze({ winner: 0, top2: 1, equal: 2 });
const MAX_UINT256 = (1n << 256n) - 1n;
export function validatePlaces(places) {
  if (
    !Array.isArray(places) ||
    places.length < 2 ||
    places.length > 4 ||
    places.some((p) => !Number.isInteger(p) || p < 1 || p > places.length)
  )
    throw Error("Expected two to four valid places");
  const ranks = [...new Set(places)].sort((a, b) => a - b);
  if (ranks.some((p, i) => p !== i + 1))
    throw Error("Pot places must have no rank gaps");
  return [...places];
}
export function payoutVector(stake, places, rule) {
  validatePlaces(places);
  if (
    typeof stake !== "bigint" ||
    stake <= 0n ||
    stake > MAX_UINT256 / BigInt(places.length)
  )
    throw Error("Stake exceeds uint256 pot bounds");
  const ruleId = typeof rule === "string" ? PAYOUT_RULES[rule] : rule;
  if (![0, 1, 2].includes(ruleId)) throw Error("Unknown payout rule");
  const total = stake * BigInt(places.length),
    out = places.map(() => 0n);
  const first = places.flatMap((p, i) => (p === 1 ? [i] : [])),
    second = places.flatMap((p, i) => (p === 2 ? [i] : []));
  const split = (pool, winners) => {
    for (const i of winners) out[i] += pool / BigInt(winners.length);
  };
  if (ruleId === 1 && second.length) {
    // Divide before multiplying to avoid uint256 intermediate overflow on-chain.
    const share = (n) => (total / 100n) * n + ((total % 100n) * n) / 100n;
    split(share(70n), first);
    split(share(30n), second);
  } else split(total, first);
  out[first[0]] += total - out.reduce((a, b) => a + b, 0n);
  return out;
}
export function placesFromResult(result, seatSlots) {
  if (result?.status !== "completed" || result.verification !== "verified")
    throw Error("Only verified completed matches can settle");
  if (
    !Array.isArray(seatSlots) ||
    seatSlots.length < 2 ||
    seatSlots.length > 4 ||
    new Set(seatSlots).size !== seatSlots.length ||
    seatSlots.some((s) => !Number.isInteger(s) || s < 0 || s > 3)
  )
    throw Error("Invalid frozen seat roster");
  if (
    !Array.isArray(result.scores) ||
    result.scores.length !== seatSlots.length ||
    new Set(result.scores.map((s) => s.slot)).size !== seatSlots.length
  )
    throw Error("Result roster differs from the pot");
  const ranks = seatSlots.map(
    (slot) => result.scores.find((s) => s.slot === slot)?.rank,
  );
  if (
    ranks.some((r) => !Number.isInteger(r) || r < 1 || r > seatSlots.length) ||
    !ranks.includes(1)
  )
    throw Error("Invalid game ranking");
  const ordered = [...new Set(ranks)].sort((a, b) => a - b);
  return validatePlaces(ranks.map((r) => ordered.indexOf(r) + 1));
}
