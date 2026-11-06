import type { ReactNode } from "react";
import clsx from "clsx";

interface XpWindowProps {
  title: string;
  children: ReactNode;
  testId?: string;
  className?: string;
  /** Small text on the right of the title bar. */
  badge?: ReactNode;
}

/** Compact titled panel in the blue Funcaster/XP style. */
export function XpWindow({
  title,
  children,
  testId,
  className,
  badge,
}: XpWindowProps) {
  return (
    <section data-testid={testId} className={clsx("xp-window", className)}>
      <h2 className="xp-title">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {badge ? (
          <span className="shrink-0 normal-case tracking-normal">{badge}</span>
        ) : null}
      </h2>
      <div className="min-w-0 p-3 sm:p-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--subtle)]">
        {label}
      </dt>
      <dd
        data-testid={testId}
        className="mt-0.5 min-w-0 break-words text-sm tabular-nums text-[var(--ink-2)]"
      >
        {children}
      </dd>
    </div>
  );
}
