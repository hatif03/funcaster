import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { setImmediate as turn } from "node:timers/promises";
import { commerceReceiptData } from "../../integrations/commerce/jobs.mjs";
import {
  createLedgerStore,
  receiptObservation,
} from "../../integrations/ledger/store.mjs";
import { createLocalRecords } from "../../server/local-records/index.cjs";
import { createWeb3 } from "../../server/web3/index.cjs";
import { loadConfig } from "../../integrations/shared/config.mjs";
import { appendJsonStream } from "../../integrations/shared/outbox.mjs";

function workerReceipt(action) {
  const type = `commerce.${action}`;
  return {
    id: `synthetic-${action}`,
    type,
    status: "done",
    at: 1,
    tx: "0x" + { register: "a", pay: "b", claim: "c" }[action].repeat(64),
    data: commerceReceiptData(
      type,
      {
        operationId: `synthetic-${action}`,
        actor: "0x" + "1".repeat(40),
        version: { id: "2".repeat(64) },
      },
      { amount: "1000", blockNumber: "123" },
    ),
  };
}

test("actual commerce worker receipt shapes remain Arc observations without a relay-only mode field", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "chonks-ledger-commerce-"));
  t.after(() => rm(dir, { recursive: true, force: true, maxRetries: 5 }));
  const service = createLocalRecords({ dataDir: dir });
  for (const action of ["register", "pay", "claim"]) {
    const raw = workerReceipt(action),
      observed = receiptObservation(raw);
    assert.equal(
      Object.hasOwn(raw.data, "mode"),
      false,
      "use the actual worker sanitizer output",
    );
    assert.equal(observed.partner, "arc");
    assert.equal(observed.chainId, 5042002);
    assert.equal(observed.tx, raw.tx);
    assert.equal(observed.data.amount, "1000");
    assert.equal(observed.data.operationId, undefined);
    service.recordReceipt(raw);
  }
  await service.close();
  const resumed = createLocalRecords({ dataDir: dir });
  for (const action of ["register", "pay", "claim"])
    resumed.recordReceipt(workerReceipt(action));
  await resumed.close();
  const ledger = await resumed.ledger();
  assert.equal(ledger.rows.length, 3);
  assert.equal(ledger.journalRows, 3);
  for (const row of ledger.rows)
    assert.equal(
      row.verification,
      null,
      "worker success alone never grants an independently verified badge",
    );
});

test("legacy commerce observation support excludes mock, invalid transaction and unsupported action shapes", () => {
  const raw = workerReceipt("pay");
  for (const invalid of [
    { ...raw, mock: true },
    { ...raw, data: { ...raw.data, mode: "mock" } },
    { ...raw, data: { ...raw.data, mode: "off" } },
    { ...raw, tx: null },
    { ...raw, tx: "invalid" },
    { ...raw, type: "commerce.pass" },
  ])
    assert.equal(receiptObservation(invalid), null);
  const local = receiptObservation({
    ...raw,
    tx: null,
    mock: true,
    data: { ...raw.data, mode: "mock" },
  });
  assert.equal(local.partner, "local");
  assert.equal(local.chainId, null);
  assert.equal(local.tx, null);
});

test("relay uses one durable live commerce receipt and retains its mock operation bridge", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "chonks-commerce-bridge-"));
  let relay,
    closed = false;
  t.after(async () => {
    if (relay && !closed) await relay.close();
    await rm(dir, { recursive: true, force: true, maxRetries: 5 });
  });
  const commerceModule = createRequire(import.meta.url)(
    "../../server/commerce/index.cjs",
  );
  let configured;
  const optionsReady = new Promise((resolve) => {
    configured = resolve;
  });
  t.mock.method(commerceModule, "createCommerce", async (options) => {
    configured(options);
    return { service: { poll: async () => {}, close: async () => {} } };
  });
  const raw = workerReceipt("pay");
  await appendJsonStream(path.join(dir, "receipts.jsonl"), raw, raw.id);
  relay = createWeb3({
    config: loadConfig({
      PARTNERS: "mock",
      COMMERCE: "mock",
      WEB3_DATA_DIR: dir,
    }),
  });
  const options = await optionsReady;
  options.onReceipt({
    id: "operation-live-pay",
    action: "pay",
    mode: "on",
    tx: raw.tx,
    amount: "1000",
    asset: "USDC",
    at: 1,
  });
  options.onReceipt({
    id: "operation-mock-pass",
    action: "pass",
    mode: "mock",
    amount: "1000",
    asset: "USDC",
    at: 1,
  });
  const deadline = Date.now() + 3000;
  let snapshot;
  while (Date.now() < deadline) {
    snapshot = await createLedgerStore(dir)
      .snapshot()
      .catch(() => null);
    if (
      snapshot?.rows.some(
        (row) =>
          row.kind === "receipt" && row.data.id === receiptObservation(raw).id,
      )
    )
      break;
    await turn();
  }
  await relay.close();
  closed = true;
  snapshot = await createLedgerStore(dir).snapshot();
  assert.equal(
    snapshot.count,
    2,
    "operation bridge must not duplicate a live worker payment",
  );
  const live = snapshot.rows.filter((row) => row.data.tx === raw.tx);
  assert.equal(live.length, 1);
  assert.equal(live[0].data.id, receiptObservation(raw).id);
  const mock = snapshot.rows.find((row) => row.data.type === "commerce.pass");
  assert.equal(mock.data.partner, "local");
  assert.equal(mock.data.mock, true);
  assert.equal(mock.data.tx, null);
});
