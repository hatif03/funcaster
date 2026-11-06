/**
 * Pre-submission check of the Create form against the deployed contract (public RPC reads only).
 *
 * It exists so stale configuration is caught before a wallet is asked to sign: wrong chain, no
 * contract at the configured address, an asset the contract does not allow, an id that is taken,
 * a funding deadline that already passed in chain time, and above all a canonical terms hash that
 * differs between this page and the contract.
 */

import { BaseError, type Hex, type PublicClient } from "viem";
import type { ChonksConfig } from "../config";
import { isRevertNamed } from "./pot";
import { conditionalPotAbi } from "./potAbi";
import { createReadClient } from "./reader";
import { toCreateArgs, type ValidTerms } from "./createForm";
import { readDeployment, finishRead } from "./chainGuard";
import { ReadError } from "./reader";

export type CheckCode =
  | "not-configured"
  | "wrong-chain"
  | "not-deployed"
  | "asset-not-allowed"
  | "pot-exists"
  | "deadline-passed"
  | "hash-mismatch"
  | "rpc";

export type CreateCheck =
  | { status: "ok"; forHash: Hex; chainTime: bigint; contractHash: Hex }
  | { status: "blocked"; code: CheckCode; message: string };

export async function preflightCreate(
  config: ChonksConfig,
  value: ValidTerms,
  deps: { client?: PublicClient; now?: () => number } = {},
): Promise<CreateCheck> {
  const contract = config.potAddress;
  if (!contract) {
    return {
      status: "blocked",
      code: "not-configured",
      message:
        "No ConditionalPot address is configured (VITE_CHONKS_POT_ADDRESS), so nothing can be created yet.",
    };
  }
  const client = deps.client ?? createReadClient(config);
  const { terms } = value;
  try {
    const chainId = await client.getChainId();
    if (chainId !== config.chainId) {
      return {
        status: "blocked",
        code: "wrong-chain",
        message: `The RPC reports chain ${chainId}, but this page only supports ${config.chainName} (${config.chainId}).`,
      };
    }
    const code = await client.getCode({ address: contract });
    if (!code || code === "0x") {
      return {
        status: "blocked",
        code: "not-deployed",
        message: `No contract code at ${contract} on ${config.chainName}.`,
      };
    }

    const block = await readDeployment(config, client, deps.now);
    const blockNumber = block.number;
    const allowed = await client.readContract({
      address: contract,
      abi: conditionalPotAbi,
      functionName: "isAllowedAsset",
      args: [terms.asset],
      blockNumber,
    });
    if (!allowed) {
      return {
        status: "blocked",
        code: "asset-not-allowed",
        message: `This contract does not allow ${value.assetLabel} (${terms.asset}). Its asset list is fixed at deployment.`,
      };
    }

    const [, params] = toCreateArgs(terms);
    const contractHash = await client.readContract({
      address: contract,
      abi: conditionalPotAbi,
      functionName: "hashTerms",
      args: [terms.potId, params],
      blockNumber,
    });
    if (contractHash.toLowerCase() !== value.termsHash.toLowerCase()) {
      return {
        status: "blocked",
        code: "hash-mismatch",
        message: `The contract computes a different terms hash (${contractHash}) than this page (${value.termsHash}). The page and the deployed contract disagree; do not sign anything.`,
      };
    }

    const exists = await client
      .readContract({
        address: contract,
        abi: conditionalPotAbi,
        functionName: "getPot",
        args: [terms.potId],
        blockNumber,
      })
      .then(
        () => true,
        (error: unknown) => {
          if (isRevertNamed(error, "UnknownPot")) return false;
          throw error;
        },
      );
    if (exists)
      return {
        status: "blocked",
        code: "pot-exists",
        message: "A pot with this id already exists. Generate a new id.",
      };

    if (terms.fundDeadline <= block.timestamp) {
      return {
        status: "blocked",
        code: "deadline-passed",
        message: `The funding deadline is not after the latest block time (${block.timestamp}). Choose a later deadline.`,
      };
    }
    await finishRead(client, block, deps.now);
    return {
      status: "ok",
      forHash: value.termsHash,
      chainTime: block.timestamp,
      contractHash,
    };
  } catch (error) {
    if (error instanceof ReadError)
      return {
        status: "blocked",
        code: error.kind === "wrong-chain" ? "wrong-chain" : "rpc",
        message: error.message,
      };
    const detail =
      error instanceof BaseError
        ? error.shortMessage
        : error instanceof Error
          ? error.message
          : "unknown error";
    return {
      status: "blocked",
      code: "rpc",
      message: `Could not read from the public RPC: ${detail}`,
    };
  }
}
