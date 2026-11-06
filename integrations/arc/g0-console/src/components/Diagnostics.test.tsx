// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DEFAULT_CONFIG } from '../config'
import { ReadError, type ChainSnapshot } from '../lib/reader'
import { Diagnostics } from './Diagnostics'
import { Header } from './Header'

afterEach(cleanup)

const snapshot: ChainSnapshot = {
  chainId: 5042002,
  blockNumber: 9_876_543n,
  usdcBalance: 1_234_567_890n,
  decimals: 6,
  checkedAt: new Date(2026, 10, 5, 12, 30, 15).getTime(),
}

describe('Header', () => {
  it('always shows the play-money label', () => {
    render(<Header />)
    expect(screen.getByTestId('play-money-label').textContent).toBe('PLAY MONEY · ARC TESTNET')
    expect(screen.getByRole('heading', { name: 'Funcaster Pot' })).toBeTruthy()
  })
})

describe('Diagnostics', () => {
  it('shows a loading state without inventing values', () => {
    render(<Diagnostics config={DEFAULT_CONFIG} read={() => new Promise<ChainSnapshot>(() => {})} />)
    expect(screen.getByTestId('status-banner').getAttribute('data-status')).toBe('loading')
    expect(screen.getByTestId('usdc-formatted').textContent).toBe('—')
    expect(screen.getByTestId('block-number').textContent).toBe('—')
    expect(screen.getByRole('button', { name: /reading/i }).hasAttribute('disabled')).toBe(true)
  })

  it('renders the values the read returned', async () => {
    render(<Diagnostics config={DEFAULT_CONFIG} read={() => Promise.resolve(snapshot)} />)
    await waitFor(() => expect(screen.getByTestId('status-banner').getAttribute('data-status')).toBe('ready'))
    expect(screen.getByTestId('usdc-formatted').textContent).toContain('1,234.567890')
    expect(screen.getByTestId('usdc-raw').textContent).toContain('1,234,567,890 base units')
    expect(screen.getByTestId('chain-id').textContent).toBe('5042002')
    expect(screen.getByTestId('block-number').textContent).toBe('9,876,543')
    expect(screen.getByTestId('relayer-address').textContent).toBe(DEFAULT_CONFIG.relayerAddress)
    expect(screen.getByTestId('last-checked').textContent).not.toBe('—')
  })

  it('shows an honest wrong-chain error and the observed chain ID', async () => {
    const read = () => Promise.reject(new ReadError('wrong-chain', 'Wrong chain: the RPC reports chain 1.', 1))
    render(<Diagnostics config={DEFAULT_CONFIG} read={read} />)
    const banner = await screen.findByRole('alert')
    expect(banner.textContent).toContain('Wrong chain')
    expect(screen.getByTestId('chain-id').textContent).toBe('1')
    expect(screen.getByTestId('usdc-formatted').textContent).toBe('—')
  })

  it('shows an honest RPC failure with no fabricated balance', async () => {
    const read = () => Promise.reject(new ReadError('rpc', 'Could not read from the public RPC: fetch failed'))
    render(<Diagnostics config={DEFAULT_CONFIG} read={read} />)
    const banner = await screen.findByRole('alert')
    expect(banner.textContent).toContain('RPC unavailable')
    expect(banner.textContent).toContain('fetch failed')
    expect(screen.getByTestId('usdc-formatted').textContent).toBe('—')
    expect(screen.getByTestId('chain-id').textContent).toBe('—')
  })

  it('shows an unsupported-decimals error and no balance', async () => {
    const read = () =>
      Promise.reject(new ReadError('decimals', 'Unsupported asset: decimals() returned 18 at block 5.'))
    render(<Diagnostics config={DEFAULT_CONFIG} read={read} />)
    const banner = await screen.findByRole('alert')
    expect(banner.textContent).toContain('Unsupported token decimals')
    expect(screen.getByTestId('usdc-formatted').textContent).toBe('—')
  })

  it('Refresh re-reads and can recover from an error', async () => {
    const read = vi
      .fn<() => Promise<ChainSnapshot>>()
      .mockRejectedValueOnce(new ReadError('rpc', 'Could not read from the public RPC: timeout'))
      .mockResolvedValueOnce(snapshot)
    render(<Diagnostics config={DEFAULT_CONFIG} read={read} />)
    await screen.findByRole('alert')
    expect(read).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.getByTestId('status-banner').getAttribute('data-status')).toBe('ready'))
    expect(read).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('usdc-formatted').textContent).toContain('1,234.567890')
  })
})
