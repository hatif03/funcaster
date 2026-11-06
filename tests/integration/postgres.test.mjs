import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPostgresStorage } from "../../integrations/storage/postgres.mjs";
import { registerStorage } from "../../integrations/storage/runtime.mjs";
import {
  atomicJson,
  readJson,
  createOutbox,
  readJobReceipt,
  listJobs,
  createReceiptReader,
  killed,
} from "../../integrations/shared/outbox.mjs";
import {
  createWorker,
  mockProvider,
  acquireWorkerLock,
} from "../../integrations/shared/worker.mjs";
import { createLedgerStore } from "../../integrations/ledger/store.mjs";

test(
  "PostgreSQL stream cursors cannot skip an earlier uncommitted writer",
  { skip: !process.env.DATABASE_URL, timeout: 10000 },
  async (t) => {
    const namespace = `test-${randomUUID()}`,
      stream = "receipts.jsonl";
    const options = {
      connectionString: process.env.DATABASE_URL,
      namespace,
      ssl: false,
    };
    const db = await createPostgresStorage(options);
    const { Pool } = createRequire(
      new URL("../../integrations/storage/package.json", import.meta.url),
    )("pg");
    const direct = new Pool({ connectionString: options.connectionString });
    const first = await direct.connect();
    t.after(async () => {
      await first.query("ROLLBACK");
      first.release();
      await db.close();
      await direct.end();
    });
    await first.query("BEGIN");
    const lockKey = createHash("sha256")
      .update(`stream:${namespace}:${stream}`)
      .digest()
      .readBigInt64BE();
    await first.query("SELECT pg_advisory_xact_lock($1::bigint)", [
      String(lockKey),
    ]);
    await first.query(
      "INSERT INTO funcaster_streams(namespace,stream,entry_key,value) VALUES($1,$2,'first','{\"id\":1}')",
      [namespace, stream],
    );
    let finished = false;
    const second = db.append(stream, { id: 2 }, "second").then(() => {
      finished = true;
    });
    // A separate process must wait before allocating its sequence number.
    await first.query("SELECT pg_sleep(0.1)");
    assert.equal(finished, false);
    assert.deepEqual(await db.entries(stream), []);
    await first.query("COMMIT");
    await second;
    const rows = await db.entries(stream);
    assert.deepEqual(
      rows.map((r) => r.value.id),
      [1, 2],
    );
    assert.deepEqual(
      (await db.entries(stream, rows[0].seq)).map((r) => r.value.id),
      [2],
    );
    await db.append(stream, { id: 2 }, "second");
    await assert.rejects(
      db.append(stream, { id: 3 }, "second"),
      /STREAM_IDEMPOTENCY_CONFLICT/,
    );
    assert.equal((await db.entries(stream)).length, 2);
  },
);

test(
  "PostgreSQL survives fresh connections, owns writers and delivers durable jobs/receipts without data files",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "funcaster-postgres-"));
    const options = {
      connectionString: process.env.DATABASE_URL,
      namespace: `test-${randomUUID()}`,
      ssl: false,
    };
    let db = await createPostgresStorage(options),
      unregister = registerStorage(dir, db);
    t.after(async () => {
      unregister();
      await db.close();
      await rm(dir, { recursive: true, force: true });
    });
    await atomicJson(path.join(dir, "snapshot.json"), { rounds: 2 });
    const unlock = await acquireWorkerLock(dir);
    const contender = await createPostgresStorage(options);
    await assert.rejects(contender.acquire("writer:"), /ANOTHER_PROCESS/);
    await contender.close();
    await unlock();
    unregister();
    await db.close();
    db = await createPostgresStorage(options);
    unregister = registerStorage(dir, db);
    assert.deepEqual(await readJson(path.join(dir, "snapshot.json")), {
      rounds: 2,
    });
    const outbox = createOutbox(dir);
    const job = await outbox.enqueue({
      type: "arc.drip",
      room: "PGTEST",
      idempotencyKey: "pg-drip-1",
      payload: { address: "0x" + "1".repeat(40), asset: "usdc" },
    });
    assert.equal((await listJobs(dir)).length, 1);
    const worker = createWorker({ dir, providers: { arc: mockProvider(dir) } });
    await worker.poll();
    assert.equal((await readJobReceipt(dir, job.id)).status, "done");
    assert.equal((await listJobs(dir)).length, 0);
    const receipts = [];
    const reader = createReceiptReader(dir, {
      onReceipt: (r) => receipts.push(r),
    });
    await reader.poll();
    reader.close();
    assert.equal(receipts[0]?.id, job.id);
    const ledger = createLedgerStore(dir);
    await ledger.append("receipt", { id: "test", mock: true }, "test");
    const restartedLedger = createLedgerStore(dir);
    assert.equal((await restartedLedger.snapshot()).count, 1);
    await atomicJson(path.join(dir, "KILL"), true);
    assert.equal(await killed(dir, "0"), true);
    await worker.close();
    await outbox.close();
    assert.equal(
      (await readdir(dir, { recursive: true })).filter(
        (x) => x.endsWith(".json") || x.endsWith(".jsonl"),
      ).length,
      0,
    );
  },
);

test(
  "PostgreSQL receipt pagination and ledger restart retain numeric stream order across digit boundaries",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const { hash } = await import("../../server/records.cjs");
    const { checkChain } = await import("../../integrations/ledger/store.mjs");
    const { readJsonStream } =
      await import("../../integrations/shared/outbox.mjs");
    const dir = await mkdtemp(
      path.join(os.tmpdir(), "funcaster-ledger-order-"),
    );
    const db = await createPostgresStorage({
      connectionString: process.env.DATABASE_URL,
      namespace: `test-${randomUUID()}`,
      ssl: false,
    });
    const unregister = registerStorage(dir, db);
    t.after(async () => {
      unregister();
      await db.close();
      await rm(dir, { recursive: true, force: true });
    });
    const rows = [];
    for (let seq = 1; seq <= 120; seq++) {
      const body = {
        seq,
        previous: rows.at(-1)?.hash || "0".repeat(64),
        at: seq,
        kind: "receipt",
        data: { id: `row-${seq}`, mock: true },
      };
      const row = { ...body, hash: hash(body) };
      rows.push(row);
      await db.append("ledger/journal.jsonl", row, String(seq));
    }
    const original = await db.entries("ledger/journal.jsonl");
    assert.deepEqual(
      original.map((r) => r.value),
      rows,
    );
    assert.ok(
      original.some((r, i) => i && r.seq.length > original[i - 1].seq.length),
      "fixture crosses a decimal-width boundary",
    );
    const paginated = [];
    let cursor = "0";
    for (;;) {
      const batch = await db.entries("ledger/journal.jsonl", cursor, 7);
      if (!batch.length) break;
      for (const row of batch) {
        assert.ok(BigInt(row.seq) > BigInt(cursor));
        cursor = row.seq;
        paginated.push(row.value);
      }
      assert.ok(
        paginated.length <= 120,
        "pagination cannot revisit an earlier row",
      );
    }
    assert.deepEqual(paginated, rows);
    const text = await readJsonStream(
      path.join(dir, "ledger", "journal.jsonl"),
    );
    assert.equal(checkChain(text).count, 120);
    const ledger = createLedgerStore(dir, { now: () => 121 });
    assert.deepEqual((await ledger.snapshot()).rows, rows);
    const next = await ledger.append("receipt", { id: "row-121", mock: true });
    assert.equal(next.seq, 121);
    assert.equal(next.previous, rows.at(-1).hash);
    const current = await db.entries("ledger/journal.jsonl");
    assert.deepEqual(current.slice(0, 120), original);
    assert.equal((await createLedgerStore(dir).snapshot()).count, 121);
  },
);
