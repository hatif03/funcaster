import test from "node:test";
import assert from "node:assert/strict";
import { stringToHex } from "viem";
import {
  finalMode,
  budgetCost,
  FINAL_BUDGET,
  SECOND_TOPUP,
  COST_CASES,
  costFixture,
  scoreFixture,
} from "./final-protocol.mjs";
import { NETWORK, captureBatch, dataHash } from "./protocol.mjs";
import { classifyScore, createBoardCache, walkScores } from "./hall-reader.mjs";
import { guardSend } from "./send-guard.mjs";
import { guardReadRpc } from "./ens-read-transport.mjs";
import { finalOwnerMode } from "../g0-final-owner.mjs";
test("combined owner command is read-only by default and requires exact testnet confirmation", () => {
  assert.equal(finalOwnerMode([]), "check");
  assert.equal(finalOwnerMode(["--check"]), "check");
  assert.equal(finalOwnerMode(["--apply", "--confirm-testnets"]), "apply");
  for (const args of [
    ["--apply"],
    ["--apply", "--confirm-mainnet"],
    ["--check", "--apply"],
  ])
    assert.throws(() => finalOwnerMode(args));
});
test("ENS read failover refuses every signing or broadcast route before forwarding", async () => {
  let calls = 0;
  const rpc = guardReadRpc({
    request: async () => {
      calls++;
      return "0x1";
    },
  });
  for (const method of [
    "eth_sendRawTransaction",
    "eth_sendTransaction",
    "eth_sign",
    "personal_sign",
    "anvil_setBalance",
  ])
    assert.throws(() => rpc.request({ method, params: [] }));
  assert.equal(calls, 0);
  assert.equal(await rpc.request({ method: "eth_chainId" }), "0x1");
  assert.equal(calls, 1);
});
test("final runner requires its own exact owner confirmation", () => {
  assert.equal(finalMode([]), "check");
  assert.equal(finalMode(["--check"]), "check");
  assert.equal(
    finalMode(["--apply", "--confirm-network", "rabdi-g0-final"]),
    "apply",
  );
  for (const args of [
    ["--apply"],
    ["--apply", "--confirm-network", "rabdi-k0"],
    ["--check", "--apply"],
  ])
    assert.throws(() => finalMode(args));
});
test("aggregate budget includes both gas and the second-writer top-up", () => {
  const p = {
    spent: 0n,
    gas: 1000000n,
    gasPrice: 1000000000n,
    value: SECOND_TOPUP,
    balance: 10000000000000000000n,
  };
  assert.equal(budgetCost(p), 21000000000000000n);
  assert.throws(() => budgetCost({ ...p, spent: FINAL_BUDGET - SECOND_TOPUP }));
  assert.throws(() => budgetCost({ ...p, balance: SECOND_TOPUP }));
});
test("ten real cost shapes and 20-row batch encode without a signing method", async () => {
  const methods = [];
  const rpc = {
    request: async ({ method }) => {
      methods.push(method);
      if (method === "eth_chainId") return "0x76edaf";
      if (method === "eth_blockNumber") return "0x100";
      throw Error("Forbidden");
    },
  };
  assert.equal(COST_CASES.length, 10);
  for (const c of COST_CASES)
    await captureBatch(rpc, { creates: [costFixture("test", c)] });
  await captureBatch(rpc, {
    creates: Array.from({ length: 20 }, (_, i) => scoreFixture("test", i)),
  });
  assert(methods.every((m) => ["eth_chainId", "eth_blockNumber"].includes(m)));
});
test("native top-up signature is bound to the exact value and journalled before send", async () => {
  const tx = {
    chainId: NETWORK.id,
    nonce: 0,
    gas: 1000000n,
    gasPrice: 1000n,
    to: NETWORK.recipient,
    data: "0x",
    value: SECOND_TOPUP,
  };
  const entry = {
    ...tx,
    gas: String(tx.gas),
    gasPrice: String(tx.gasPrice),
    value: String(tx.value),
    dataHash: dataHash(tx),
  };
  const order = [];
  const guard = guardSend({
    entry,
    account: {
      signTransaction: async () => {
        order.push("sign");
        return "0xdeadbeef";
      },
    },
    persist: async () => order.push("persist"),
    rpc: { request: async () => order.push("send") },
  });
  await assert.rejects(
    guard.account.signTransaction({ ...tx, value: SECOND_TOPUP + 1n }),
  );
  const raw = await guard.account.signTransaction(tx);
  await guard.request({ method: "eth_sendRawTransaction", params: [raw] });
  assert.deepEqual(order, ["sign", "persist", "send"]);
});
function row(changes = {}) {
  return {
    $key: "0x" + "01".repeat(32),
    $creator: NETWORK.owner,
    $creationFlags: { readonly: true },
    project: { value: "chonks_g0" },
    game: { value: "synthetic" },
    ordinal: { value: 1 },
    score: { value: 1 },
    winner: { value: NETWORK.owner },
    payload: {
      value: stringToHex(
        JSON.stringify({
          synthetic: true,
          ordinal: 1,
          score: 1,
          winner: NETWORK.owner,
        }),
      ),
    },
    ...changes,
  };
}
test("Hall trusts creator plus immutable validated payload, never a copied namespace or high score", () => {
  assert.equal(classifyScore(row(), [NETWORK.owner]), "trusted");
  assert.equal(
    classifyScore(
      row({ $creator: NETWORK.recipient, score: { value: 2147483647 } }),
      [NETWORK.owner],
    ),
    "unverified",
  );
  for (const patch of [
    { score: { value: 2 } },
    { winner: { value: NETWORK.recipient } },
    { $creationFlags: { readonly: false } },
    { payload: { value: "0xff" } },
    { payload: { value: stringToHex("{}") } },
  ])
    assert.equal(classifyScore(row(patch), [NETWORK.owner]), "invalid");
});
test("cache immediately returns stale data and deduplicates refresh; failures retain labelled data", async () => {
  let now = 0,
    calls = 0,
    resolve;
  const cache = createBoardCache({ now: () => now, ttl: 10 });
  const load = async () => {
    calls++;
    return [1];
  };
  assert.deepEqual(await cache("a", load), { rows: [1], stale: false });
  now = 11;
  const refresh = () =>
    new Promise((r) => {
      calls++;
      resolve = r;
    });
  assert.deepEqual(await cache("a", refresh), { rows: [1], stale: true });
  await cache("a", refresh);
  assert.equal(calls, 2);
  resolve([2]);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(await cache("a", load), { rows: [2], stale: false });
  now = 22;
  let observed;
  await cache(
    "a",
    async () => {
      throw Error("offline");
    },
    (r) => (observed = r),
  );
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(observed, { rows: [2], stale: true });
});
function fakeClient(pages) {
  let i = 0;
  const q = {
    select() {
      return this;
    },
    from() {
      return this;
    },
    where() {
      return this;
    },
    createdBy() {
      return this;
    },
    orderBy() {
      return this;
    },
    limit() {
      return this;
    },
    async fetch() {
      return pages[i++];
    },
  };
  return q;
}
test("bounded keyset walk rejects malformed, backwards and overlapping pages", async () => {
  const full = Array.from({ length: 100 }, (_, i) => ({
    $key: "0x" + i.toString(16).padStart(64, "0"),
  }));
  const first = { entities: full, blockNumber: 10n, skipped: 0 };
  assert.equal(
    (
      await walkScores(
        fakeClient([first, { entities: [], blockNumber: 11n, skipped: 0 }]),
        "test",
      )
    ).length,
    100,
  );
  for (const next of [
    { entities: [], blockNumber: 9n, skipped: 0 },
    { entities: [], blockNumber: 11n, skipped: 1 },
    { entities: [full[99]], blockNumber: 11n, skipped: 0 },
  ])
    await assert.rejects(walkScores(fakeClient([first, next]), "test"));
  await assert.rejects(
    walkScores(fakeClient([first]), "test", { maxPages: 1 }),
  );
});
