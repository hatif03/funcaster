import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { createRequire } from "node:module";
import { loadConfig } from "../../integrations/shared/config.mjs";
const require = createRequire(import.meta.url),
  { createWeb3 } = require("../../server/web3/index.cjs"),
  { createRouter } = require("../../server/web3/router.cjs"),
  { scriptedRoom } = require("./party-script.cjs"),
  { canonical } = require("../../server/records.cjs");
test("live pot HTTP reads are fresh, keyless, bounded and never turn errors into verified state", async (t) => {
  let fail = false,
    missing = false;
  const id = `0x${"ab".repeat(32)}`;
  const { router } = createRouter({
    config: { PARTNERS: "on", WEB3_ARC: "on" },
    getArcReads: async () => ({
      async snapshot(potId) {
        assert.equal(potId, id);
        if (fail) throw Error("private RPC URL");
        return {
          potId,
          state: missing ? "None" : "Locked",
          chainVerified: false,
          terms: { stake: 500000n },
        };
      },
    }),
  });
  const base = await server(t, router),
    url = `${base}/api/web3/pot/${id}`;
  const response = await fetch(url);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.pot.terms.stake, "500000");
  assert.equal(body.pot.chainVerified, false);
  missing = true;
  assert.equal((await fetch(url)).status, 404);
  missing = false;
  fail = true;
  const error = await fetch(url);
  assert.equal(error.status, 503);
  assert(!(await error.text()).includes("private"));
  fail = false;
  for (let i = 0; i < 27; i++) assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(url)).status, 429);
});
test("ENS HTTP reads are bounded, return plain failures and never reflect RPC details", async (t) => {
  let calls = 0,
    fail = false;
  const routers = createRouter({
    config: { WEB3_ENS: "on" },
    getEnsReads: async () => ({
      async join(name) {
        calls++;
        if (fail) throw Error("secret RPC credential");
        return { name, code: "ROOMAA", origin: "https://console.example" };
      },
      async history(input) {
        return { ...input, rows: [], nextCursor: null };
      },
    }),
  });
  const base = await server(t, routers.router),
    url = `${base}/api/web3/ens/join?name=table.play.fixture.eth`;
  assert.equal((await fetch(url)).status, 200);
  assert.equal(
    (await fetch(`${base}/api/web3/ens/join?name[]=table`)).status,
    400,
  );
  fail = true;
  const failed = await fetch(url);
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes("secret"));
  fail = false;
  for (let i = 0; i < 28; i++) assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(url)).status, 429);
  assert.equal(calls, 30);
  assert.equal(
    (await fetch(`${base}/api/web3/ens/history?name=table&tx=forged`)).status,
    400,
  );
});
async function server(t, router, potRouter) {
  const app = express();
  app.use("/api/web3", router);
  if (potRouter) app.use("/pot", potRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  return `http://127.0.0.1:${server.address().port}`;
}
test("canonical result endpoint preserves hash, exposes no identities, and health has no private config", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-http-"));
  const web3 = createWeb3({
    config: loadConfig({
      PARTNERS: "mock",
      WEB3_DATA_DIR: dir,
      ENS_RPC_URLS: "https://private-rpc.example/key-value",
    }),
  });
  t.after(async () => {
    await web3.close();
    await rm(dir, { recursive: true, force: true });
  });
  const room = scriptedRoom({ web3 }),
    base = await server(t, web3.router, web3.potRouter);
  const response = await fetch(`${base}/api/web3/result/${room.result.hash}`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(canonical(data.result), canonical(room.result));
  assert.equal(data.verified, true);
  assert.equal(data.chainVerified, false);
  assert.equal(data.verificationScope, "game-replay");
  assert.equal(data.places.length, 4);
  const text = JSON.stringify(data);
  for (const p of room.room.players) {
    assert.ok(!text.includes(p.token));
    assert.ok(!text.includes(p.address || "no-identity-fixture"));
  }
  assert.ok(!/displayName|privateKey/.test(text));
  const health = await (await fetch(`${base}/api/web3/health`)).json();
  assert.ok(!JSON.stringify(health).includes(dir));
  assert.ok(!JSON.stringify(health).includes("private-rpc"));
  assert.ok(!JSON.stringify(health).includes("balance"));
  assert.equal(health.mode, "mock");
  assert.equal(
    (await fetch(`${base}/api/web3/result/${"0".repeat(64)}`)).status,
    404,
  );
  assert.equal((await fetch(`${base}/api/web3/result/nope`)).status, 400);
  assert.equal(
    (await fetch(`${base}/api/web3/pot/0x${"0".repeat(64)}`)).status,
    404,
  );
  assert.equal((await fetch(`${base}/api/web3/pot/nope`)).status, 400);
  room.party.close();
});
test("an unbuilt console returns 503 independently of local build artifacts", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-unbuilt-pot-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const routers = createRouter({ config: { PARTNERS: "mock" }, root: dir });
  const base = await server(t, routers.router, routers.potRouter);
  const response = await fetch(`${base}/pot/`);
  assert.equal(response.status, 503);
  assert.match(await response.text(), /not built/);
});
test("own JSON parser enforces 16 KB and never reflects submitted content", async (t) => {
  const router = createRouter({
    config: loadConfig({ PARTNERS: "mock" }),
    health: () => ({}),
    getResult: () => null,
    getPot: () => null,
  });
  const base = await server(t, router.router);
  const options = (body) => ({
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  let r = await fetch(
    `${base}/api/web3/health`,
    options(JSON.stringify({ value: "x".repeat(17000) })),
  );
  assert.equal(r.status, 413);
  assert.equal((await r.json()).error, "Request body exceeds 16 KB.");
  r = await fetch(`${base}/api/web3/health`, options("{not-json"));
  assert.equal(r.status, 400);
  assert.equal(r.headers.get("cache-control"), "no-store");
});
test("live pot reads fail explicitly; real Studio dist is served only when it exists", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-pot-dist-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const dist = path.join(dir, "integrations/arc/pot-console/dist");
  await mkdir(dist, { recursive: true });
  await writeFile(path.join(dist, "index.html"), "<title>TEST FIXTURE</title>");
  const routers = createRouter({
    config: loadConfig({
      PARTNERS: "on",
      WEB3_ENS: "off",
      WEB3_ARC: "off",
      WEB3_ARKIV: "off",
    }),
    health: () => ({}),
    getResult: () => null,
    getPot: () => null,
    root: dir,
  });
  const base = await server(t, routers.router, routers.potRouter);
  assert.equal(
    (await fetch(`${base}/api/web3/pot/0x${"0".repeat(64)}`)).status,
    503,
  );
  assert.match(await (await fetch(`${base}/pot/`)).text(), /TEST FIXTURE/);
});
