const test = require("node:test"),
  assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises"),
  path = require("node:path"),
  { tmpdir } = require("node:os");
const { fixture, emit, wait } = require("./harness.cjs");
const { createWeb3 } = require("../../server/web3/index.cjs");
const { loadConfig } = require("../../integrations/shared/config.mjs");
const { sanitizeName, uniqueName } = require("../../server/web3/names.cjs");
test("name rules reject markup, invalid length, reserved labels and confusables", () => {
  assert.equal(sanitizeName("  Cat Rider  "), "cat-rider");
  for (const nick of [
    "ab",
    "a".repeat(21),
    "admin",
    "HOST",
    "play",
    "games",
    "agents",
    "tv",
    "chonks",
    "admin-joe",
    "<script>",
    "cat/../dog",
    "аdmin",
    "cat--dog",
    "💩",
    {},
    null,
  ])
    assert.equal(sanitizeName(nick), null);
  const p = {},
    a = { displayName: "abcdefghijklmnopqrst" },
    b = { displayName: "abcdefghijklmnopqr-2" };
  assert.equal(
    uniqueName("abcdefghijklmnopqrst", [a, b, p], p),
    "abcdefghijklmnopqr-3",
  );
});
test("names update the view, collisions are stable, reconnect ack persists, leave resets and attempts are limited", async (t) => {
  let clock = 100000;
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-names-"));
  const web3 = createWeb3({
    config: loadConfig({ PARTNERS: "mock", WEB3_DATA_DIR: dir }),
    now: () => clock,
  });
  const f = await fixture(t, { web3 });
  t.after(async () => {
    await web3.close();
    await rm(dir, { recursive: true, force: true });
  });
  const h = await f.connect(),
    host = await emit(h, "host"),
    a = await f.connect(),
    b = await f.connect();
  const identity = await emit(a, "join", { code: host.code });
  await emit(b, "join", { code: host.code });
  assert.equal((await emit(a, "name", { nick: "Rider" })).name, "rider");
  assert.equal((await emit(b, "name", { nick: "Rider" })).name, "rider-2");
  assert.equal(
    f.party.view(f.party.rooms.get(host.code)).players[0].name,
    "rider",
  );
  assert.match(
    (await emit(a, "name", { nick: "other" })).error,
    /three seconds/,
  );
  clock += 3000;
  assert.equal((await emit(a, "name", { nick: "other" })).name, "other");
  const resumed = await f.connect();
  assert.equal(
    (await emit(resumed, "join", { code: host.code, token: identity.token }))
      .name,
    "other",
  );
  resumed.emit("leave");
  await wait(20);
  const fresh = await f.connect();
  const joined = await emit(fresh, "join", { code: host.code });
  assert.notEqual(joined.name, "other");
  assert.equal((await emit(fresh, "name", { nick: "rider" })).name, "rider");
});
