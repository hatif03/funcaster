import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createDemoLog } from "../../server/web3/demo-log.cjs";
import { createWeb3 } from "../../server/web3/index.cjs";
import { loadConfig } from "../../integrations/shared/config.mjs";
import { bindData } from "../../integrations/shared/bind-types.mjs";
import { registerStorage } from "../../integrations/storage/runtime.mjs";
import { fixture, emit } from "../party/harness.cjs";

const address = "0x52908400098527886e0f7030069857d2e4169ee7";
const tx = `0x${"ab".repeat(32)}`;
const receipt = (overrides = {}) => ({
  id: "private-job-id",
  type: "arc.drip",
  status: "done",
  at: 1001,
  tx,
  ...overrides,
});
function capture(options = {}) {
  const lines = [];
  const logger = createDemoLog({
    now: () => 1000,
    write: (line) => lines.push(line),
    ...options,
  });
  return {
    logger,
    lines,
    rows: () =>
      lines.map((line) => {
        assert.ok(line.startsWith("FUNC_DEMO "));
        return JSON.parse(line.slice("FUNC_DEMO ".length));
      }),
  };
}

test("wallet logs contain only the public checksum address, slot and fixed labels", () => {
  const { logger, lines, rows } = capture();
  logger.walletConnected({
    address,
    slot: 2,
    token: "SECRET",
    signature: "SECRET",
    privateKey: "SECRET",
    name: "SECRET",
    ip: "SECRET",
  });
  assert.deepEqual(rows(), [
    {
      event: "wallet-connected",
      mode: "live",
      address: getAddress(address),
      slot: 2,
    },
  ]);
  assert.ok(!lines.join().includes("SECRET"));
  for (const player of [
    null,
    { address: "SECRET", slot: 0 },
    { address, slot: -1 },
    { address, slot: 4 },
  ])
    logger.walletConnected(player);
  assert.equal(lines.length, 1);
});

test("transaction logs allowlist fields and derive canonical explorer links", () => {
  const { logger, lines, rows } = capture();
  logger.receipt(
    receipt({
      explorer: "https://SECRET.invalid",
      payload: { signature: "SECRET" },
      room: "SECRET",
      data: { token: "SECRET" },
    }),
  );
  logger.receipt(receipt({ type: "ens.seat.mint", at: 999, status: "failed" }));
  const [arc, ens] = rows();
  assert.deepEqual(arc, {
    event: "transaction",
    mode: "live",
    operation: "arc.drip",
    status: "done",
    delivery: "new",
    verification: "worker-observed",
    chainId: 5042002,
    tx,
    url: `https://explorer.testnet.arc.io/tx/${tx}`,
  });
  assert.equal(ens.url, `https://sepolia.etherscan.io/tx/${tx}`);
  assert.equal(ens.delivery, "replay");
  assert.equal(ens.status, "failed");
  assert.ok(!lines.join().includes("SECRET"));
  assert.ok(!lines.join().includes("private-job-id"));
  for (const invalid of [
    { type: "arc.SECRET" },
    { type: "swarm.upload" },
    { tx: "SECRET" },
    { tx: `${tx}\nSECRET` },
    { tx: `0x${"0".repeat(64)}` },
    { tx: null },
    { status: "SECRET" },
    { at: NaN },
    { at: -1 },
  ])
    logger.receipt(receipt(invalid));
  assert.equal(lines.length, 2);
});

test("mock receipts never print transaction hashes or live explorer URLs", () => {
  for (const options of [{ mode: "mock" }, {}]) {
    const { logger, lines, rows } = capture(options);
    logger.receipt(
      receipt({
        mock: true,
        explorer: `https://explorer.testnet.arc.io/tx/${tx}`,
      }),
    );
    logger.receipt(receipt({ data: { mode: "mock" } }));
    assert.ok(
      rows().every(
        (row) =>
          row.event === "mock-receipt" &&
          row.mode === "mock" &&
          row.verification === "simulated",
      ),
    );
    assert.ok(!lines.join().includes(tx));
    assert.ok(!lines.join().includes("https://"));
  }
  const { logger, rows } = capture({ mode: "mock" });
  logger.walletConnected({ address, slot: 0 });
  assert.equal(rows()[0].mode, "mock");
});

test("logging errors and malformed objects never escape into game code", async () => {
  for (const write of [
    () => {
      throw Error("PRIVATE");
    },
    () => Promise.reject(Error("PRIVATE")),
  ]) {
    const logger = createDemoLog({ write, now: () => 1000 });
    assert.doesNotThrow(() => logger.walletConnected({ address, slot: 0 }));
    assert.doesNotThrow(() => logger.receipt(receipt()));
    assert.doesNotThrow(() =>
      logger.receipt({
        get type() {
          throw Error("PRIVATE");
        },
      }),
    );
  }
  await new Promise((resolve) => setImmediate(resolve));
});

test("relay logs a wallet only after successful signature validation and a broken logger cannot reject binding", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "funcaster-demo-wallet-"));
  const lines = [];
  const web3 = createWeb3({
    config: loadConfig({ PARTNERS: "mock", WEB3_DATA_DIR: dir }),
    demoWrite(line) {
      lines.push(line);
      throw Error("LOG_UNAVAILABLE");
    },
  });
  const f = await fixture(t, { web3 });
  t.after(async () => {
    await web3.close();
    await rm(dir, { recursive: true, force: true });
  });
  const host = await f.connect(),
    room = await emit(host, "host"),
    phone = await f.connect();
  const challenged = new Promise((resolve) =>
    phone.once("web3.challenge", resolve),
  );
  const seat = await emit(phone, "join", { code: room.code });
  const challenge = await challenged,
    account = privateKeyToAccount(generatePrivateKey());
  const signature = await account.signTypedData(
    bindData(challenge, { room: room.code, slot: seat.slot }),
  );
  const wrong = privateKeyToAccount(generatePrivateKey());
  assert.ok(
    (await emit(phone, "web3.bind", { address: wrong.address, signature }))
      .error,
  );
  assert.equal(lines.length, 0);
  assert.equal(
    (await emit(phone, "web3.bind", { address: account.address, signature }))
      .ok,
    true,
  );
  assert.deepEqual(
    lines.map((line) => JSON.parse(line.slice("FUNC_DEMO ".length))),
    [
      {
        event: "wallet-connected",
        mode: "mock",
        address: account.address,
        slot: seat.slot,
      },
    ],
  );
  for (const secret of [signature, seat.token, room.code])
    assert.ok(!lines.join().includes(secret));
});

test("relay emits a receipt log only after its local ledger write finishes", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "funcaster-demo-receipt-"));
  const documents = new Map(),
    streams = new Map([
      ["receipts.jsonl", [{ seq: "1", value: receipt({ mock: true }) }]],
    ]);
  let release,
    writing,
    durable = false;
  const started = new Promise((resolve) => {
    writing = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const unregister = registerStorage(dir, {
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
      if (name === "ledger/journal.jsonl") {
        writing();
        await gate;
        durable = true;
      }
      if (!streams.has(name)) streams.set(name, []);
      const rows = streams.get(name);
      if (!rows.some((row) => row.key === key))
        rows.push({
          seq: String(rows.length + 1),
          key,
          value: structuredClone(value),
        });
    },
  });
  const lines = [];
  const web3 = createWeb3({
    config: loadConfig({ PARTNERS: "mock", WEB3_DATA_DIR: dir }),
    now: () => 1000,
    demoWrite: (line) => lines.push({ line, durable }),
  });
  t.after(async () => {
    release();
    await web3.close();
    unregister();
    await rm(dir, { recursive: true, force: true });
  });
  await Promise.race([
    started,
    new Promise((_, reject) => {
      const timer = setTimeout(
        () => reject(Error("Ledger write did not start")),
        3000,
      );
      timer.unref();
    }),
  ]);
  assert.equal(lines.length, 0);
  release();
  const deadline = Date.now() + 3000;
  while (!lines.length && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].durable, true);
  assert.equal(
    JSON.parse(lines[0].line.slice("FUNC_DEMO ".length)).event,
    "mock-receipt",
  );
});
