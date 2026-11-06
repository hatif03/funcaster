import path from "node:path";
import { mkdir } from "node:fs/promises";
import {
  encodeFunctionData,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
} from "viem";
import { atomicJson, readJson } from "./outbox.mjs";
import { acquireWorkerLock } from "./worker.mjs";
const requireTx = (condition, code, message) => {
  if (!condition) throw Object.assign(new Error(message), { code });
};

const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();
// This port is injected into the lifecycle by an owner-operated worker. It does
// not load credentials or enable itself. Every saved admission is reconciled
// before another transaction; an uncertain send is never automatically resent.
export async function createTransactions({
  dir,
  lane,
  minimumFeePerGasWei = 0n,
  nativeBalanceFloorWei = 0n,
  client,
  wallet,
  chainId,
  owner,
  budgetWei,
  maxTransactions,
  priorityFeeWei,
  maxFeePerGasWei,
  maxPerRoom,
  maxPerHour,
  continueAfterRevert = false,
  killed = async () => false,
}) {
  requireTx(
    ["ens", "arc-relayer", "arc-oracle"].includes(lane),
    "INVALID_CONFIG",
    "Unknown transaction lane",
  );
  const arc = lane.startsWith("arc-");
  requireTx(
    typeof minimumFeePerGasWei === "bigint" &&
      minimumFeePerGasWei >= 0n &&
      typeof nativeBalanceFloorWei === "bigint" &&
      nativeBalanceFloorWei >= 0n &&
      (!arc || minimumFeePerGasWei >= 20_000_000_000n),
    "INVALID_CONFIG",
    "Invalid fee floor",
  );
  requireTx(
    [arc ? 5042002 : 11155111, 31337].includes(chainId),
    "WRONG_CHAIN",
    "Transactions require the lane testnet or a guarded local fork",
  );
  requireTx(
    same(wallet.account?.address, owner),
    "WRONG_SIGNER",
    "Chain transaction signer does not match the configured account",
  );
  requireTx(
    typeof budgetWei === "bigint" &&
      budgetWei > 0n &&
      typeof priorityFeeWei === "bigint" &&
      (arc ? priorityFeeWei >= 0n : priorityFeeWei > 0n) &&
      typeof maxFeePerGasWei === "bigint" &&
      maxFeePerGasWei >= priorityFeeWei &&
      Number.isInteger(maxTransactions) &&
      maxTransactions > 0,
    "INVALID_CONFIG",
    "Explicit positive transaction and fee limits are required",
  );
  const folder = path.join(dir, `${lane}-transactions`),
    file = path.join(folder, "journal.json");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const unlock = await acquireWorkerLock(folder);
  let journal;
  try {
    journal = (await readJson(file)) || {
      version: 1,
      chainId,
      owner: owner.toLowerCase(),
      entries: [],
    };
    requireTx(
      journal.version === 1 &&
        journal.chainId === chainId &&
        same(journal.owner, owner),
      "STATE_CONFLICT",
      "Chain journal belongs to another signer or chain",
    );
    await atomicJson(file, journal);
  } catch (error) {
    await unlock();
    throw error;
  }
  let tail = Promise.resolve(),
    closed = false;
  const save = () => atomicJson(file, journal);
  async function readProof(entry) {
    let receipt;
    try {
      receipt = await client.getTransactionReceipt({ hash: entry.hash });
    } catch {
      throw new Error(
        "Chain transaction unresolved; reconcile the journal before sending anything else",
      );
    }
    // Independent reads only. Drain both even if one fails so no request leaks
    // into the next serialized admission. No signing/broadcast is parallelized.
    const reads = await Promise.allSettled([
      client.getTransaction({ hash: entry.hash }),
      client.getBlock({ blockNumber: receipt.blockNumber }),
    ]);
    for (const result of reads)
      if (result.status === "rejected") throw result.reason;
    return { entry, receipt, tx: reads[0].value, block: reads[1].value };
  }
  async function reconcile() {
    requireTx(
      (await client.getChainId()) === chainId,
      "WRONG_CHAIN",
      "Chain RPC changed chain",
    );
    let spent = 0n,
      changed = false;
    try {
      // Every historical admission is still freshly verified on each pass.
      // Three proofs at a time bounds RPC load while avoiding a growing serial
      // network round-trip for every transaction in the persistent journal.
      for (let offset = 0; offset < journal.entries.length; offset += 3) {
        const proofs = await Promise.allSettled(
          journal.entries.slice(offset, offset + 3).map(readProof),
        );
        for (const proof of proofs) {
          if (proof.status === "rejected") throw proof.reason;
          const { entry, receipt, tx, block } = proof.value;
          requireTx(
            same(receipt.transactionHash, entry.hash) &&
              receipt.blockHash === block.hash &&
              same(tx.blockHash, block.hash),
            "RECEIPT_MISMATCH",
            "Chain receipt is not canonical",
          );
          requireTx(
            tx.chainId === chainId &&
              same(tx.from, owner) &&
              same(tx.to, entry.to) &&
              same(keccak256(tx.input), entry.dataHash) &&
              tx.value === 0n &&
              tx.nonce === entry.nonce,
            "RECEIPT_MISMATCH",
            "Chain receipt does not match the admitted intent",
          );
          const cost = receipt.gasUsed * receipt.effectiveGasPrice;
          requireTx(
            ["success", "reverted"].includes(receipt.status) &&
              receipt.gasUsed > 0n &&
              receipt.effectiveGasPrice >= 0n &&
              receipt.gasUsed <= BigInt(entry.gas) &&
              receipt.effectiveGasPrice <= BigInt(entry.maxFeePerGas),
            "BUDGET_EXCEEDED",
            "Chain receipt exceeds its admitted bounds",
          );
          spent += cost;
          changed ||=
            entry.costWei !== String(cost) ||
            entry.status !== receipt.status ||
            entry.blockNumber !== String(receipt.blockNumber);
          entry.costWei = String(cost);
          entry.status = receipt.status;
          entry.blockNumber = String(receipt.blockNumber);
          requireTx(
            receipt.status === "success" || (arc && continueAfterRevert),
            "REVERTED",
            "Chain transaction reverted; inspect it instead of retrying",
          );
        }
      }
    } finally {
      if (changed) await save();
    }
    requireTx(
      spent <= budgetWei && journal.entries.length <= maxTransactions,
      "BUDGET_EXCEEDED",
      "Chain journal exceeds this execution budget",
    );
    return spent;
  }
  async function execute(id, call) {
    requireTx(
      typeof id === "string" &&
        id.length > 0 &&
        id.length <= 256 &&
        same(call.account, owner),
      "INVALID_JOB",
      "Invalid Chain transaction identity",
    );
    requireTx(
      !closed && !(await killed()),
      "KILLED",
      "Chain sending is stopped",
    );
    const data = encodeFunctionData(call),
      dataHash = keccak256(data);
    const nativeDebitWei = call.nativeDebitWei ?? 0n;
    requireTx(
      typeof nativeDebitWei === "bigint" &&
        nativeDebitWei >= 0n &&
        (arc || nativeDebitWei === 0n),
      "INVALID_JOB",
      "Invalid native-equivalent debit",
    );
    const prior = journal.entries.find((entry) => entry.id === id);
    if (prior)
      requireTx(
        same(prior.to, call.address) && prior.dataHash === dataHash,
        "IDEMPOTENCY_CONFLICT",
        "Chain transaction payload changed",
      );
    const spent = await reconcile();
    if (prior) {
      requireTx(
        prior.status === "success",
        "REVERTED",
        "This transaction reverted; it will not be resent",
      );
      return { tx: prior.hash, reconciled: true };
    }
    requireTx(
      journal.entries.length < maxTransactions,
      "BUDGET_EXCEEDED",
      "Chain transaction count cap reached",
    );
    const nonce = await client.getTransactionCount({
      address: owner,
      blockTag: "pending",
    });
    requireTx(
      nonce ===
        (await client.getTransactionCount({
          address: owner,
          blockTag: "latest",
        })),
      "NONCE_CONFLICT",
      "Signer has an unconfirmed transaction outside this journal",
    );
    if (journal.entries.length)
      requireTx(
        nonce === journal.entries.at(-1).nonce + 1,
        "NONCE_CONFLICT",
        "Signer nonce moved outside this journal",
      );
    await client.simulateContract(call);
    const estimate = await client.estimateGas({
      account: owner,
      to: call.address,
      data,
      value: 0n,
    });
    const gas = (estimate * 12n + 9n) / 10n;
    const block = await client.getBlock({ blockTag: "latest" });
    const roomId = arc
      ? /^room:([a-f0-9]{64}):/.exec(id)?.[1] || null
      : /^(party|seat|grant|revoke|record):([a-f0-9]{64})(:|$)/.exec(id)?.[2] ||
        null;
    if (maxPerRoom !== undefined || maxPerHour !== undefined) {
      requireTx(
        Number.isSafeInteger(maxPerRoom) &&
          maxPerRoom > 0 &&
          Number.isSafeInteger(maxPerHour) &&
          maxPerHour > 0 &&
          typeof block.timestamp === "bigint",
        "INVALID_CONFIG",
        "Positive room/hour caps and chain time are required",
      );
      requireTx(
        journal.entries.every((e) => /^\d+$/.test(e.admittedAt || "")),
        "STATE_CONFLICT",
        "Older journal admissions lack rate-limit timestamps; reconcile before enabling rate caps",
      );
      requireTx(
        journal.entries.filter(
          (e) => BigInt(e.admittedAt) > block.timestamp - 3600n,
        ).length < maxPerHour,
        "RATE_LIMIT",
        "Chain hourly transaction cap reached",
      );
      requireTx(
        roomId || (!arc && id.startsWith("pair:")),
        "INVALID_JOB",
        "Rate-limited transactions require a room or warm-pool identity",
      );
      if (roomId)
        requireTx(
          journal.entries.filter((e) => e.roomId === roomId).length <
            maxPerRoom,
          "RATE_LIMIT",
          "Chain room transaction cap reached",
        );
    }
    const calculatedFee = (block.baseFeePerGas || 0n) * 2n + priorityFeeWei;
    const maxFeePerGas =
      calculatedFee > minimumFeePerGasWei ? calculatedFee : minimumFeePerGasWei;
    requireTx(
      gas > 0n &&
        maxFeePerGas <= maxFeePerGasWei &&
        spent + gas * maxFeePerGas <= budgetWei,
      "BUDGET_EXCEEDED",
      "Chain gas admission exceeds the configured cap",
    );
    requireTx(
      (await client.getBalance({ address: owner })) >=
        gas * maxFeePerGas + nativeBalanceFloorWei + nativeDebitWei,
      "INSUFFICIENT_BALANCE",
      "Signer balance is below the admitted transaction ceiling",
    );
    requireTx(
      !(await killed()) && (await client.getChainId()) === chainId,
      "KILLED",
      "Chain sending stopped before signing",
    );
    requireTx(
      nonce ===
        (await client.getTransactionCount({
          address: owner,
          blockTag: "pending",
        })),
      "NONCE_CONFLICT",
      "Signer nonce moved during admission",
    );
    const signed = await wallet.signTransaction({
      chainId,
      type: "eip1559",
      to: call.address,
      data,
      value: 0n,
      gas,
      nonce,
      maxFeePerGas,
      maxPriorityFeePerGas: priorityFeeWei,
    });
    const decoded = parseTransaction(signed);
    requireTx(
      decoded.chainId === chainId &&
        decoded.nonce === nonce &&
        decoded.gas === gas &&
        decoded.maxFeePerGas === maxFeePerGas &&
        (decoded.maxPriorityFeePerGas || 0n) === priorityFeeWei &&
        (decoded.value || 0n) === 0n &&
        same(decoded.to, call.address) &&
        // Hex casing carries no byte information. Dynamic bytes arguments may
        // retain checksum-address casing before RLP normalizes the same bytes.
        same(decoded.data, data) &&
        same(
          await recoverTransactionAddress({ serializedTransaction: signed }),
          owner,
        ),
      "WRONG_SIGNATURE",
      "Signed Chain transaction differs from the admitted intent",
    );
    const hash = keccak256(signed);
    journal.entries.push({
      id,
      hash,
      to: call.address,
      dataHash,
      nonce,
      gas: String(gas),
      maxFeePerGas: String(maxFeePerGas),
      status: "prepared",
      ...(typeof block.timestamp === "bigint"
        ? { admittedAt: String(block.timestamp), roomId }
        : {}),
    });
    await save(); // Signed bytes and secrets are never persisted.
    requireTx(
      !(await killed()) && (await client.getChainId()) === chainId,
      "KILLED",
      "Chain sending stopped after admission; inspect the journal",
    );
    const submitted = await client.sendRawTransaction({
      serializedTransaction: signed,
    });
    requireTx(
      same(submitted, hash),
      "RECEIPT_MISMATCH",
      "Chain RPC returned an unexpected transaction hash",
    );
    // No resend on timeout. The caller may later retry this ID, which only reads
    // the already-admitted hash and resumes after its canonical receipt exists.
    await client.waitForTransactionReceipt({
      hash,
      timeout: 90000,
      pollingInterval: 1000,
      retryCount: 0,
    });
    await reconcile();
    requireTx(
      journal.entries.at(-1).status === "success",
      "REVERTED",
      "This transaction reverted; it will not be resent",
    );
    return { tx: hash, reconciled: false };
  }
  return {
    hasAdmission(prefix) {
      requireTx(
        !closed && typeof prefix === "string" && prefix.length > 0,
        "INVALID_JOB",
        "Admission lookup requires an open port and a nonempty prefix",
      );
      // Presence only, including uncertain or reverted sends. This never
      // reconciles, removes, or changes an admitted intent or its budget.
      const result = tail.then(() =>
        journal.entries.some((entry) => entry.id.startsWith(prefix)),
      );
      tail = result.catch(() => {});
      return result;
    },
    admissionHashes() {
      requireTx(!closed, "CLOSED", "Chain transaction port is closed");
      // Identity snapshot only, never a receipt or permission to send. transact
      // still freshly reconciles every entry before admitting any new write.
      return journal.entries.map((entry) => entry.hash);
    },
    receipts({ prefix, suffixes } = {}) {
      requireTx(!closed, "CLOSED", "Chain transaction port is closed");
      const result = tail.then(async () => {
        await reconcile();
        return journal.entries
          .filter(
            (e) =>
              (!prefix || e.id.startsWith(prefix)) &&
              (!suffixes || suffixes.some((s) => e.id.endsWith(s))),
          )
          .map((e) => ({
            hash: e.hash,
            blockNumber: e.blockNumber,
            ...(arc ? { id: e.id, status: e.status, costWei: e.costWei } : {}),
          }));
      });
      tail = result.catch(() => {});
      return result;
    },
    transact(id, call) {
      requireTx(!closed, "CLOSED", "Chain transaction port is closed");
      const result = tail.then(() => execute(id, call));
      tail = result.catch(() => {});
      return result;
    },
    async close() {
      if (closed) return;
      closed = true;
      await tail;
      await unlock();
    },
  };
}
