// Retry only named public reads/simulations. Broadcasts are always single-attempt.
import { setTimeout as delay } from "node:timers/promises";
const transientCodes = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);
const transientNames = new Set([
  "TimeoutError",
  "InternalRpcError",
  "ConnectTimeoutError",
  "HeadersTimeoutError",
  "BodyTimeoutError",
]);
const reads = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getTransactionCount",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getBalance",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_estimateGas",
  "eth_call",
  "eth_getLogs",
  "arkiv_query",
  "arkiv_getEntity",
  "arkiv_getBlockTiming",
]);
function causes(error) {
  const result = [];
  for (
    let e = error;
    e && result.length < 12 && !result.includes(e);
    e = e.cause
  )
    result.push(e);
  return result;
}
function transient(error) {
  const chain = causes(error);
  if (historicalStateUnavailable(error)) return false;
  // Validation, oversized requests and contract reverts are not congestion.
  if (
    chain.some(
      (e) =>
        [400, 401, 403, 404, 413].includes(e.status) ||
        [3, -32600, -32601, -32602, -32000].includes(e.code) ||
        /revert/i.test(e.name ?? ""),
    )
  )
    return false;
  return chain.some(
    (e) =>
      [429, 500, 502, 503, 504].includes(e.status) ||
      e.code === -32603 ||
      transientCodes.has(e.code) ||
      transientNames.has(e.name),
  );
}
export function historicalStateUnavailable(error) {
  return causes(error).some((e) =>
    /arkiv serves state at the chain head only|GolemDB cannot read at a past commit/.test(
      e.details ?? e.message ?? "",
    ),
  );
}
// No error messages/URLs/params: viem errors may embed raw signed calldata.
export function rpcDiagnostic(error) {
  return causes(error).map((e) => ({
    name: /^[A-Za-z][A-Za-z0-9]*$/.test(e.name ?? "") ? e.name : "Error",
    code:
      typeof e.code === "number" || transientCodes.has(e.code)
        ? e.code
        : undefined,
    status: typeof e.status === "number" ? e.status : undefined,
    method: reads.has(e.rpcMethod) ? e.rpcMethod : undefined,
    attempts: Number.isInteger(e.rpcAttempts) ? e.rpcAttempts : undefined,
    limitation: historicalStateUnavailable(e)
      ? "historical-state-unavailable"
      : undefined,
  }));
}
export function withReadRetry(rpc, { sleep = delay } = {}) {
  return {
    ...rpc,
    async request(args) {
      const waits = [1000, 3000, 7000];
      for (let attempt = 0; ; attempt++) {
        try {
          return await rpc.request(args);
        } catch (error) {
          if (!reads.has(args.method)) throw error;
          if (!transient(error) || attempt === waits.length) {
            const failure = new Error("Public RPC read failed", {
              cause: error,
            });
            failure.rpcMethod = args.method;
            failure.rpcAttempts = attempt + 1;
            throw failure;
          }
          await sleep(waits[attempt]);
        }
      }
    },
  };
}
