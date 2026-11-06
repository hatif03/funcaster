import test from "node:test";
import assert from "node:assert/strict";
import {
  captureBatch,
  createFixture,
  selectGas,
  admitCost,
  mode,
  swarmReference,
} from "./protocol.mjs";
import { defineSchema, str, bytes, u64 } from "@arkiv-network/sdk/schema";
import { ExpirationTime } from "@arkiv-network/sdk";

test("K0 is read-only by default and requires exact owner confirmation", () => {
  assert.equal(mode([]), "check");
  assert.equal(mode(["--check"]), "check");
  for (const args of [
    ["--apply"],
    ["--apply", "--confirm-network", "tiramisu"],
    ["--check", "--apply"],
  ])
    assert.throws(() => mode(args));
  assert.equal(mode(["--apply", "--confirm-network", "rabdi-k0"]), "apply");
});
test("SDK executes only read methods until unsigned calldata capture", async () => {
  const methods = [];
  const rpc = {
    request: async ({ method }) => {
      methods.push(method);
      if (method === "eth_chainId") return "0x76edaf";
      if (method === "eth_blockNumber") return "0x100";
      throw Error("Unexpected forwarding");
    },
  };
  const tx = await captureBatch(rpc, { creates: [createFixture("test", 0)] });
  assert.match(tx.data, /^0x[0-9a-f]+$/);
  assert.deepEqual(methods, ["eth_chainId", "eth_blockNumber"]);
});
test("wrong network is rejected before batch preparation", async () => {
  await assert.rejects(
    captureBatch(
      { request: async () => "0x1" },
      { creates: [createFixture("test", 0)] },
    ),
  );
});
test("gas caps account for batch size and reject oversized batches", () => {
  assert.equal(
    selectGas({ estimate: 100n, operations: 4, blockGasLimit: 30000000n }),
    2200000n,
  );
  assert.equal(
    selectGas({ estimate: 2000000n, operations: 1, blockGasLimit: 30000000n }),
    4000000n,
  );
  assert.throws(() =>
    selectGas({ estimate: 9000000n, operations: 1, blockGasLimit: 30000000n }),
  );
});
test("aggregate spend and recovery balance are checked before signing", () => {
  const input = {
    gas: 1000000n,
    gasPrice: 100n,
    spent: 0n,
    budget: 200000000n,
    balance: 1000000100000000n,
  };
  assert.equal(admitCost(input), 100000000n);
  assert.throws(() => admitCost({ ...input, spent: 100000001n }));
  assert.throws(() => admitCost({ ...input, balance: 100n }));
});
test("Swarm reference rejects encrypted references and malformed hex", () => {
  assert.equal(swarmReference("0x" + "12".repeat(32)).length, 32);
  for (const s of ["0x" + "12".repeat(64), "0x" + "zz".repeat(32), ""])
    assert.throws(() => swarmReference(s));
});
test("SDK 1.0.1 validates schema names, string bytes, named-column count, and bytes bounds", async () => {
  assert.throws(() => defineSchema("test", { $reserved: str() }));
  assert.throws(() => defineSchema("test", { ["a".repeat(33)]: str() }));
  assert.throws(() => str("é".repeat(65)));
  assert.throws(() =>
    defineSchema(
      "test",
      Object.fromEntries(
        Array.from({ length: 32 }, (_, i) => ["c" + i, str()]),
      ),
    ),
  );
  assert.throws(() => bytes(new Uint8Array(131073)));
  // These changed from the old specification: 31 named columns and 129,000 bytes are SDK-valid.
  assert.doesNotThrow(() =>
    defineSchema(
      "test",
      Object.fromEntries(
        Array.from({ length: 31 }, (_, i) => ["c" + i, str()]),
      ),
    ),
  );
  assert.doesNotThrow(() => bytes(new Uint8Array(129000)));
  assert.doesNotThrow(() => u64(1793912400000n));
  assert.throws(() => bytes().indexed());
});
test("combined bytes limit is checked before any RPC or signature", async () => {
  const schema = defineSchema("limit", { a: bytes(), b: bytes() });
  let requests = 0;
  const rpc = {
    request: async () => {
      requests++;
      return "0x76edaf";
    },
  };
  await assert.rejects(
    captureBatch(rpc, {
      creates: [
        {
          schema,
          values: { a: new Uint8Array(70000), b: new Uint8Array(70000) },
          expiration: ExpirationTime.fromHours(1),
          salt: 1n,
        },
      ],
    }),
  );
  assert.equal(requests, 1); // chain guard only; encoding fails before a block read.
});
