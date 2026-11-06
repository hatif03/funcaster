import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  ORIGIN,
  RELAY,
  recoveryArgs,
  recoveryIntent,
  runDatabaseRecovery,
  remoteRecovery,
  remoteStartCommand,
  runRenderRecovery,
  waitForRegistration,
  main,
} from "../../scripts/render-recover-registration.mjs";
import { registration } from "../../integrations/commerce/math.mjs";
import { digest } from "../../integrations/shared/outbox.mjs";
import {
  hash,
  commerceTransactionId,
} from "../../integrations/commerce/jobs.mjs";

const address = (n) => "0x" + String(n).repeat(40);
const prefix = "accept-" + "a".repeat(20),
  operationId = prefix + "-register";
const creator = address(1),
  operator = address(2),
  versionId = "b".repeat(64);
const intent = { operationId, creator, versionId };
const namespace = "funcaster-live";
const markerKey = "commerce-recovery/" + digest(operationId) + ".json";
function session() {
  return {
    version: 1,
    base: ORIGIN,
    mock: false,
    started: false,
    expiredTableRecovery: true,
    hookStarted: true,
    host: {
      code: "OLD123",
      token: "private-host-token",
      displayToken: "private-display-token",
    },
    checks: [
      "Two phone controllers joined; party and both seat ENS names are ready",
      "Both phones received confirmed Arc test-USDC starting play money",
    ],
    addresses: [creator, address(3)],
    marketAcceptance: {
      version: 1,
      addresses: {
        "spectator-1": address(4),
        "spectator-2": address(5),
        "phone-1": creator,
        "phone-2": address(3),
      },
      initialBalances: ["1100000", "1100000", "1100000", "1100000"],
      commerce: { prefix, register: { attempted: true }, versionId },
    },
  };
}
function fixture() {
  const v = {
    ...registration(
      { creator, price: "500000" },
      { platformAddress: operator },
    ),
    id: versionId,
    gameId: "star-catch",
    version: "1.0.0",
    status: "pending",
  };
  v.recipients = v.recipients.map(({ address, bps }) => ({ bps, address }));
  const job = {
    type: "commerce.register",
    room: "creator-" + creator.slice(2, 22),
    idempotencyKey: "commerce:register:" + operationId,
    payload: { operationId, actor: creator, version: v },
  };
  const operation = {
    id: operationId,
    action: "register",
    actor: creator,
    status: "failed",
    error: "WORKER_REVIEW_REQUIRED",
    job,
    jobId: "original-job-id",
    fingerprint: "c".repeat(64),
  };
  const receipt = {
    id: operation.jobId,
    type: job.type,
    status: "failed",
    tx: null,
    explorer: null,
    error: "Provider failed after eight attempts",
  };
  const fingerprint = hash({ type: job.type, payload: job.payload });
  const done = { fingerprint, receipt };
  const state = {
    schema: 2,
    operations: [operation],
    versions: [structuredClone(v)],
    receipts: [],
  };
  const journal = {
    version: 1,
    chainId: 5042002,
    owner: operator,
    entries: [{ id: "other-admission" }],
  };
  const docs = new Map([
    ["commerce/live-state.json", state],
    ["done/" + digest(job.idempotencyKey) + ".json", done],
    ["arc-relayer-transactions/journal.json", journal],
  ]);
  const statements = [];
  let pending;
  const db = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.startsWith("SELECT value ")) {
        assert.equal(params[0], namespace);
        const value =
          pending?.[0] === params[1] ? pending[1] : docs.get(params[1]);
        return {
          rows: value === undefined ? [] : [{ value: structuredClone(value) }],
        };
      }
      if (sql.startsWith("INSERT ")) {
        assert.equal(params[0], namespace);
        assert.equal(params[1], markerKey);
        assert.match(
          sql,
          /ON CONFLICT\(namespace,key\) DO NOTHING RETURNING key$/,
        );
        if (docs.has(params[1])) return { rowCount: 0, rows: [] };
        pending = [params[1], JSON.parse(params[2])];
        return { rowCount: 1, rows: [{ key: params[1] }] };
      }
      if (sql === "COMMIT" && pending) {
        docs.set(...pending);
        pending = undefined;
      }
      if (sql === "ROLLBACK") pending = undefined;
      assert.match(
        sql,
        /^(SET default_transaction_read_only=on|BEGIN READ ONLY|BEGIN ISOLATION LEVEL REPEATABLE READ|COMMIT|ROLLBACK)$/,
      );
      return { rows: [] };
    },
  };
  const run = (apply) =>
    runDatabaseRecovery({ db, intent, apply, namespace, operator });
  return {
    db,
    docs,
    statements,
    operation,
    job,
    receipt,
    fingerprint,
    done,
    state,
    journal,
    run,
  };
}
function recovered(f, confirmed = false) {
  const marker = f.docs.get(markerKey),
    o = f.operation;
  o.recovery = {
    version: 1,
    reason: marker.reason,
    manifest: structuredClone(marker),
    original: {
      job: structuredClone(f.job),
      jobId: o.jobId,
      fingerprint: f.fingerprint,
      failure: structuredClone(f.receipt),
      operationFingerprint: o.fingerprint,
    },
    idempotencyKey: f.job.idempotencyKey + ":jsonb-recovery-v1",
  };
  o.job = {
    ...structuredClone(f.job),
    idempotencyKey: o.recovery.idempotencyKey,
  };
  o.jobId = "recovered-job-id";
  o.status = confirmed ? "confirmed" : "queued";
  o.error = null;
  if (confirmed) {
    o.result = { versionId, tx: "0x" + "d".repeat(64) };
    f.state.versions[0].status = "published";
  }
}

test("exact owner flags and saved prepayment identities are required", () => {
  assert.deepEqual(recoveryArgs(["--check"]), { apply: false });
  assert.deepEqual(recoveryArgs(["--apply", "--confirm-funcaster-testnet"]), {
    apply: true,
  });
  for (const args of [
    [],
    ["--apply"],
    ["--check", "--apply"],
    ["--check", "--check"],
    ["--apply", "--confirm-funcaster-testnet", "--force"],
  ])
    assert.throws(() => recoveryArgs(args));
  assert.deepEqual(recoveryIntent(session()), intent);
  const paid = session();
  paid.marketAcceptance.commerce.pay = { attempted: true };
  assert.throws(() => recoveryIntent(paid));
  const other = session();
  other.base = "https://other.example";
  assert.throws(() => recoveryIntent(other), /RECOVERY_ORIGIN_MISMATCH/);
});

test("check has two read-only guards, cannot insert, and retains all documents", async () => {
  const f = fixture(),
    before = structuredClone(f.docs);
  const result = await f.run(false);
  assert.deepEqual(
    f.statements.slice(0, 2).map((s) => s.sql),
    ["SET default_transaction_read_only=on", "BEGIN READ ONLY"],
  );
  assert.equal(result.status, "checked");
  assert.equal(
    f.statements.some((s) => /INSERT|UPDATE|DELETE/.test(s.sql)),
    false,
  );
  assert.deepEqual(f.docs, before);
});

test("apply only inserts one immutable manifest and reruns do not write", async () => {
  const f = fixture(),
    before = structuredClone(f.docs);
  assert.equal((await f.run(true)).status, "requested");
  assert.deepEqual(f.docs.get(markerKey), {
    version: 1,
    reason: "jsonb-registration-v1",
    operationId,
    originalJobId: f.operation.jobId,
    originalIdempotencyKey: f.job.idempotencyKey,
    fingerprint: f.fingerprint,
    versionId,
  });
  assert.equal((await f.run(true)).status, "existing");
  recovered(f);
  assert.equal((await f.run(true)).operationStatus, "queued");
  f.operation.status = "confirmed";
  f.operation.result = { versionId, tx: "0x" + "d".repeat(64) };
  f.state.versions[0].status = "published";
  assert.equal((await f.run(true)).operationStatus, "confirmed");
  assert.equal(
    f.statements.filter((s) => s.sql.startsWith("INSERT ")).length,
    1,
  );
  assert.equal(
    f.statements.some((s) => /UPDATE|DELETE/.test(s.sql)),
    false,
  );
  for (const [key, value] of before)
    if (key !== "commerce/live-state.json")
      assert.deepEqual(f.docs.get(key), value);
});

const rejected = {
  "malformed state": (f) => {
    f.state.operations = {};
  },
  "duplicate operation": (f) => {
    f.state.operations.push(structuredClone(f.operation));
  },
  "paid intent": (f) => {
    f.state.operations.push({ id: prefix + "-pay" });
  },
  "claim intent": (f) => {
    f.state.operations.push({ id: prefix + "-claim" });
  },
  "provider record": (f) => {
    f.docs.set("commerce-worker/" + digest(f.job.idempotencyKey) + ".json", {});
  },
  "admitted transaction": (f) => {
    f.journal.entries.push({ id: commerceTransactionId(f.job) });
  },
  "missing relayer journal": (f) => {
    f.docs.delete("arc-relayer-transactions/journal.json");
  },
  "wrong relayer": (f) => {
    f.journal.owner = address(6);
  },
  "wrong original job ID": (f) => {
    f.receipt.id = "wrong-job-id";
  },
  "wrong receipt": (f) => {
    f.receipt.tx = "0x" + "f".repeat(64);
  },
  "different failure": (f) => {
    f.receipt.error = "other";
  },
  "wrong fingerprint": (f) => {
    f.done.fingerprint = "f".repeat(64);
  },
  "wrong creator": (f) => {
    f.operation.actor = address(6);
  },
  "wrong version": (f) => {
    f.job.payload.version.version = "2.0.0";
  },
  "invalid terms": (f) => {
    f.job.payload.version.recipients[0].bps = 9999;
  },
  "not JSONB defect": (f) => {
    f.job.payload.version.recipients = [{ address: creator, bps: 10000 }];
    f.done.fingerprint = hash({ type: f.job.type, payload: f.job.payload });
  },
  "mismatched marker": (f) => {
    f.docs.set(markerKey, { version: 1 });
  },
};
for (const [label, mutate] of Object.entries(rejected))
  test(`refuses ${label} before any insert`, async () => {
    const f = fixture();
    mutate(f);
    const before = structuredClone(f.docs);
    await assert.rejects(f.run(true));
    assert.equal(
      f.statements.some((s) => s.sql.startsWith("INSERT ")),
      false,
    );
    assert.equal(f.statements.at(-1).sql, "ROLLBACK");
    assert.deepEqual(f.docs, before);
  });

test("missing or changed recovery evidence never recreates a marker", async () => {
  for (const variant of ["missing", "changed", "failed"]) {
    const f = fixture();
    await f.run(true);
    recovered(f);
    if (variant === "missing") f.docs.delete(markerKey);
    if (variant === "changed")
      f.operation.recovery.original.failure.error = "changed";
    if (variant === "failed") f.operation.status = "failed";
    const writes = f.statements.filter((s) =>
      s.sql.startsWith("INSERT "),
    ).length;
    await assert.rejects(f.run(true));
    assert.equal(
      f.statements.filter((s) => s.sql.startsWith("INSERT ")).length,
      writes,
    );
  }
});

test("uncertain reads and insert conflicts roll back without any durable mutation", async () => {
  for (const variant of ["throw", "malformed", "conflict"]) {
    const f = fixture(),
      original = f.db.query;
    f.db.query = async (sql, params) => {
      if (
        sql.startsWith("SELECT ") &&
        params[1] === "arc-relayer-transactions/journal.json"
      ) {
        if (variant === "throw") throw Error("untrusted database body");
        if (variant === "malformed") return {};
      }
      if (sql.startsWith("INSERT ") && variant === "conflict")
        return { rowCount: 0, rows: [] };
      return original(sql, params);
    };
    await assert.rejects(f.run(true));
    assert.equal(f.docs.has(markerKey), false);
    assert.equal(f.statements.at(-1).sql, "ROLLBACK");
    if (variant !== "conflict")
      assert.equal(
        f.statements.some((s) => s.sql.startsWith("INSERT ")),
        false,
      );
  }
});

test("remote shell receives the source literally without interpolation", () => {
  const requestId = "quote' dollar$(printf unsafe) backtick`printf unsafe`";
  const command = remoteStartCommand({ intent, apply: false, requestId });
  const source = execFileSync(
    "/bin/sh",
    ["-c", "set -- " + command + "; printf '%s' \"$5\""],
    { encoding: "utf8" },
  );
  assert.ok(source.includes(JSON.stringify(requestId)));
  assert.ok(
    source.includes(
      "createRequire(new URL('./integrations/storage/postgres.mjs', import.meta.url))",
    ),
  );
  assert.ok(
    command.startsWith(
      "node --env-file=/etc/secrets/funcaster.env --input-type=module -e ",
    ),
  );
});

test("remote runner uses a read-only connection and emits only a sanitized failure", async () => {
  const output = [],
    options = [];
  class Client {
    constructor(opts) {
      options.push(opts);
    }
    on() {}
    async connect() {
      throw Error("postgres://secret-token@private-host");
    }
    async end() {}
  }
  const env = {
    FUNCASTER_ROLE: "relay",
    PUBLIC_ORIGIN: ORIGIN,
    ARC_CHAIN_ID: "5042002",
    ARC_ALLOW_MAINNET: "0",
    DATABASE_URL: "postgres://fixture:fixture@dpg-fixture/db",
  };
  assert.equal(
    await remoteRecovery({
      Client,
      intent,
      apply: false,
      requestId: "test-request",
      env,
      log: (s) => output.push(s),
    }),
    false,
  );
  assert.equal(options[0].options, "-c default_transaction_read_only=on");
  assert.deepEqual(output, [
    'FUNC_RECOVERY {"requestId":"test-request","ok":false,"code":"REGISTRATION_RECOVERY_STOPPED"}',
  ]);
  assert.equal(output.join().includes("secret-token"), false);
});

function cliFixture({ failed = false, badOutput = false } = {}) {
  const calls = [],
    result = {
      requestId: "request-test",
      ok: true,
      status: "requested",
      operationId,
      versionId,
      operationStatus: "failed",
    };
  let lists = 0,
    clock = 100000;
  return {
    calls,
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
    async cli(args) {
      calls.push(args);
      if (args[0] === "jobs" && args[1] === "create")
        return { id: "job-fixture" };
      if (args[0] === "jobs" && args[1] === "list")
        return [
          {
            job: {
              id: "job-fixture",
              status:
                ++lists === 1 ? "running" : failed ? "failed" : "succeeded",
            },
          },
        ];
      if (args[0] === "logs")
        return (
          "unrelated private log\n2026-11-06T00:00:00Z FUNC_RECOVERY " +
          JSON.stringify({
            ...result,
            ...(badOutput ? { operationId: "another-operation" } : {}),
          }) +
          "\n"
        );
      throw Error("Unexpected CLI call");
    },
  };
}

test("CLI captures one job, bounds status/log reads, and returns only validated marker fields", async () => {
  const f = cliFixture();
  assert.deepEqual(
    await runRenderRecovery(
      { intent, apply: true },
      { ...f, requestId: "request-test" },
    ),
    { status: "requested", operationId, versionId, operationStatus: "failed" },
  );
  assert.equal(f.calls.filter((a) => a[1] === "create").length, 1);
  assert.equal(f.calls[0][2], RELAY);
  assert.ok(f.calls[0].includes("--confirm"));
  const logs = f.calls.find((a) => a[0] === "logs");
  assert.equal(logs[logs.indexOf("--text") + 1], "FUNC_RECOVERY");
  assert.equal(logs[logs.indexOf("--resources") + 1], "job-fixture");
  assert.equal(logs[logs.indexOf("--output") + 1], "text");
  assert.ok(logs.includes("--start") && logs.includes("--end"));
  for (const args of [{ failed: true }, { badOutput: true }]) {
    const broken = cliFixture(args);
    await assert.rejects(
      runRenderRecovery(
        { intent, apply: true },
        { ...broken, requestId: "request-test" },
      ),
    );
  }
});

test("uncertain CLI responses never retry job creation and pending jobs are bounded", async () => {
  let creates = 0;
  await assert.rejects(
    runRenderRecovery(
      { intent, apply: true },
      {
        cli: async () => {
          creates++;
          throw Error("uncertain CLI response");
        },
      },
    ),
    /uncertain CLI response/,
  );
  assert.equal(creates, 1);
  let clock = 0,
    polls = 0;
  await assert.rejects(
    runRenderRecovery(
      { intent, apply: false },
      {
        now: () => clock,
        wait: async (ms) => {
          clock += ms;
        },
        cli: async (args) => {
          if (args[1] === "create") return { id: "job-fixture" };
          assert.equal(args[1], "list");
          polls++;
          return [{ id: "job-fixture", status: "pending" }];
        },
      },
    ),
    /RENDER_JOB_PENDING_RERUN_CHECK/,
  );
  assert.equal(clock, 120000);
  assert.equal(polls, 25);
});

test("CLI ignores other request markers and startup command echoes", async () => {
  const f = cliFixture(),
    original = f.cli;
  f.cli = async (args) =>
    args[0] === "logs"
      ? "running command echo FUNC_RECOVERY {not-json}\nFUNC_RECOVERY " +
        JSON.stringify({ requestId: "another-request", ok: true }) +
        "\n"
      : original(args);
  await assert.rejects(
    runRenderRecovery(
      { intent, apply: true },
      { ...f, requestId: "request-test" },
    ),
    /REMOTE_RECOVERY_NOT_CONFIRMED/,
  );
});

test("apply exits successfully only after the same registration is confirmed", async () => {
  const output = [],
    states = ["failed", "queued", "confirmed"];
  let reads = 0,
    clock = 0,
    remoteCalls = 0;
  const result = await main(["--apply", "--confirm-funcaster-testnet"], {
    readPrivate: async () => session(),
    log: (s) => output.push(s),
    remote: async ({ apply, intent: actual }) => {
      remoteCalls++;
      assert.equal(apply, true);
      assert.deepEqual(actual, intent);
      return { versionId };
    },
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
    read: async (route) => {
      assert.equal(route, "/api/commerce/operations/" + operationId);
      return {
        operationId,
        action: "register",
        status: states[reads++],
        versionId,
        tx: "0x" + "d".repeat(64),
      };
    },
  });
  assert.equal(remoteCalls, 1);
  assert.equal(reads, 3);
  assert.equal(result.status, "confirmed");
  assert.equal(output.length, 1);
  assert.equal(output.join().includes("private-"), false);
});

test("check never polls or starts hosted acceptance; failed registration never retries writes", async () => {
  let readCalls = 0,
    calls = 0;
  const result = await main(["--check"], {
    readPrivate: async () => session(),
    log() {},
    remote: async ({ apply }) => {
      calls++;
      assert.equal(apply, false);
      return { status: "checked" };
    },
    read: async () => {
      readCalls++;
    },
  });
  assert.equal(result.status, "checked");
  assert.equal(calls, 1);
  assert.equal(readCalls, 0);
  let count = 0;
  await assert.rejects(
    waitForRegistration(intent, {
      wait: async () => {},
      read: async () => ({
        operationId,
        action: "register",
        status: count++ ? "failed" : "queued",
      }),
    }),
    /RECOVERY_REGISTRATION_FAILED/,
  );
  await assert.rejects(
    waitForRegistration(intent, {
      read: async () => {
        throw Error("network uncertainty");
      },
    }),
    /network uncertainty/,
  );
  await assert.rejects(
    waitForRegistration(intent, {
      read: async () => ({
        operationId,
        action: "register",
        status: "confirmed",
        versionId,
        tx: null,
      }),
    }),
    /PUBLIC_REGISTRATION_UNCONFIRMED/,
  );
});

test("public confirmation polling has a short initial-failure grace and ten-minute queued deadline", async () => {
  for (const status of ["failed", "queued"]) {
    let clock = 0;
    await assert.rejects(
      waitForRegistration(intent, {
        now: () => clock,
        wait: async (ms) => {
          clock += ms;
        },
        read: async () => ({ operationId, action: "register", status }),
      }),
      status === "failed"
        ? /RECOVERY_REGISTRATION_FAILED/
        : /REGISTRATION_PENDING_RERUN_CHECK/,
    );
    assert.equal(clock, status === "failed" ? 60000 : 600000);
  }
});

test("owner wait reports blocked proof and allows a bounded unavailable proof check", async () => {
  const operation = { operationId, action: "register", status: "failed" };
  await assert.rejects(
    waitForRegistration(intent, {
      read: async () => ({
        ...operation,
        recovery: { status: "blocked", code: "COMMERCE_RECOVERY_BLOCKED" },
      }),
      wait: async () => assert.fail("blocked proof must not spin"),
    }),
    /RECOVERY_PROOF_BLOCKED/,
  );
  let clock = 0;
  await assert.rejects(
    waitForRegistration(intent, {
      read: async () => ({
        ...operation,
        recovery: { status: "waiting", code: "RECOVERY_CHECK_UNAVAILABLE" },
      }),
      now: () => clock,
      wait: async (ms) => {
        clock += ms;
      },
    }),
    /REGISTRATION_PENDING_RERUN_CHECK/,
  );
  assert.equal(clock, 600000);
});
