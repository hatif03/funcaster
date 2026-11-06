/**
 * Funcaster Pot G0 configuration.
 *
 * Public values only: RPC URL, expected chain ID, asset addresses, the
 * ConditionalPot address (no deployment is hard-coded; it is supplied by the
 * operator) and the public project relayer address. Nothing here is a secret.
 */

import { getAddress, isAddress, type Address } from "viem";

/** The only chain this console supports. */
export const ARC_TESTNET_CHAIN_ID = 5042002;

export interface ChonksConfig {
  readonly chainId: typeof ARC_TESTNET_CHAIN_ID;
  readonly chainName: string;
  readonly rpcUrl: string;
  readonly usdcAddress: Address;
  readonly usdcDecimals: number;
  /** EURC on Arc Testnet (6 decimals). Override with VITE_CHONKS_EURC_ADDRESS. */
  readonly eurcAddress: Address | undefined;
  /** Deployed ConditionalPot. Not hard-coded: set VITE_CHONKS_POT_ADDRESS after an owner-run deployment. */
  readonly potAddress: Address | undefined;
  readonly relayerAddress: Address;
  readonly explorerBase: string;
}

export const DEFAULT_CONFIG = {
  chainId: ARC_TESTNET_CHAIN_ID,
  chainName: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.io",
  usdcAddress: "0x3600000000000000000000000000000000000000",
  usdcDecimals: 6,
  // Published by Circle (developers.circle.com/stablecoins/eurc-contract-addresses) and read back
  // onchain: symbol() = EURC, decimals() = 6.
  eurcAddress: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  potAddress: undefined,
  relayerAddress: "0x81DdeD7eE7753791cEaF24Ab6Cb1694d1F39A008",
  explorerBase: "https://explorer.testnet.arc.io",
} as const satisfies ChonksConfig;

export const PLAY_MONEY_LABEL = "PLAY MONEY · ARC TESTNET";

/** Optional overrides, all public values. Invalid overrides throw loudly. */
export interface ConfigEnv {
  VITE_CHONKS_CHAIN_ID?: string;
  VITE_CHONKS_RPC_URL?: string;
  VITE_CHONKS_USDC_ADDRESS?: string;
  VITE_CHONKS_EURC_ADDRESS?: string;
  VITE_CHONKS_POT_ADDRESS?: string;
  VITE_CHONKS_RELAYER_ADDRESS?: string;
}

function requireAddress(name: string, value: string): Address {
  if (!isAddress(value) || /^0x0{40}$/i.test(value)) {
    throw new Error(`${name} is not a valid EVM address: ${value}`);
  }
  return getAddress(value);
}

export function resolveConfig(env: ConfigEnv = {}): ChonksConfig {
  // The chain is fixed. The variable is accepted only if it restates Arc Testnet.
  const chainIdRaw = env.VITE_CHONKS_CHAIN_ID?.trim();
  if (chainIdRaw && chainIdRaw !== String(ARC_TESTNET_CHAIN_ID)) {
    throw new Error(
      `This console only supports Arc Testnet (${ARC_TESTNET_CHAIN_ID}); refusing VITE_CHONKS_CHAIN_ID=${chainIdRaw}`,
    );
  }

  const rpcRaw = env.VITE_CHONKS_RPC_URL?.trim();
  let rpcUrl: string = DEFAULT_CONFIG.rpcUrl;
  if (rpcRaw) {
    let parsed: URL;
    try {
      parsed = new URL(rpcRaw);
    } catch {
      throw new Error("VITE_CHONKS_RPC_URL is not a valid public URL");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("VITE_CHONKS_RPC_URL must use https");
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash)
      throw new Error(
        "VITE_CHONKS_RPC_URL must be public and contain no credentials, query or fragment",
      );
    rpcUrl = rpcRaw;
  }

  const usdcRaw = env.VITE_CHONKS_USDC_ADDRESS?.trim();
  const relayerRaw = env.VITE_CHONKS_RELAYER_ADDRESS?.trim();
  const eurcRaw = env.VITE_CHONKS_EURC_ADDRESS?.trim();
  const potRaw = env.VITE_CHONKS_POT_ADDRESS?.trim();

  return {
    ...DEFAULT_CONFIG,
    rpcUrl,
    usdcAddress: usdcRaw
      ? requireAddress("VITE_CHONKS_USDC_ADDRESS", usdcRaw)
      : DEFAULT_CONFIG.usdcAddress,
    eurcAddress: eurcRaw
      ? requireAddress("VITE_CHONKS_EURC_ADDRESS", eurcRaw)
      : DEFAULT_CONFIG.eurcAddress,
    potAddress: potRaw
      ? requireAddress("VITE_CHONKS_POT_ADDRESS", potRaw)
      : undefined,
    relayerAddress: relayerRaw
      ? requireAddress("VITE_CHONKS_RELAYER_ADDRESS", relayerRaw)
      : DEFAULT_CONFIG.relayerAddress,
  };
}

export const CONFIG: ChonksConfig = resolveConfig(import.meta.env as ConfigEnv);
