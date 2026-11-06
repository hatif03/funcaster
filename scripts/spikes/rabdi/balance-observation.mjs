import assert from "node:assert/strict";
// Rabdi has head-only state. Bind the current balance to the last admitted nonce
// and exact receipt cost rather than racing a historical block balance request.
export async function observeBalanceAfter(reader, entry) {
  assert.equal(
    await reader.getTransactionCount({
      address: entry.from,
      blockTag: "latest",
    }),
    entry.nonce + 1,
    "Another confirmed transaction needs reconciliation",
  );
  assert.equal(
    await reader.getTransactionCount({
      address: entry.from,
      blockTag: "pending",
    }),
    entry.nonce + 1,
    "Pending transaction needs reconciliation",
  );
  const balance = await reader.getBalance({
    address: entry.from,
    blockTag: "latest",
  });
  assert.equal(
    balance,
    BigInt(entry.balanceBefore) - BigInt(entry.gasCost) - BigInt(entry.value),
    "Unexpected balance movement; reconcile before continuing",
  );
  entry.balanceAfter = String(balance);
  entry.balanceObservation =
    "HEAD_ONLY: latest balance matches pre-send observation minus verified receipt cost/value; no historical-state claim";
}
