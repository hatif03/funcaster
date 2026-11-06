import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createLedgerStore,
  checkChain,
  ledgerView,
  receiptObservation,
} from "../../integrations/ledger/store.mjs";
import { verifyReceipt } from "../../integrations/ledger/verify.mjs";
const tx = "0x" + "a".repeat(64),
  blockHash = "0x" + "b".repeat(64),
  address = "0x" + "1".repeat(40);
const urls = ["https://first.example", "https://second.example"];
const observation = receiptObservation({
  id: "one",
  type: "arc.pot.claim",
  status: "done",
  tx,
  at: 1000,
  data: { contract: address },
});
function reader(change = () => {}) {
  return async (url, method) => {
    if (method === "eth_chainId") return "0x4cef52";
    if (method === "eth_getBlockByNumber")
      return { hash: blockHash, number: "0x99" };
    const receipt = {
      transactionHash: tx,
      blockHash,
      blockNumber: "0x99",
      status: "0x1",
      from: address,
      to: address,
      gasUsed: "0x100",
      logs: [],
    };
    change(receipt, url);
    return receipt;
  };
}

test("append-only ledger survives restart, deduplicates and detects tampering or partial tails", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "chonks-ledger-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createLedgerStore(dir, { now: () => 1 });
  await Promise.all([
    store.append("receipt", observation, observation.id),
    store.append("receipt", observation, observation.id),
  ]);
  const proof = await verifyReceipt(observation, urls, {
    read: reader(),
    now: () => 2000,
  });
  await store.append("verification", { id: observation.id, proof });
  const snapshot = await createLedgerStore(dir).snapshot();
  assert.equal(snapshot.count, 2);
  assert.equal(ledgerView(snapshot).rows[0].verification.status, "confirmed");
  const text = await readFile(store.file, "utf8");
  assert.throws(
    () => checkChain(text.replace('"at":1', '"at":2')),
    /INTEGRITY/,
  );
  assert.throws(() => checkChain(text.slice(0, -1)), /INCOMPLETE_TAIL/);
  await assert.rejects(
    store.append(
      "receipt",
      { ...observation, status: "failed" },
      observation.id,
    ),
    /KEY_CONFLICT/,
  );
});

test("only two distinct hosts agreeing on a canonical successful receipt confirm it", async () => {
  const proof = await verifyReceipt(observation, urls, { read: reader() });
  assert.equal(proof.status, "confirmed");
  assert.equal(proof.scope, "transaction receipt only");
  assert.equal(proof.blockNumber, "153");
  const mismatch = await verifyReceipt(observation, urls, {
    read: reader((r, url) => {
      if (url === urls[1]) r.gasUsed = "0x101";
    }),
  });
  assert.equal(mismatch.status, "rpc-mismatch");
  const changedBlock = await verifyReceipt(observation, urls, {
    read: reader((r) => {
      r.blockHash = tx;
    }),
  });
  assert.equal(changedBlock.status, "rpc-mismatch");
  assert.equal(
    (await verifyReceipt(observation, [urls[0], urls[0]], { read: reader() }))
      .status,
    "unconfigured",
  );
});

test("mock, missing, reverted and unavailable receipts never get a confirmed badge", async () => {
  let calls = 0;
  const read = async () => {
    calls++;
    throw Error("RPC down");
  };
  assert.equal(
    (await verifyReceipt({ ...observation, mock: true }, urls, { read }))
      .status,
    "mock",
  );
  assert.equal(calls, 0);
  assert.equal(
    (await verifyReceipt({ ...observation, tx: null }, urls, { read })).status,
    "no-transaction",
  );
  assert.equal(
    (await verifyReceipt(observation, urls, { read })).status,
    "unavailable",
  );
  assert.equal(
    (
      await verifyReceipt(observation, urls, {
        read: reader((r) => {
          r.status = "0x0";
        }),
      })
    ).status,
    "reverted",
  );
});

test("local commerce and market activity never masquerades as an Arc receipt", () => {
  const local = {
    id: "pass-one",
    type: "commerce.pass",
    partner: "arc",
    status: "posted",
    mock: true,
    data: { amount: "12", asset: "USDC", signature: "private" },
  };
  const row = receiptObservation(local);
  assert.equal(row.partner, "local");
  assert.equal(row.chainId, null);
  assert.equal(row.tx, null);
  assert.equal(row.data.amount, "12");
  assert.equal(row.data.signature, undefined);
  assert.equal(receiptObservation({ ...local, mock: false }), null);
  assert.equal(receiptObservation({ ...local, tx }), null);
});
