import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";
import { initializeLocal } from "../../scripts/web3-init-local.mjs";
import { loadConfig } from "../../integrations/shared/config.mjs";
test("fresh role keys, restrictive permissions, separated environments and no overwrite", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-keys-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const result = await initializeLocal(dir);
  assert.equal(result.count, 14);
  const inventory = JSON.parse(
    await readFile(path.join(dir, result.inventory), "utf8"),
  );
  assert.equal(new Set(inventory.roles.map((r) => r.address)).size, 14);
  for (const file of result.files) {
    if (process.platform !== "win32")
      assert.equal((await stat(path.join(dir, file))).mode & 0o777, 0o600);
  }
  const relay = parseEnv(await readFile(path.join(dir, ".env.relay"), "utf8"));
  assert.equal(
    Object.keys(relay).some((k) => /KEY|SECRET|TOKEN/.test(k)),
    false,
  );
  for (const role of ["relay", "worker", "gateway", "verifier"]) {
    const env = parseEnv(
      await readFile(path.join(dir, `.env.${role}`), "utf8"),
    );
    assert.doesNotThrow(() => loadConfig(env, { role }));
  }
  const worker = parseEnv(
    await readFile(path.join(dir, ".env.worker"), "utf8"),
  );
  assert.doesNotThrow(() => loadConfig(worker, { role: "worker" }));
  assert.ok(!worker.MARKET_VERIFIER_KEY);
  assert.ok(!worker.GATEWAY_TOKEN_KEY);
  const before = await readFile(path.join(dir, ".env.worker"));
  await assert.rejects(() => initializeLocal(dir), /Refusing to overwrite/);
  assert.ok(before.equals(await readFile(path.join(dir, ".env.worker"))));
});
test("an existing secret file prevents any generated file from being written", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-existing-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, ".env.worker"), "existing", { mode: 0o600 });
  await assert.rejects(() => initializeLocal(dir), /Refusing/);
  await assert.rejects(() => stat(path.join(dir, ".env.relay")), {
    code: "ENOENT",
  });
});
