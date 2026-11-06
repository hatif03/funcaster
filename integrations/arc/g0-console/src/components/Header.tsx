import { PLAY_MONEY_LABEL } from '../config'

function ChonkMark() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="2" y="6" width="32" height="26" rx="10" fill="var(--accent)" />
      <circle cx="13" cy="18" r="2.6" fill="#0d1b2f" />
      <circle cx="23" cy="18" r="2.6" fill="#0d1b2f" />
      <path d="M13 25c2.6 1.6 7.4 1.6 10 0" stroke="#0d1b2f" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 8l3-5 4 5M21 8l4-5 3 5" stroke="var(--accent)" strokeWidth="2.4" strokeLinejoin="round" />
    </svg>
  )
}

export function Header() {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <ChonkMark />
        <div className="min-w-0">
          <h1 className="display text-3xl font-bold leading-none text-balance sm:text-4xl">Funcaster Pot</h1>
          <p className="mt-1 text-sm text-[var(--subtle)]">G0 · read-only chain diagnostic</p>
        </div>
      </div>
      <p
        data-testid="play-money-label"
        className="w-fit max-w-full rounded-full border border-[var(--warn)]/50 bg-[var(--warn)]/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--warn)]"
      >
        {PLAY_MONEY_LABEL}
      </p>
    </header>
  )
}
