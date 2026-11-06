import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createArchive } from "../../server/local-records/archive.cjs";
import { createLocalRecords } from "../../server/local-records/index.cjs";
import { makeResult, hash } from "../../server/records.cjs";
import { games } from "../../core/catalog.js";
import express from "express";
const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "chonks-local-records-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
function record({ seed = 42, time = 2000, status } = {}) {
  const game = games.find((g) => g.id === "star-catch");
  const room = {
    code: "ABCDEF",
    roundId: 1,
    game: "star-catch",
    active: [0, 1],
    startedAt: 1000,
    match: { seed, mode: "multiplayer", duration: 60, cpuCount: 0 },
    replay: [],
  };
  const value = makeResult(
    room,
    game,
    [
      { slot: 0, score: 0 },
      { slot: 1, score: 0 },
    ],
    time,
  );
  if (status) {
    value.result.status = status;
    const { hash: _, ...body } = value.result;
    value.result.hash = hash(body);
  }
  return value;
}

test("canonical records survive restart, deduplicate, reject changed inputs and omit join codes from summaries", async (t) => {
  const dir = await fixture(t),
    archive = createArchive(dir),
    value = record();
  await archive.save(value);
  await archive.save(value);
  const reopened = createArchive(dir);
  assert.equal((await reopened.list()).length, 1);
  assert.deepEqual(
    await reopened.get(value.result.hash),
    JSON.parse(JSON.stringify(value)),
  );
  assert.equal(JSON.stringify(await reopened.list()).includes("ABCDEF"), false);
  const changed = structuredClone(value);
  changed.replay.seed++;
  await assert.rejects(archive.save(changed), /RECORD_HASH_MISMATCH/);
  assert.equal(await archive.get("../../env"), null);
});

test("leaderboard separates builds/rules and excludes abandoned or unverified rounds", async (t) => {
  const archive = createArchive(await fixture(t));
  await archive.save(record());
  await archive.save(record({ seed: 43, time: 3000 }));
  await archive.save(record({ seed: 44, time: 4000, status: "abandoned" }));
  const groups = await archive.leaderboard();
  assert.equal(groups.length, 1);
  assert.equal(groups[0].matches, 2);
  assert.equal(groups[0].wins.length, 4);
  assert.equal(groups[0].direction, "higher");
});

test("export and existing replay checker work with no relay process; corrupt exports fail", async (t) => {
  const dir = await fixture(t),
    archive = createArchive(dir),
    value = record();
  await archive.save(value);
  const out = path.join(dir, "offline");
  await exec(
    process.execPath,
    ["scripts/records-export.mjs", "--data-dir", dir, "--out", out],
    { cwd: root },
  );
  const file = path.join(out, "records", value.result.hash + ".json");
  const verified = await exec(
    process.execPath,
    ["scripts/records-verify.mjs", file],
    { cwd: root },
  );
  assert.match(verified.stdout, /Verified:/);
  assert.match(
    await readFile(path.join(out, "index.html"), "utf8"),
    /Offline snapshot/,
  );
  const tampered = JSON.parse(await readFile(file, "utf8"));
  tampered.result.scores[0].score++;
  await writeFile(file, JSON.stringify(tampered));
  await assert.rejects(
    exec(process.execPath, ["scripts/records-verify.mjs", file], { cwd: root }),
  );
});

test("bounded background hooks persist rounds and mock receipts without network or fake verification", async (t) => {
  const service = createLocalRecords({
    dataDir: await fixture(t),
    maxPending: 1,
  });
  assert.equal(service.finish(null, record()), true);
  assert.equal(service.finish(null, record({ seed: 5 })), false);
  await service.flush();
  assert.equal(
    service.recordReceipt({
      id: "mock-drip",
      type: "arc.drip",
      status: "done",
      mock: true,
      tx: "0x" + "a".repeat(64),
      at: 100,
      data: {
        address: "0x" + "1".repeat(40),
        signature: "private",
        ip: "private",
      },
    }),
    true,
  );
  await service.close();
  assert.equal((await service.list()).length, 1);
  const ledger = await service.ledger();
  assert.equal(ledger.rows[0].mock, true);
  assert.equal(ledger.rows[0].tx, null);
  assert.equal(ledger.rows[0].verification, null);
  assert.equal(JSON.stringify(ledger).includes("private"), false);
  assert.equal(service.status().dropped, 1);
});

test("public replay downloads withhold live join codes until the table closes", async (t) => {
  let active = true;
  const service = createLocalRecords({
    dataDir: await fixture(t),
    isRoomActive: (code) => code === "ABCDEF" && active,
  });
  const first = record(),
    arcade = record({ seed: 9 });
  arcade.result.matchId = "abc123.ABCDEF.1";
  const { hash: _, ...body } = arcade.result;
  arcade.result.hash = hash(body);
  service.finish(null, first);
  service.finish(null, arcade);
  await service.flush();
  const app = express();
  app.use("/api/records", service.router);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await service.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api/records`;
  for (const value of [first, arcade]) {
    const hidden = await fetch(`${base}/${value.result.hash}`);
    assert.equal(hidden.status, 409);
    assert.match((await hidden.json()).error, /after table closes/);
    assert.deepEqual(
      await service.get(value.result.hash),
      JSON.parse(JSON.stringify(value)),
      "owner CLI/read port still keeps original canonical record",
    );
  }
  assert.equal(
    JSON.stringify(await (await fetch(base)).json()).includes("ABCDEF"),
    false,
  );
  active = false;
  const response = await fetch(`${base}/${first.result.hash}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.hash, first.result.hash);
});
