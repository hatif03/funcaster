import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  acceptanceOptions,
  readHostedJson,
  assertRecoverableSession,
  confirmTableMissing,
  reserveExpiredRecovery,
  markReplacementCreating,
  saveReplacementHost,
  ensReadiness,
  readExistingPhoneIdentity,
  hostedWorkerReady,
  connectHostedScreens,
  holdHostedScreens,
  retainedPhoneBankroll,
  createAcceptanceSave,
} from "../../scripts/web3-hosted-basic.mjs";

test("a paused live acceptance holds existing screens for a bounded interval without retrying any action", async () => {
  const waits = [],
    messages = [];
  await holdHostedScreens({
    wait: async (ms) => waits.push(ms),
    report: (message) => messages.push(message),
  });
  assert.equal(
    waits.reduce((a, b) => a + b, 0),
    15 * 60000,
  );
  assert.ok(waits.every((ms) => ms <= 30000));
  assert.equal(messages.length, 1);
  assert.match(messages[0], /no further test actions or payment submissions/);
});

test("saved-table resume reconnects retained phones before host cleanup; fresh tables still open host first", async (t) => {
  const { fixture, emit, wait } = createRequire(import.meta.url)(
    "../party/harness.cjs",
  );
  const f = await fixture(t),
    hostSocket = await f.connect(),
    host = await emit(hostSocket, "host"),
    originalPhones = [];
  for (let i = 0; i < 2; i++) {
    const socket = await f.connect(),
      identity = await emit(socket, "join", { code: host.code });
    originalPhones.push({ socket, identity });
  }
  const room = f.party.rooms.get(host.code),
    originalPlayers = [...room.players];
  hostSocket.disconnect();
  for (const phone of originalPhones) phone.socket.disconnect();
  await wait(20);
  await f.advance(45000);
  assert.deepEqual(room.players, originalPlayers);
  const order = [];
  const restored = await connectHostedScreens({
    savedHost: host,
    async connectPhones(savedHost) {
      order.push("phones");
      assert.equal(savedHost, host);
      const phones = [];
      for (const original of originalPhones) {
        const socket = await f.connect(),
          identity = await emit(socket, "join", {
            code: host.code,
            token: original.identity.token,
          });
        assert.equal(identity.token, original.identity.token);
        assert.equal(identity.slot, original.identity.slot);
        phones.push(socket);
      }
      return phones;
    },
    async connectHost() {
      order.push("host");
      const desktop = await f.connect();
      await emit(desktop, "host", { code: host.code, token: host.token });
      await f.advance(20);
      return { desktop, host };
    },
  });
  assert.deepEqual(order, ["phones", "host"]);
  assert.equal(restored.phones.length, 2);
  for (const player of originalPlayers.filter(Boolean))
    assert.equal(room.players[player.slot], player);
  order.length = 0;
  const fresh = await connectHostedScreens({
    savedHost: null,
    async connectHost() {
      order.push("host");
      return { desktop: {}, host: { code: "CATS42" } };
    },
    async connectPhones(savedHost) {
      order.push("phones");
      assert.equal(savedHost.code, "CATS42");
      return ["phone-1", "phone-2"];
    },
  });
  assert.deepEqual(order, ["host", "phones"]);
  assert.deepEqual(fresh.phones, ["phone-1", "phone-2"]);
});

test("hosted reads tolerate deployment routing lag without retrying any writes", async () => {
  const requests = [],
    waits = [];
  const result = await readHostedJson(
    "https://example.test",
    "/api/web3/live-config",
    {
      fetcher: async (url, options) => {
        requests.push({ url, method: options.method });
        return requests.length < 3
          ? new Response("Starting", { status: 503 })
          : Response.json({ mode: "on" });
      },
      wait: async (ms) => waits.push(ms),
    },
  );
  assert.deepEqual(result, { mode: "on" });
  assert.deepEqual(waits, [2000, 4000]);
  assert.ok(
    requests.every(
      (r) =>
        r.method === "GET" &&
        r.url === "https://example.test/api/web3/live-config",
    ),
  );
});

const unstarted = () => ({
  version: 1,
  base: "https://example.test",
  mock: false,
  started: false,
  checks: [],
  buildId: "build-one",
  host: {
    code: "CATS42",
    token: "private-host-fixture",
    displayToken: "private-display-fixture",
  },
});
test("creator status and authenticated balances retry failed GET connections without retrying submissions", async () => {
  for (const route of [
    "/api/commerce/operations/existing-registration",
    "/api/web3/market/me",
  ]) {
    const requests = [];
    const value = await readHostedJson("https://example.test", route, {
      headers: { Authorization: "Bearer private-fixture-token" },
      wait: async () => {},
      fetcher: async (url, options) => {
        requests.push({ url, options });
        if (requests.length === 1) throw new TypeError("fetch failed");
        if (requests.length === 2)
          return new Response("temporarily unavailable", { status: 503 });
        return Response.json({ status: "confirmed" });
      },
    });
    assert.deepEqual(value, { status: "confirmed" });
    assert.equal(requests.length, 3);
    assert.ok(
      requests.every(
        ({ url, options }) =>
          url.endsWith(route) &&
          options.method === "GET" &&
          options.headers.Authorization === "Bearer private-fixture-token",
      ),
    );
  }
  assert.equal(
    await readHostedJson(
      "https://example.test",
      "/api/commerce/operations/missing",
      {
        allowMissing: true,
        fetcher: async () => new Response("missing", { status: 404 }),
      },
    ),
    null,
  );
  let calls = 0;
  await assert.rejects(
    readHostedJson("https://example.test", "/api/web3/market/me", {
      headers: { Authorization: "Bearer private-fixture-token" },
      fetcher: async () => {
        calls++;
        return new Response("private-fixture-token", { status: 401 });
      },
    }),
    (error) =>
      /HTTP 401/.test(error.message) &&
      !error.message.includes("private-fixture-token"),
  );
  assert.equal(calls, 1);
});
test("expired recovery requires owner confirmation and refuses gameplay or extension financial state", () => {
  assert.equal(
    acceptanceOptions([
      "--apply",
      "--confirm-funcaster-testnet",
      "--url",
      "https://example.test",
      "--recover-expired-table",
    ]).recoverExpiredTable,
    true,
  );
  assert.throws(() =>
    acceptanceOptions([
      "--mock",
      "--url",
      "http://127.0.0.1:8795",
      "--recover-expired-table",
    ]),
  );
  assertRecoverableSession(unstarted());
  for (const fields of [
    { started: true },
    { completed: true },
    { resultHash: "a".repeat(64) },
    { hookStarted: true },
    { marketAcceptance: { version: 1 } },
    { checks: ["Bet funded"] },
    { expiredTableRecovery: true },
  ])
    assert.throws(() =>
      assertRecoverableSession({ ...unstarted(), ...fields }),
    );
});
test("expired display token alone is insufficient: replacement requires independent table-not-found GET", async () => {
  const calls = [];
  await confirmTableMissing("https://example.test", unstarted().host, {
    fetcher: async (url, options) => {
      calls.push([url, options.method]);
      return Response.json({ error: "Party not found" }, { status: 404 });
    },
  });
  assert.deepEqual(calls, [
    ["https://example.test/api/party/pairing/CATS42", "GET"],
  ]);
  for (const status of [200, 401, 500])
    await assert.rejects(
      confirmTableMissing("https://example.test", unstarted().host, {
        fetcher: async () => Response.json({}, { status }),
      }),
    );
});
test("one-use recovery archives the original session and preserves addresses across reservation/creation crashes", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "chonks-expired-recovery-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const journal = unstarted(),
    original = JSON.stringify(journal, null, 2),
    addresses = ["0x" + "1".repeat(40), "0x" + "2".repeat(40)];
  await writeFile(path.join(dir, "session.json"), original);
  await reserveExpiredRecovery(dir, journal, addresses);
  await reserveExpiredRecovery(dir, journal, addresses);
  assert.equal(
    await readFile(path.join(dir, "session.expired.original.json"), "utf8"),
    original,
  );
  assert.equal(
    await readFile(path.join(dir, "session.json"), "utf8"),
    original,
  );
  await markReplacementCreating(dir);
  await assert.rejects(markReplacementCreating(dir), /already attempted/);
  await assert.rejects(
    reserveExpiredRecovery(dir, journal, addresses),
    /already consumed/,
  );
  const host = {
    code: "CHNK42",
    token: "new-host-fixture",
    displayToken: "new-display-fixture",
  };
  const marker = await saveReplacementHost(dir, host);
  assert.deepEqual(marker.addresses, addresses);
  assert.deepEqual(marker.host, host);
  assert.equal(marker.phase, "replacement-saved");
  await assert.rejects(saveReplacementHost(dir, host));
  await assert.rejects(
    reserveExpiredRecovery(dir, journal, addresses),
    /already consumed/,
  );
  assert.equal(
    await readFile(path.join(dir, "session.expired.original.json"), "utf8"),
    original,
  );
});
test("ENS readiness reports counts and stops immediately on terminal seat failure", () => {
  const state = {
    players: [{ ready: true }, { ready: true }],
    web3: {
      party: { status: "ready" },
      seats: [
        { slot: 0, status: "pending", named: false },
        { slot: 1, status: "ready", named: true },
      ],
    },
  };
  assert.equal(ensReadiness(state).ready, false);
  assert.match(
    ensReadiness(state).summary,
    /phones 2\/2; ENS party ready; names 1\/2/,
  );
  state.web3.seats[0].status = "failed";
  assert.throws(
    () => ensReadiness(state),
    /ENS terminal failure.*seat 1: failed/,
  );
});
test("pre-join readiness requires an initialized worker without waiting for room-dependent ENS health", () => {
  assert.equal(
    hostedWorkerReady({
      worker: "up",
      ok: false,
      providers: { ens: "down", arc: "ok" },
    }),
    true,
  );
  assert.equal(
    hostedWorkerReady({ worker: "down", providers: { ens: "ok", arc: "ok" } }),
    false,
  );
  assert.equal(hostedWorkerReady(null), false);
});
test(
  "real Chromium identity probe retains the original key and never joins, connects, signs or creates a key",
  {
    skip:
      process.env.CHONKS_BROWSER_TEST !== "1"
        ? "Run with CHONKS_BROWSER_TEST=1 and installed Chromium"
        : false,
  },
  async (t) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "chonks-profile-probe-")),
      requests = [];
    const module = await readFile(
      new URL("../../public/web3/phone-signer.js", import.meta.url),
    );
    let upgrades = 0;
    const server = createServer((req, res) => {
      requests.push(req.url);
      res.writeHead(req.url === "/web3/phone-signer.js" ? 200 : 404, {
        "content-type": "text/javascript",
      });
      res.end(req.url === "/web3/phone-signer.js" ? module : "");
    });
    server.on("upgrade", (_request, socket) => {
      upgrades++;
      socket.destroy();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`,
      key = generatePrivateKey(),
      account = privateKeyToAccount(key);
    let context;
    t.after(async () => {
      await context?.close();
      await new Promise((resolve) => server.close(resolve));
      await rm(dir, { recursive: true, force: true });
    });
    context = await chromium.launchPersistentContext(dir, { headless: true });
    let seed = await context.newPage();
    await seed.route(base + "/seed", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html>" }),
    );
    await seed.goto(base + "/seed");
    await seed.evaluate(
      (value) => localStorage.setItem("chonks.web3.key", value),
      key,
    );
    await context.close();
    context = await chromium.launchPersistentContext(dir, { headless: true });
    assert.equal(
      await readExistingPhoneIdentity(context, base, account.address),
      account.address,
    );
    assert.ok(requests.every((url) => url === "/web3/phone-signer.js"));
    assert.equal(upgrades, 0);
    seed = await context.newPage();
    await seed.route(base + "/seed", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html>" }),
    );
    await seed.goto(base + "/seed");
    assert.equal(
      await seed.evaluate(
        (value) => localStorage.getItem("chonks.web3.key") === value,
        key,
      ),
      true,
    );
    await assert.rejects(
      readExistingPhoneIdentity(context, base, "0x" + "1".repeat(40)),
      /address changed/,
    );
    await seed.evaluate(() => localStorage.removeItem("chonks.web3.key"));
    await assert.rejects(
      readExistingPhoneIdentity(context, base, account.address),
      /Original phone key is missing/,
    );
    assert.equal(
      await seed.evaluate(() => localStorage.getItem("chonks.web3.key")),
      null,
    );
    assert.equal(upgrades, 0);
  },
);

test("hosted read failures are bounded and identify the endpoint/status", async () => {
  let calls = 0;
  await assert.rejects(
    readHostedJson("https://example.test", "/api/health", {
      fetcher: async () => {
        calls++;
        return new Response("Unavailable", { status: 503 });
      },
      wait: async () => {},
    }),
    /\/api\/health \(HTTP 503\)/,
  );
  assert.equal(calls, 5);
  calls = 0;
  await assert.rejects(
    readHostedJson("https://example.test", "/api/health", {
      fetcher: async () => {
        calls++;
        return new Response("Missing", { status: 404 });
      },
      wait: async () => {},
    }),
    /HTTP 404/,
  );
  assert.equal(calls, 1);
});
test("hosted acceptance requires owner apply plus exact testnet confirmation; mock never accepts a public origin", () => {
  assert.deepEqual(
    acceptanceOptions([
      "--apply",
      "--confirm-funcaster-testnet",
      "--url",
      "https://example.test",
    ]),
    { mock: false, base: "https://example.test" },
  );
  assert.deepEqual(
    acceptanceOptions(["--mock", "--url", "http://127.0.0.1:8795"]),
    { mock: true, base: "http://127.0.0.1:8795" },
  );
  for (const args of [
    [],
    ["--url", "https://example.test"],
    ["--apply", "--url", "https://example.test"],
    ["--mock", "--url", "https://example.test"],
    [
      "--apply",
      "--confirm-funcaster-testnet",
      "--url",
      "https://user:pass@example.test",
    ],
    [
      "--apply",
      "--confirm-funcaster-testnet",
      "--url",
      "https://example.test/path",
    ],
  ])
    assert.throws(() => acceptanceOptions(args));
});

test("resuming retains a passed funding checkpoint only for the exact original two phone keys", () => {
  const addresses = ["0x" + "a".repeat(40), "0x" + "b".repeat(40)];
  const journal = {
    addresses,
    checks: [
      "Both phones received confirmed Arc test-USDC starting play money",
    ],
  };
  assert.equal(retainedPhoneBankroll(journal, addresses), true);
  assert.equal(
    retainedPhoneBankroll({ ...journal, checks: [] }, addresses),
    false,
  );
  for (const changed of [
    [addresses[1], addresses[0]],
    [addresses[0], "0x" + "c".repeat(40)],
    [addresses[0], addresses[0]],
    [addresses[0]],
  ])
    assert.throws(() => retainedPhoneBankroll(journal, changed));
  assert.throws(() =>
    retainedPhoneBankroll({ ...journal, addresses: null }, addresses),
  );
});

test("concurrent acceptance checkpoints retain every intent and receipt across atomic saves", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "acceptance-save-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "session.json"),
    journal = {};
  const save = createAcceptanceSave(file, () => journal);
  await Promise.all(
    ["betOne", "betTwo", "cheer"].map(async (key) => {
      journal[key] = { attempted: true };
      await save();
      assert.equal(
        JSON.parse(await readFile(file, "utf8"))[key].attempted,
        true,
      );
      journal[key].done = true;
      await save();
    }),
  );
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), journal);
  const broken = createAcceptanceSave(
    path.join(dir, "missing", "session.json"),
    () => journal,
  );
  await assert.rejects(broken());
  await assert.rejects(
    broken(),
    /ENOENT/,
    "a failed admission save never permits a later action",
  );
});
