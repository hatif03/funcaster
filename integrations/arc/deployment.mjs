// One owner-authorized creation, with no automatic resend or replacement.
// The caller supplies a signer only in apply mode. Local tests inject a guard.
import path from "node:path";
import { mkdir } from "node:fs/promises";
import {
  encodeDeployData,
  getContractAddress,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  parseEther,
  parseGwei,
} from "viem";
import { atomicJson, readJson, digest } from "../shared/outbox.mjs";
import { acquireWorkerLock } from "../shared/worker.mjs";
import { requireArc, same, json } from "./jobs.mjs";

export function reviewedCreation(artifact, assets, pin) {
  const metadata = artifact.metadata;
  requireArc(
    pin.chainId === 5042002 &&
      metadata?.compiler?.version === pin.compiler &&
      metadata.settings?.evmVersion === pin.evmVersion &&
      metadata.settings?.optimizer?.enabled === true &&
      metadata.settings.optimizer.runs === pin.optimizerRuns &&
      same(keccak256(artifact.bytecode.object), pin.bytecodeHash),
    "INVALID_CONFIG",
    "Compiled artifact differs from the reviewed Studio deployment",
  );
  const data = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [assets.map((a) => a.address)],
  });
  requireArc(
    same(keccak256(data), pin.creationHash) &&
      (data.length - 2) / 2 === pin.creationBytes,
    "INVALID_CONFIG",
    "Creation payload or ordered asset list changed",
  );
  return data;
}

export function deploymentLimits(pin) {
  const limits = {
    minimumFee: parseGwei(pin.minimumFeeGwei),
    maximumFee: parseGwei(pin.maximumFeeGwei),
    maximumCost: parseEther(pin.maximumGasUSDC),
    retained: parseEther(pin.retainedUSDC),
  };
  requireArc(
    limits.minimumFee >= 20_000_000_000n &&
      limits.maximumFee >= limits.minimumFee &&
      limits.maximumFee <= 100_000_000_000n &&
      limits.maximumCost > 0n &&
      limits.maximumCost <= 100_000_000_000_000_000n &&
      limits.retained >= 50_000_000_000_000_000n,
    "INVALID_CONFIG",
    "Deployment limits exceed the reviewed owner ceiling",
  );
  return limits;
}
async function network({ client, chainId = 5042002, localGuard }) {
  requireArc(
    chainId === 5042002 ||
      (chainId === 31337 && typeof localGuard === "function"),
    "INVALID_CONFIG",
    "Deployment requires Arc testnet or an injected local guard",
  );
  if (chainId === 31337) await localGuard();
  requireArc(
    (await client.getChainId()) === chainId,
    "WRONG_CHAIN",
    "Deployment RPC changed chain",
  );
}
async function nonceAt(client, owner) {
  const [latest, pending] = await Promise.all(
    ["latest", "pending"].map((blockTag) =>
      client.getTransactionCount({ address: owner, blockTag }),
    ),
  );
  requireArc(
    Number.isSafeInteger(latest) && latest >= 0 && latest === pending,
    "NONCE_CONFLICT",
    "Deployer has an unresolved transaction; stop and reconcile",
  );
  return latest;
}

// Arc can expose a canonical receipt before its transaction-by-hash cache has
// acquired the mined block metadata. Refresh the entire proof, never the send.
// All callers still validate every intent field and the final canonical hashes.
export async function readDeploymentProof(
  client,
  hash,
  { wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) {
  const delays = [2000, 3000, 5000];
  for (let attempt = 0; ; attempt++) {
    const receipt = await client.getTransactionReceipt({ hash }),
      tx = await client.getTransaction({ hash }),
      block = await client.getBlock({ blockNumber: receipt.blockNumber });
    const metadataLag =
      same(receipt.transactionHash, hash) &&
      same(tx.hash, hash) &&
      same(receipt.blockHash, block.hash) &&
      !same(tx.blockHash, block.hash);
    if (!metadataLag || attempt === delays.length)
      return { receipt, tx, block };
    await wait(delays[attempt]);
  }
}

export async function preflightDeployment(options) {
  const { client, owner, data, limits, now = Date.now } = options;
  await network(options);
  const nonce = await nonceAt(client, owner),
    address = getContractAddress({ from: owner, nonce: BigInt(nonce) }),
    block = await client.getBlock({ blockTag: "latest" });
  requireArc(
    now() / 1000 - Number(block.timestamp) <= 30 &&
      Number(block.timestamp) <= now() / 1000 + 5,
    "INVALID_PROOF",
    "Deployment preflight block is stale",
  );
  const [simulation, estimate, quotedFee, balance, occupied] =
    await Promise.all([
      client.call({ account: owner, data, value: 0n }),
      client.estimateGas({ account: owner, data, value: 0n }),
      client.getGasPrice(),
      client.getBalance({ address: owner }),
      client.getCode({ address }),
    ]);
  requireArc(
    simulation.data &&
      simulation.data !== "0x" &&
      (!occupied || occupied === "0x"),
    "INVALID_PROOF",
    "Creation simulation failed or predicted address already has code",
  );
  const gas = (estimate * 12n + 9n) / 10n,
    fee = [limits.minimumFee, block.baseFeePerGas || 0n, quotedFee].reduce(
      (a, b) => (a > b ? a : b),
    ),
    cost = gas * fee;
  requireArc(
    gas > 0n && fee <= limits.maximumFee && cost <= limits.maximumCost,
    "BUDGET_EXCEEDED",
    "Deployment exceeds its configured test-USDC ceiling; nothing signed",
  );
  requireArc(
    balance >= cost + limits.retained,
    "INSUFFICIENT_BALANCE",
    "Deployment would breach the retained USDC floor",
  );
  requireArc(
    same(
      (await client.getBlock({ blockNumber: block.number })).hash,
      block.hash,
    ) &&
      now() / 1000 - Number(block.timestamp) <= 30 &&
      (await nonceAt(client, owner)) === nonce,
    "INVALID_PROOF",
    "Deployment proof or nonce changed during preflight",
  );
  await network(options);
  return {
    nonce,
    address,
    gas,
    fee,
    cost,
    balance,
    blockNumber: block.number,
    blockHash: block.hash,
  };
}

export async function deployOnce(options) {
  const {
    client,
    owner,
    data,
    limits,
    dir,
    signTransaction,
    chainId = 5042002,
    killed = async () => false,
  } = options;
  const folder = path.join(dir, "arc-deployment"),
    file = path.join(folder, "journal.json");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const release = await acquireWorkerLock(folder);
  const identity = digest(
    JSON.stringify(
      json({
        chainId,
        owner: owner.toLowerCase(),
        dataHash: keccak256(data),
        limits,
      }),
    ),
  );
  let journal;
  async function reconcile() {
    await network(options);
    requireArc(
      journal.version === 1 && journal.identity === identity,
      "CONFLICT",
      "Deployment journal belongs to a different reviewed intent",
    );
    let receipt, tx, block;
    try {
      ({ receipt, tx, block } = await readDeploymentProof(
        client,
        journal.hash,
        { wait: options.wait },
      ));
    } catch {
      throw Object.assign(
        Error("Deployment unresolved; never resend or delete its journal"),
        { code: "UNRESOLVED" },
      );
    }
    const checks = {
      transactionHash: same(tx.hash, journal.hash),
      receiptHash: same(receipt.transactionHash, journal.hash),
      receiptBlock: same(receipt.blockHash, block.hash),
      transactionBlock: same(tx.blockHash, block.hash),
      chain: tx.chainId === chainId,
      sender: same(tx.from, owner),
      creation: tx.to === null,
      value: tx.value === 0n,
      nonce: tx.nonce === journal.nonce,
      calldata: same(tx.input, data),
      gas: tx.gas === BigInt(journal.gas),
      fee: tx.maxFeePerGas === BigInt(journal.fee),
      priority: tx.maxPriorityFeePerGas === 0n,
    };
    const failedChecks = Object.keys(checks).filter((name) => !checks[name]);
    if (failedChecks.length) {
      journal.lastProofFailure = { checks: failedChecks };
      await atomicJson(file, journal);
      throw Object.assign(
        Error("Deployment receipt differs from its admitted creation"),
        {
          code: "INVALID_PROOF",
          failedChecks,
        },
      );
    }
    const cost = receipt.gasUsed * receipt.effectiveGasPrice;
    requireArc(
      ["success", "reverted"].includes(receipt.status) &&
        receipt.gasUsed > 0n &&
        receipt.gasUsed <= BigInt(journal.gas) &&
        receipt.effectiveGasPrice >= 0n &&
        receipt.effectiveGasPrice <= BigInt(journal.fee) &&
        cost <= limits.maximumCost,
      "BUDGET_EXCEEDED",
      "Deployment receipt exceeds its admission",
    );
    journal.status = receipt.status;
    journal.costWei = String(cost);
    journal.blockNumber = String(receipt.blockNumber);
    delete journal.lastProofFailure;
    await atomicJson(file, journal);
    requireArc(
      receipt.status === "success",
      "REVERTED",
      "Deployment reverted; inspect it, never resend",
    );
    requireArc(
      same(receipt.contractAddress, journal.address),
      "INVALID_PROOF",
      "Unexpected created address",
    );
    return {
      hash: journal.hash,
      address: journal.address,
      blockNumber: journal.blockNumber,
      costWei: journal.costWei,
    };
  }
  try {
    journal = await readJson(file);
    if (journal) return { ...(await reconcile()), reconciled: true };
    requireArc(!(await killed()), "KILLED", "Deployment sending is stopped");
    const proof = await preflightDeployment(options);
    requireArc(!(await killed()), "KILLED", "Deployment sending is stopped");
    const request = {
      chainId,
      type: "eip1559",
      nonce: proof.nonce,
      data,
      value: 0n,
      gas: proof.gas,
      maxFeePerGas: proof.fee,
      maxPriorityFeePerGas: 0n,
    };
    const signed = await signTransaction(request),
      decoded = parseTransaction(signed);
    requireArc(
      decoded.type === "eip1559" &&
        decoded.chainId === chainId &&
        !decoded.to &&
        (decoded.value || 0n) === 0n &&
        decoded.nonce === proof.nonce &&
        decoded.gas === proof.gas &&
        decoded.maxFeePerGas === proof.fee &&
        (decoded.maxPriorityFeePerGas || 0n) === 0n &&
        same(decoded.data, data) &&
        same(
          await recoverTransactionAddress({ serializedTransaction: signed }),
          owner,
        ),
      "WRONG_SIGNATURE",
      "Signed creation differs from the reviewed admission",
    );
    journal = json({
      version: 1,
      identity,
      hash: keccak256(signed),
      address: proof.address,
      nonce: proof.nonce,
      gas: proof.gas,
      fee: proof.fee,
      status: "prepared",
      chainId,
      owner,
      dataHash: keccak256(data),
      admittedAtBlock: proof.blockNumber,
    });
    await atomicJson(file, journal); // Never persist signed bytes or keys.
    await network(options);
    requireArc(
      !(await killed()),
      "KILLED",
      "Deployment stopped after admission; inspect the journal",
    );
    requireArc(
      (await nonceAt(client, owner)) === proof.nonce,
      "NONCE_CONFLICT",
      "Deployer nonce moved after admission",
    );
    const hash = await client.sendRawTransaction({
      serializedTransaction: signed,
    });
    requireArc(
      same(hash, journal.hash),
      "INVALID_PROOF",
      "RPC returned another deployment hash",
    );
    await client.waitForTransactionReceipt({
      hash,
      timeout: 90000,
      pollingInterval: 1000,
      retryCount: 0,
    });
    return { ...(await reconcile()), reconciled: false };
  } finally {
    await release();
  }
}
