// Independent public reads; no wallet imports or transaction submission.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createPublicClient, keccak256 } from "viem";
import { sepolia } from "viem/chains";
import { addEnsContracts } from "@ensdomains/ensjs";
import { NETWORK, Probe, publicClient, same, serial } from "./protocol.mjs";
import { ensReadTransport } from "./ens-read-transport.mjs";
import {
  verifyCrossCreation,
  verifyCrossAvailability,
} from "./cross-proof.mjs";
const root = new URL("../../../", import.meta.url),
  at = (p) => new URL(p, root);
const source = JSON.parse(
  await fs.readFile(at("docs/web3/spikes/cross-owner-live.json"), "utf8"),
);
const rehearsal = JSON.parse(
  await fs.readFile(at("docs/web3/spikes/cross-rehearsal.json"), "utf8"),
);
assert.equal(source.name, "play.funcaster.eth");
assert.equal(source.dataHash, rehearsal.dataHash);
const ens = createPublicClient({
  chain: addEnsContracts(sepolia),
  cacheTime: 0,
  transport: ensReadTransport(),
});
assert.equal(await ens.getChainId(), 11155111);
assert(same(await ens.getEnsAddress({ name: source.name }), NETWORK.owner));
assert(same(await ens.getEnsResolver({ name: source.name }), source.resolver));
const receipts = [];
for (const op of source.operations) {
  const receipt = await ens.getTransactionReceipt({ hash: op.hash }),
    tx = await ens.getTransaction({ hash: op.hash });
  const block = await ens.getBlock({ blockNumber: receipt.blockNumber });
  assert.equal(receipt.status, "success");
  assert.equal(receipt.blockHash, block.hash);
  assert.equal(tx.chainId, 11155111);
  assert(same(tx.from, source.registrar));
  assert(same(tx.to, source.resolver));
  assert.equal(tx.value, 0n);
  assert.equal(keccak256(tx.input), rehearsal.dataHash);
  assert(receipt.gasUsed * receipt.effectiveGasPrice <= 5000000000000000n);
  receipts.push({
    hash: op.hash,
    block: String(receipt.blockNumber),
    blockHash: block.hash,
    gasCost: String(receipt.gasUsed * receipt.effectiveGasPrice),
  });
}
const arkiv = publicClient();
assert.equal(await arkiv.getChainId(), NETWORK.id);
const receipt = await arkiv.getTransactionReceipt({ hash: source.arkiv.hash });
const finalRun = JSON.parse(
  await fs.readFile(at("docs/web3/spikes/rabdi-final-live.json"), "utf8"),
);
const proof = await verifyCrossCreation({
  tx: await arkiv.getTransaction({ hash: source.arkiv.hash }),
  receipt,
  block: await arkiv.getBlock({ blockNumber: receipt.blockNumber }),
  run: finalRun.run,
  key: source.arkiv.key,
});
let row;
try {
  row = await arkiv.getEntity(source.arkiv.key, Probe);
} catch (e) {
  if (e.name !== "NoEntityFoundError") throw e;
}
const head = await arkiv.getBlockNumber();
const availability = verifyCrossAvailability({ row, head, proof });
const report = {
  at: new Date().toISOString(),
  scope: "INDEPENDENT PUBLIC READS; not a two-provider Ledger badge",
  status: "PASS",
  name: source.name,
  resolved: NETWORK.owner,
  ensReceipts: receipts,
  arkiv: {
    hash: source.arkiv.hash,
    ...proof,
    observedHead: head,
    availability,
  },
};
await fs.writeFile(at("docs/web3/spikes/cross-verified.json"), serial(report));
console.log(serial(report));
