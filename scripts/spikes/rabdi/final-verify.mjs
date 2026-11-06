// Independent public reads only. Never imports the owner operator or a private account.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { NETWORK, publicClient, serial } from "./protocol.mjs";
import { walkScores, classifyScore } from "./hall-reader.mjs";
import { verifyReceipts } from "./receipt-verify.mjs";
const root = new URL("../../../", import.meta.url),
  at = (p) => new URL(p, root),
  reader = publicClient();
const source = JSON.parse(
  await fs.readFile(at("docs/web3/spikes/rabdi-final-live.json"), "utf8"),
);
assert(source.complete, "Owner probe is not complete");
assert.equal(source.chainId, NETWORK.id);
assert.equal(await reader.getChainId(), NETWORK.id);
const pages = [],
  start = performance.now(),
  rows = await walkScores(reader, source.run, { onPage: (p) => pages.push(p) });
assert.equal(
  rows.length,
  2002,
  "One-day synthetic fixtures have expired or the dataset is incomplete",
);
const counts = { trusted: 0, unverified: 0, invalid: 0 };
for (const row of rows) counts[classifyScore(row, [NETWORK.owner])]++;
assert.deepEqual(counts, { trusted: 2000, unverified: 1, invalid: 1 });
const report = {
  at: new Date().toISOString(),
  scope: "INDEPENDENT PUBLIC READS ONLY",
  run: source.run,
  chainId: NETWORK.id,
  reader: {
    ...counts,
    rows: rows.length,
    milliseconds: performance.now() - start,
    pages,
  },
  receipts: [],
};
Object.assign(report, await verifyReceipts(reader, source.entries));
report.transientObservations = {
  source:
    "Owner-run observations linked to independently verified receipts; expired fixtures are not recreated",
  costs: Object.entries(source.checks)
    .filter(([id]) => id.startsWith("cost "))
    .map(([, v]) => v),
  atomicity: source.checks["atomic failed last operation"],
  expiry: source.checks["short expiry"],
};
await fs.writeFile(
  at("docs/web3/spikes/rabdi-final-verified.json"),
  serial(report),
);
console.log(serial(report));
