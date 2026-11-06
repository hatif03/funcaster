// The cross-SDK fixture has a one-hour lease. Its transaction proof survives it.
import assert from "node:assert/strict";
import { decodeEventLog, keccak256 } from "viem";
import { ENTITY_EVENTS_ABI } from "@arkiv-network/sdk";
import { NETWORK, captureBatch, createFixture, same } from "./protocol.mjs";
export async function verifyCrossCreation({ tx, receipt, block, run, key }) {
  assert.equal(receipt.status, "success");
  assert.equal(receipt.blockHash, block.hash);
  assert.equal(tx.chainId, NETWORK.id);
  assert(same(tx.from, NETWORK.owner));
  assert.equal(tx.value, 0n);
  const expected = await captureBatch(
    {
      request: async ({ method }) => {
        if (method === "eth_chainId") return "0x" + NETWORK.id.toString(16);
        if (method === "eth_blockNumber")
          return "0x" + receipt.blockNumber.toString(16);
        throw Error("Unexpected offline capture method");
      },
    },
    { creates: [createFixture(run, 905)] },
  );
  assert(same(tx.to, expected.to));
  assert.equal(
    tx.input,
    expected.data,
    "Cross-write does not encode the resolved address and expected fixture",
  );
  const creates = receipt.logs
    .filter((l) => same(l.address, tx.to))
    .map((l) =>
      decodeEventLog({
        abi: ENTITY_EVENTS_ABI,
        data: l.data,
        topics: l.topics,
      }),
    )
    .filter((e) => e.eventName === "EntityCreated");
  assert.equal(creates.length, 1);
  assert.equal(creates[0].args.entityKey, key);
  assert(same(creates[0].args.owner, NETWORK.owner));
  assert(creates[0].args.expiresAt > receipt.blockNumber);
  return {
    key,
    createdAt: receipt.blockNumber,
    expiresAt: creates[0].args.expiresAt,
    who: NETWORK.owner,
    calldataHash: keccak256(tx.input),
  };
}
export function verifyCrossAvailability({ row, head, proof }) {
  if (!row) {
    assert(
      head >= proof.expiresAt,
      "Fixture missing before its recorded expiry",
    );
    return "EXPIRED: canonical creation/calldata verified; no current live-row claim";
  }
  assert.equal(row.$key, proof.key);
  assert(same(row.who.value, proof.who));
  assert(same(row.$creator, NETWORK.owner));
  assert.equal(row.$createdAt, proof.createdAt);
  assert.equal(row.$expiresAt, proof.expiresAt);
  return "LIVE: current typed row verified";
}
