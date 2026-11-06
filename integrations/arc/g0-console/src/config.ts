/**
 * Funcaster Pot G0 configuration.
 *
 * Read-only diagnostic scope: a public RPC URL, the expected chain ID, the
 * USDC contract and the public project relayer address. Nothing here is a
 * secret, and nothing here can sign or send a transaction.
 */

import { getAddress, isAddress, type Address } from 'viem'

/** The only chain this diagnostic will read. */
export const ARC_TESTNET_CHAIN_ID = 5042002

export interface ChonksConfig {
  readonly chainId: typeof ARC_TESTNET_CHAIN_ID
  readonly chainName: string
  readonly rpcUrl: string
  readonly usdcAddress: Address
  readonly usdcDecimals: number
  readonly relayerAddress: Address
  readonly explorerBase: string
}

export const DEFAULT_CONFIG = {
  chainId: ARC_TESTNET_CHAIN_ID,
  chainName: 'Arc Testnet',
  rpcUrl: 'https://rpc.testnet.arc.io',
  usdcAddress: '0x3600000000000000000000000000000000000000',
  usdcDecimals: 6,
  relayerAddress: '0x81DdeD7eE7753791cEaF24Ab6Cb1694d1F39A008',
  explorerBase: 'https://explorer.testnet.arc.io',
} as const satisfies ChonksConfig

export const PLAY_MONEY_LABEL = 'PLAY MONEY · ARC TESTNET'

/** Optional overrides, all public values. Invalid overrides throw loudly. */
export interface ConfigEnv {
  VITE_CHONKS_CHAIN_ID?: string
  VITE_CHONKS_RPC_URL?: string
  VITE_CHONKS_USDC_ADDRESS?: string
  VITE_CHONKS_RELAYER_ADDRESS?: string
}

function requireAddress(name: string, value: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${name} is not a valid EVM address: ${value}`)
  }
  return getAddress(value)
}

export function resolveConfig(env: ConfigEnv = {}): ChonksConfig {
  // The chain is fixed. The variable is accepted only if it restates Arc Testnet.
  const chainIdRaw = env.VITE_CHONKS_CHAIN_ID?.trim()
  if (chainIdRaw && chainIdRaw !== String(ARC_TESTNET_CHAIN_ID)) {
    throw new Error(
      `This diagnostic only reads Arc Testnet (${ARC_TESTNET_CHAIN_ID}); refusing VITE_CHONKS_CHAIN_ID=${chainIdRaw}`,
    )
  }

  const rpcRaw = env.VITE_CHONKS_RPC_URL?.trim()
  let rpcUrl: string = DEFAULT_CONFIG.rpcUrl
  if (rpcRaw) {
    let parsed: URL
    try {
      parsed = new URL(rpcRaw)
    } catch {
      throw new Error(`VITE_CHONKS_RPC_URL is not a valid URL: ${rpcRaw}`)
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('VITE_CHONKS_RPC_URL must use https')
    }
    rpcUrl = rpcRaw
  }

  const usdcRaw = env.VITE_CHONKS_USDC_ADDRESS?.trim()
  const relayerRaw = env.VITE_CHONKS_RELAYER_ADDRESS?.trim()

  return {
    ...DEFAULT_CONFIG,
    rpcUrl,
    usdcAddress: usdcRaw ? requireAddress('VITE_CHONKS_USDC_ADDRESS', usdcRaw) : DEFAULT_CONFIG.usdcAddress,
    relayerAddress: relayerRaw
      ? requireAddress('VITE_CHONKS_RELAYER_ADDRESS', relayerRaw)
      : DEFAULT_CONFIG.relayerAddress,
  }
}

export const CONFIG: ChonksConfig = resolveConfig(import.meta.env as ConfigEnv)
