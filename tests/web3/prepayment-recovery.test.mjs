import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertPrepaymentRecovery,
  confirmPrepaymentOperations,
} from "../../scripts/prepayment-table-recovery.mjs";
import {
  acceptanceOptions,
  reserveExpiredRecovery,
  markReplacementCreating,
  saveReplacementHost,
} from "../../scripts/web3-hosted-basic.mjs";

const fixture = () => {
  const accounts = [1, 2, 3, 4].map((n) => "0x" + String(n).repeat(40));
  return {
    version: 1,
    base: "https://funcaster.onrender.com",
    mock: false,
    checks: [
      "Two phone controllers joined; party and both seat ENS names are ready",
      "Both phones received confirmed Arc test-USDC starting play money",
    ],
    started: false,
    buildId: "build-one",
    host: {
      code: "CATS42",
      token: "host-fixture",
      displayToken: "display-fixture",
    },
    addresses: accounts.slice(2),
    expiredTableRecovery: true,
    hookStarted: true,
    marketAcceptance: {
      version: 1,
      addresses: Object.fromEntries(
        ["spectator-1", "spectator-2", "phone-1", "phone-2"].map((key, i) => [
          key,
          accounts[i],
        ]),
      ),
      initialBalances: accounts.map(() => "1100000"),
      commerce: {
        prefix: "accept-" + "a".repeat(20),
        register: { attempted: true },
      },
    },
  };
};
test("prepayment recovery accepts only retained registration-only state and four funded identities", () => {
  assert.equal(assertPrepaymentRecovery(fixture()).accounts.length, 4);
  for (const mutate of [
    (j) => {
      j.started = true;
    },
    (j) => {
      j.resultHash = "hash";
    },
    (j) => {
      j.completed = false;
    },
    (j) => {
      j.prepaymentTableRecovery = true;
    },
    ...[
      "marketId",
      "listingAttempted",
      "betOne",
      "betTwo",
      "cheer",
      "claim-phone-1",
    ].map((key) => (j) => {
      j.marketAcceptance[key] = false;
    }),
    ...["pay", "preparedPayment", "claim"].map((key) => (j) => {
      j.marketAcceptance.commerce[key] = { attempted: false };
    }),
    (j) => {
      delete j.marketAcceptance.addresses["spectator-2"];
    },
    (j) => {
      j.marketAcceptance.addresses["phone-1"] = "0x" + "9".repeat(40);
    },
    (j) => {
      j.marketAcceptance.initialBalances[0] = "1100001";
    },
  ]) {
    const j = fixture();
    mutate(j);
    assert.throws(() => assertPrepaymentRecovery(j));
  }
  assert.equal(
    acceptanceOptions([
      "--apply",
      "--confirm-funcaster-testnet",
      "--url",
      "https://funcaster.onrender.com",
      "--recover-prepayment-table",
    ]).recoverPrepaymentTable,
    true,
  );
  assert.throws(() =>
    acceptanceOptions([
      "--mock",
      "--url",
      "http://127.0.0.1",
      "--recover-prepayment-table",
    ]),
  );
});

test("server evidence requires absent pay/claim and the confirmed original creator version", async () => {
  const j = fixture(),
    c = j.marketAcceptance.commerce;
  const version = {
    id: "b".repeat(64),
    status: "published",
    gameId: "star-catch",
    version: "1.0.0",
    price: "500000",
    creator: j.addresses[0],
  };
  const registration = {
    operationId: c.prefix + "-register",
    action: "register",
    status: "confirmed",
    tx: "0x" + "c".repeat(64),
    versionId: version.id,
  };
  const requests = [];
  const read = async (route, options) => {
    requests.push({ route, options });
    if (route.endsWith("-pay") || route.endsWith("-claim")) return null;
    return route.endsWith("-register") ? registration : { versions: [version] };
  };
  assert.equal(await confirmPrepaymentOperations(j, read), registration);
  assert.equal(
    requests.filter((r) => r.options?.allowMissing === true).length,
    2,
  );
  await assert.rejects(
    confirmPrepaymentOperations(j, async () => ({ status: "prepared" })),
    /payment or claim/,
  );
  await assert.rejects(
    confirmPrepaymentOperations(j, async () => {
      throw Error("HTTP 503");
    }),
    /HTTP 503/,
  );
  registration.status = "failed";
  await assert.rejects(
    confirmPrepaymentOperations(j, read),
    /confirm the original registration/,
  );
  registration.status = "confirmed";
  version.creator = "0x" + "9".repeat(40);
  await assert.rejects(
    confirmPrepaymentOperations(j, read),
    /original creator version differs/,
  );
});

test("prepayment replacement preserves the old marker, registration and balances with one new admission", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "funcaster-prepayment-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const j = fixture(),
    original = JSON.stringify(j);
  const oldMarker = JSON.stringify({
    base: j.base,
    phase: "replacement-saved",
    host: j.host,
  });
  await writeFile(path.join(dir, "session.json"), original);
  await writeFile(path.join(dir, "expired-table-recovery.json"), oldMarker);
  const marker = await reserveExpiredRecovery(dir, j, j.addresses, true);
  assert.match(marker.priorMarkerHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    await reserveExpiredRecovery(dir, j, j.addresses, true),
    marker,
  );
  assert.equal(
    await readFile(path.join(dir, "session.prepayment.original.json"), "utf8"),
    original,
  );
  assert.equal(
    await readFile(path.join(dir, "session.json"), "utf8"),
    original,
  );
  await markReplacementCreating(dir, true);
  await assert.rejects(markReplacementCreating(dir, true), /already attempted/);
  await saveReplacementHost(dir, { ...j.host, code: "CHNK42" }, true);
  await assert.rejects(
    reserveExpiredRecovery(dir, j, j.addresses, true),
    /already consumed/,
  );
  assert.equal(
    await readFile(path.join(dir, "expired-table-recovery.json"), "utf8"),
    oldMarker,
  );
  assert.equal(
    await readFile(path.join(dir, "session.json"), "utf8"),
    original,
  );
});
