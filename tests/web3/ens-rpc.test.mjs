import test from "node:test";
import assert from "node:assert/strict";
import {
  ensRpcTransport,
  retryEnsReplicaReads,
} from "../../integrations/ens/rpc.mjs";
test("ENS transient reads retry but a signed broadcast never retries", async () => {
  const seen = [];
  const transport = ensRpcTransport("https://rpc.invalid", {
    wait: async () => {},
    fetchFn: async (_url, init) => {
      const body = JSON.parse(init.body);
      seen.push(body.method);
      if (body.method === "eth_sendRawTransaction" || seen.length === 1)
        return new Response("temporarily unavailable", { status: 429 });
      return Response.json({ jsonrpc: "2.0", id: body.id, result: "0xaa36a7" });
    },
  })({ retryCount: 0 });
  assert.equal(
    await transport.request({ method: "eth_chainId", params: [] }),
    "0xaa36a7",
  );
  await assert.rejects(
    transport.request({ method: "eth_sendRawTransaction", params: ["0x00"] }),
  );
  assert.deepEqual(seen, [
    "eth_chainId",
    "eth_chainId",
    "eth_sendRawTransaction",
  ]);
});
test("ENS retries only observed block-not-found replica lag, never generic missing resources or sends", async () => {
  let calls = 0;
  const lag = Object.assign(Error("block not found: 0x123"), { code: -32001 });
  const request = retryEnsReplicaReads(
    async () => {
      if (++calls === 1) throw lag;
      return "0x123";
    },
    { wait: async () => {} },
  );
  assert.equal(await request({ method: "eth_getCode" }), "0x123");
  assert.equal(calls, 2);
  for (const [method, error] of [
    ["eth_sendRawTransaction", lag],
    [
      "eth_getCode",
      Object.assign(Error("resource not found"), { code: -32001 }),
    ],
  ]) {
    calls = 0;
    const stop = retryEnsReplicaReads(
      async () => {
        calls++;
        throw error;
      },
      { wait: async () => {} },
    );
    await assert.rejects(stop({ method }));
    assert.equal(calls, 1);
  }
});
