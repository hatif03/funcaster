import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeEventTopics,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
import { ENTITY_EVENTS_ABI } from "@arkiv-network/sdk";
import { NETWORK, captureBatch, createFixture } from "./protocol.mjs";
import {
  verifyCrossCreation,
  verifyCrossAvailability,
} from "./cross-proof.mjs";
async function fixture() {
  const run = "test",
    key = "0x" + "11".repeat(32);
  const tx = await captureBatch(
    {
      request: async ({ method }) =>
        method === "eth_chainId" ? "0x76edaf" : "0x64",
    },
    { creates: [createFixture(run, 905)] },
  );
  const receipt = {
    status: "success",
    blockNumber: 100n,
    blockHash: "0xabc",
    logs: [
      {
        address: tx.to,
        topics: encodeEventTopics({
          abi: ENTITY_EVENTS_ABI,
          eventName: "EntityCreated",
          args: { entityKey: key, owner: NETWORK.owner },
        }),
        data: encodeAbiParameters(parseAbiParameters("uint64,uint8"), [
          1900n,
          0,
        ]),
      },
    ],
  };
  return {
    run,
    key,
    tx: { ...tx, input: tx.data, chainId: NETWORK.id, value: 0n },
    receipt,
    block: { hash: "0xabc" },
  };
}
test("cross-write proof reconstructs exact fixture calldata and retains expiry after pruning", async () => {
  const f = await fixture();
  const proof = await verifyCrossCreation(f);
  assert.equal(proof.who, NETWORK.owner);
  assert.equal(proof.expiresAt, 1900n);
  assert.match(verifyCrossAvailability({ proof, head: 1900n }), /^EXPIRED/);
  assert.throws(() => verifyCrossAvailability({ proof, head: 1899n }));
});
test("expired-fixture path never excuses wrong sender, chain, calldata, event key or canonical block", async () => {
  for (const mutate of [
    (f) => (f.tx.from = NETWORK.recipient),
    (f) => f.tx.chainId++,
    (f) => (f.tx.input = "0x00"),
    (f) => (f.key = "0x" + "22".repeat(32)),
    (f) => (f.block.hash = "0xdef"),
    (f) => (f.receipt.status = "reverted"),
  ]) {
    const f = await fixture();
    mutate(f);
    await assert.rejects(verifyCrossCreation(f));
  }
});
test("live readback requires matching creator, resolved address and creation/expiry metadata", async () => {
  const proof = await verifyCrossCreation(await fixture());
  const row = {
    $key: proof.key,
    $createdAt: 100n,
    $expiresAt: 1900n,
    $creator: NETWORK.owner,
    who: { value: NETWORK.owner },
  };
  assert.match(verifyCrossAvailability({ proof, row, head: 101n }), /^LIVE/);
  assert.throws(() =>
    verifyCrossAvailability({
      proof,
      row: { ...row, who: { value: NETWORK.recipient } },
      head: 101n,
    }),
  );
  assert.throws(() =>
    verifyCrossAvailability({
      proof,
      row: { ...row, $creator: NETWORK.recipient },
      head: 101n,
    }),
  );
});
