import { ExternalLink, RefreshCw, TriangleAlert, CircleCheck, LoaderCircle } from 'lucide-react'
import clsx from 'clsx'
import { StatCard } from './StatCard'
import type { ChonksConfig } from '../config'
import { useChainSnapshot, type SnapshotState } from '../hooks/useChainSnapshot'
import { formatBaseUnits, formatCheckedAt, formatUsdcUnits } from '../lib/format'
import type { ChainSnapshot } from '../lib/reader'

const EMPTY = '—'

interface DiagnosticsProps {
  config: ChonksConfig
  read: () => Promise<ChainSnapshot>
}

function statusText(state: SnapshotState): { title: string; detail: string } {
  switch (state.status) {
    case 'loading':
      return { title: 'Checking', detail: 'Reading from the public RPC…' }
    case 'ready':
      return { title: 'Connected', detail: 'Public RPC reachable on the expected chain. Read-only.' }
    case 'error':
      if (state.kind === 'wrong-chain') return { title: 'Wrong chain', detail: state.message }
      if (state.kind === 'decimals') return { title: 'Unsupported token decimals', detail: state.message }
      if (state.kind === 'config') return { title: 'Invalid configuration', detail: state.message }
      return { title: 'RPC unavailable', detail: state.message }
  }
}

export function StatusBanner({ state }: { state: SnapshotState }) {
  const { title, detail } = statusText(state)
  const tone = state.status === 'ready' ? 'ok' : state.status === 'error' ? 'bad' : 'wait'
  const Icon = tone === 'ok' ? CircleCheck : tone === 'bad' ? TriangleAlert : LoaderCircle
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      aria-live="polite"
      data-testid="status-banner"
      data-status={state.status}
      className={clsx(
        'flex min-w-0 items-start gap-3 rounded-2xl border p-4 sm:p-5',
        tone === 'ok' && 'border-[var(--success)]/40 bg-[var(--success)]/10',
        tone === 'bad' && 'border-[var(--danger)]/50 bg-[var(--danger)]/10',
        tone === 'wait' && 'border-[var(--border)] bg-[var(--surface)]',
      )}
    >
      <Icon
        aria-hidden="true"
        className={clsx(
          'mt-0.5 h-5 w-5 shrink-0',
          tone === 'ok' && 'text-[var(--success)]',
          tone === 'bad' && 'text-[var(--danger)]',
          tone === 'wait' && 'animate-spin text-[var(--accent)]',
        )}
      />
      <div className="min-w-0">
        <p className="display text-lg font-semibold">{title}</p>
        <p className="mt-0.5 break-words text-sm text-pretty text-[var(--muted)]">{detail}</p>
      </div>
    </div>
  )
}

export function Diagnostics({ config, read }: DiagnosticsProps) {
  const { state, refresh } = useChainSnapshot(read)
  const snapshot = state.status === 'ready' ? state.snapshot : undefined
  const loading = state.status === 'loading'
  const observedChainId =
    snapshot?.chainId ?? (state.status === 'error' ? state.observedChainId : undefined)
  const chainMismatch = state.status === 'error' && state.kind === 'wrong-chain'

  return (
    <div className="flex flex-col gap-4">
      <StatusBanner state={state} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="USDC balance (relayer)"
          testId="card-balance"
          className="sm:col-span-2"
          hint={
            snapshot
              ? `ERC-20 view, 6 decimals, read at block ${formatBaseUnits(snapshot.blockNumber)}.`
              : 'ERC-20 view, 6 decimals. Read from the USDC contract, not estimated.'
          }
        >
          <p className="display text-4xl font-bold sm:text-5xl" data-testid="usdc-formatted">
            {snapshot ? formatUsdcUnits(snapshot.usdcBalance) : EMPTY}
            {snapshot ? <span className="ml-2 text-base font-medium text-[var(--subtle)]">USDC</span> : null}
          </p>
          <p className="mono mt-2 text-sm text-[var(--muted)]" data-testid="usdc-raw">
            {snapshot ? `${formatBaseUnits(snapshot.usdcBalance)} base units` : EMPTY}
          </p>
        </StatCard>

        <StatCard
          label="Observed chain ID"
          testId="card-chain"
          hint={`Expected ${config.chainId} (${config.chainName})`}
        >
          <p
            className={clsx('display text-2xl font-semibold', chainMismatch && 'text-[var(--danger)]')}
            data-testid="chain-id"
          >
            {observedChainId ?? EMPTY}
          </p>
        </StatCard>

        <StatCard label="Block number" testId="card-block" hint="Balance and decimals are pinned to this block.">
          <p className="display text-2xl font-semibold" data-testid="block-number">
            {snapshot ? formatBaseUnits(snapshot.blockNumber) : EMPTY}
          </p>
        </StatCard>

        <StatCard label="Public wallet address (relayer)" testId="card-address" hint="Public project relayer. Not a connected wallet.">
          <p className="mono break-all text-sm" data-testid="relayer-address">
            {config.relayerAddress}
          </p>
          <a
            href={`${config.explorerBase}/address/${config.relayerAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
          >
            View on explorer
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
          </a>
        </StatCard>

        <StatCard label="Last checked" testId="card-checked" hint={state.status === 'error' ? 'Time of the failed attempt.' : undefined}>
          <p className="display text-2xl font-semibold" data-testid="last-checked">
            {state.attemptedAt ? formatCheckedAt(state.attemptedAt) : EMPTY}
          </p>
        </StatCard>

        <StatCard label="USDC contract" testId="card-usdc" className="sm:col-span-2">
          <p className="mono break-all text-sm" data-testid="usdc-address">
            {config.usdcAddress}
          </p>
          <p className="mono mt-2 break-all text-xs text-[var(--subtle)]">RPC {config.rpcUrl}</p>
        </StatCard>
      </div>

      <button
        type="button"
        onClick={() => void refresh()}
        disabled={loading}
        aria-busy={loading}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 text-base font-semibold text-[#0d1b2f] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
      >
        <RefreshCw aria-hidden="true" className={clsx('h-4 w-4', loading && 'animate-spin')} />
        {loading ? 'Reading…' : 'Refresh'}
      </button>
    </div>
  )
}
