import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createDripBudget } from "../../integrations/arc/drip-budget.mjs";
const h = (n) => n.toString(16).padStart(64, "0");
const input = (n = 1) => ({
  asset: "usdc",
  room: h(1),
  device: h(n),
  ip: h(1),
  address: `0x${n.toString(16).padStart(40, "0")}`,
  balance: 0n,
  chainTime: 10000,
});
const limit = {
  perDevice: 1000000n,
  perIpHour: 2000000n,
  perRoom: 3000000n,
  total: 4000000n,
  bankroll: 1000000n,
  floor: 50000n,
};
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "chonks-arc-drip-"));
  let policy;
  const start = async () =>
    (policy = await createDripBudget({
      dir,
      limits: { usdc: limit, eurc: limit },
    }));
  t.after(async () => {
    await policy?.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  return { policy: await start(), start, dir };
}
test("drips reserve before sending, survive restart, and never double-spend a device's allowance", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.policy.reserve("join1", input())).amount, 1000000n);
  await f.policy.close();
  const p = await f.start();
  assert.equal(
    (await p.reserve("join1", { ...input(), balance: 1000000n })).amount,
    1000000n,
  );
  await assert.rejects(
    p.reserve("join2", { ...input(), room: h(2) }),
    /budget/,
  );
  await assert.rejects(p.reserve("join1", input(2)), /conflict/);
  assert.equal(
    (await fs.stat(path.join(f.dir, "arc-drip-budget/journal.json"))).mode &
      0o777,
    0o600,
  );
});
test("parallel identities cannot race the per-IP or per-room cap, and hourly expiry does not erase lifetime caps", async (t) => {
  const f = await fixture(t);
  const answers = await Promise.allSettled(
    [1, 2, 3].map((n) => f.policy.reserve(`j${n}`, input(n))),
  );
  assert.equal(answers.filter((r) => r.status === "fulfilled").length, 2);
  await f.policy.reserve("j3", { ...input(3), chainTime: 13601 });
  await assert.rejects(
    f.policy.reserve("j4", { ...input(4), ip: h(2), chainTime: 13602 }),
    /budget/,
  );
  await f.policy.reserve("j4", {
    ...input(4),
    room: h(2),
    ip: h(2),
    chainTime: 13602,
  });
  await assert.rejects(
    f.policy.reserve("j5", {
      ...input(5),
      room: h(3),
      ip: h(3),
      chainTime: 13603,
    }),
    /budget/,
  );
});
test("balance top-ups and each asset use exact six-decimal units; full balances consume no allowance", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(
    await f.policy.reserve("full", { ...input(), balance: 2000000n }),
    { amount: 0n, reserved: false },
  );
  assert.equal(
    (await f.policy.reserve("partial", { ...input(), balance: 700000n }))
      .amount,
    300000n,
  );
  assert.equal(
    (await f.policy.reserve("eurc", { ...input(), asset: "eurc" })).amount,
    1000000n,
  );
  await assert.rejects(
    f.policy.reserve("raw-ip", { ...input(2), ip: "127.0.0.1" }),
    /Invalid/,
  );
  await assert.rejects(
    f.policy.reserve("past", { ...input(2), chainTime: 9999 }),
    /backwards/,
  );
});
test("lowering limits or tampering with saved admissions cannot reset a spent budget", async (t) => {
  const f = await fixture(t);
  await f.policy.reserve("spent", input());
  await f.policy.close();
  await assert.rejects(
    createDripBudget({
      dir: f.dir,
      limits: { usdc: { ...limit, total: 999999n }, eurc: limit },
    }),
    /exceed/,
  );
  const file = path.join(f.dir, "arc-drip-budget/journal.json"),
    value = JSON.parse(await fs.readFile(file, "utf8"));
  value.entries.push(value.entries[0]);
  await fs.writeFile(file, JSON.stringify(value));
  await assert.rejects(f.start(), /Invalid|exceed/);
});
