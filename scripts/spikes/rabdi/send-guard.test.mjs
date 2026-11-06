import test from "node:test";
import assert from "node:assert/strict";
import { guardSend } from "./send-guard.mjs";
import { NETWORK, dataHash } from "./protocol.mjs";
const tx = {
  chainId: NETWORK.id,
  nonce: 7,
  gas: 1000000n,
  gasPrice: 1000000000n,
  to: "0x4400000000000000000000000000000000000044",
  data: "0x1234",
  value: 0n,
};
function setup(persist) {
  const events = [],
    entry = {
      nonce: tx.nonce,
      gas: String(tx.gas),
      gasPrice: String(tx.gasPrice),
      to: tx.to,
      dataHash: dataHash(tx),
    };
  const guard = guardSend({
    entry,
    account: {
      signTransaction: async () => {
        events.push("sign-stub");
        return "0xdeadbeef";
      },
    },
    persist: persist ?? (async () => events.push("durable")),
    rpc: {
      request: async () => {
        events.push("broadcast-stub");
        return "hash";
      },
    },
  });
  return { guard, events, entry };
}
test("durable admission precedes any broadcast; repeated sends and signatures are refused", async () => {
  const { guard, events } = setup();
  await assert.rejects(
    guard.request({ method: "eth_sendRawTransaction", params: ["0xdeadbeef"] }),
  );
  const signed = await guard.account.signTransaction(tx);
  await guard.request({ method: "eth_sendRawTransaction", params: [signed] });
  assert.deepEqual(events, ["sign-stub", "durable", "broadcast-stub"]);
  await assert.rejects(
    guard.request({ method: "eth_sendRawTransaction", params: [signed] }),
  );
  await assert.rejects(guard.account.signTransaction(tx));
});
test("a journal failure prevents broadcast and does not permit a fresh signature", async () => {
  const { guard, events } = setup(async () => {
    throw Error("disk full");
  });
  await assert.rejects(guard.account.signTransaction(tx));
  await assert.rejects(
    guard.request({ method: "eth_sendRawTransaction", params: ["0xdeadbeef"] }),
  );
  await assert.rejects(guard.account.signTransaction(tx));
  assert.deepEqual(events, ["sign-stub"]);
});
test("signing is bound to chain, nonce, gas, fee, target, value and exact prepared calldata", async () => {
  for (const change of [
    { chainId: 1 },
    { nonce: 8 },
    { gas: 1n },
    { gasPrice: 1n },
    { to: NETWORK.owner },
    { value: 1n },
    { data: "0x1235" },
  ]) {
    const { guard, events } = setup();
    await assert.rejects(guard.account.signTransaction({ ...tx, ...change }));
    assert.deepEqual(events, []);
  }
});
test("wallet RPC alternatives and a different signed byte string are blocked", async () => {
  const { guard, events } = setup();
  await guard.account.signTransaction(tx);
  for (const method of [
    "eth_sendTransaction",
    "eth_sign",
    "personal_sign",
    "eth_signTypedData_v4",
  ])
    await assert.rejects(guard.request({ method, params: [] }));
  await assert.rejects(
    guard.request({ method: "eth_sendRawTransaction", params: ["0xaaaa"] }),
  );
  assert.deepEqual(events, ["sign-stub", "durable"]);
});
