import { setTimeout as delay } from "node:timers/promises";

// A positive allowlist is essential: never retry a signed send (even after a
// 429), signing request, filter mutation or a method added by a future caller.
export const ARC_READ_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getBalance",
  "eth_getCode",
  "eth_call",
  "eth_estimateGas",
  "eth_getTransactionCount",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getLogs",
  "eth_gasPrice",
  "eth_feeHistory",
  "eth_maxPriorityFeePerGas",
]);
export function arcReadOutage(error) {
  let transient = false,
    retryAfterMs = 0;
  for (let e = error, i = 0; e && i < 12; e = e.cause, i++) {
    if (
      e.code === -32005 ||
      e.status === 429 ||
      (e.status >= 500 && e.status <= 599) ||
      ["TimeoutError", "ConnectTimeoutError", "SocketError"].includes(e.name) ||
      (e.name === "HttpRequestError" && e.status === undefined)
    )
      transient = true;
    const header = e.headers?.get?.("retry-after");
    if (header != null) {
      const seconds = Number(header);
      const ms = Number.isFinite(seconds)
        ? seconds * 1000
        : Date.parse(header) - Date.now();
      if (Number.isFinite(ms)) retryAfterMs = Math.max(retryAfterMs, ms);
    }
  }
  return { transient, retryAfterMs };
}
export function retryArcReads(request, { wait = delay } = {}) {
  return async (args, options) => {
    for (let attempt = 1; ; attempt++) {
      try {
        // Disable the underlying viem transport's retry even if a caller tries
        // to override it; all permitted retries happen only in this loop.
        return await request(args, { ...options, retryCount: 0 });
      } catch (error) {
        if (error && typeof error === "object" && Object.isExtensible(error)) {
          if (ARC_READ_METHODS.has(args.method))
            error.arcRpcMethod = args.method;
          error.arcRpcAttempts = attempt;
        }
        const { transient, retryAfterMs } = arcReadOutage(error);
        if (
          !ARC_READ_METHODS.has(args.method) ||
          !transient ||
          attempt >= 4 ||
          retryAfterMs > 15000 ||
          options?.signal?.aborted
        )
          throw error;
        await wait(
          Math.max(1000 * 2 ** (attempt - 1), retryAfterMs),
          undefined,
          { signal: options?.signal },
        );
      }
    }
  };
}
