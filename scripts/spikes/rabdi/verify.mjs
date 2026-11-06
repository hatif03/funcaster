// Public reads only: independently checks owner receipts and all surviving synthetic rows.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { keccak256, formatEther, decodeEventLog } from "viem";
import { ENTITY_EVENTS_ABI } from "@arkiv-network/sdk";
import { eq, gt, lt, asc } from "@arkiv-network/sdk/query";
import {
  NETWORK,
  Probe,
  publicClient,
  serial,
  same,
  fixture,
} from "./protocol.mjs";
const root = new URL("../../../", import.meta.url),
  reader = publicClient();
const source = JSON.parse(
  await fs.readFile(
    new URL("docs/web3/spikes/rabdi-owner-live.json", root),
    "utf8",
  ),
);
assert.equal(await reader.getChainId(), NETWORK.id);
assert.equal(source.chainId, NETWORK.id);
assert.equal(source.sdk, "1.0.1");
assert(same(source.owner, NETWORK.owner));
const report = {
  at: new Date().toISOString(),
  scope: "INDEPENDENT PUBLIC READS; no wallet or secret",
  chainId: NETWORK.id,
  provider: NETWORK.rpc,
  run: source.run,
  receipts: [],
  rows: [],
  predicates: [],
};
let total = 0n;
for (const op of source.operations) {
  const receipt = await reader.getTransactionReceipt({ hash: op.hash }),
    tx = await reader.getTransaction({ hash: op.hash }),
    block = await reader.getBlock({ blockNumber: receipt.blockNumber });
  assert.equal(receipt.status, "success");
  assert.equal(receipt.blockHash, block.hash);
  assert.equal(String(receipt.blockNumber), op.blockNumber);
  assert(same(tx.from, NETWORK.owner));
  assert(same(tx.to, "0x4400000000000000000000000000000000000044"));
  assert.equal(tx.value, 0n);
  assert.equal(tx.chainId, NETWORK.id);
  assert.equal(tx.nonce, op.nonce);
  assert.equal(keccak256(tx.input), op.dataHash);
  const cost = receipt.gasUsed * receipt.effectiveGasPrice;
  assert.equal(String(cost), op.gasCost);
  total += cost;
  const events = receipt.logs
    .filter((l) => same(l.address, tx.to))
    .flatMap((l) => {
      try {
        const e = decodeEventLog({
          abi: ENTITY_EVENTS_ABI,
          data: l.data,
          topics: l.topics,
        });
        return [{ event: e.eventName, args: e.args }];
      } catch {
        return [];
      }
    });
  assert.equal(
    events.filter((e) => e.event === "EntityCreated").length,
    op.createCount,
  );
  report.receipts.push({
    id: op.id,
    hash: op.hash,
    block: op.blockNumber,
    blockHash: block.hash,
    gasCost: String(cost),
    events,
  });
}
assert.equal(formatEther(total), source.totalGasTGLM);
report.totalGasTGLM = formatEther(total);
const all = await reader
  .select("*")
  .from(Probe, { onMismatch: "throw" })
  .createdBy(NETWORK.owner)
  .where(eq("run", source.run))
  .orderBy(asc("ordinal"))
  .limit(100)
  .fetch();
assert.equal(all.entities.length, 8);
const rows = all.entities;
for (const row of rows) {
  const i = row.ordinal.value;
  assert(i > 0 && i < 9);
  assert.equal(row.$key, source.entities[i]);
  assert(same(row.$creator, NETWORK.owner));
  assert(same(row.$owner, i === 4 ? NETWORK.recipient : NETWORK.owner));
  const expected = fixture(source.run, i);
  assert.equal(row.project.value, "chonks_k0");
  assert.equal(row.entity_type.value, "probe");
  assert.equal(row.schema_version.value, 2n);
  assert.equal(row.label.value, i === 3 ? "patched" : expected.label);
  for (const field of ["at", "amount", "rating", "active", "who", "related"])
    assert.deepEqual(
      typeof expected[field] === "object" ? row[field] : row[field].value,
      expected[field],
    );
  assert.equal(
    row.swarm_ref.value,
    "0x" + Buffer.from(expected.swarm_ref).toString("hex"),
  );
  assert.equal(
    row.payload.value,
    "0x" + Buffer.from(expected.payload).toString("hex"),
  );
  assert.equal(row.$creationFlags.readonly, i < 3);
  assert.equal(row.$creationFlags.permissionlessExtension, i === 4);
  report.rows.push({
    key: row.$key,
    ordinal: i,
    creator: row.$creator,
    owner: row.$owner,
    expiresAt: String(row.$expiresAt),
    flags: row.$creationFlags,
    validated: true,
  });
}
let deleted = false;
try {
  await reader.getEntity(source.entities[0], Probe);
} catch (e) {
  deleted = e.name === "NoEntityFoundError";
}
assert(deleted);
report.ownerDeletionVerified = true;
// Query the actually funded fixtures through every supported scalar type/operator.
for (const field of [
  "label",
  "ordinal",
  "at",
  "amount",
  "rating",
  "active",
  "who",
  "related",
]) {
  const target = rows[0][field];
  const compare = (a, b) => {
    if (["addr", "key"].includes(target.type)) {
      a = BigInt(a);
      b = BigInt(b);
    }
    if (target.type === "dec") {
      a = Number(a);
      b = Number(b);
    } // synthetic exact 1.25 only, never money
    return a === b ? 0 : a > b ? 1 : -1;
  };
  for (const [name, fn, test] of [
    ["eq", eq, (c) => c === 0],
    ["gt", gt, (c) => c > 0],
    ["lt", lt, (c) => c < 0],
  ]) {
    const page = await reader
      .select({ $key: true })
      .from(Probe, { onMismatch: "throw" })
      .createdBy(NETWORK.owner)
      .where(eq("run", source.run))
      .where(fn(field, target))
      .orderBy(asc("$key"))
      .limit(100)
      .fetch();
    const expected = rows
      .filter((row) => test(compare(row[field].value, target.value)))
      .map((row) => row.$key)
      .sort();
    assert.deepEqual(
      page.entities.map((row) => row.$key).sort(),
      expected,
      `${field}/${name}`,
    );
    report.predicates.push({
      field,
      type: target.type,
      operator: name,
      count: expected.length,
      block: String(page.blockNumber),
      status: "PASS-READ",
    });
  }
}
report.balanceTGLM = formatEther(
  await reader.getBalance({ address: NETWORK.owner }),
);
report.limit =
  "One public RPC provider. Receipt and row verification is independent of the owner process, not a two-provider ledger certification. Boundary/cost/expiry/volume/forgery checks remain.";
await fs.writeFile(
  new URL("docs/web3/spikes/rabdi-owner-verified.json", root),
  serial(report),
);
console.log(
  `PASS: ${report.receipts.length} canonical receipts, ${report.rows.length} complete typed rows, deletion and ${report.predicates.length} indexed predicate checks. Gas ${report.totalGasTGLM} tGLM; balance ${report.balanceTGLM}.`,
);
