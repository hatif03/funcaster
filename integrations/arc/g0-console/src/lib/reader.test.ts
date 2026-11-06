import { describe, expect, it, vi } from 'vitest'
import type { PublicClient } from 'viem'
import { DEFAULT_CONFIG } from '../config'
import { ReadError, assertExpectedChain, readSnapshot } from './reader'

interface ReadContractCall {
  functionName: string
  blockNumber?: bigint
}

interface FakeOptions {
  decimals?: number
  chainId?: number | Error
  blockNumber?: bigint
  readError?: Error
}

function fakeClient({ decimals = 6, chainId = 5042002, blockNumber = 123_456n, readError }: FakeOptions = {}) {
  return {
    getChainId: vi.fn<() => Promise<number>>(() =>
      chainId instanceof Error ? Promise.reject(chainId) : Promise.resolve(chainId),
    ),
    getBlockNumber: vi.fn<() => Promise<bigint>>(() => Promise.resolve(blockNumber)),
    readContract: vi.fn<(call: ReadContractCall) => Promise<number | bigint>>((call) =>
      readError
        ? Promise.reject(readError)
        : Promise.resolve(call.functionName === 'decimals' ? decimals : 42_500_000n),
    ),
  }
}

const asClient = (c: object) => c as unknown as PublicClient

describe('assertExpectedChain', () => {
  it('passes on the expected chain', () => {
    expect(() => assertExpectedChain(5042002, 5042002, 'Arc Testnet')).not.toThrow()
  })

  it('rejects a wrong chain with the observed ID', () => {
    try {
      assertExpectedChain(1, 5042002, 'Arc Testnet')
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ReadError)
      expect((error as ReadError).kind).toBe('wrong-chain')
      expect((error as ReadError).observedChainId).toBe(1)
    }
  })
})

describe('readSnapshot', () => {
  it('returns only values the client reported', async () => {
    const client = fakeClient()
    const snapshot = await readSnapshot(DEFAULT_CONFIG, { client: asClient(client), now: () => 1_700_000_000_000 })
    expect(snapshot).toEqual({
      chainId: 5042002,
      blockNumber: 123_456n,
      usdcBalance: 42_500_000n,
      decimals: 6,
      checkedAt: 1_700_000_000_000,
    })
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: DEFAULT_CONFIG.usdcAddress,
        functionName: 'balanceOf',
        args: [DEFAULT_CONFIG.relayerAddress],
      }),
    )
  })

  it('pins balanceOf and decimals to the block number it read first', async () => {
    const client = fakeClient({ blockNumber: 777n })
    await readSnapshot(DEFAULT_CONFIG, { client: asClient(client) })

    expect(client.readContract).toHaveBeenCalledTimes(2)
    const calls = client.readContract.mock.calls.map(([call]) => call)
    expect(calls.map((c) => c.functionName).sort()).toEqual(['balanceOf', 'decimals'])
    for (const call of calls) expect(call.blockNumber).toBe(777n)

    const blockOrder = client.getBlockNumber.mock.invocationCallOrder[0] ?? Infinity
    for (const order of client.readContract.mock.invocationCallOrder) expect(order).toBeGreaterThan(blockOrder)
  })

  it.each([0, 18, 8])('rejects a token reporting %i decimals', async (decimals) => {
    const client = fakeClient({ decimals })
    const error = await readSnapshot(DEFAULT_CONFIG, { client: asClient(client) }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ReadError)
    expect((error as ReadError).kind).toBe('decimals')
    expect((error as ReadError).message).toContain(`returned ${decimals}`)
  })

  it('refuses a configuration for any chain other than Arc Testnet', async () => {
    const client = fakeClient()
    const other = { ...DEFAULT_CONFIG, chainId: 1 } as unknown as typeof DEFAULT_CONFIG
    await expect(readSnapshot(other, { client: asClient(client) })).rejects.toMatchObject({ kind: 'config' })
    expect(client.getChainId).not.toHaveBeenCalled()
  })

  it('rejects the wrong chain and never reads a balance from it', async () => {
    const client = fakeClient({ chainId: 11155111 })
    await expect(readSnapshot(DEFAULT_CONFIG, { client: asClient(client) })).rejects.toMatchObject({
      kind: 'wrong-chain',
      observedChainId: 11155111,
    })
    expect(client.readContract).not.toHaveBeenCalled()
    expect(client.getBlockNumber).not.toHaveBeenCalled()
  })

  it('reports a failed RPC honestly', async () => {
    const client = fakeClient({ chainId: new Error('fetch failed') })
    const error = await readSnapshot(DEFAULT_CONFIG, { client: asClient(client) }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ReadError)
    expect((error as ReadError).kind).toBe('rpc')
    expect((error as ReadError).message).toContain('fetch failed')
  })

  it('reports a failed balance read as an RPC error', async () => {
    const client = fakeClient({ readError: new Error('execution reverted') })
    await expect(readSnapshot(DEFAULT_CONFIG, { client: asClient(client) })).rejects.toMatchObject({ kind: 'rpc' })
  })

  it('rejects an invalid configured address before any network call', async () => {
    const client = fakeClient()
    const bad = { ...DEFAULT_CONFIG, relayerAddress: '0x123' as `0x${string}` }
    await expect(readSnapshot(bad, { client: asClient(client) })).rejects.toMatchObject({ kind: 'config' })
    expect(client.getChainId).not.toHaveBeenCalled()
  })
})
