import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { zeroAddress } from "viem";
import { bootstrapParent } from "../../integrations/ens/bootstrap-parent.mjs";
import { createEnsTransactions } from "../../integrations/ens/transactions.mjs";
import { labelId } from "../../integrations/ens/names.mjs";
import { chainFixture, address } from "./fixtures/ens-chain.mjs";
async function fixture() {
  const f = chainFixture(),
    parent = "funcaster.eth",
    eth = f.protocol.contracts.ethRegistry;
  const timestamp = (await f.client.getBlock()).timestamp;
  f.occupy(eth, "funcaster", {
    latestOwner: f.owner,
    tokenId: 1n,
    expiry: timestamp + 63072000n,
    subregistry: zeroAddress,
  });
  const transact = async (id, call) => {
    if (call.functionName === "setSubregistry") {
      f.calls.push(call);
      f.rows.get(`${eth}:${labelId("funcaster")}`).subregistry = call.args[1];
      return { tx: "0x" + "a".repeat(64) };
    }
    return f.transact(id, call);
  };
  const hierarchy = {
    async walk(name) {
      assert.equal(name, "play.funcaster.eth");
      const root = f.rows.get(`${eth}:${labelId("funcaster")}`).subregistry;
      assert(root && root !== zeroAddress);
      const play = f.rows.get(`${root}:${labelId("play")}`);
      assert.equal(play.latestOwner, f.owner);
      assert(play.resolver !== zeroAddress);
      return { blockNumber: 1n, blockHash: "0x" + "b".repeat(64) };
    },
  };
  return { ...f, parent, transact, hierarchy };
}
test("new parent bootstrap plans without writing, then creates distinct canonical play proxies and resumes idempotently", async () => {
  const f = await fixture();
  const plan = await bootstrapParent({ ...f, transact: undefined });
  assert.equal(plan.operations.length, 7);
  assert.equal(f.calls.length, 0);
  const result = await bootstrapParent(f);
  assert.equal(result.status, "ready");
  assert.equal(result.parent, "funcaster.eth");
  assert.equal(f.calls.length, 7);
  assert.notEqual(result.parentRegistry, result.playRegistry);
  assert.equal((await bootstrapParent(f)).operations.length, 0);
  assert.equal(f.calls.length, 7);
});
test("bootstrap refuses existing unrelated registry links", async () => {
  const f = await fixture();
  f.rows.get(
    `${f.protocol.contracts.ethRegistry}:${labelId("funcaster")}`,
  ).subregistry = address(77);
  await assert.rejects(bootstrapParent(f), {
    code: "EXISTING_NAMESPACE_CONFLICT",
  });
  assert.equal(f.calls.length, 0);
});
test("bootstrap uses the real ENS transaction port's admitted rate-limited identity", async () => {
  const f = await fixture(),
    dir = await mkdtemp(path.join(os.tmpdir(), "chonks-bootstrap-admit-"));
  const client = {
    ...f.client,
    getTransactionCount: async () => 0,
    simulateContract: async () => {},
    estimateGas: async () => 100n,
    getBalance: async () => 100000n,
    getBlock: async () => ({ timestamp: 1000n, baseFeePerGas: 2n }),
  };
  const port = await createEnsTransactions({
    dir,
    client,
    wallet: {
      account: { address: f.owner },
      signTransaction: async () => {
        throw Object.assign(Error("Unsigned boundary"), {
          code: "UNSIGNED_PREFLIGHT_COMPLETE",
        });
      },
    },
    chainId: 11155111,
    owner: f.owner,
    budgetWei: 10000n,
    maxTransactions: 24,
    priorityFeeWei: 1n,
    maxFeePerGasWei: 100n,
    maxPerRoom: 24,
    maxPerHour: 24,
  });
  try {
    await assert.rejects(
      bootstrapParent({ ...f, client, transact: port.transact }),
      { code: "UNSIGNED_PREFLIGHT_COMPLETE" },
    );
  } finally {
    await port.close();
    await rm(dir, { recursive: true, force: true });
  }
});
