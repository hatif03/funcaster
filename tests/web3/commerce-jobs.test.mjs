import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { registration } from "../../integrations/commerce/math.mjs";
import { validateCommerceJob } from "../../integrations/commerce/jobs.mjs";
import { createCommerceJobProvider } from "../../integrations/commerce/provider.mjs";

const creator = "0x" + "11".repeat(20),
  collaborator = "0x" + "22".repeat(20),
  platform = "0x" + "33".repeat(20);
function registrationJob() {
  return {
    type: "commerce.register",
    room: "creator-fixture",
    idempotencyKey: "commerce:register:jsonb-fixture",
    payload: {
      operationId: "jsonb-fixture",
      actor: creator,
      version: {
        id: "a".repeat(64),
        ...registration(
          {
            creator,
            price: "500000",
            collaborators: [
              { address: creator, bps: 7000 },
              { address: collaborator, bps: 3000 },
            ],
          },
          { platformAddress: platform },
        ),
      },
    },
  };
}
// Model JSONB's key ordering throughout the document, keeping arrays unchanged.
function jsonbOrder(value) {
  if (Array.isArray(value)) return value.map(jsonbOrder);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.length - b.length || a.localeCompare(b))
      .map(([key, item]) => [key, jsonbOrder(item)]),
  );
}

test("JSONB-reordered recipient objects preserve valid registration through provider admission", async (t) => {
  const original = registrationJob(),
    stored = jsonbOrder(original),
    snapshot = JSON.stringify(stored);
  assert.notEqual(JSON.stringify(original), snapshot);
  assert.deepEqual(Object.keys(stored.payload.version.recipients[0]), [
    "bps",
    "address",
  ]);
  assert.equal(validateCommerceJob(original), original.payload);
  assert.equal(validateCommerceJob(stored), stored.payload);
  assert.deepEqual(
    stored.payload.version.recipients,
    original.payload.version.recipients,
  );
  const dir = await mkdtemp(path.join(tmpdir(), "commerce-jsonb-"));
  t.after(() => rm(dir, { force: true, recursive: true }));
  let calls = 0;
  const tx = "0x" + "44".repeat(32),
    provider = createCommerceJobProvider({
      dir,
      chain: {
        execute: async (job) => {
          calls++;
          assert.deepEqual(job, original);
          return { tx, data: {} };
        },
      },
    });
  const receipt = await provider.execute(stored);
  assert.equal(calls, 1);
  assert.equal(receipt.tx, tx);
  assert.equal(receipt.data.versionId, original.payload.version.id);
  assert.equal(
    JSON.stringify(stored),
    snapshot,
    "validation must not rewrite the job",
  );
});

test("structural registration checks still reject changed types, extra recipient fields and invalid economic terms", () => {
  for (const mutate of [
    (v) => {
      v.recipients[0].bps = "7000";
    },
    (v) => {
      v.recipients[0].unexpected = true;
    },
    (v) => {
      v.recipients[0].bps = 7001;
    },
    (v) => {
      v.recipients[1].address = creator;
    },
    (v) => {
      v.price = 500000;
    },
    (v) => {
      v.capBps = 1501;
    },
    (v) => {
      v.decimals = "6";
    },
  ]) {
    const job = jsonbOrder(registrationJob());
    mutate(job.payload.version);
    assert.throws(() => validateCommerceJob(job));
  }
});
