import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setImmediate as turn } from "node:timers/promises";
import { registerStorage } from "../../integrations/storage/runtime.mjs";
import {
  createReceiptReader,
  appendJsonStream,
} from "../../integrations/shared/outbox.mjs";
import {
  createLedgerStore,
  receiptObservation,
} from "../../integrations/ledger/store.mjs";
import { createLocalRecords } from "../../server/local-records/index.cjs";
import { createWeb3 } from "../../server/web3/index.cjs";
import { loadConfig } from "../../integrations/shared/config.mjs";

const receipt = (id) => ({
  id: String(id),
  type: "arc.drip",
  status: "done",
  mock: true,
  tx: null,
  at: 1,
  data: {},
});
async function fixture(t, receipts = []) {
  const dir = await mkdtemp(
    path.join(os.tmpdir(), "chonks-receipt-backpressure-"),
  );
  const streams = new Map(),
    documents = new Map(),
    closers = [];
  let seq = 0;
  streams.set(
    "receipts.jsonl",
    receipts.map((value) => ({ seq: String(++seq), value })),
  );
  const store = {
    get: async (key) => documents.get(key) ?? null,
    put: async (key, value) => {
      documents.set(key, structuredClone(value));
    },
    remove: async (key) => {
      documents.delete(key);
    },
    list: async (prefix) =>
      [...documents]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value })),
    entries: async (name, after = "0", limit = 500) =>
      structuredClone(
        (streams.get(name) || [])
          .filter((row) => BigInt(row.seq) > BigInt(after))
          .slice(0, limit),
      ),
    append: async (name, value, key) => {
      await turn(); // Durable writes complete after the receipt callback returns.
      if (!streams.has(name)) streams.set(name, []);
      const rows = streams.get(name),
        prior = rows.find((row) => row.key === key);
      if (prior) {
        assert.deepEqual(prior.value, value);
        return;
      }
      rows.push({ seq: String(++seq), key, value: structuredClone(value) });
    },
  };
  const unregister = registerStorage(dir, store);
  t.after(async () => {
    try {
      for (const close of closers) await close();
    } finally {
      unregister();
      await rm(dir, { recursive: true, force: true });
    }
  });
  return { dir, streams, onClose: (close) => closers.push(close) };
}

test("relay restart persists all 130 streamed receipts through its bounded local-record queue", async (t) => {
  const { dir, streams, onClose } = await fixture(
    t,
    Array.from({ length: 130 }, (_, i) => receipt(i)),
  );
  const relay = createWeb3({
    config: loadConfig({ PARTNERS: "mock", WEB3_DATA_DIR: dir }),
  });
  onClose(() => relay.close());
  const deadline = Date.now() + 3000;
  while (
    (streams.get("ledger/journal.jsonl")?.length || 0) < 130 &&
    Date.now() < deadline
  )
    await turn();
  const rows = streams.get("ledger/journal.jsonl") || [];
  assert.equal(
    rows.length,
    130,
    "the stream must wait for ledger persistence before reading the next receipt",
  );
  assert.equal(new Set(rows.map((row) => row.value.data.id)).size, 130);
  assert.equal((await createLedgerStore(dir).snapshot()).count, 130);
});

test("database receipt cursor and deduplication advance only after a successful async sink", async (t) => {
  const { dir, onClose } = await fixture(t, [
    receipt(1),
    receipt(2),
    receipt(3),
  ]);
  const calls = [];
  let rejectOnce = true,
    errors = 0;
  const reader = createReceiptReader(dir, {
    pollMs: 60000,
    onError: () => errors++,
    onReceipt: async (row) => {
      calls.push(row.id);
      await turn();
      if (row.id === "2" && rejectOnce) {
        rejectOnce = false;
        throw Error("SINK_UNAVAILABLE");
      }
    },
  });
  onClose(() => reader.close());
  await reader.poll();
  assert.deepEqual(calls, ["1", "2"]);
  assert.equal(errors, 1);
  await reader.poll();
  assert.deepEqual(calls, ["1", "2", "2", "3"]);
  await reader.poll();
  assert.equal(calls.length, 4);
});

test("filesystem receipt chunks also retry rejected async sinks without unhandled promises", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "chonks-receipt-files-"));
  for (const id of [1, 2, 3])
    await appendJsonStream(path.join(dir, "receipts.jsonl"), receipt(id));
  const calls = [];
  let rejectOnce = true;
  const reader = createReceiptReader(dir, {
    pollMs: 60000,
    onReceipt: async (row) => {
      calls.push(row.id);
      await turn();
      if (row.id === "2" && rejectOnce) {
        rejectOnce = false;
        throw Error("SINK_UNAVAILABLE");
      }
    },
  });
  t.after(async () => {
    reader.close();
    // Close the watcher before removal; an already-running read may finish mkdir.
    await rm(dir, { recursive: true, force: true, maxRetries: 5 });
  });
  await reader.poll();
  assert.deepEqual(calls, ["1", "2"]);
  await reader.poll();
  assert.deepEqual(calls, ["1", "2", "2", "3"]);
});

test("receipt persistence conflicts reject flush instead of acknowledging a dropped record", async (t) => {
  const { dir } = await fixture(t);
  const service = createLocalRecords({ dataDir: dir });
  service.recordReceipt({ ...receipt(1), data: { amount: "1" } });
  await service.flush({ includeVerification: false });
  service.recordReceipt({ ...receipt(1), data: { amount: "2" } });
  await assert.rejects(
    service.flush({ includeVerification: false }),
    /LEDGER_KEY_CONFLICT/,
  );
  assert.equal((await service.ledger()).rows.length, 1);
  await assert.rejects(service.close(), /LEDGER_KEY_CONFLICT/);
});

test("restart preserves an existing confirmed verification without repeating RPC or appending another proof", async (t) => {
  const { dir } = await fixture(t);
  const value = { ...receipt(1), mock: false, tx: "0x" + "a".repeat(64) },
    observation = receiptObservation(value),
    ledger = createLedgerStore(dir);
  await ledger.append("receipt", observation, `receipt:${observation.id}`);
  await ledger.append("verification", {
    id: observation.id,
    proof: { status: "confirmed", at: 1, scope: "synthetic test fixture" },
  });
  let reads = 0;
  t.mock.method(globalThis, "fetch", async () => {
    reads++;
    throw Error("NO_NETWORK_IN_TEST");
  });
  const service = createLocalRecords({
    dataDir: dir,
    verificationRpcUrls: {
      arc: ["https://first.example", "https://second.example"],
    },
  });
  service.recordReceipt(value);
  await service.close();
  assert.equal(reads, 0);
  assert.equal((await createLedgerStore(dir).snapshot()).count, 2);
  assert.equal(
    (await service.ledger()).rows[0].verification.status,
    "confirmed",
  );
});

test("stream persistence flush does not wait for independent verification RPC", async (t) => {
  const { dir, onClose } = await fixture(t);
  let release, started;
  const pending = new Promise((resolve) => {
      release = resolve;
    }),
    requested = new Promise((resolve) => {
      started = resolve;
    });
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    started();
    await pending;
    const { method } = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        result: method === "eth_chainId" ? "0x4cef52" : null,
      }),
    };
  });
  const service = createLocalRecords({
    dataDir: dir,
    verificationRpcUrls: {
      arc: ["https://first.example", "https://second.example"],
    },
  });
  onClose(async () => {
    release();
    await service.close();
  });
  service.recordReceipt({
    ...receipt(1),
    mock: false,
    tx: "0x" + "a".repeat(64),
  });
  let persisted = false;
  const flushing = service.flush({ includeVerification: false }).then(() => {
    persisted = true;
  });
  await requested;
  await turn();
  assert.equal(
    persisted,
    true,
    "receipt persistence must finish while RPC is still pending",
  );
  await flushing;
  assert.equal((await service.ledger()).rows[0].verification, null);
});
