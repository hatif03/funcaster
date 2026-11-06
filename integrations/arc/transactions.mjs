import { createTransactions } from "../shared/transactions.mjs";

// Separate durable journals for the relayer and the proposal-only oracle.
// No credential loading or automatic activation; the owner-operated provider
// injects its signer after public deployment/domain and budget preflight.
export function createArcTransactions({ role, ...options }) {
  if (!["relayer", "oracle"].includes(role))
    throw Error("Unknown Arc signer role");
  if (
    !Number.isSafeInteger(options.maxPerRoom) ||
    options.maxPerRoom <= 0 ||
    !Number.isSafeInteger(options.maxPerHour) ||
    options.maxPerHour <= 0
  )
    throw Error("Arc requires explicit room and hourly transaction caps");
  return createTransactions({
    ...options,
    lane: `arc-${role}`,
    continueAfterRevert: true,
  });
}
