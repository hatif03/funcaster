import test from "node:test";
import assert from "node:assert/strict";
import { withReadRetry, rpcDiagnostic } from "./read-retry.mjs";
test("Node connection timeout nested beneath fetch and viem wrappers retries reads but never sends", async () => {
  const nested = () =>
    [
      "ConnectTimeoutError",
      "TypeError",
      "HttpRequestError",
      "Error",
      "UnknownRpcError",
    ].reduce(
      (cause, name) =>
        Object.assign(new Error("private request", { cause }), {
          name,
          ...(name === "ConnectTimeoutError"
            ? { code: "UND_ERR_CONNECT_TIMEOUT" }
            : {}),
        }),
      undefined,
    );
  const waits = [];
  let reads = 0,
    sends = 0;
  const rpc = withReadRetry(
    {
      request: async ({ method }) => {
        if (method === "eth_sendRawTransaction") {
          sends++;
          throw nested();
        }
        if (++reads === 1) throw nested();
        return "0xblock";
      },
    },
    { sleep: async (ms) => waits.push(ms) },
  );
  assert.equal(
    await rpc.request({ method: "eth_getBlockByNumber" }),
    "0xblock",
  );
  assert.equal(reads, 2);
  assert.deepEqual(waits, [1000]);
  await assert.rejects(rpc.request({ method: "eth_sendRawTransaction" }));
  assert.equal(sends, 1);
  assert.deepEqual(waits, [1000]);
  assert(
    rpcDiagnostic(nested()).some((e) => e.code === "UND_ERR_CONNECT_TIMEOUT"),
  );
});
test("Node header, body and socket timeouts are bounded retryable read errors", async () => {
  for (const code of [
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT",
    "UND_ERR_SOCKET",
  ]) {
    let calls = 0;
    const rpc = withReadRetry(
      {
        request: async () => {
          calls++;
          throw Object.assign(new Error("timeout"), { code });
        },
      },
      { sleep: async () => {} },
    );
    await assert.rejects(rpc.request({ method: "arkiv_query" }));
    assert.equal(calls, 4);
  }
});
test("transient public reads and simulations recover after bounded backoff", async () => {
  for (const method of [
    "eth_estimateGas",
    "eth_getTransactionReceipt",
    "arkiv_query",
  ]) {
    const waits = [];
    let calls = 0;
    const rpc = withReadRetry(
      {
        request: async () => {
          if (++calls < 3)
            throw Object.assign(new Error("private request body"), {
              code: -32603,
            });
          return "ok";
        },
      },
      { sleep: async (ms) => waits.push(ms) },
    );
    assert.equal(await rpc.request({ method }), "ok");
    assert.equal(calls, 3);
    assert.deepEqual(waits, [1000, 3000]);
  }
});
test("read retry exhaustion reports method and attempts without leaking request data", async () => {
  let calls = 0;
  const rpc = withReadRetry(
    {
      request: async () => {
        calls++;
        throw Object.assign(new Error("SECRET signed transaction"), {
          status: 503,
        });
      },
    },
    { sleep: async () => {} },
  );
  await assert.rejects(rpc.request({ method: "eth_getBalance" }), (e) => {
    const safe = rpcDiagnostic(e);
    assert.equal(safe[0].method, "eth_getBalance");
    assert.equal(safe[0].attempts, 4);
    assert.equal(safe[1].status, 503);
    assert(!JSON.stringify(safe).includes("SECRET"));
    return true;
  });
  assert.equal(calls, 4);
});
test("broadcast, signing and unknown methods never retry even on transient errors", async () => {
  for (const method of [
    "eth_sendRawTransaction",
    "eth_sendTransaction",
    "eth_sign",
    "personal_sign",
    "arkiv_unknown",
  ]) {
    let calls = 0,
      sleeps = 0;
    const rpc = withReadRetry(
      {
        request: async () => {
          calls++;
          throw Object.assign(new Error("uncertain send"), { code: -32603 });
        },
      },
      { sleep: async () => sleeps++ },
    );
    await assert.rejects(rpc.request({ method }));
    assert.equal(calls, 1);
    assert.equal(sleeps, 0);
  }
});
test("Rabdi head-only state errors are deterministic and never retried", async () => {
  let calls = 0;
  const rpc = withReadRetry(
    {
      request: async () => {
        calls++;
        throw Object.assign(Error("unavailable"), {
          code: -32603,
          details:
            "arkiv serves state at the chain head only: asked for commit 1, head is 2",
        });
      },
    },
    {
      sleep: async () => {
        assert.fail("Unexpected retry");
      },
    },
  );
  await assert.rejects(rpc.request({ method: "eth_getBalance" }), (error) => {
    assert.equal(
      rpcDiagnostic(error)[0].limitation,
      "historical-state-unavailable",
    );
    return true;
  });
  assert.equal(calls, 1);
});
test("validation, request size, contract reverts and unknown failures stop immediately", async () => {
  for (const cause of [
    { status: 413 },
    { code: -32602 },
    { code: 3 },
    { code: -32000 },
    { name: "ContractFunctionRevertedError" },
    {},
  ]) {
    let calls = 0;
    const rpc = withReadRetry(
      {
        request: async () => {
          calls++;
          throw Object.assign(new Error("upstream"), { code: -32603, cause });
        },
      },
      { sleep: async () => {} },
    );
    if (Object.keys(cause).length === 0) {
      const unknown = withReadRetry(
        {
          request: async () => {
            calls++;
            throw Error("unknown");
          },
        },
        { sleep: async () => {} },
      );
      await assert.rejects(unknown.request({ method: "eth_call" }));
    } else await assert.rejects(rpc.request({ method: "eth_call" }));
    assert.equal(calls, 1);
  }
});
