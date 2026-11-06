import type { ReactNode } from 'react'
import clsx from 'clsx'

interface StatCardProps {
  label: string
  children: ReactNode
  hint?: ReactNode
  className?: string
  testId?: string
}

export function StatCard({ label, children, hint, className, testId }: StatCardProps) {
  return (
    <section
      data-testid={testId}
      className={clsx(
        'min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 backdrop-blur-md sm:p-5',
        className,
      )}
    >
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--subtle)]">{label}</h2>
      <div className="mt-2 min-w-0 break-words tabular-nums">{children}</div>
      {hint ? <p className="mt-2 text-sm text-pretty text-[var(--subtle)]">{hint}</p> : null}
    </section>
  )
}
