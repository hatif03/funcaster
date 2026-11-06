// Keyless Arc adapter. Importing or constructing it cannot sign or broadcast.
import { readFile } from "node:fs/promises";
import { decodeEventLog, keccak256, encodeAbiParameters } from "viem";
import { ASSET_ABI, verifyAsset } from "../arc/assets.mjs";
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
export const MARKET_ABI = JSON.parse(
  await readFile(
    new URL("./onchain/abi/ChonksMatchMarkets.json", import.meta.url),
    "utf8",
  ),
);
export function marketNonce({
  chainId = 5042002,
  contract,
  marketId,
  outcome,
  amount,
  minPayout,
  bettor,
  salt,
}) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint8" },
        { type: "uint128" },
        { type: "uint128" },
        { type: "address" },
        { type: "bytes32" },
      ],
      [
        BigInt(chainId),
        contract,
        BigInt(marketId),
        outcome,
        BigInt(amount),
        BigInt(minPayout),
        bettor,
        salt,
      ],
    ),
  );
}
export function createMarketChain({
  client,
  deployment,
  now = Date.now,
  localGuard,
  abi = MARKET_ABI,
  allowlistFunction = "allowedToken",
  snapshotFunction = "getMarket",
  claimFunction = "previewClaim",
  assetField = "token",
  verifierField = "verifierB",
  idKind = "uint256",
}) {
  if (
    ![5042002, 31337].includes(deployment.chainId) ||
    (deployment.chainId === 31337 && !localGuard) ||
    !/^0x[\da-f]{64}$/i.test(deployment.codeHash) ||
    !/^0x[\da-f]{40}$/i.test(deployment.contract) ||
    !deployment.assets?.length
  )
    throw Error("Explicit verified market deployment required");
  const call = (functionName, args, account) => ({
    address: deployment.contract,
    abi,
    functionName,
    args,
    account,
  });
  async function fresh() {
    if (localGuard) await localGuard();
    if ((await client.getChainId()) !== deployment.chainId)
      throw Error("Market chain changed");
    const block = await client.getBlock({ blockTag: "latest" });
    if (
      now() / 1000 - Number(block.timestamp) > 30 ||
      Number(block.timestamp) > now() / 1000 + 5
    )
      throw Error("Market block is stale");
    const code = await client.getCode({
      address: deployment.contract,
      blockNumber: block.number,
    });
    if (!code || !same(keccak256(code), deployment.codeHash))
      throw Error("Market bytecode pin changed");
    for (const asset of deployment.assets) {
      if (
        !(await client.readContract({
          ...call(allowlistFunction, [asset.address]),
          blockNumber: block.number,
        }))
      )
        throw Error("Market token allowlist mismatch");
      await verifyAsset(
        client,
        {
          ...asset,
          name: asset.symbol,
          version: "2",
          decimals: 6,
          chainId: deployment.chainId,
        },
        { now, block, localGuard },
      );
    }
    await canonical(block);
    return block;
  }
  async function canonical(block) {
    if (
      (await client.getChainId()) !== deployment.chainId ||
      !same(
        (await client.getBlock({ blockNumber: block.number })).hash,
        block.hash,
      ) ||
      now() / 1000 - Number(block.timestamp) > 30
    )
      throw Error("Market proof changed");
  }
  return {
    client,
    local: !!localGuard,
    deploymentConfig: deployment,
    call,
    deployment: fresh,
    async readMany(requests) {
      const block = await fresh();
      const values = await Promise.all(
        requests.map(([functionName, args]) =>
          client.readContract({
            ...call(functionName, args),
            blockNumber: block.number,
          }),
        ),
      );
      await canonical(block);
      return values;
    },
    async snapshot(id) {
      const block = await fresh(),
        m = await client.readContract({
          ...call(snapshotFunction, [idKind === "bytes32" ? id : BigInt(id)]),
          blockNumber: block.number,
        });
      if (
        !deployment.assets.some((a) => same(a.address, m.params[assetField])) ||
        same(m.params.reporterA, m.params[verifierField])
      )
        throw Error("Market terms are inconsistent");
      await canonical(block);
      return {
        ...m,
        chainTime: Number(block.timestamp),
        blockNumber: String(block.number),
        blockHash: block.hash,
        observedAt: now(),
        chainVerified: false,
      };
    },
    async claimable(id, address) {
      const block = await fresh(),
        amount = await client.readContract({
          ...call(claimFunction, [
            idKind === "bytes32" ? id : BigInt(id),
            address,
          ]),
          blockNumber: block.number,
        });
      await canonical(block);
      return amount;
    },
    async tokenAccount(asset, address) {
      const block = await fresh();
      if (!deployment.assets.some((a) => same(a.address, asset)))
        throw Error("Unknown market token");
      const read = (functionName) =>
        client.readContract({
          address: asset,
          abi: ASSET_ABI,
          functionName,
          args: [address],
          blockNumber: block.number,
        });
      const [balance, blocked] = await Promise.all([
        read("balanceOf"),
        read("isBlacklisted"),
      ]);
      await canonical(block);
      return { balance, blocked, chainTime: Number(block.timestamp) };
    },
    async receipt(hash) {
      const r = await client.getTransactionReceipt({ hash });
      if (
        r.status !== "success" ||
        !same(r.transactionHash, hash) ||
        !same(
          (await client.getBlock({ blockNumber: r.blockNumber })).hash,
          r.blockHash,
        )
      )
        throw Error("Market receipt is not canonical success");
      return {
        ...r,
        events: r.logs
          .filter((l) => same(l.address, deployment.contract))
          .flatMap((l) => {
            try {
              return [
                decodeEventLog({
                  abi,
                  data: l.data,
                  topics: l.topics,
                  strict: true,
                }),
              ];
            } catch {
              return [];
            }
          }),
      };
    },
  };
}
