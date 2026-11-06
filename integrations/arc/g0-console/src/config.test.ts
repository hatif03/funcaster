import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, PLAY_MONEY_LABEL, resolveConfig } from './config'

describe('resolveConfig', () => {
  it('uses the documented defaults', () => {
    const config = resolveConfig({})
    expect(config.chainId).toBe(5042002)
    expect(config.rpcUrl).toBe('https://rpc.testnet.arc.io')
    expect(config.usdcAddress).toBe('0x3600000000000000000000000000000000000000')
    expect(config.relayerAddress).toBe('0x81DdeD7eE7753791cEaF24Ab6Cb1694d1F39A008')
    expect(config.usdcDecimals).toBe(6)
    expect(config).toMatchObject(DEFAULT_CONFIG)
  })

  it('accepts valid public overrides', () => {
    const config = resolveConfig({
      VITE_CHONKS_CHAIN_ID: '5042002',
      VITE_CHONKS_RPC_URL: 'https://example.org/rpc',
      VITE_CHONKS_RELAYER_ADDRESS: DEFAULT_CONFIG.usdcAddress,
    })
    expect(config.chainId).toBe(5042002)
    expect(config.rpcUrl).toBe('https://example.org/rpc')
    expect(config.relayerAddress).toBe(DEFAULT_CONFIG.usdcAddress)
  })

  it.each([
    [{ VITE_CHONKS_CHAIN_ID: 'abc' }],
    [{ VITE_CHONKS_CHAIN_ID: '0' }],
    [{ VITE_CHONKS_CHAIN_ID: '1' }],
    [{ VITE_CHONKS_CHAIN_ID: '5042' }],
    [{ VITE_CHONKS_CHAIN_ID: '11155111' }],
    [{ VITE_CHONKS_RPC_URL: 'http://insecure.example' }],
    [{ VITE_CHONKS_RPC_URL: 'not a url' }],
    [{ VITE_CHONKS_USDC_ADDRESS: '0x123' }],
    [{ VITE_CHONKS_RELAYER_ADDRESS: 'nope' }],
  ])('rejects invalid override %j', (env) => {
    expect(() => resolveConfig(env)).toThrow()
  })

  it('keeps the permanent play-money label', () => {
    expect(PLAY_MONEY_LABEL).toBe('PLAY MONEY · ARC TESTNET')
  })
})
