import { readFile } from "node:fs/promises";
import { createMarketChain } from "./chain.mjs";
export const CHEER_ABI = JSON.parse(
  await readFile(
    new URL("./onchain/abi/SplitPayout.json", import.meta.url),
    "utf8",
  ),
);
export function createCheerChain(options) {
  const chain = createMarketChain({
    ...options,
    abi: CHEER_ABI,
    allowlistFunction: "allowedAsset",
    snapshotFunction: "getTable",
    claimFunction: "previewPayout",
    assetField: "asset",
    verifierField: "reporterB",
    idKind: "bytes32",
  });
  return {
    ...chain,
    async refundable(id, address) {
      const [amount, refunded] = await chain.readMany([
        ["cheerOf", [id, address]],
        ["refunded", [id, address]],
      ]);
      return refunded ? 0n : amount;
    },
  };
}
