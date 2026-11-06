/**
 * Optional wallet actions: Refund and Claim only.
 *
 * Reading never touches this module. Both actions are permissionless on the
 * contract, so any connected account can trigger them; a claim always pays the
 * seat, never the caller. Uses the browser's injected EIP-1193 provider, no
 * third-party wallet service, and no signing of anything except these two
 * ordinary transactions.
 */

import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  getAddress,
  http,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import type { ChonksConfig } from "../config";
import { requireChain } from "../onchain-facts";
import type { toCreateArgs } from "./createForm";
import { conditionalPotAbi } from "./potAbi";
import { readDeployment, finishRead } from "./chainGuard";
import { hashTerms, RULES } from "./signing";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export function getInjectedProvider(
  win: object = window,
): Eip1193Provider | undefined {
  const candidate = (win as { ethereum?: unknown }).ethereum as
    Eip1193Provider | undefined;
  return candidate && typeof candidate.request === "function"
    ? candidate
    : undefined;
}

export function chainFor(config: ChonksConfig): Chain {
  const facts = requireChain(config.chainId);
  return defineChain({
    id: config.chainId,
    name: config.chainName,
    nativeCurrency: {
      name: facts.nativeCurrency.symbol,
      symbol: facts.nativeCurrency.symbol,
      decimals: facts.nativeCurrency.decimals,
    },
    rpcUrls: { default: { http: [config.rpcUrl] } },
    blockExplorers: { default: { name: "Explorer", url: config.explorerBase } },
    testnet: true,
  });
}

export class WrongWalletChainError extends Error {
  readonly walletChainId: number | undefined;
  constructor(walletChainId: number | undefined, expected: string) {
    super(
      walletChainId === undefined
        ? `Could not read your wallet's network. Switch it to ${expected} and try again.`
        : `Your wallet is on chain ${walletChainId}, not ${expected}. Switch networks in your wallet, or press "Switch wallet network".`,
    );
    this.name = "WrongWalletChainError";
    this.walletChainId = walletChainId;
  }
}

const REVERT_MESSAGES: Record<string, string> = {
  PotExists: "A pot with this id already exists.",
  AssetNotAllowed: "This contract does not allow that asset.",
  StakeTooLarge: "The stake is too large for this many seats.",
  BadDeadlines: "The deadlines are not valid at the current chain time.",
  NotRefundable: "Not refundable yet: the deadline has not passed.",
  NothingToClaim: "Nothing to claim for this seat.",
  WrongState: "The pot is not in a state that allows this action.",
  UnknownPot: "This pot does not exist.",
};

/** Turns a viem/wallet error into one plain sentence. */
export function describeTxError(error: unknown): string {
  if (error instanceof WrongWalletChainError) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 4001
  ) {
    return "You rejected the request in your wallet.";
  }
  if (error instanceof BaseError) {
    const revert = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    );
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && REVERT_MESSAGES[name]) return REVERT_MESSAGES[name];
      return revert.reason ?? name ?? error.shortMessage;
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : "The transaction failed.";
}

export async function connectWallet(
  provider: Eip1193Provider,
): Promise<Address> {
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  const first = accounts[0];
  if (!first) throw new Error("The wallet returned no account.");
  return getAddress(first);
}

/** Reads the wallet's current chain id (eth_chainId). Never changes anything. */
export async function readWalletChainId(
  provider: Eip1193Provider,
): Promise<number | undefined> {
  const raw = await provider.request({ method: "eth_chainId" });
  if (typeof raw !== "string" || !/^0x[0-9a-f]+$/i.test(raw)) return undefined;
  const parsed = Number.parseInt(raw, 16);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/** Throws unless the wallet is already on the configured chain. It never switches the chain. */
export async function assertWalletOnChain(
  provider: Eip1193Provider,
  config: ChonksConfig,
): Promise<void> {
  chainFor(config);
  const walletChainId = await readWalletChainId(provider);
  if (walletChainId !== config.chainId) {
    throw new WrongWalletChainError(
      walletChainId,
      `${config.chainName} (${config.chainId})`,
    );
  }
}

/**
 * Asks the wallet to switch to the configured chain. Only ever called from an explicit
 * "Switch wallet network" button; no transaction path calls it.
 */
export async function switchWalletChain(
  provider: Eip1193Provider,
  config: ChonksConfig,
): Promise<void> {
  chainFor(config);
  const chainIdHex = `0x${config.chainId.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    const chain = chainFor(config);
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [config.rpcUrl],
          blockExplorerUrls: [config.explorerBase],
        },
      ],
    });
  }
}

export type PotAction =
  | { kind: "refund"; potId: Hex }
  | { kind: "claim"; potId: Hex; seat: Address }
  | { kind: "create"; args: ReturnType<typeof toCreateArgs> };

export interface TxResult {
  hash: Hex;
  status: "success" | "reverted";
}

/**
 * Simulates first (so a revert is explained before the wallet prompt), then sends, then waits for
 * the receipt on the public RPC. The wallet must already be on the configured chain: this never
 * switches it, and it never requests accounts.
 */
export async function sendPotAction(
  provider: Eip1193Provider,
  config: ChonksConfig,
  account: Address,
  action: PotAction,
  onSubmitted?: (hash: Hex) => void,
): Promise<TxResult> {
  const contract = config.potAddress;
  if (!contract) throw new Error("No ConditionalPot address is configured.");
  await assertWalletOnChain(provider, config);

  const chain = chainFor(config);
  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl, { timeout: 10000, retryCount: 0 }),
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: custom(provider),
  });
  const block = await readDeployment(config, publicClient);
  const fee = (block.baseFeePerGas ?? 0n) * 2n;
  const maxFeePerGas = fee < 20_000_000_000n ? 20_000_000_000n : fee;
  if (maxFeePerGas > 100_000_000_000n)
    throw new Error("Network fees exceed this demo’s limit. Try again later.");
  const fees = { maxFeePerGas, maxPriorityFeePerGas: 0n };
  if (action.kind === "create") {
    const [potId, params] = action.args;
    const expected = hashTerms({ ...params, potId, rule: RULES[params.rule] });
    const actual = await publicClient.readContract({
      address: contract,
      abi: conditionalPotAbi,
      functionName: "hashTerms",
      args: action.args,
      blockNumber: block.number,
    });
    if (actual !== expected)
      throw new Error(
        "The terms differ from the deployed contract. Refresh and review them again.",
      );
  }
  const beforeSend = async () => {
    await finishRead(publicClient, block);
    await assertWalletOnChain(provider, config);
    const accounts = await provider.request({ method: "eth_accounts" });
    if (
      !Array.isArray(accounts) ||
      typeof accounts[0] !== "string" ||
      accounts[0].toLowerCase() !== account.toLowerCase()
    ) {
      throw new Error(
        "Your wallet account changed. Reconnect and review the action again.",
      );
    }
  };

  let hash: Hex;
  if (action.kind === "refund") {
    const { request } = await publicClient.simulateContract({
      account,
      address: contract,
      abi: conditionalPotAbi,
      functionName: "refund",
      args: [action.potId],
      blockNumber: block.number,
      ...fees,
    });
    await beforeSend();
    hash = await walletClient.writeContract(request);
  } else if (action.kind === "claim") {
    const { request } = await publicClient.simulateContract({
      account,
      address: contract,
      abi: conditionalPotAbi,
      functionName: "claim",
      args: [action.potId, action.seat],
      blockNumber: block.number,
      ...fees,
    });
    await beforeSend();
    hash = await walletClient.writeContract(request);
  } else {
    const { request } = await publicClient.simulateContract({
      account,
      address: contract,
      abi: conditionalPotAbi,
      functionName: "create",
      args: action.args,
      blockNumber: block.number,
      ...fees,
    });
    await beforeSend();
    hash = await walletClient.writeContract(request);
  }
  onSubmitted?.(hash);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: 45000,
  });
  return { hash, status: receipt.status };
}
