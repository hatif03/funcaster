import type { Hex, PublicClient } from "viem";
import { ARC_TESTNET_CHAIN_ID, type ChonksConfig } from "../config";
import { conditionalPotAbi } from "./potAbi";
import { ReadError } from "./reader";

export interface FreshBlock {
  number: bigint;
  hash: Hex;
  timestamp: bigint;
  baseFeePerGas?: bigint | null;
}

export function assertFreshBlock(block: FreshBlock, now = Date.now): void {
  const age = now() / 1000 - Number(block.timestamp);
  if (
    typeof block.number !== "bigint" ||
    !/^0x[\da-f]{64}$/i.test(block.hash ?? "") ||
    !Number.isFinite(age) ||
    age > 30 ||
    age < -5
  ) {
    throw new ReadError(
      "rpc",
      "The RPC returned stale or incomplete data. Refresh before continuing.",
    );
  }
}

/** Reads only. Every value belongs to one fresh block on the configured testnet. */
export async function readDeployment(
  config: ChonksConfig,
  client: PublicClient,
  now = Date.now,
): Promise<FreshBlock> {
  if (
    config.chainId !== ARC_TESTNET_CHAIN_ID ||
    (await client.getChainId()) !== ARC_TESTNET_CHAIN_ID
  ) {
    throw new ReadError(
      "wrong-chain",
      "This console only supports Arc Testnet (5042002).",
    );
  }
  if (!config.potAddress)
    throw new ReadError(
      "config",
      "This demo is not connected to a deployed pot yet.",
    );
  const block = await client.getBlock({ blockTag: "latest" });
  assertFreshBlock(block, now);
  const code = await client.getCode({
    address: config.potAddress,
    blockNumber: block.number,
  });
  if (!code || code === "0x")
    throw new ReadError(
      "not-deployed",
      "No pot contract is deployed at the configured address.",
    );
  const domain = await client.readContract({
    address: config.potAddress,
    abi: conditionalPotAbi,
    functionName: "eip712Domain",
    blockNumber: block.number,
  });
  if (
    domain[0] !== "0x0f" ||
    domain[1] !== "ChonksPot" ||
    domain[2] !== "1" ||
    domain[3] !== BigInt(ARC_TESTNET_CHAIN_ID) ||
    domain[4].toLowerCase() !== config.potAddress.toLowerCase() ||
    domain[6].length !== 0
  ) {
    throw new ReadError(
      "config",
      "The configured contract has a different signing domain. No wallet action is allowed.",
    );
  }
  return block;
}

export async function finishRead(
  client: PublicClient,
  block: FreshBlock,
  now = Date.now,
): Promise<void> {
  const canonical = await client.getBlock({ blockNumber: block.number });
  if (
    canonical.hash !== block.hash ||
    canonical.timestamp !== block.timestamp ||
    (await client.getChainId()) !== ARC_TESTNET_CHAIN_ID
  ) {
    throw new ReadError(
      "rpc",
      "The chain changed while reading. Refresh before continuing.",
    );
  }
  assertFreshBlock(block, now);
}
