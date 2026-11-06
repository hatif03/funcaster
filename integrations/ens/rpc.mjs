import { http } from "viem";
import { setTimeout as delay } from "node:timers/promises";
import { ARC_READ_METHODS, retryArcReads } from "../arc/rpc.mjs";

export function retryEnsReplicaReads(request, { wait = delay } = {}) {
  return async (args, options) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await request(args, options);
      } catch (error) {
        let replicaLag = false;
        for (
          let cause = error, depth = 0;
          cause && depth < 12;
          cause = cause.cause, depth++
        ) {
          if (
            cause.code === -32001 &&
            /block not found/i.test(
              `${cause.details || ""} ${cause.message || ""}`,
            )
          )
            replicaLag = true;
        }
        if (
          !ARC_READ_METHODS.has(args.method) ||
          !replicaLag ||
          attempt >= 2 ||
          options?.signal?.aborted
        )
          throw error;
        await wait(1000 * (attempt + 1), undefined, {
          signal: options?.signal,
        });
      }
    }
  };
}

// Both chains use the same EVM read allowlist. Reuse the audited bounded read
// retry policy; sendRawTransaction and every unknown method remain single-shot.
export function ensRpcTransport(url, { wait, fetchFn } = {}) {
  const transport = http(url, { timeout: 15000, retryCount: 0, fetchFn });
  return (options) => {
    const base = transport(options);
    return {
      ...base,
      request: retryEnsReplicaReads(retryArcReads(base.request, { wait }), {
        wait,
      }),
    };
  };
}
