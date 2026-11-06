// Anonymous public reads. This file never imports an account or sends a transaction.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { addEnsContracts } from "@ensdomains/ensjs";
import { asc, eq, gt, lt } from "@arkiv-network/sdk/query";
import { u64 } from "@arkiv-network/sdk/schema";
import { NETWORK, Probe, publicClient, serial } from "./protocol.mjs";
const root = new URL("../../../", import.meta.url),
  reader = publicClient();
const report = {
  at: new Date().toISOString(),
  scope: "APPROVED SDK MIGRATION: PUBLIC READS ONLY",
  versions: { arkiv: "1.0.1", viem: "2.57.14", ensjs: "5.2.7" },
  chainId: await reader.getChainId(),
  checks: [],
};
assert.equal(report.chainId, NETWORK.id);
report.balanceWei = String(await reader.getBalance({ address: NETWORK.owner }));
for (const [name, predicate] of [
  ["eq", eq("schema_version", u64(2))],
  ["gt", gt("schema_version", u64(1))],
  ["lt", lt("schema_version", u64(3))],
]) {
  const page = await reader
    .select({ $key: true, $creator: true, schema_version: true })
    .from(Probe, { onMismatch: "throw" })
    .createdBy(NETWORK.owner)
    .where(eq("project", "chonks_k0"))
    .where(predicate)
    .orderBy(asc("$key"))
    .withCount()
    .limit(10)
    .fetch();
  assert(
    page.entities.every(
      (r) =>
        r.$creator.toLowerCase() === NETWORK.owner.toLowerCase() &&
        r.schema_version.value === 2n,
    ),
  );
  report.checks.push({
    id: `creator/schema-scoped ${name}, ordering, count`,
    status: "PASS-READ",
    validatedRows: page.entities.length,
    total: String(page.count),
    block: String(page.blockNumber),
  });
}
const ens = createPublicClient({
  chain: addEnsContracts(sepolia),
  transport: http("https://ethereum-sepolia-rpc.publicnode.com", {
    timeout: 15000,
    retryCount: 0,
  }),
  cacheTime: 0,
});
assert.equal(await ens.getChainId(), 11155111);
const address = await ens.getEnsAddress({ name: "play.funcaster.eth" });
report.checks.push({
  id: "ENS same-process read",
  status: "PASS-READ",
  address,
  note: "Null is expected until an addr record is configured; this is not full VX-08 resolution/write acceptance.",
});
const arc = createPublicClient({
  transport: http("https://rpc.testnet.arc.io", {
    timeout: 15000,
    retryCount: 0,
  }),
  cacheTime: 0,
});
assert.equal(await arc.getChainId(), 5042002);
report.checks.push({
  id: "Arc same-process read",
  status: "PASS-READ",
  block: String(await arc.getBlockNumber()),
});
await fs.writeFile(
  new URL("docs/web3/spikes/rabdi-readonly.json", root),
  serial(report),
);
console.log(serial(report));
