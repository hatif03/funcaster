import assert from "node:assert/strict";

const phoneChecks = [
  "Two phone controllers joined; party and both seat ENS names are ready",
  "Both phones received confirmed Arc test-USDC starting play money",
];
const only = (object, keys) =>
  object &&
  typeof object === "object" &&
  !Array.isArray(object) &&
  Object.keys(object).every((key) => keys.includes(key));
const address = (value) => /^0x[\da-f]{40}$/i.test(value || "");
export function assertPrepaymentRecovery(journal) {
  assert.ok(
    only(journal, [
      "version",
      "base",
      "mock",
      "checks",
      "started",
      "buildId",
      "host",
      "addresses",
      "expiredTableRecovery",
      "hookStarted",
      "marketAcceptance",
    ]),
    "Unknown acceptance state; prepayment recovery refused",
  );
  assert.equal(journal.mock, false);
  assert.equal(journal.started, false);
  assert.equal(
    journal.expiredTableRecovery,
    true,
    "The original recovery evidence must be retained",
  );
  assert.equal(journal.hookStarted, true);
  assert.ok(
    journal.host?.code && journal.host.token && journal.host.displayToken,
  );
  assert.deepEqual(journal.checks, phoneChecks);
  const m = journal.marketAcceptance;
  assert.ok(
    only(m, ["version", "addresses", "initialBalances", "commerce"]),
    "Market intent already exists; no replacement table",
  );
  assert.equal(m.version, 1);
  const roles = ["spectator-1", "spectator-2", "phone-1", "phone-2"];
  assert.deepEqual(Object.keys(m.addresses).sort(), [...roles].sort());
  const accounts = roles.map((role) => m.addresses[role]);
  assert.ok(accounts.every(address));
  assert.equal(new Set(accounts.map((a) => a.toLowerCase())).size, 4);
  assert.deepEqual(
    journal.addresses.map((a) => a.toLowerCase()),
    accounts.slice(2).map((a) => a.toLowerCase()),
  );
  assert.ok(
    Array.isArray(m.initialBalances) &&
      m.initialBalances.length === 4 &&
      m.initialBalances.every(
        (b) => /^\d+$/.test(b) && BigInt(b) >= 150000n && BigInt(b) <= 1100000n,
      ),
  );
  const c = m.commerce;
  assert.ok(
    only(c, ["prefix", "register", "versionId"]),
    "Room-bound commerce intent exists; no replacement table",
  );
  assert.match(c.prefix, /^accept-[a-f0-9]{20}$/);
  assert.ok(only(c.register, ["attempted", "done", "result"]));
  assert.equal(c.register.attempted, true);
  if (Object.hasOwn(c.register, "done")) assert.equal(c.register.done, true);
  if (c.versionId) assert.match(c.versionId, /^[a-f0-9]{64}$/);
  return { roles, accounts, prefix: c.prefix };
}

export async function confirmPrepaymentOperations(journal, read) {
  const { prefix } = assertPrepaymentRecovery(journal);
  for (const action of ["pay", "claim"])
    assert.equal(
      await read(`/api/commerce/operations/${prefix}-${action}`, {
        allowMissing: true,
      }),
      null,
      "A payment or claim already exists; no replacement table",
    );
  const registration = await read(
    `/api/commerce/operations/${prefix}-register`,
  );
  assert.equal(registration.operationId, `${prefix}-register`);
  assert.equal(registration.action, "register");
  assert.equal(
    registration.status,
    "confirmed",
    "Recover and confirm the original registration before creating another table",
  );
  assert.match(registration.tx, /^0x[\da-f]{64}$/i);
  const catalog = await read("/api/commerce/catalog");
  const version = catalog.versions.find((v) => v.id === registration.versionId);
  assert.ok(
    version &&
      version.status === "published" &&
      version.gameId === "star-catch" &&
      version.version === "1.0.0" &&
      version.price === "500000" &&
      version.creator.toLowerCase() ===
        journal.marketAcceptance.addresses["phone-1"].toLowerCase(),
    "The original creator version differs",
  );
  return registration;
}
