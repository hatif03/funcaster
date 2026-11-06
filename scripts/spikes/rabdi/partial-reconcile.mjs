// Read-only recovery: never imports the operator, wallet or private journal.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  NETWORK,
  publicClient,
  publicRpc,
  estimateBatch,
  serial,
} from "./protocol.mjs";
import { scoreFixture } from "./final-protocol.mjs";
import { walkScores, classifyScore } from "./hall-reader.mjs";
import { verifyReceipts } from "./receipt-verify.mjs";
const at = (p) => new URL("../../../" + p, import.meta.url);
const source = JSON.parse(
  await fs.readFile(at("docs/web3/spikes/rabdi-final-live.json"), "utf8"),
);
const reader = publicClient();
assert.equal(source.chainId, NETWORK.id);
assert.equal(await reader.getChainId(), NETWORK.id);
const report = {
  at: new Date().toISOString(),
  scope: "INDEPENDENT PUBLIC READS ONLY; PARTIAL RUN, NOT G0 PASS",
  run: source.run,
};
Object.assign(report, await verifyReceipts(reader, source.entries));
console.log(`Reconciled ${report.receipts.length} canonical receipts.`);
const batches = source.entries.filter((e) => /^scores \d+$/.test(e.id));
for (let i = 0; i < batches.length; i++) {
  assert.equal(batches[i].id, "scores " + i * 20, "Score journal has a gap");
  assert.equal(batches[i].createCount, 20);
}
const next = batches.length * 20;
const pages = [];
const rows = await walkScores(reader, source.run, {
  onPage: (p) => pages.push(p),
});
// This recovery command is intentionally limited to a stop during score seeding.
assert.equal(
  rows.length,
  next,
  "Unexpected or expired rows; manual reconciliation required",
);
assert(rows.every((row) => classifyScore(row, [NETWORK.owner]) === "trusted"));
assert.deepEqual(
  rows.map((r) => r.ordinal.value).sort((a, b) => a - b),
  Array.from({ length: next }, (_, i) => i),
);
const expectedNonce =
  Math.max(
    ...source.entries
      .filter((e) => e.from.toLowerCase() === NETWORK.owner.toLowerCase())
      .map((e) => e.nonce),
  ) + 1;
const latest = await reader.getTransactionCount({
  address: NETWORK.owner,
  blockTag: "latest",
});
const pending = await reader.getTransactionCount({
  address: NETWORK.owner,
  blockTag: "pending",
});
assert.equal(latest, expectedNonce, "Unjournalled confirmed transaction; stop");
assert.equal(pending, latest, "Pending transaction; stop");
report.reader = { rows: rows.length, trusted: rows.length, pages };
report.nonces = { latest, pending, expected: expectedNonce };
const ownerEntries = source.entries.filter(
  (e) => e.from.toLowerCase() === NETWORK.owner.toLowerCase(),
);
const expectedBalance =
  BigInt(ownerEntries[0].balanceBefore) -
  ownerEntries.reduce(
    (sum, e) => sum + BigInt(e.gasCost) + BigInt(e.value),
    0n,
  );
const currentBalance = await reader.getBalance({
  address: NETWORK.owner,
  blockTag: "latest",
});
assert.equal(
  currentBalance,
  expectedBalance,
  "Aggregate balance mismatch; reconcile first",
);
report.balance = {
  current: String(currentBalance),
  expected: String(expectedBalance),
  initialOwnerObservation: ownerEntries[0].balanceBefore,
};
report.remainingScoreRows = 2000 - next;
assert(next < 2000, "Use final-verify after the complete owner run");
const estimate = await estimateBatch(publicRpc(), {
  creates: Array.from({ length: 20 }, (_, i) =>
    scoreFixture(source.run, next + i),
  ),
});
report.nextUnsignedBatch = {
  id: "scores " + next,
  estimate: String(estimate.estimate),
  signed: false,
  broadcast: false,
};
report.transientObservations = {
  source:
    "Owner observations linked to verified receipts; expired fixtures not recreated",
  checks: source.checks,
};
await fs.writeFile(
  at("docs/web3/spikes/rabdi-partial-verified.json"),
  serial(report),
);
console.log(
  serial({
    verifiedReceipts: report.receipts.length,
    rows: rows.length,
    nonces: report.nonces,
    next: report.nextUnsignedBatch,
    gasTGLM: report.gasTGLM,
  }),
);
