const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http"),
  express = require("express");
const { CreatorRegistry } = require("../../server/creator-registry.cjs"),
  { creatorGallery } = require("../../server/creator-gallery.cjs");
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-registry-")),
    source = path.join(dir, "source"),
    store = path.join(dir, "registry");
  fs.mkdirSync(source);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const manifest = {
    ...require("../../games/star-catch/game.json"),
    gameId: "example.catch",
    verification: "casual",
    title: "Example <catch>",
  };
  fs.writeFileSync(path.join(source, "game.json"), JSON.stringify(manifest));
  fs.writeFileSync(
    path.join(source, "index.html"),
    '<html><p>Example game</p><script src="game.js"></script></html>',
  );
  fs.writeFileSync(
    path.join(source, "game.js"),
    'document.body.dataset.ready="yes";',
  );
  const registry = new CreatorRegistry(store);
  registry.namespace("example", "Test owner");
  return { dir, source, store, registry };
}
const approval = {
  reviewer: "Fixture reviewer",
  note: "Automated fixture checks only",
  checks: { assetRights: true, sandbox: true, playability: true },
  approved: true,
};
test("creator versions are immutable, owned, hash pinned and require complete review", (t) => {
  const f = setup(t),
    r = f.registry;
  assert.throws(() => r.submit(f.source, "Another owner"), /owner/);
  const s = r.submit(f.source, "Test owner");
  assert.throws(() => r.submit(f.source, "Test owner"), /immutable/);
  assert.throws(() => r.namespace("chonks", "Imposter"), /unreserved/);
  assert.throws(
    () => r.review(s.id, { ...approval, checks: {} }),
    /separately/,
  );
  assert.throws(() => r.publish(s.id), /trial/);
  r.acceptTrial("Automated test fixture; not real creator acceptance.");
  assert.throws(() => r.publish(s.id), /approval/);
  r.review(s.id, approval);
  r.publish(s.id);
  assert.equal(r.catalog().length, 1);
  fs.writeFileSync(path.join(f.source, "game.js"), "changed after submission");
  assert.equal(
    Buffer.from(
      r.bundle(s.id).files.find((f) => f.path === "game.js").data,
      "base64",
    ).toString(),
    'document.body.dataset.ready="yes";',
  );
  r.withdraw(s.id, "Fixture withdrawal test");
  assert.equal(r.catalog().length, 0);
  assert.equal(new CreatorRegistry(f.store).get(s.id).status, "withdrawn");
});
test("corrupt saved bundles cannot publish", (t) => {
  const f = setup(t),
    r = f.registry,
    s = r.submit(f.source, "Test owner");
  r.acceptTrial("Automated test fixture; not real creator acceptance.");
  r.review(s.id, approval);
  const p = path.join(f.store, s.id + ".bundle.json"),
    b = JSON.parse(fs.readFileSync(p));
  b.files[0].data = Buffer.from("tampered").toString("base64");
  fs.writeFileSync(p, JSON.stringify(b));
  assert.throws(() => r.publish(s.id), /integrity/);
});
test("public gallery serves only published versions in an opaque sandbox and withdraws immediately", async (t) => {
  const f = setup(t),
    r = f.registry,
    s = r.submit(f.source, "Test owner");
  const app = express();
  app.use("/community", creatorGallery(f.store));
  const server = http.createServer(app);
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  t.after(() => new Promise((res) => server.close(res)));
  const base = "http://127.0.0.1:" + server.address().port;
  assert.equal((await fetch(base + "/community/play/" + s.id)).status, 404);
  r.acceptTrial("Automated test fixture; not real creator acceptance.");
  r.review(s.id, approval);
  r.publish(s.id);
  const page = await (await fetch(base + "/community/play/" + s.id)).text();
  assert.ok(page.includes('sandbox="allow-scripts"'));
  assert.ok(!page.includes("allow-same-origin"));
  assert.ok(page.includes("Example &lt;catch&gt;"));
  const file = await fetch(base + "/community/bundles/" + s.id + "/game.js");
  assert.equal(file.status, 200);
  assert.match(
    file.headers.get("content-security-policy"),
    /worker-src 'none'/,
  );
  assert.match(
    file.headers.get("content-security-policy"),
    new RegExp("/community/bundles/" + s.id + "/"),
  );
  r.withdraw(s.id, "Automated withdrawal test");
  assert.equal(
    (await fetch(base + "/community/bundles/" + s.id + "/game.js")).status,
    404,
  );
});
