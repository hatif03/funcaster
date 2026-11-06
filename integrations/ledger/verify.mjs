import { hash } from "../../server/records.cjs";

const TX = /^0x[\da-f]{64}$/i;
const same = (a, b) =>
  typeof a === "string" && a.toLowerCase() === b?.toLowerCase();
const failure = (status, at, hosts = []) => ({
  status,
  at,
  hosts,
  scope: "transaction receipt only",
});

// This port deliberately exposes JSON-RPC reads only. No account or wallet is
// loaded, and no worker observation can set a confirmed receipt badge.
export async function rpcRead(url, method, params) {
  if (
    ![
      "eth_chainId",
      "eth_getTransactionReceipt",
      "eth_getBlockByNumber",
    ].includes(method)
  )
    throw Error("READ_ONLY_METHOD_REQUIRED");
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Error("RPC_UNAVAILABLE");
  const body = await response.json();
  if (body.error) throw Error("RPC_UNAVAILABLE");
  return body.result;
}

export async function verifyReceipt(
  observation,
  urls,
  { read = rpcRead, now = Date.now } = {},
) {
  const at = now();
  if (observation.mock) return failure("mock", at);
  if (!TX.test(observation.tx)) return failure("no-transaction", at);
  let hosts;
  try {
    if (!Array.isArray(urls) || urls.length !== 2)
      return failure("unconfigured", at);
    hosts = urls.map((value) => {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password)
        throw Error("INVALID_RPC");
      return url.hostname;
    });
    if (new Set(hosts).size !== 2) return failure("unconfigured", at);
  } catch {
    return failure("unconfigured", at);
  }
  try {
    const proofs = await Promise.all(
      urls.map(async (url) => {
        const chain = await read(url, "eth_chainId", []);
        if (BigInt(chain) !== BigInt(observation.chainId))
          throw Error("RPC_MISMATCH");
        const receipt = await read(url, "eth_getTransactionReceipt", [
          observation.tx,
        ]);
        if (!receipt) return null;
        if (
          !same(receipt.transactionHash, observation.tx) ||
          !TX.test(receipt.blockHash)
        )
          throw Error("RPC_MISMATCH");
        const block = await read(url, "eth_getBlockByNumber", [
          receipt.blockNumber,
          false,
        ]);
        if (
          !block ||
          !same(block.hash, receipt.blockHash) ||
          BigInt(block.number) !== BigInt(receipt.blockNumber)
        )
          throw Error("RPC_MISMATCH");
        if (
          !Array.isArray(receipt.logs) ||
          receipt.logs.some(
            (log) =>
              log.removed ||
              !same(log.transactionHash, observation.tx) ||
              !same(log.blockHash, receipt.blockHash),
          )
        )
          throw Error("RPC_MISMATCH");
        return {
          tx: observation.tx,
          blockNumber: BigInt(receipt.blockNumber).toString(),
          blockHash: receipt.blockHash.toLowerCase(),
          status: BigInt(receipt.status).toString(),
          from: receipt.from?.toLowerCase(),
          to: receipt.to?.toLowerCase() || null,
          gasUsed: BigInt(receipt.gasUsed).toString(),
          logs: receipt.logs.map((log) => ({
            address: log.address.toLowerCase(),
            topics: log.topics.map((v) => v.toLowerCase()),
            data: log.data.toLowerCase(),
            index: BigInt(log.logIndex).toString(),
          })),
        };
      }),
    );
    if (proofs.some((p) => !p)) return failure("pending", at, hosts);
    if (hash(proofs[0]) !== hash(proofs[1]))
      return failure("rpc-mismatch", at, hosts);
    const proof = proofs[0];
    return {
      ...failure(proof.status === "1" ? "confirmed" : "reverted", at, hosts),
      blockNumber: proof.blockNumber,
      blockHash: proof.blockHash,
      from: proof.from,
      to: proof.to,
      gasUsed: proof.gasUsed,
      receiptDigest: hash(proof),
      logCount: proof.logs.length,
      detail:
        "Two distinct RPC hosts agree on this canonical transaction receipt. Game outcome and worker-reported operation details are not independently proven by this badge.",
    };
  } catch (error) {
    return failure(
      error.message === "RPC_MISMATCH" ? "rpc-mismatch" : "unavailable",
      at,
      hosts,
    );
  }
}
