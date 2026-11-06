export const FREE_BAND = 1_000_000_000n;
export const PLATFORM_CAP_BPS = 1500;
export const address = (value) => {
  if (!/^0x[\da-fA-F]{40}$/.test(value || "") || /^0x0{40}$/.test(value))
    throw Error("INVALID_ADDRESS");
  return value.toLowerCase();
};
export function registration(input, config) {
  const creator = address(input.creator),
    platform = address(config.platformAddress);
  const price = BigInt(input.price || "1000000");
  if (price <= 0n || price > 100_000_000n) throw Error("INVALID_PRICE");
  const collaborators = input.collaborators || [
    { address: creator, bps: 10000 },
  ];
  if (
    !Array.isArray(collaborators) ||
    collaborators.length < 1 ||
    collaborators.length > 5
  )
    throw Error("INVALID_SPLIT");
  const recipients = collaborators.map((p) => ({
    address: address(p.address),
    bps: Number(p.bps),
  }));
  if (
    recipients.some(
      (p) => !Number.isInteger(p.bps) || p.bps < 1 || p.bps > 10000,
    ) ||
    recipients.reduce((n, p) => n + p.bps, 0) !== 10000 ||
    !recipients.some((p) => p.address === creator) ||
    new Set(recipients.map((p) => p.address)).size !== recipients.length
  )
    throw Error("INVALID_SPLIT");
  const referral = input.referralAddress
    ? address(input.referralAddress)
    : null;
  const referralBps = referral ? Number(input.referralBps ?? 1000) : 0;
  if (
    referral &&
    (!Number.isInteger(referralBps) || referralBps < 500 || referralBps > 2000)
  )
    throw Error("INVALID_REFERRAL");
  return {
    creator,
    platform,
    price: price.toString(),
    recipients,
    venue: config.venueAddress ? address(config.venueAddress) : null,
    venueBps: config.venueAddress ? 1000 : 0,
    referral,
    referralBps,
    standardBps: 1000,
    creatorBps: 500,
    capBps: PLATFORM_CAP_BPS,
    freeBand: FREE_BAND.toString(),
    asset: "USDC",
    decimals: 6,
  };
}
export function splitPayment(
  version,
  lifetime = "0",
  { creatorBrought = false, referred = false, atVenue = false } = {},
) {
  const amount = BigInt(version.price),
    prior = BigInt(lifetime);
  const remainingFree = prior >= FREE_BAND ? 0n : FREE_BAND - prior;
  const chargeable = amount > remainingFree ? amount - remainingFree : 0n;
  const bps = creatorBrought ? version.creatorBps : version.standardBps;
  if (!Number.isInteger(bps) || bps < 0 || bps > PLATFORM_CAP_BPS)
    throw Error("INVALID_FEE");
  const platform = (chargeable * BigInt(bps)) / 10000n;
  const venue =
    atVenue && version.venue
      ? (amount * BigInt(version.venueBps)) / 10000n
      : 0n;
  const referral =
    referred && version.referral
      ? (amount * BigInt(version.referralBps)) / 10000n
      : 0n;
  const remainder = amount - platform - venue - referral;
  if (remainder < 0n) throw Error("INVALID_SPLIT");
  const credits = new Map();
  const add = (who, n) => {
    if (n > 0n) credits.set(who, (credits.get(who) || 0n) + n);
  };
  add(version.platform, platform);
  if (venue) add(version.venue, venue);
  if (referral) add(version.referral, referral);
  let distributed = 0n;
  for (const p of version.recipients) {
    const n = (remainder * BigInt(p.bps)) / 10000n;
    add(p.address, n);
    distributed += n;
  }
  add(version.creator, remainder - distributed);
  return {
    amount: amount.toString(),
    platform: platform.toString(),
    venue: venue.toString(),
    referral: referral.toString(),
    creatorPool: remainder.toString(),
    freeAmount: (amount - chargeable).toString(),
    credits: Object.fromEntries(
      [...credits].map(([k, v]) => [k, v.toString()]),
    ),
  };
}
