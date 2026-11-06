import { createPublicClient, erc20Abi, http, type PublicClient } from "viem";
import { USDC_DECIMALS, isValidAddress } from "./format";
import { ARC_TESTNET_CHAIN_ID, type ChonksConfig } from "../config";

export interface ChainSnapshot {
  chainId: number;
  /** Block that the balance and decimals() reads are pinned to. */
  blockNumber: bigint;
  /** USDC ERC-20 balance of the relayer at `blockNumber`, in 6-decimal base units. */
  usdcBalance: bigint;
  /** decimals() reported by the token at `blockNumber` (always 6 on success). */
  decimals: number;
  checkedAt: number;
}

export type ReadErrorKind =
  "wrong-chain" | "rpc" | "config" | "decimals" | "not-found" | "not-deployed";

export class ReadError extends Error {
  readonly kind: ReadErrorKind;
  readonly observedChainId?: number;

  constructor(kind: ReadErrorKind, message: string, observedChainId?: number) {
    super(message);
    this.name = "ReadError";
    this.kind = kind;
    this.observedChainId = observedChainId;
  }
}

/** Public, read-only client. No account, no wallet transport. */
export function createReadClient(config: ChonksConfig): PublicClient {
  return createPublicClient({
    transport: http(config.rpcUrl, { timeout: 10_000, retryCount: 1 }),
  });
}

/** Throws a wrong-chain ReadError unless the observed chain matches. */
export function assertExpectedChain(
  observed: number,
  expected: number,
  chainName: string,
): void {
  if (observed !== expected) {
    throw new ReadError(
      "wrong-chain",
      `Wrong chain: the RPC reports chain ${observed}, but this page only reads ${chainName} (${expected}).`,
      observed,
    );
  }
}

export interface ReadDeps {
  client?: PublicClient;
  now?: () => number;
}

/**
 * Read from the public RPC: chain ID (checked first, so nothing is read from a
 * wrong chain), then the block number, then the token's decimals() and the
 * relayer's balanceOf() both pinned to that same block. A token that does not
 * report six decimals is rejected, never displayed.
 */
export async function readSnapshot(
  config: ChonksConfig,
  deps: ReadDeps = {},
): Promise<ChainSnapshot> {
  const configuredChainId: number = config.chainId;
  if (configuredChainId !== ARC_TESTNET_CHAIN_ID) {
    throw new ReadError(
      "config",
      `This console only supports Arc Testnet (${ARC_TESTNET_CHAIN_ID}).`,
    );
  }
  if (
    !isValidAddress(config.relayerAddress) ||
    !isValidAddress(config.usdcAddress)
  ) {
    throw new ReadError(
      "config",
      "Configured relayer or USDC address is not a valid EVM address.",
    );
  }

  const client = deps.client ?? createReadClient(config);
  const now = deps.now ?? Date.now;

  try {
    const chainId = await client.getChainId();
    assertExpectedChain(chainId, config.chainId, config.chainName);

    const blockNumber = await client.getBlockNumber();

    const [decimals, usdcBalance] = await Promise.all([
      client.readContract({
        address: config.usdcAddress,
        abi: erc20Abi,
        functionName: "decimals",
        blockNumber,
      }),
      client.readContract({
        address: config.usdcAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [config.relayerAddress],
        blockNumber,
      }),
    ]);

    if (decimals !== USDC_DECIMALS) {
      throw new ReadError(
        "decimals",
        `Unsupported asset: decimals() returned ${decimals} at block ${blockNumber}, but this page only supports ${USDC_DECIMALS}-decimal tokens.`,
      );
    }

    return { chainId, blockNumber, usdcBalance, decimals, checkedAt: now() };
  } catch (error) {
    if (error instanceof ReadError) throw error;
    const detail =
      error instanceof Error
        ? ((error as { shortMessage?: string }).shortMessage ?? error.message)
        : "unknown error";
    throw new ReadError("rpc", `Could not read from the public RPC: ${detail}`);
  }
}
