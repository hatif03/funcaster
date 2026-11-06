// Unsigned deployment description only. No client, wallet or key is imported.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { encodeDeployData, keccak256, getAddress } from "viem";
import { USDC } from "./signatures.mjs";
const sourceUrl = new URL(
  "./studio/contracts/RevenueRouter.sol",
  import.meta.url,
);
const artifactUrl = new URL("./RevenueRouter.artifact.json", import.meta.url);
export function prepareCommerceDeployment({ operator, platform }) {
  const artifact = JSON.parse(fs.readFileSync(artifactUrl, "utf8"));
  const sourceSha256 = createHash("sha256")
    .update(fs.readFileSync(sourceUrl))
    .digest("hex");
  if (
    sourceSha256 !== artifact.sourceSha256 ||
    sourceSha256 !==
      "527ea3af2d1482183255fa173f6f97a55560bb7b929ff1de9b1bab16ceb5c949"
  )
    throw Error("COMMERCE_SOURCE_MISMATCH");
  const args = [USDC, getAddress(platform), getAddress(operator)];
  if (args.slice(1).some((v) => /^0x0{40}$/.test(v)))
    throw Error("COMMERCE_ZERO_ROLE");
  const data = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args,
  });
  return {
    contractName: "RevenueRouter",
    chainId: 5042002,
    value: 0n,
    to: null,
    data,
    constructorArgs: args,
    sourceSha256,
    creationHash: keccak256(data),
    artifactBytecodeHash: artifact.creationBytecodeHash,
    abi: artifact.abi,
    expectedRuntimeTemplate: artifact.deployedBytecode,
    immutableReferences: artifact.immutableReferences,
    publicConfig: { asset: USDC, platform: args[1], operator: args[2] },
    recommendedGasBudgetUsdc: "0.12",
    compiler: artifact.compiler,
    settings: artifact.settings,
    studioApp: artifact.studioApp,
  };
}
