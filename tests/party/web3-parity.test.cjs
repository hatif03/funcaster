const test = require("node:test"),
  assert = require("node:assert/strict");
const { scriptedRoom } = require("../web3/party-script.cjs");
const golden = require("../web3/fixtures/main-404abb1.json");
const { loadConfig } = require("../../integrations/shared/config.mjs");
const { createWeb3 } = require("../../server/web3/index.cjs");
const { canonical, hash } = require("../../server/records.cjs");
test("PARTNERS=off is byte-identical to unchanged main state and socket event names", () => {
  const off = createWeb3({ config: loadConfig({ PARTNERS: "off" }) });
  assert.equal(off, null);
  const r = scriptedRoom({ web3: off });
  assert.deepEqual(r.snapshots, golden.snapshots);
  assert.deepEqual(r.eventNames, golden.eventNames);
  assert.ok(!JSON.stringify(r.snapshots).includes("web3"));
  r.party.close();
});
test("off, mock and on with a fake worker preserve result, hash and replayHash", async () => {
  const { mkdtemp, rm } = require("node:fs/promises"),
    path = require("node:path"),
    { tmpdir } = require("node:os");
  const { listJobs } = require("../../integrations/shared/outbox.mjs");
  const {
    createWorker,
    mockProvider,
  } = require("../../integrations/shared/worker.mjs");
  const { createMockEnsProvider } = require("../../integrations/ens/mock.mjs");
  for (const mode of ["off", "mock", "on"]) {
    const dir = await mkdtemp(path.join(tmpdir(), "chonks-parity-"));
    const config = loadConfig({
      PARTNERS: mode,
      WEB3_DATA_DIR: dir,
      ...(mode === "on"
        ? {
            WEB3_ARC: "off",
            WEB3_ARKIV: "off",
            ENS_PARENT: "fixture.eth",
            ENS_RPC_URLS: "http://127.0.0.1:1",
            ENS_APP_URL: "https://example.test",
          }
        : {}),
    });
    const web3 = createWeb3({ config }),
      r = scriptedRoom({ web3 });
    try {
      assert.equal(canonical(r.result), canonical(golden.result));
      if (mode !== "off") {
        // Inject the fake at the worker boundary only. The relay's on-mode graph
        // never loads a mock chain provider; no network requests are possible.
        const deadline = Date.now() + 3000;
        while ((await listJobs(dir)).length < 2 && Date.now() < deadline)
          await new Promise((r) => setTimeout(r, 10));
        assert.equal((await listJobs(dir)).length, 2);
        const worker = createWorker({
          dir,
          providers: {
            ens:
              mode === "mock"
                ? await createMockEnsProvider(dir)
                : mockProvider(dir),
          },
        });
        await worker.poll();
        await worker.close();
        assert.equal((await listJobs(dir)).length, 0);
        assert.equal(canonical(r.result), canonical(golden.result));
      }
      const { hash: expected, ...result } = r.result;
      assert.equal(hash(result), expected);
      if (mode === "mock") {
        assert.equal(r.party.view(r.room).web3.party.status, "ready");
        assert.match(r.party.view(r.room).web3.party.name, /^MOCK-/);
      }
      if (mode === "on")
        assert.equal(r.party.view(r.room).web3.party.name, null);
    } finally {
      r.party.close();
      await web3?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
});
