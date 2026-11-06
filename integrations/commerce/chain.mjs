// Explicit, injected Arc port. Importing this module never reads keys, starts a
// signer, activates a worker, or submits a transaction. Reuse createArcTransactions
// when an owner activates this port after deployment verification.
import { isDeepStrictEqual } from "node:util";
import {
  parseAbi,
  keccak256,
  encodeFunctionData,
  verifyTypedData,
  parseSignature,
  hashDomain,
  decodeEventLog,
  ContractFunctionRevertedError,
  toFunctionSelector,
} from "viem";
import { ASSET_ABI, verifyAsset } from "../arc/assets.mjs";
import {
  USDC,
  commerceDomain,
  passTypes,
  claimTypes,
  receiveTypes,
  commerceId,
} from "./signatures.mjs";
import { validateCommerceJob, json } from "./jobs.mjs";
const same = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.toLowerCase() === b.toLowerCase();
const stable = (value) =>
  JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
const canonicalLogs = (logs) =>
  logs.map((log) => ({
    address: log.address.toLowerCase(),
    topics: log.topics.map((t) => t.toLowerCase()),
    data: log.data.toLowerCase(),
    index: log.logIndex,
    transactionHash: log.transactionHash?.toLowerCase(),
    blockHash: log.blockHash?.toLowerCase(),
  }));
const requireValue = (ok, code) => {
  if (!ok) throw Object.assign(Error(code), { code });
};
const zero = "0x0000000000000000000000000000000000000000";
export const ROUTER_ABI = parseAbi([
  "function token() view returns (address)",
  "function platform() view returns (address)",
  "function operator() view returns (address)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function credit(address) view returns (uint256)",
  "function lifetimeGross(address) view returns (uint256)",
  "function claimNonces(address) view returns (uint256)",
  "function paymentUsed(bytes32) view returns (bool)",
  "function passExpiry(bytes32,bytes32,address) view returns (uint64)",
  "function getVersion(bytes32) view returns ((address creator,uint256 price,address venue,address referral,uint16 referralBps,uint16 creatorWeightBps,(address account,uint16 weightBps)[] collaborators,bool exists))",
  "function registerVersion(bytes32,address,uint256,address,address,uint16,uint16,(address account,uint16 weightBps)[])",
  "function pay((bytes32 paymentId,bytes32 versionId,address payer,bytes32 roomHash,bool attribution,bool referred,bool atVenue,uint256 validAfter,uint256 validBefore),bytes,uint8,bytes32,bytes32)",
  "function claim(address,uint256,bytes)",
  "event PassPaid(bytes32 indexed paymentId,bytes32 indexed versionId,address indexed payer,bytes32 roomHash,uint256 amount)",
  "event Claimed(address indexed recipient,uint256 amount,uint256 nonce)",
  "event Credited(bytes32 indexed paymentId,address indexed recipient,uint256 amount)",
]);
const VERSION_ABI = [...ROUTER_ABI, ...parseAbi(["error UnknownVersion()"])];
const unknownVersionSelector = toFunctionSelector("UnknownVersion()");

export async function createCommerceChain({
  clients,
  deployment,
  transactions,
  now = Date.now,
}) {
  requireValue(
    Array.isArray(clients) && clients.length === 2,
    "TWO_RPC_HOSTS_REQUIRED",
  );
  requireValue(
    deployment?.chainId === 5042002 &&
      /^0x[\da-f]{64}$/i.test(deployment.runtimeHash || "") &&
      Number.isSafeInteger(deployment.blockNumber) &&
      deployment.blockNumber > 0,
    "VERIFIED_DEPLOYMENT_REQUIRED",
  );
  const domain = commerceDomain({
    chainId: 5042002,
    contract: deployment.address,
  });
  let snapshotCache = null,
    snapshotAt = 0,
    snapshotPending = null;
  async function snapshot({ fresh = false } = {}) {
    if (
      !fresh &&
      snapshotCache &&
      now() - snapshotAt < 5000 &&
      now() / 1000 - Number(snapshotCache.block.timestamp) < 30
    )
      return snapshotCache;
    if (snapshotPending) return snapshotPending;
    snapshotPending = fetchSnapshot()
      .then((value) => {
        snapshotCache = value;
        snapshotAt = now();
        return value;
      })
      .finally(() => {
        snapshotPending = null;
      });
    return snapshotPending;
  }
  async function fetchSnapshot() {
    const chainIds = await Promise.all(clients.map((c) => c.getChainId()));
    requireValue(
      chainIds.every((id) => id === 5042002),
      "WRONG_CHAIN",
    );
    const heights = await Promise.all(clients.map((c) => c.getBlockNumber())),
      height = heights.reduce((a, b) => (a < b ? a : b));
    const blocks = await Promise.all(
      clients.map((c) => c.getBlock({ blockNumber: height })),
    );
    requireValue(
      blocks[0].hash === blocks[1].hash &&
        height >= BigInt(deployment.blockNumber) &&
        now() / 1000 - Number(blocks[0].timestamp) <= 30 &&
        Number(blocks[0].timestamp) <= now() / 1000 + 5,
      "STALE_OR_DIFFERENT_BLOCK",
    );
    for (const client of clients) {
      const code = await client.getCode({
        address: deployment.address,
        blockNumber: height,
      });
      requireValue(
        code && code !== "0x" && same(keccak256(code), deployment.runtimeHash),
        "ROUTER_CODE_MISMATCH",
      );
      await verifyAsset(
        client,
        {
          address: USDC,
          chainId: 5042002,
          name: "USDC",
          version: "2",
          decimals: 6,
        },
        { now, block: blocks[0] },
      );
    }
    const readCache = new Map();
    const read = (functionName, args = []) => {
      const key = stable({ functionName, args });
      if (readCache.has(key)) return readCache.get(key);
      const result = readUncached(functionName, args).catch((error) => {
        readCache.delete(key);
        throw error;
      });
      readCache.set(key, result);
      return result;
    };
    const readUncached = async (functionName, args = []) => {
      const results = await Promise.all(
        clients.map((c) =>
          c.readContract({
            address: deployment.address,
            abi: ROUTER_ABI,
            functionName,
            args,
            blockNumber: height,
          }),
        ),
      );
      requireValue(
        stable(results[0]) === stable(results[1]),
        "RPC_READ_MISMATCH",
      );
      return results[0];
    };
    const [token, operator, platform, separator] = await Promise.all([
      read("token"),
      read("operator"),
      read("platform"),
      read("DOMAIN_SEPARATOR"),
    ]);
    requireValue(
      same(token, USDC) &&
        same(operator, deployment.operator) &&
        same(platform, deployment.platform),
      "ROUTER_CONFIGURATION_MISMATCH",
    );
    requireValue(
      same(
        separator,
        hashDomain({
          domain,
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
          },
        }),
      ),
      "DOMAIN_MISMATCH",
    );
    // A missing version reverts on this contract. Prove absence independently
    // on both pinned hosts; transport failures and arbitrary reverts are not absence.
    const versionExists = async (versionId) => {
      const results = await Promise.allSettled(
        clients.map(async (client) => {
          try {
            const value = await client.readContract({
              address: deployment.address,
              abi: VERSION_ABI,
              functionName: "getVersion",
              args: [versionId],
              blockNumber: height,
            });
            requireValue(value?.exists === true, "INVALID_VERSION_PROOF");
            return true;
          } catch (error) {
            const revert = error?.walk?.(
              (cause) => cause instanceof ContractFunctionRevertedError,
            );
            if (
              revert instanceof ContractFunctionRevertedError &&
              revert.data?.errorName === "UnknownVersion" &&
              revert.raw === unknownVersionSelector
            )
              return false;
            throw error;
          }
        }),
      );
      for (const result of results)
        if (result.status === "rejected") throw result.reason;
      requireValue(results[0].value === results[1].value, "RPC_READ_MISMATCH");
      return results[0].value;
    };
    return { read, versionExists, height, block: blocks[0] };
  }
  function callFor(job) {
    const p = validateCommerceJob(job),
      action = job.type.split(".")[1];
    let args;
    if (action === "register") {
      const v = p.version,
        creator = v.recipients.find((r) => same(r.address, v.creator));
      requireValue(same(v.platform, deployment.platform), "PLATFORM_MISMATCH");
      args = [
        "0x" + v.id,
        v.creator,
        BigInt(v.price),
        v.venue || zero,
        v.referral || zero,
        v.referralBps,
        creator.bps,
        v.recipients
          .filter((r) => !same(r.address, v.creator))
          .map((r) => ({ account: r.address, weightBps: r.bps })),
      ];
    } else if (action === "pay") {
      const request = {
          ...p.request,
          validAfter: BigInt(p.request.validAfter),
          validBefore: BigInt(p.request.validBefore),
        },
        sig = parseSignature(p.authorizationSignature);
      args = [
        request,
        p.permitSignature,
        Number(sig.v ?? BigInt(sig.yParity) + 27n),
        sig.r,
        sig.s,
      ];
    } else args = [p.recipient, BigInt(p.deadline), p.signature];
    return {
      address: deployment.address,
      abi: ROUTER_ABI,
      functionName: action === "register" ? "registerVersion" : action,
      args,
      account: deployment.operator,
    };
  }
  async function verifyReceipt(job, txHash) {
    const call = callFor(job),
      expected = encodeFunctionData(call),
      p = job.payload;
    let canonical;
    for (const client of clients) {
      requireValue((await client.getChainId()) === 5042002, "WRONG_CHAIN");
      const receipt = await client.getTransactionReceipt({ hash: txHash }),
        tx = await client.getTransaction({ hash: txHash }),
        block = await client.getBlock({ blockNumber: receipt.blockNumber });
      requireValue(
        receipt.status === "success" &&
          receipt.blockHash === block.hash &&
          tx.blockHash === block.hash &&
          same(receipt.transactionHash, txHash) &&
          same(tx.hash, txHash) &&
          tx.chainId === 5042002 &&
          same(tx.to, deployment.address) &&
          same(tx.from, deployment.operator) &&
          same(tx.input, expected) &&
          tx.value === 0n,
        "RECEIPT_MISMATCH",
      );
      if (canonical)
        requireValue(
          canonical.blockHash === receipt.blockHash &&
            stable(canonicalLogs(canonical.logs)) ===
              stable(canonicalLogs(receipt.logs)),
          "RPC_RECEIPT_MISMATCH",
        );
      else canonical = receipt;
    }
    const fresh = await snapshot({
        fresh: !snapshotCache || snapshotCache.height < canonical.blockNumber,
      }),
      events = [];
    for (const log of canonical.logs) {
      if (!same(log.address, deployment.address)) continue;
      try {
        events.push(
          decodeEventLog({
            abi: ROUTER_ABI,
            data: log.data,
            topics: log.topics,
          }),
        );
      } catch {}
    }
    const data = {
      blockNumber: String(canonical.blockNumber),
      blockHash: canonical.blockHash,
      asset: "USDC",
    };
    if (job.type === "commerce.register") {
      const actual = await fresh.read("getVersion", ["0x" + p.version.id]);
      requireValue(
        actual.exists &&
          same(actual.creator, p.version.creator) &&
          actual.price === BigInt(p.version.price),
        "REGISTRATION_NOT_CONFIRMED",
      );
      data.versionId = p.version.id;
    } else if (job.type === "commerce.pay") {
      const e = events.find(
        (e) =>
          e.eventName === "PassPaid" &&
          same(e.args.paymentId, p.request.paymentId),
      );
      requireValue(
        e &&
          same(e.args.versionId, p.request.versionId) &&
          same(e.args.payer, p.actor) &&
          same(e.args.roomHash, p.request.roomHash) &&
          e.args.amount === BigInt(p.price) &&
          (await fresh.read("paymentUsed", [p.request.paymentId])),
        "PAYMENT_NOT_CONFIRMED",
      );
      const credits = {};
      for (const event of events.filter(
        (e) =>
          e.eventName === "Credited" &&
          same(e.args.paymentId, p.request.paymentId),
      )) {
        const who = event.args.recipient.toLowerCase();
        credits[who] = String(BigInt(credits[who] || 0) + event.args.amount);
      }
      requireValue(
        Object.values(credits).reduce((n, v) => n + BigInt(v), 0n) ===
          e.args.amount,
        "CREDIT_PROOF_MISMATCH",
      );
      Object.assign(data, {
        versionId: p.request.versionId.slice(2),
        roomCode: p.roomCode,
        buyer: p.actor,
        amount: String(e.args.amount),
        credits,
        expiresAt:
          Number(
            await fresh.read("passExpiry", [
              p.request.versionId,
              p.request.roomHash,
              p.actor,
            ]),
          ) * 1000,
      });
    } else {
      const e = events.find(
        (e) =>
          e.eventName === "Claimed" &&
          same(e.args.recipient, p.recipient) &&
          e.args.nonce === BigInt(p.nonce),
      );
      requireValue(
        e &&
          e.args.amount > 0n &&
          (await fresh.read("claimNonces", [p.recipient])) > BigInt(p.nonce),
        "CLAIM_NOT_CONFIRMED",
      );
      Object.assign(data, {
        recipient: p.recipient,
        amount: String(e.args.amount),
        nonce: p.nonce,
      });
    }
    return {
      tx: txHash,
      explorer: `https://explorer.testnet.arc.io/tx/${txHash}`,
      mock: false,
      data,
    };
  }
  async function reconcile(job, jobId) {
    callFor(job);
    requireValue(
      transactions && typeof transactions.receipts === "function",
      "OWNER_WORKER_REQUIRED",
    );
    const saved = (await transactions.receipts({ prefix: jobId })).find(
      (r) => r.id === jobId,
    );
    if (!saved) return null;
    requireValue(saved.status === "success", "RECORDED_TRANSACTION_FAILED");
    return verifyReceipt(job, saved.hash);
  }
  async function execute(job, jobId) {
    requireValue(
      transactions && typeof transactions.transact === "function",
      "OWNER_WORKER_REQUIRED",
    );
    // Reconcile admission before clock, balance and nonce checks. A paid operation
    // remains recoverable after its original authorization window closes.
    const prior = await reconcile(job, jobId);
    if (prior) return prior;
    const call = callFor(job),
      p = job.payload,
      s = await snapshot({ fresh: true });
    if (job.type === "commerce.pay") {
      const r = call.args[0],
        v = await s.read("getVersion", [r.versionId]);
      requireValue(
        v.exists &&
          v.price === BigInt(p.price) &&
          r.validAfter <= s.block.timestamp &&
          r.validBefore > s.block.timestamp &&
          r.validBefore - r.validAfter <= 301n,
        "INVALID_PAYMENT_WINDOW",
      );
      requireValue(
        same(r.roomHash, commerceId(p.roomCode)) &&
          !(r.attribution && r.referred) &&
          (!r.referred || !same(v.referral, zero)) &&
          (!r.atVenue || !same(v.venue, zero)),
        "INVALID_ATTRIBUTION",
      );
      requireValue(
        await verifyTypedData({
          domain,
          primaryType: "PassPermit",
          types: passTypes,
          message: r,
          address: p.actor,
          signature: p.permitSignature,
        }),
        "INVALID_PASS_SIGNATURE",
      );
      const authorization = {
        from: p.actor,
        to: deployment.address,
        value: v.price,
        validAfter: r.validAfter,
        validBefore: r.validBefore,
        nonce: r.paymentId,
      };
      requireValue(
        await verifyTypedData({
          domain: {
            name: "USDC",
            version: "2",
            chainId: 5042002,
            verifyingContract: USDC,
          },
          primaryType: "ReceiveWithAuthorization",
          types: receiveTypes,
          message: authorization,
          address: p.actor,
          signature: p.authorizationSignature,
        }),
        "INVALID_PAYMENT_SIGNATURE",
      );
      for (const client of clients) {
        const balance = await client.readContract({
          address: USDC,
          abi: ASSET_ABI,
          functionName: "balanceOf",
          args: [p.actor],
          blockNumber: s.height,
        });
        requireValue(balance - v.price >= 50000n, "DRAIN_FLOOR");
      }
    } else if (job.type === "commerce.claim") {
      const nonce = BigInt(p.nonce),
        deadline = BigInt(p.deadline);
      requireValue(
        (await s.read("claimNonces", [p.recipient])) === nonce &&
          deadline > s.block.timestamp &&
          deadline <= s.block.timestamp + 300n,
        "INVALID_CLAIM_WINDOW",
      );
      requireValue(
        await verifyTypedData({
          domain,
          primaryType: "ClaimPermit",
          types: claimTypes,
          message: { recipient: p.recipient, nonce, deadline },
          address: p.actor,
          signature: p.signature,
        }),
        "INVALID_CLAIM_SIGNATURE",
      );
    }
    const sent = await transactions.transact(jobId, call);
    return verifyReceipt(job, sent.tx);
  }
  await snapshot();
  return {
    snapshot,
    reconcile,
    execute,
    verifyReceipt,
    async paymentContext({ version, payer }) {
      const s = await snapshot(),
        v = await s.read("getVersion", ["0x" + version.id]);
      const expected = version.recipients.find((p) =>
        same(p.address, version.creator),
      );
      requireValue(
        v.exists &&
          same(v.creator, version.creator) &&
          v.price === BigInt(version.price) &&
          same(v.venue, version.venue || zero) &&
          same(v.referral, version.referral || zero) &&
          Number(v.referralBps) === version.referralBps &&
          Number(v.creatorWeightBps) === expected.bps &&
          isDeepStrictEqual(
            v.collaborators.map((p) => ({
              address: p.account.toLowerCase(),
              bps: Number(p.weightBps),
            })),
            version.recipients.filter((p) => !same(p.address, version.creator)),
          ),
        "VERSION_TERMS_MISMATCH",
      );
      const balances = await Promise.all(
        clients.map((c) =>
          c.readContract({
            address: USDC,
            abi: ASSET_ABI,
            functionName: "balanceOf",
            args: [payer],
            blockNumber: s.height,
          }),
        ),
      );
      requireValue(balances[0] === balances[1], "RPC_READ_MISMATCH");
      return {
        chainTime: String(s.block.timestamp),
        balance: String(balances[0]),
        block: String(s.height),
      };
    },
    async earnings(recipient) {
      const s = await snapshot();
      return {
        credit: String(await s.read("credit", [recipient])),
        nonce: String(await s.read("claimNonces", [recipient])),
        lifetimeGross: String(await s.read("lifetimeGross", [recipient])),
        block: String(s.height),
        chainTime: String(s.block.timestamp),
        mode: "on",
      };
    },
    async access({ versionId, roomCode, buyer }) {
      const s = await snapshot(),
        expiry = await s.read("passExpiry", [
          versionId,
          commerceId(roomCode),
          buyer,
        ]);
      return {
        allowed: BigInt(expiry) > s.block.timestamp,
        expiresAt: Number(expiry) * 1000,
        kind: "pass",
        mode: "on",
      };
    },
  };
}
