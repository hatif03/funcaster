// Explicit owner-only recovery of one already-admitted hash. This is never
// called by the worker. It cannot replace, reprice or renonce a transaction.
import { encodeFunctionData, keccak256, recoverTransactionAddress } from "viem";
import { setTimeout as delay } from "node:timers/promises";
import { POT_ABI } from "./chain.mjs";
import { requireArc, same, hex32, json } from "./jobs.mjs";
import { readJson, atomicJson } from "../shared/outbox.mjs";
import { arcReadOutage } from "./rpc.mjs";
import { arcFailure } from "./diagnostics.mjs";

export function exactFinalization({
  entry,
  owner,
  contract,
  potId,
  places,
  expectedHash,
  spentWei,
  chainId = 5042002,
}) {
  const data = encodeFunctionData({
    abi: POT_ABI,
    functionName: "finalize",
    args: [potId, places],
  });
  requireArc(
    hex32(expectedHash) &&
      same(entry.hash, expectedHash) &&
      same(entry.to, contract) &&
      same(entry.dataHash, keccak256(data)) &&
      entry.id.endsWith(":recover:finalize") &&
      ["prepared", "success"].includes(entry.status) &&
      Number.isSafeInteger(entry.nonce) &&
      entry.nonce >= 0,
    "INVALID_PROOF",
    "Recovery is limited to the exact admitted finalization",
  );
  const gas = BigInt(entry.gas),
    fee = BigInt(entry.maxFeePerGas),
    ceiling = gas * fee;
  requireArc(
    gas > 0n &&
      fee >= 20000000000n &&
      fee <= 100000000000n &&
      spentWei >= 0n &&
      spentWei + ceiling <= 500000000000000000n,
    "BUDGET_EXCEEDED",
    "Original relayer budget still applies",
  );
  return {
    hash: expectedHash,
    owner,
    potId,
    places,
    ceiling,
    transaction: {
      chainId,
      type: "eip1559",
      to: contract,
      data,
      value: 0n,
      nonce: entry.nonce,
      gas,
      maxFeePerGas: fee,
      maxPriorityFeePerGas: 0n,
    },
  };
}
async function network(client, candidate, localGuard) {
  const id = candidate.transaction.chainId;
  requireArc(
    id === 5042002 || (id === 31337 && typeof localGuard === "function"),
    "WRONG_CHAIN",
    "Only Arc testnet or guarded local tests",
  );
  if (id === 31337) await localGuard();
  requireArc(
    (await client.getChainId()) === id,
    "WRONG_CHAIN",
    "Recovery RPC changed chain",
  );
}
async function missingOnly(action, name) {
  try {
    return await action();
  } catch (error) {
    if (error.name === name) return null;
    throw error; // outages are not evidence of absence
  }
}
function receiptProof(checks) {
  const failed = Object.keys(checks).filter((name) => !checks[name]);
  if (failed.length)
    throw Object.assign(
      Error("Recovery receipt differs from its original admission"),
      {
        code: "INVALID_PROOF",
        recoveryChecks: failed,
      },
    );
}
async function status(client, candidate, localGuard) {
  await network(client, candidate, localGuard);
  const [tx, receipt] = await Promise.all([
    missingOnly(
      () => client.getTransaction({ hash: candidate.hash }),
      "TransactionNotFoundError",
    ),
    missingOnly(
      () => client.getTransactionReceipt({ hash: candidate.hash }),
      "TransactionReceiptNotFoundError",
    ),
  ]);
  if (!tx && !receipt) return { state: "absent" };
  if (!tx || !receipt) return { state: "pending" };
  const original = candidate.transaction;
  receiptProof({
    txHash: same(tx.hash, candidate.hash),
    receiptHash: same(receipt.transactionHash, candidate.hash),
    sender: same(tx.from, candidate.owner),
    destination: same(tx.to, original.to),
    calldata: same(tx.input, original.data),
    txChain: tx.chainId === original.chainId,
    nonce: tx.nonce === original.nonce,
    value: tx.value === 0n,
    gas: tx.gas === original.gas,
    maxFee: tx.maxFeePerGas === original.maxFeePerGas,
    priorityFee: tx.maxPriorityFeePerGas === 0n,
  });
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  receiptProof({
    txBlock: same(tx.blockHash, block.hash),
    receiptBlock: same(receipt.blockHash, block.hash),
    blockNumber: tx.blockNumber === receipt.blockNumber,
    positiveGas: receipt.gasUsed > 0n,
    gasCeiling: receipt.gasUsed <= original.gas,
    positivePrice: receipt.effectiveGasPrice > 0n,
    priceCeiling: receipt.effectiveGasPrice <= original.maxFeePerGas,
  });
  requireArc(
    receipt.status === "success",
    "REVERTED",
    "Original transaction reverted; no replacement is permitted",
  );
  return {
    state: "confirmed",
    hash: candidate.hash,
    blockNumber: String(receipt.blockNumber),
    blockHash: receipt.blockHash,
    costWei: String(receipt.gasUsed * receipt.effectiveGasPrice),
  };
}
async function statusBoth(options) {
  requireArc(
    options.clients.length === 2,
    "INVALID_CONFIG",
    "Two RPC clients required",
  );
  const rows = [];
  for (const client of options.clients)
    rows.push(await status(client, options.candidate, options.localGuard));
  if (rows.every((r) => r.state === "confirmed")) {
    requireArc(
      JSON.stringify(rows[0]) === JSON.stringify(rows[1]),
      "INVALID_PROOF",
      "Hosts disagree on the confirmed recovery",
    );
    return rows[0];
  }
  return {
    state: rows.every((r) => r.state === "absent") ? "absent" : "pending",
  };
}
async function exactNonce(client, candidate) {
  const nonces = await Promise.all(
    ["latest", "pending"].map((blockTag) =>
      client.getTransactionCount({ address: candidate.owner, blockTag }),
    ),
  );
  requireArc(
    nonces.every((n) => n === candidate.transaction.nonce),
    "NONCE_CONFLICT",
    "Original nonce is no longer unused on both views",
  );
}
export async function checkExactRecovery(options) {
  const {
    candidate,
    clients,
    ready = async () => {},
    now = Date.now,
  } = options;
  const observed = await statusBoth(options);
  if (observed.state !== "absent") return observed;
  for (const [i, client] of clients.entries()) {
    await exactNonce(client, candidate);
    await ready(client, i); // caller verifies reviewed deployment and exact pot
    const block = await client.getBlock({ blockTag: "latest" });
    requireArc(
      now() / 1000 - Number(block.timestamp) <= 30 &&
        Number(block.timestamp) <= now() / 1000 + 5 &&
        block.baseFeePerGas <= candidate.transaction.maxFeePerGas,
      "INVALID_PROOF",
      "Recovery chain head is stale or fees changed",
    );
    const call = {
      account: candidate.owner,
      to: candidate.transaction.to,
      data: candidate.transaction.data,
      value: 0n,
    };
    await client.call(call);
    const estimate = await client.estimateGas(call);
    requireArc(
      estimate > 0n && estimate <= candidate.transaction.gas,
      "BUDGET_EXCEEDED",
      "Exact original gas no longer covers finalization",
    );
    requireArc(
      (await client.getBalance({ address: candidate.owner })) >=
        candidate.ceiling + 50000000000000000n,
      "INSUFFICIENT_BALANCE",
      "Recovery would breach the retained floor",
    );
    requireArc(
      same(
        (await client.getBlock({ blockNumber: block.number })).hash,
        block.hash,
      ) && now() / 1000 - Number(block.timestamp) <= 30,
      "INVALID_PROOF",
      "Recovery preflight changed block or became stale",
    );
    await exactNonce(client, candidate);
  }
  return {
    state: "absent",
    ready: true,
    hash: candidate.hash,
    nonce: candidate.transaction.nonce,
    maximumCostWei: String(candidate.ceiling),
  };
}
export async function recoverExactOnce(options) {
  const {
    candidate,
    wallet,
    markerFile,
    wait = delay,
    now = Date.now,
    killed = async () => false,
  } = options;
  const prior = await readJson(markerFile);
  if (prior)
    requireArc(
      same(prior.hash, candidate.hash) && same(prior.owner, candidate.owner),
      "CONFLICT",
      "Recovery marker belongs to another admission",
    );
  const proof = await checkExactRecovery(options);
  if (proof.state === "confirmed") {
    // Update only metadata for an existing marker. No signing or send on restart.
    if (prior)
      await atomicJson(markerFile, {
        ...prior,
        status: "confirmed",
        receipt: json(proof),
      });
    return proof;
  }
  requireArc(
    proof.ready && proof.state === "absent",
    "RECOVERY_WAIT",
    "Transaction is already known or hosts disagree; wait for readback",
  );
  requireArc(
    !prior,
    "RECOVERY_ALREADY_ATTEMPTED",
    "This owner recovery was already attempted; never automatically send it again",
  );
  requireArc(
    same(wallet?.account?.address, candidate.owner) && !(await killed()),
    "WRONG_SIGNER",
    "Recovery signer differs or sending is stopped",
  );
  const signed = await wallet.signTransaction(candidate.transaction);
  requireArc(
    same(keccak256(signed), candidate.hash) &&
      same(
        await recoverTransactionAddress({ serializedTransaction: signed }),
        candidate.owner,
      ),
    "WRONG_SIGNATURE",
    "Recreated bytes do not produce the original admitted hash",
  );
  for (const client of options.clients) {
    await network(client, candidate, options.localGuard);
    await exactNonce(client, candidate);
  }
  requireArc(
    !(await killed()),
    "KILLED",
    "Owner stopped recovery before dispatch",
  );
  const marker = {
    version: 1,
    hash: candidate.hash,
    owner: candidate.owner,
    nonce: candidate.transaction.nonce,
    maximumCostWei: String(candidate.ceiling),
    attemptedAt: now(),
    status: "dispatching",
  };
  await atomicJson(markerFile, marker); // write ahead; never store signed bytes
  try {
    const hash = await options.clients[1].sendRawTransaction({
      serializedTransaction: signed,
    });
    requireArc(
      same(hash, candidate.hash),
      "INVALID_PROOF",
      "RPC acknowledged another transaction hash",
    );
    marker.status = "acknowledged";
    await atomicJson(markerFile, marker);
  } catch (error) {
    marker.status = "uncertain";
    marker.failure = arcFailure(error);
    await atomicJson(markerFile, marker);
    throw Object.assign(
      Error(
        "Owner dispatch outcome is uncertain; inspect the same hash without resending",
      ),
      { code: "RECOVERY_SEND_UNCERTAIN", cause: error },
    );
  }
  const deadline = now() + 120000;
  while (now() < deadline) {
    try {
      const result = await statusBoth(options);
      if (result.state === "confirmed") {
        await atomicJson(markerFile, {
          ...marker,
          status: "confirmed",
          receipt: json(result),
        });
        return result;
      }
    } catch (error) {
      if (!arcReadOutage(error).transient) {
        // Preserve named predicates, never the raw RPC error or signed bytes.
        await atomicJson(markerFile, { ...marker, failure: arcFailure(error) });
        throw error;
      }
    }
    await wait(1000);
  }
  throw Object.assign(
    Error("Exact recovery receipt still pending; no automatic resend"),
    { code: "RECOVERY_WAIT" },
  );
}
