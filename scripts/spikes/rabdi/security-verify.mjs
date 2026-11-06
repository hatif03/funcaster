// Independent public readback of surviving cost and atomicity fixtures. No key.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { eq } from "@arkiv-network/sdk/query";
import { NETWORK, Probe, publicClient, same, serial } from "./protocol.mjs";
import { costFixture } from "./final-protocol.mjs";
const at = (p) => new URL("../../../" + p, import.meta.url);
const source = JSON.parse(
  await fs.readFile(at("docs/web3/spikes/rabdi-final-live.json"), "utf8"),
);
const reader = publicClient();
assert.equal(await reader.getChainId(), NETWORK.id);
const report = {
  at: new Date().toISOString(),
  scope: "INDEPENDENT PUBLIC READS OF SURVIVING FIXTURES",
  run: source.run,
  costs: [],
};
for (const ordinal of [1, 2, 7, 8, 9]) {
  const c = source.checks["cost " + ordinal];
  const row = await reader.getEntity(c.key, costFixture(source.run, c).schema);
  assert.equal(row.run.value, source.run);
  assert.equal(row.ordinal.value, ordinal);
  assert.equal(row.payload.value, "0x" + "53".repeat(c.size));
  assert.equal(
    Object.keys(row).filter((k) => !k.startsWith("$")).length,
    c.columns,
  );
  assert(same(row.$creator, NETWORK.owner));
  report.costs.push({
    ordinal,
    key: row.$key,
    columns: c.columns,
    bytes: c.size,
    creator: row.$creator,
    payloadMatches: true,
    expiresAt: String(row.$expiresAt),
  });
}
const base = source.entries.find((e) => e.id === "atomicity baseline");
const immutable = await reader.getEntity(base.created[1], Probe);
assert(same(immutable.$owner, NETWORK.recipient));
assert(same(immutable.$creator, NETWORK.owner));
assert(immutable.$creationFlags.readonly);
report.readonlyTransfer = {
  key: immutable.$key,
  owner: immutable.$owner,
  creator: immutable.$creator,
  readonly: true,
};
const baseline = await reader.getEntity(base.created[0], Probe);
assert.equal(baseline.label.value, "synthetic_900");
assert.equal(
  baseline.$expiresAt,
  BigInt(source.checks["ordered create and extend"].deadline),
);
const failed = await reader
  .select({ $key: true })
  .from(Probe)
  .createdBy(NETWORK.owner)
  .where(eq("run", source.run))
  .where(eq("ordinal", 902))
  .limit(10)
  .fetch();
assert.equal(failed.entities.length, 0);
const ordered = await reader.getEntity(
  source.checks["ordered create and extend"].created,
  Probe,
);
assert.equal(ordered.ordinal.value, 903);
report.atomicity = {
  baselineLabelUnchanged: true,
  failedCreateAbsent: true,
  queryBlock: String(failed.blockNumber),
  mintNonceAtFailure:
    "Owner-time observation only; subsequent creates advanced it",
};
report.ordered = {
  created: ordered.$key,
  baseline: baseline.$key,
  expiresAt: String(baseline.$expiresAt),
};
await fs.writeFile(
  at("docs/web3/spikes/rabdi-security-verified.json"),
  serial(report),
);
console.log(serial(report));
