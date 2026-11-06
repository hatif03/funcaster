import { isAddress } from 'viem'

/** USDC (ERC-20 view) always has six decimals. */
export const USDC_DECIMALS = 6

const GROUP_RE = /\B(?=(\d{3})+(?!\d))/g

/**
 * Format a raw 6-decimal USDC amount (base units) as a fixed-width decimal
 * string, e.g. 1234567890n -> "1,234.567890". Never rounds, never loses digits.
 */
export function formatUsdcUnits(raw: bigint): string {
  const negative = raw < 0n
  const abs = negative ? -raw : raw
  const base = 10n ** BigInt(USDC_DECIMALS)
  const whole = (abs / base).toString().replace(GROUP_RE, ',')
  const frac = (abs % base).toString().padStart(USDC_DECIMALS, '0')
  return `${negative ? '-' : ''}${whole}.${frac}`
}

/** Raw base units with digit grouping, e.g. 1234567890n -> "1,234,567,890". */
export function formatBaseUnits(raw: bigint): string {
  const negative = raw < 0n
  const digits = (negative ? -raw : raw).toString().replace(GROUP_RE, ',')
  return negative ? `-${digits}` : digits
}

/** Strict EVM address check (rejects bad length, bad hex, and bad mixed-case checksums). */
export function isValidAddress(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && isAddress(value, { strict: true })
}

/** 0x81Dd...A008 style shortening for tight layouts. */
export function shortenAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 1) return address
  return `${address.slice(0, head)}…${address.slice(-tail)}`
}

export function formatCheckedAt(timestampMs: number, locale?: string): string {
  return new Date(timestampMs).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
