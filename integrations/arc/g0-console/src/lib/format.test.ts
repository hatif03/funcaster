import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config'
import { formatBaseUnits, formatUsdcUnits, isValidAddress, shortenAddress } from './format'

describe('formatUsdcUnits (six decimals)', () => {
  it.each([
    [0n, '0.000000'],
    [1n, '0.000001'],
    [999_999n, '0.999999'],
    [1_000_000n, '1.000000'],
    [1_234_567_890n, '1,234.567890'],
    [123_456_789_012_345n, '123,456,789.012345'],
    [10_000_000_000_000_000_000n, '10,000,000,000,000.000000'],
    [-1_500_000n, '-1.500000'],
  ])('formats %s as %s', (raw, expected) => {
    expect(formatUsdcUnits(raw)).toBe(expected)
  })

  it('never drops or rounds digits beyond six decimals of precision', () => {
    expect(formatUsdcUnits(2n ** 64n)).toBe('18,446,744,073,709.551616')
  })
})

describe('formatBaseUnits', () => {
  it('groups raw base units', () => {
    expect(formatBaseUnits(0n)).toBe('0')
    expect(formatBaseUnits(1234567n)).toBe('1,234,567')
    expect(formatBaseUnits(-1000n)).toBe('-1,000')
  })
})

describe('isValidAddress', () => {
  it('accepts the configured defaults', () => {
    expect(isValidAddress(DEFAULT_CONFIG.relayerAddress)).toBe(true)
    expect(isValidAddress(DEFAULT_CONFIG.usdcAddress)).toBe(true)
  })

  it('accepts an all-lowercase address', () => {
    expect(isValidAddress(DEFAULT_CONFIG.relayerAddress.toLowerCase())).toBe(true)
  })

  it('rejects a wrong mixed-case checksum', () => {
    const bad = DEFAULT_CONFIG.relayerAddress.replace('DdeD', 'dDEd')
    expect(bad).not.toBe(DEFAULT_CONFIG.relayerAddress)
    expect(isValidAddress(bad)).toBe(false)
  })

  it.each([
    ['empty string', ''],
    ['too short', '0x1234'],
    ['too long', `${DEFAULT_CONFIG.usdcAddress}00`],
    ['missing 0x', DEFAULT_CONFIG.usdcAddress.slice(2)],
    ['non-hex characters', '0x' + 'z'.repeat(40)],
    ['number', 123],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_label, value) => {
    expect(isValidAddress(value)).toBe(false)
  })
})

describe('shortenAddress', () => {
  it('shortens long addresses and leaves short strings alone', () => {
    expect(shortenAddress(DEFAULT_CONFIG.relayerAddress)).toBe('0x81Dd…A008')
    expect(shortenAddress('0x12')).toBe('0x12')
  })
})
