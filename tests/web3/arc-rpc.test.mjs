import test from "node:test";
import assert from "node:assert/strict";
import { retryArcReads } from "../../integrations/arc/rpc.mjs";
import { arcClient, paceArcReads } from "../../integrations/arc/provider.mjs";

test("read pacing spans clients without caching results or delaying a send", async () => {
  let clock = 0;
  const state = { tail: Promise.resolve(), nextAt: 0 },
    calls = [],
    waits = [];
  const options = {
    state,
    now: () => clock,
    wait: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
  };
  const request = async (args) => {
    calls.push({ method: args.method, at: clock });
    return calls.length;
  };
  const first = paceArcReads(request, options),
    second = paceArcReads(request, options);
  const reads = [
    first({ method: "eth_call" }),
    second({ method: "eth_call" }),
    first({ method: "eth_call" }),
  ];
  await second({ method: "eth_sendRawTransaction" });
  await Promise.all(reads);
  assert.equal(calls[0].method, "eth_sendRawTransaction");
  assert.deepEqual(
    calls.filter((x) => x.method === "eth_call").map((x) => x.at),
    [0, 150, 300],
  );
  assert.deepEqual(waits, [150, 150]);
});
import { arcFailure } from "../../integrations/arc/diagnostics.mjs";

test("read RPC retries transient rate limits with bounded backoff and preserves request options", async () => {
  let calls = 0;
  const waits = [],
    params = ["0x1234", "latest"];
  const signal = new AbortController().signal;
  const request = retryArcReads(
    async (args, options) => {
      calls++;
      assert.deepEqual(args, { method: "eth_getBalance", params });
      assert.equal(options.signal, signal);
      assert.equal(options.retryCount, 0);
      if (calls < 4) throw { cause: { code: -32005 } };
      return "0x10";
    },
    { wait: async (ms) => waits.push(ms) },
  );
  assert.equal(
    await request(
      { method: "eth_getBalance", params },
      { signal, retryCount: 100 },
    ),
    "0x10",
  );
  assert.equal(calls, 4);
  assert.deepEqual(waits, [1000, 2000, 4000]);
});
test("read retry exhaustion retains method and attempts without a request body", async () => {
  let calls = 0;
  const request = retryArcReads(
    async () => {
      calls++;
      throw Object.assign(Error("private request"), { code: -32005 });
    },
    { wait: async () => {} },
  );
  await assert.rejects(
    request({ method: "eth_call", params: ["private"] }),
    (e) => {
      const failure = arcFailure(e);
      assert.equal(failure.code, "RPC_RATE_LIMITED");
      assert.equal(failure.method, "eth_call");
      assert.equal(failure.attempts, 4);
      assert(!JSON.stringify(failure).includes("private"));
      return true;
    },
  );
  assert.equal(calls, 4);
});
test("transaction submission, signatures, filters and unknown RPC methods are never retried", async () => {
  for (const method of [
    "eth_sendRawTransaction",
    "eth_sendTransaction",
    "eth_sign",
    "eth_signTypedData_v4",
    "eth_newFilter",
    "future_method",
  ]) {
    let calls = 0;
    const request = retryArcReads(
      async () => {
        calls++;
        throw { code: -32005 };
      },
      { wait: async () => assert.fail("must not wait or retry") },
    );
    await assert.rejects(request({ method }, { retryCount: 100 }));
    assert.equal(calls, 1);
  }
});
test("read retries respect Retry-After, stop on excessive server delay and ignore deterministic failures", async () => {
  for (const [error, expectedCalls, expectedWaits] of [
    [
      {
        name: "HttpRequestError",
        status: 429,
        headers: new Headers({ "retry-after": "3" }),
      },
      4,
      [3000, 3000, 4000],
    ],
    [{ name: "HttpRequestError", status: 503 }, 4, [1000, 2000, 4000]],
    [{ name: "TimeoutError" }, 4, [1000, 2000, 4000]],
    [{ code: -32005, headers: new Headers({ "retry-after": "60" }) }, 1, []],
    [{ name: "ContractFunctionRevertedError", code: 3 }, 1, []],
    [{ name: "HttpRequestError", status: 401 }, 1, []],
    [{ code: "INVALID_PROOF" }, 1, []],
    [{ code: -32602 }, 1, []],
  ]) {
    let calls = 0;
    const waits = [];
    await assert.rejects(
      retryArcReads(
        async () => {
          calls++;
          throw error;
        },
        { wait: async (ms) => waits.push(ms) },
      )({ method: "eth_call" }),
    );
    assert.equal(calls, expectedCalls);
    assert.deepEqual(waits, expectedWaits);
  }
});
test("an aborted read never starts another request", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    retryArcReads(
      async () => {
        calls++;
        throw { code: -32005 };
      },
      { wait: async () => assert.fail("aborted") },
    )({ method: "eth_call" }, { signal: controller.signal }),
  );
  assert.equal(calls, 1);
});
test("real viem transport retries reads but never hides a retry of a rejected send", async () => {
  const counts = new Map();
  let recover = true;
  const client = arcClient("https://rpc.testnet.arc.io", {
    wait: async () => {},
    fetchFn: async (_url, options) => {
      const { id, method } = JSON.parse(options.body);
      counts.set(method, (counts.get(method) || 0) + 1);
      const result =
        method === "eth_chainId" && recover && counts.get(method) > 1
          ? { result: "0x4cef52" }
          : { error: { code: -32005, message: "request limit reached" } };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id, ...result }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(await client.getChainId(), 5042002);
  assert.equal(counts.get("eth_chainId"), 2);
  await assert.rejects(
    client.request(
      { method: "eth_sendRawTransaction", params: ["0x00"] },
      { retryCount: 9 },
    ),
  );
  assert.equal(counts.get("eth_sendRawTransaction"), 1);
  recover = false;
  await assert.rejects(client.getBalance({ address: `0x${"11".repeat(20)}` }));
  assert.equal(counts.get("eth_getBalance"), 4);
});
