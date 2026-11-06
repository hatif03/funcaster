// Owner-operated recovery of one proved pre-admission JSONB registration failure.
// This requests recovery; only the relay/worker can enqueue or sign a transaction.
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify, isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { assertPrepaymentRecovery } from "./prepayment-table-recovery.mjs";
import { digest } from "../integrations/shared/outbox.mjs";
import {
  hash,
  validateCommerceJob,
  commerceTransactionId,
} from "../integrations/commerce/jobs.mjs";
import { registration } from "../integrations/commerce/math.mjs";

export const ORIGIN = "https://funcaster.onrender.com";
export const RELAY = "srv-dbn3labbc2fs73ebli4g";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const need = (ok, code = "REGISTRATION_RECOVERY_BLOCKED") => {
  if (!ok) throw Object.assign(Error(code), { recoveryCode: code });
};
const safeCode = (error) =>
  error?.recoveryCode || "REGISTRATION_RECOVERY_STOPPED";
const record = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const txHash = (value) => /^0x[\da-f]{64}$/i.test(value || "");
const same = isDeepStrictEqual;

export function recoveryArgs(args) {
  if (args.length === 1 && args[0] === "--check") return { apply: false };
  need(
    args.length === 2 &&
      new Set(args).size === 2 &&
      args.includes("--apply") &&
      args.includes("--confirm-funcaster-testnet"),
    "EXPLICIT_RECOVERY_FLAGS_REQUIRED",
  );
  return { apply: true };
}

export function recoveryIntent(journal) {
  const { prefix } = assertPrepaymentRecovery(journal);
  need(journal.base === ORIGIN, "RECOVERY_ORIGIN_MISMATCH");
  return {
    operationId: prefix + "-register",
    creator: journal.marketAcceptance.addresses["phone-1"].toLowerCase(),
    versionId: journal.marketAcceptance.commerce.versionId || null,
  };
}

// The only mutating SQL in this script inserts the immutable manifest. Do not
// use initializeStorage: its schema setup and put/remove methods are broader.
export async function runDatabaseRecovery({
  db,
  intent,
  apply,
  namespace,
  operator,
}) {
  need(typeof apply === "boolean" && /^[a-z0-9_-]{1,64}$/.test(namespace));
  need(
    /^accept-[a-f0-9]{20}-register$/.test(intent?.operationId || "") &&
      /^0x[a-f0-9]{40}$/.test(intent.creator || "") &&
      (intent.versionId === null || /^[a-f0-9]{64}$/.test(intent.versionId)) &&
      /^0x[\da-f]{40}$/i.test(operator || ""),
  );
  const query = (sql, args) => db.query(sql, args);
  const read = async (key) => {
    const result = await query(
      "SELECT value FROM funcaster_documents WHERE namespace=$1 AND key=$2",
      [namespace, key],
    );
    need(
      Array.isArray(result?.rows) && result.rows.length <= 1,
      "DATABASE_READ_UNCERTAIN",
    );
    if (!result.rows.length) return null;
    need(record(result.rows[0]?.value), "INVALID_RECOVERY_DOCUMENT");
    return result.rows[0].value;
  };
  let transaction = false;
  try {
    if (!apply) await query("SET default_transaction_read_only=on");
    await query(
      apply ? "BEGIN ISOLATION LEVEL REPEATABLE READ" : "BEGIN READ ONLY",
    );
    transaction = true;
    const key = "commerce-recovery/" + digest(intent.operationId) + ".json";
    const state = await read("commerce/live-state.json"),
      marker = await read(key);
    need(
      state?.schema === 2 &&
        Array.isArray(state.operations) &&
        Array.isArray(state.versions) &&
        Array.isArray(state.receipts) &&
        state.operations.every((o) => record(o) && typeof o.id === "string"),
    );
    const prefix = intent.operationId.slice(0, -"-register".length);
    need(
      !state.operations.some((o) =>
        [prefix + "-pay", prefix + "-claim"].includes(o.id),
      ),
      "PAYMENT_INTENT_EXISTS",
    );
    const operations = state.operations.filter(
      (o) => o.id === intent.operationId,
    );
    need(operations.length === 1);
    const o = operations[0],
      recovered = !!o.recovery;
    need(o.action === "register" && o.actor === intent.creator && !o.prepared);
    if (recovered) {
      need(
        marker && ["queued", "confirmed"].includes(o.status),
        "RECOVERY_ALREADY_ATTEMPTED",
      );
      need(
        o.recovery.version === 1 &&
          o.recovery.reason === "jsonb-registration-v1" &&
          same(o.recovery.manifest, marker) &&
          o.recovery.original?.operationFingerprint === o.fingerprint,
      );
    } else {
      need(
        o.status === "failed" &&
          o.error === "WORKER_REVIEW_REQUIRED" &&
          !o.result &&
          !state.receipts.some((r) => r?.id === o.id),
      );
    }
    const old = recovered
      ? o.recovery.original
      : { job: o.job, jobId: o.jobId };
    const job = old?.job,
      jobId = old?.jobId;
    need(
      typeof jobId === "string" &&
        jobId.length > 0 &&
        jobId.length < 256 &&
        job?.type === "commerce.register" &&
        job.idempotencyKey === "commerce:register:" + o.id &&
        job.room === "creator-" + o.actor.slice(2, 22) &&
        job.payload?.operationId === o.id &&
        job.payload.actor === o.actor &&
        !job.payload.roomCode,
    );
    const p = validateCommerceJob(job),
      v = p.version;
    need(
      v.gameId === "star-catch" &&
        v.version === "1.0.0" &&
        v.price === "500000" &&
        v.creator === intent.creator &&
        (!intent.versionId || v.id === intent.versionId),
    );
    const versions = state.versions.filter((entry) => entry?.id === v.id);
    need(
      versions.length === 1 &&
        same(versions[0], {
          ...v,
          ...(recovered && o.status === "confirmed"
            ? { status: "published" }
            : {}),
        }),
    );
    const normalized = registration(
      {
        creator: v.creator,
        price: v.price,
        collaborators: v.recipients,
        referralAddress: v.referral,
        referralBps: v.referralBps,
      },
      { platformAddress: v.platform, venueAddress: v.venue },
    );
    need(
      Object.keys(normalized).some(
        (k) => JSON.stringify(normalized[k]) !== JSON.stringify(v[k]),
      ),
      "NOT_JSONB_REGISTRATION_DEFECT",
    );
    const done = await read("done/" + digest(job.idempotencyKey) + ".json");
    const provider = await read(
      "commerce-worker/" + digest(job.idempotencyKey) + ".json",
    );
    const journal = await read("arc-relayer-transactions/journal.json");
    need(done?.fingerprint === hash({ type: job.type, payload: job.payload }));
    const receipt = done.receipt;
    need(
      receipt?.id === jobId &&
        receipt.type === job.type &&
        receipt.status === "failed" &&
        receipt.tx === null &&
        receipt.explorer === null &&
        !receipt.mock &&
        receipt.error === "Provider failed after eight attempts",
      "ORIGINAL_FAILURE_CHANGED",
    );
    need(provider === null, "PROVIDER_RECORD_EXISTS");
    need(
      journal?.version === 1 &&
        journal.chainId === 5042002 &&
        typeof journal.owner === "string" &&
        journal.owner.toLowerCase() === operator.toLowerCase() &&
        Array.isArray(journal.entries) &&
        journal.entries.every(
          (entry) =>
            typeof entry?.id === "string" &&
            entry.id !== commerceTransactionId(job),
        ),
      "TRANSACTION_ADMISSION_UNCERTAIN",
    );
    const manifest = {
      version: 1,
      reason: "jsonb-registration-v1",
      operationId: o.id,
      originalJobId: jobId,
      originalIdempotencyKey: job.idempotencyKey,
      fingerprint: done.fingerprint,
      versionId: v.id,
    };
    if (marker) need(same(marker, manifest), "RECOVERY_MANIFEST_CONFLICT");
    if (recovered) {
      const nextKey = job.idempotencyKey + ":jsonb-recovery-v1";
      need(
        same(old.failure, receipt) &&
          old.fingerprint === done.fingerprint &&
          o.recovery.idempotencyKey === nextKey &&
          same(o.job, { ...job, idempotencyKey: nextKey }),
      );
      if (o.status === "confirmed")
        need(o.result?.versionId === v.id && txHash(o.result.tx));
    }
    let inserted = false;
    if (apply && !marker) {
      const result = await query(
        "INSERT INTO funcaster_documents(namespace,key,value) VALUES($1,$2,$3::jsonb) ON CONFLICT(namespace,key) DO NOTHING RETURNING key",
        [namespace, key, JSON.stringify(manifest)],
      );
      need([0, 1].includes(result?.rowCount), "MANIFEST_INSERT_UNCERTAIN");
      inserted = result.rowCount === 1;
      need(same(await read(key), manifest), "RECOVERY_MANIFEST_CONFLICT");
    }
    await query("COMMIT");
    transaction = false;
    return {
      status: apply ? (inserted ? "requested" : "existing") : "checked",
      operationId: o.id,
      versionId: v.id,
      operationStatus: o.status,
    };
  } finally {
    if (transaction) await query("ROLLBACK").catch(() => {});
  }
}

export async function remoteRecovery({
  Client,
  intent,
  apply,
  requestId,
  env = process.env,
  log = console.log,
}) {
  let db;
  try {
    need(
      env.FUNCASTER_ROLE === "relay" &&
        env.PUBLIC_ORIGIN === ORIGIN &&
        env.ARC_CHAIN_ID === "5042002" &&
        env.ARC_ALLOW_MAINNET === "0" &&
        [
          "ENS_REGISTRAR_KEY",
          "ARC_RELAYER_KEY",
          "ARC_ORACLE_KEY",
          "MARKET_VERIFIER_KEY",
        ].every((key) => !env[key]),
      "KEYLESS_TESTNET_RELAY_REQUIRED",
    );
    const url = new URL(env.DATABASE_URL);
    need(
      ["postgres:", "postgresql:"].includes(url.protocol),
      "DATABASE_CONFIG_REQUIRED",
    );
    const internal = /^dpg-[a-z0-9-]+$/.test(url.hostname);
    db = new Client({
      connectionString: env.DATABASE_URL,
      ssl: internal ? false : { rejectUnauthorized: true },
      connectionTimeoutMillis: 15000,
      query_timeout: 30000,
      ...(apply ? {} : { options: "-c default_transaction_read_only=on" }),
    });
    db.on("error", () => {});
    await db.connect();
    const result = await runDatabaseRecovery({
      db,
      intent,
      apply,
      namespace: env.DATABASE_NAMESPACE || "funcaster",
      operator: env.ARC_RELAYER_ADDRESS,
    });
    log("FUNC_RECOVERY " + JSON.stringify({ requestId, ok: true, ...result }));
    return true;
  } catch (error) {
    log(
      "FUNC_RECOVERY " +
        JSON.stringify({ requestId, ok: false, code: safeCode(error) }),
    );
    return false;
  } finally {
    await db?.end().catch(() => {});
  }
}

// execFile supplies CLI arguments without a local shell. Render runs the remote
// start command through a shell, so quote its one Node source argument there.
const shellQuote = (text) => "'" + text.replaceAll("'", "'\\''") + "'";
export function remoteStartCommand({ intent, apply, requestId }) {
  const source = `import { createRequire } from 'node:module';
import { remoteRecovery } from './scripts/render-recover-registration.mjs';
const { Client } = createRequire(new URL('./integrations/storage/postgres.mjs', import.meta.url))('pg');
if (!await remoteRecovery({ Client, ...${JSON.stringify({ intent, apply, requestId })} })) process.exitCode = 1;`;
  return (
    "node --env-file=/etc/secrets/funcaster.env --input-type=module -e " +
    shellQuote(source)
  );
}

const execFileAsync = promisify(execFile);
async function renderCli(args) {
  try {
    const { stdout } = await execFileAsync("render", args, {
      encoding: "utf8",
      timeout: 45000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return args[0] === "logs" ? stdout : JSON.parse(stdout);
  } catch {
    need(false, "RENDER_RESPONSE_UNCERTAIN_RERUN_CHECK");
  }
}

export async function runRenderRecovery(
  { intent, apply },
  {
    cli = renderCli,
    wait = sleep,
    now = Date.now,
    requestId = randomUUID(),
  } = {},
) {
  const started = now();
  const response = await cli([
    "jobs",
    "create",
    RELAY,
    "--start-command",
    remoteStartCommand({ intent, apply, requestId }),
    "--confirm",
    "--output",
    "json",
  ]);
  const job = response?.job || response;
  need(/^job-[a-z0-9]+$/.test(job?.id || ""), "RENDER_JOB_ID_UNCERTAIN");
  let status;
  for (;;) {
    const response = await cli(["jobs", "list", RELAY, "--output", "json"]);
    need(Array.isArray(response), "RENDER_JOB_STATUS_UNCERTAIN");
    const matches = response
      .map((entry) => entry.job || entry)
      .filter((entry) => entry.id === job.id);
    need(matches.length === 1, "RENDER_JOB_STATUS_UNCERTAIN");
    status = matches[0].status;
    if (["succeeded", "failed", "canceled"].includes(status)) break;
    need(
      ["pending", "running"].includes(status) &&
        now() - started < 2 * 60 * 1000,
      "RENDER_JOB_PENDING_RERUN_CHECK",
    );
    await wait(5000);
  }
  // A unique request ID avoids accepting another operator's concurrent output.
  // Never forward arbitrary service logs or CLI response bodies to the terminal.
  let result;
  for (let attempt = 0; attempt < 6; attempt++) {
    const logs = await cli([
      "logs",
      "--resources",
      job.id,
      "--start",
      new Date(started - 5000).toISOString(),
      "--end",
      new Date(now() + 5000).toISOString(),
      "--text",
      "FUNC_RECOVERY",
      "--limit",
      "100",
      "--output",
      "text",
    ]);
    need(typeof logs === "string", "RENDER_LOG_RESPONSE_UNCERTAIN");
    const found = [];
    for (const line of logs.split(/\r?\n/)) {
      const start = line.indexOf("FUNC_RECOVERY ");
      if (start === -1) continue;
      let parsed;
      try {
        parsed = JSON.parse(line.slice(start + "FUNC_RECOVERY ".length));
      } catch {
        continue;
      }
      if (parsed?.requestId === requestId) found.push(parsed);
    }
    need(found.length <= 1, "RECOVERY_OUTPUT_AMBIGUOUS");
    if (found.length) {
      result = found[0];
      break;
    }
    if (attempt < 5) await wait(2000);
  }
  if (result?.ok === false && /^[A-Z][A-Z0-9_]{1,80}$/.test(result.code || ""))
    need(false, result.code);
  need(
    status === "succeeded" && result?.ok === true,
    "REMOTE_RECOVERY_NOT_CONFIRMED",
  );
  need(
    result.operationId === intent.operationId &&
      /^[a-f0-9]{64}$/.test(result.versionId || "") &&
      (apply ? ["requested", "existing"] : ["checked"]).includes(
        result.status,
      ) &&
      ["failed", "queued", "confirmed"].includes(result.operationStatus),
    "INVALID_RECOVERY_OUTPUT",
  );
  return {
    status: result.status,
    operationId: result.operationId,
    versionId: result.versionId,
    operationStatus: result.operationStatus,
  };
}

export async function waitForRegistration(
  intent,
  { read, wait = sleep, now = Date.now } = {},
) {
  const started = now(),
    deadline = started + 10 * 60 * 1000;
  let progressed = false;
  for (;;) {
    const operation = await read(
      "/api/commerce/operations/" + intent.operationId,
    );
    need(
      operation?.operationId === intent.operationId &&
        operation.action === "register",
      "PUBLIC_OPERATION_MISMATCH",
    );
    if (operation.status === "confirmed") {
      need(
        txHash(operation.tx) && operation.versionId === intent.versionId,
        "PUBLIC_REGISTRATION_UNCONFIRMED",
      );
      return {
        status: "confirmed",
        operationId: intent.operationId,
        versionId: intent.versionId,
        tx: operation.tx,
      };
    }
    if (operation.recovery?.status === "blocked")
      need(false, "RECOVERY_PROOF_BLOCKED");
    const checking = ["checking", "waiting"].includes(
      operation.recovery?.status,
    );
    need(
      ["failed", "queued"].includes(operation.status) &&
        !(progressed && operation.status === "failed") &&
        (operation.status !== "failed" || checking || now() - started < 60000),
      "RECOVERY_REGISTRATION_FAILED",
    );
    progressed ||= operation.status === "queued";
    need(now() < deadline, "REGISTRATION_PENDING_RERUN_CHECK");
    await wait(5000);
  }
}

export async function main(
  args = process.argv.slice(2),
  {
    cwd = process.cwd(),
    log = console.log,
    remote = runRenderRecovery,
    read,
    readPrivate = async (file) => {
      const stat = await fs.lstat(file);
      need(
        stat.isFile() && (stat.mode & 0o777) === 0o600,
        "PRIVATE_SESSION_MODE_REQUIRED",
      );
      return JSON.parse(await fs.readFile(file, "utf8"));
    },
    wait = sleep,
    now = Date.now,
  } = {},
) {
  const { apply } = recoveryArgs(args);
  const intent = recoveryIntent(
    await readPrivate(
      path.join(cwd, ".local/hosted-basic-market/session.json"),
    ),
  );
  const result = await remote({ intent, apply });
  if (!apply) {
    log("FUNC_RECOVERY " + JSON.stringify(result));
    return result;
  }
  if (!read) {
    const { readHostedJson } = await import("./web3-hosted-basic.mjs");
    read = (route) => readHostedJson(ORIGIN, route);
  }
  const confirmed = await waitForRegistration(
    { ...intent, versionId: result.versionId },
    { read, wait, now },
  );
  log("FUNC_RECOVERY " + JSON.stringify(confirmed));
  return confirmed;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(
      safeCode(error) +
        ". Keep all recovery and signer evidence; rerun --check before any further action.",
    );
    process.exitCode = 1;
  });
