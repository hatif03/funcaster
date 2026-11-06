import { readFile } from "node:fs/promises";
import { decodeEventLog, zeroAddress } from "viem";
import { setTimeout as delay } from "node:timers/promises";
import { createPotReader } from "./reads.mjs";
import { ASSET_ABI, verifyAsset } from "./assets.mjs";
import { same, requireArc } from "./jobs.mjs";

export const POT_ABI = JSON.parse(
  await readFile(
    new URL("./onchain/abi/ConditionalPot.abi.json", import.meta.url),
    "utf8",
  ),
);
const rangeError = (error) => {
  for (let e = error, n = 0; e && n < 10; e = e.cause, n++)
    if (e.code === -32014) return true;
  return false;
};
export async function readArcLogs(
  client,
  query,
  { retries = 3, wait = delay } = {},
) {
  requireArc(
    typeof query.fromBlock === "bigint" &&
      typeof query.toBlock === "bigint" &&
      query.fromBlock >= 0n &&
      query.toBlock >= query.fromBlock,
    "INVALID_JOB",
    "Bounded log range required",
  );
  const rows = [];
  for (let fromBlock = query.fromBlock; fromBlock <= query.toBlock;) {
    let width = query.toBlock - fromBlock + 1n;
    if (width > 9999n) width = 9999n;
    let answer;
    for (let attempt = 0; ; attempt++) {
      try {
        answer = await client.getLogs({
          ...query,
          fromBlock,
          toBlock: fromBlock + width - 1n,
          strict: true,
        });
        break;
      } catch (error) {
        if (!rangeError(error) || attempt >= retries) throw error;
        if (width > 1n) width = (width + 1n) / 2n;
        await wait(100 * 2 ** attempt);
      }
    }
    requireArc(
      answer.every(
        (l) =>
          !l.removed &&
          l.blockNumber >= fromBlock &&
          l.blockNumber < fromBlock + width &&
          same(l.address, query.address),
      ),
      "INVALID_PROOF",
      "Log outside admitted range or emitter",
    );
    rows.push(...answer);
    fromBlock += width;
  }
  return rows.sort((a, b) =>
    a.blockNumber < b.blockNumber
      ? -1
      : a.blockNumber > b.blockNumber
        ? 1
        : Number(a.logIndex) - Number(b.logIndex),
  );
}

export function createArcChain({
  client,
  deployment,
  now = Date.now,
  localGuard,
}) {
  const reader = createPotReader({
    client,
    abi: POT_ABI,
    config: { ...deployment, assets: deployment.assets.map((a) => a.address) },
    now,
    localGuard,
  });
  const assetFor = (value) => {
    const asset = deployment.assets.find(
      (a) => a.symbol.toLowerCase() === value || same(a.address, value),
    );
    requireArc(asset, "INVALID_JOB", "Asset is not in the verified registry");
    return {
      ...asset,
      chainId: deployment.chainId,
      name: asset.symbol,
      version: "2",
      decimals: 6,
    };
  };
  const verifiedDeployments = new WeakSet();
  async function deploymentSnapshot() {
    const proof = await reader.deployment();
    verifiedDeployments.add(proof);
    return proof;
  }
  async function tokenSnapshot(value, addresses = [], deploymentProof) {
    // A preflight may share its exact verified block across token proofs.
    // Never accept an arbitrary caller-supplied block or reuse proofs from a
    // different chain reader. Asset verification and finish retain freshness
    // and canonical checks; ordinary calls always obtain a new deployment.
    if (deploymentProof)
      requireArc(
        verifiedDeployments.has(deploymentProof),
        "INVALID_PROOF",
        "Unknown deployment snapshot",
      );
    const asset = assetFor(value),
      { block } = deploymentProof || (await deploymentSnapshot());
    await verifyAsset(client, asset, { now, block, localGuard });
    const read = (functionName, args) =>
      client.readContract({
        address: asset.address,
        abi: ASSET_ABI,
        functionName,
        args,
        blockNumber: block.number,
      });
    const accounts = await Promise.all(
      addresses.map(async (address) => ({
        address,
        balance: await read("balanceOf", [address]),
        blocked: await read("isBlacklisted", [address]),
      })),
    );
    await reader.finish(block);
    return {
      asset,
      block,
      accounts,
      read,
      mode: "on",
      chainId: deployment.chainId,
      blockNumber: String(block.number),
      blockHash: block.hash,
      chainTime: Number(block.timestamp),
      observedAt: now(),
      chainVerified: false,
    };
  }
  async function events(potId, eventName, fromBlock, toBlock) {
    const rows = await readArcLogs(client, {
      address: deployment.contract,
      event: POT_ABI.find((x) => x.type === "event" && x.name === eventName),
      args: { potId },
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock),
    });
    for (const row of rows) {
      requireArc(
        same(row.args.potId, potId) &&
          same(
            (await client.getBlock({ blockNumber: row.blockNumber })).hash,
            row.blockHash,
          ),
        "INVALID_PROOF",
        "Noncanonical pot event",
      );
    }
    return rows;
  }
  async function receipt(hash) {
    const r = await client.getTransactionReceipt({ hash });
    requireArc(
      same(r.transactionHash, hash) &&
        same(
          (await client.getBlock({ blockNumber: r.blockNumber })).hash,
          r.blockHash,
        ),
      "INVALID_PROOF",
      "Receipt is not canonical",
    );
    return {
      ...r,
      events: r.logs
        .filter((l) => same(l.address, deployment.contract))
        .flatMap((l) => {
          try {
            return [
              {
                ...decodeEventLog({
                  abi: POT_ABI,
                  data: l.data,
                  topics: l.topics,
                  strict: true,
                }),
                logIndex: l.logIndex,
              },
            ];
          } catch {
            return [];
          }
        }),
    };
  }
  return {
    ...reader,
    deployment: deploymentSnapshot,
    client,
    deploymentConfig: deployment,
    assetFor,
    tokenSnapshot,
    events,
    receipt,
    call(functionName, args, account) {
      return {
        address: deployment.contract,
        abi: POT_ABI,
        functionName,
        args,
        account,
      };
    },
    tokenCall(asset, functionName, args, account) {
      return {
        address: assetFor(asset).address,
        abi: ASSET_ABI,
        functionName,
        args,
        account,
        ...(assetFor(asset).symbol === "USDC" && functionName === "transfer"
          ? { nativeDebitWei: args[1] * 10n ** 12n }
          : {}),
      };
    },
    async verify(data, address, signature, blockNumber) {
      if (deployment.chainId === 31337) await localGuard();
      return client.verifyTypedData({
        ...data,
        domain: { ...data.domain, chainId: deployment.chainId },
        address,
        signature,
        blockNumber: BigInt(blockNumber),
      });
    },
    async simulateCreate(potId, terms, account) {
      requireArc(
        !same(account, zeroAddress),
        "INVALID_CONFIG",
        "Relayer address required",
      );
      return client.simulateContract(
        this.call("create", [potId, terms], account),
      );
    },
  };
}
