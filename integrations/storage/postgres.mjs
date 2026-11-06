import { createHash } from "node:crypto";
import { registerStorage } from "./runtime.mjs";

// Documents retain immutable intents and signer journals. Streams supply
// ordered receipts across hosts. A dedicated advisory-lock session owns writes.
export async function createPostgresStorage({
  connectionString,
  namespace = "funcaster",
  ssl,
  Pool: suppliedPool,
}) {
  if (!connectionString || !/^[a-z0-9_-]{1,64}$/.test(namespace))
    throw Error("INVALID_DATABASE_CONFIG");
  const Pool = suppliedPool || (await import("pg")).default.Pool;
  const pool = new Pool({
    connectionString,
    ssl,
    max: 6,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });
  let fault,
    lockClient,
    closed = false;
  const failed = () => {
    fault = Error("DATABASE_CONNECTION_LOST");
  };
  pool.on("error", failed);
  const check = () => {
    if (fault) throw fault;
    if (closed) throw Error("DATABASE_CLOSED");
  };
  const query = async (sql, args = []) => {
    check();
    try {
      return await pool.query(sql, args);
    } catch {
      throw Error("DATABASE_OPERATION_FAILED");
    }
  };
  try {
    await query(`CREATE TABLE IF NOT EXISTS funcaster_documents (
      namespace text NOT NULL, key text NOT NULL, value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(namespace,key))`);
    await query(`CREATE TABLE IF NOT EXISTS funcaster_streams (
      seq bigserial PRIMARY KEY, namespace text NOT NULL, stream text NOT NULL,
      entry_key text NOT NULL, value jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(namespace,stream,entry_key))`);
    await query(
      "CREATE INDEX IF NOT EXISTS funcaster_stream_cursor ON funcaster_streams(namespace,stream,seq)",
    );
  } catch (error) {
    await pool.end();
    throw error;
  }
  const keyCheck = (key) => {
    if (typeof key !== "string" || key.length > 1024 || key.includes("\0"))
      throw Error("INVALID_STORAGE_KEY");
  };
  return {
    async get(key) {
      keyCheck(key);
      return (
        (
          await query(
            "SELECT value FROM funcaster_documents WHERE namespace=$1 AND key=$2",
            [namespace, key],
          )
        ).rows[0]?.value ?? null
      );
    },
    async put(key, value) {
      keyCheck(key);
      await query(
        "INSERT INTO funcaster_documents(namespace,key,value) VALUES($1,$2,$3::jsonb) ON CONFLICT(namespace,key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
        [namespace, key, JSON.stringify(value)],
      );
    },
    async remove(key) {
      keyCheck(key);
      await query(
        "DELETE FROM funcaster_documents WHERE namespace=$1 AND key=$2",
        [namespace, key],
      );
    },
    async list(prefix) {
      keyCheck(prefix);
      return (
        await query(
          "SELECT key,value FROM funcaster_documents WHERE namespace=$1 AND starts_with(key,$2) ORDER BY key",
          [namespace, prefix],
        )
      ).rows;
    },
    async append(stream, value, entryKey) {
      keyCheck(stream);
      keyCheck(entryKey);
      check();
      let client;
      try {
        client = await pool.connect();
        await client.query("BEGIN");
        // Allocate sequence numbers only while owning the stream's transaction
        // lock. Otherwise a later commit can advance readers past an unseen row.
        const lockKey = createHash("sha256")
          .update(`stream:${namespace}:${stream}`)
          .digest()
          .readBigInt64BE();
        await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [
          String(lockKey),
        ]);
        check();
        const args = [namespace, stream, entryKey, JSON.stringify(value)];
        const result = await client.query(
          "INSERT INTO funcaster_streams(namespace,stream,entry_key,value) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(namespace,stream,entry_key) DO NOTHING RETURNING seq",
          args,
        );
        if (!result.rowCount) {
          const previous = await client.query(
            "SELECT value=$4::jsonb AS same FROM funcaster_streams WHERE namespace=$1 AND stream=$2 AND entry_key=$3",
            args,
          );
          if (!previous.rows[0]?.same)
            throw Error("STREAM_IDEMPOTENCY_CONFLICT");
        }
        await client.query("COMMIT");
      } catch (error) {
        if (client) await client.query("ROLLBACK").catch(() => {});
        throw Error(
          error.message === "STREAM_IDEMPOTENCY_CONFLICT"
            ? error.message
            : "DATABASE_OPERATION_FAILED",
        );
      } finally {
        client?.release();
      }
    },
    async entries(stream, after = "0", limit = 500) {
      keyCheck(stream);
      // seq is returned as text for lossless cursors; sort the table's bigint,
      // not that output alias (which would place 100 before 99 and repeat rows).
      return (
        await query(
          "SELECT seq::text,value FROM funcaster_streams WHERE namespace=$1 AND stream=$2 AND seq>$3::bigint ORDER BY funcaster_streams.seq LIMIT $4",
          [
            namespace,
            stream,
            String(after),
            Math.min(10000, Math.max(1, limit)),
          ],
        )
      ).rows;
    },
    async acquire(name) {
      check();
      if (!lockClient) {
        lockClient = await pool.connect();
        lockClient.on("error", failed);
      }
      const key = createHash("sha256")
        .update(`${namespace}:${name}`)
        .digest()
        .readBigInt64BE();
      const result = await lockClient.query(
        "SELECT pg_try_advisory_lock($1::bigint) AS locked",
        [String(key)],
      );
      if (!result.rows[0].locked) throw Error("ANOTHER_PROCESS_OWNS_STORAGE");
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        check();
        await lockClient.query("SELECT pg_advisory_unlock($1::bigint)", [
          String(key),
        ]);
      };
    },
    async health() {
      await query("SELECT 1");
      return { ok: true, kind: "postgres" };
    },
    async close() {
      if (closed) return;
      closed = true;
      if (lockClient) lockClient.release(true);
      await pool.end();
    },
  };
}
export async function initializeStorage(env = process.env) {
  if (!env.DATABASE_URL) throw Error("DATABASE_URL_REQUIRED");
  // External database connections require certificate verification.
  const url = new URL(env.DATABASE_URL);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const internal = /^dpg-[a-z0-9-]+$/.test(url.hostname);
  const store = await createPostgresStorage({
    connectionString: env.DATABASE_URL,
    namespace: env.DATABASE_NAMESPACE || "funcaster",
    ssl: local || internal ? false : { rejectUnauthorized: true },
  });
  const unregister = registerStorage(env.WEB3_DATA_DIR || ".local/web3", store);
  return {
    store,
    async close() {
      unregister();
      await store.close();
    },
  };
}
