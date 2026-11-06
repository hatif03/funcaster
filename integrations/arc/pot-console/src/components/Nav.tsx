import clsx from "clsx";
import type { MouseEvent } from "react";
import type { View } from "../hooks/useView";

const ITEMS: Array<{ view: View; label: string }> = [
  { view: "pot", label: "Pot" },
  { view: "create", label: "Create" },
  { view: "about", label: "About" },
];

export function Nav({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (view: View) => void;
}) {
  function go(event: MouseEvent, next: View) {
    // Plain link semantics for modified clicks; in-app navigation otherwise.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
      return;
    event.preventDefault();
    onNavigate(next);
  }
  return (
    <nav
      aria-label="Console"
      className="grid grid-cols-3 gap-1 rounded-xl border border-[#2d5fae] bg-[var(--surface)] p-1"
    >
      {ITEMS.map((item) => {
        const href =
          item.view === "pot"
            ? import.meta.env.BASE_URL
            : `${import.meta.env.BASE_URL}?view=${item.view}`;
        const active = view === item.view;
        return (
          <a
            key={item.view}
            href={href}
            onClick={(event) => go(event, item.view)}
            aria-current={active ? "page" : undefined}
            data-testid={`nav-${item.view}`}
            className={clsx(
              "flex min-h-11 items-center justify-center rounded-lg px-2 text-sm font-bold uppercase tracking-[0.06em] transition-colors",
              active
                ? "bg-gradient-to-b from-[#3f87dc] to-[#1a56b0] text-white"
                : "text-[var(--muted)] hover:bg-[var(--surface-strong)]",
            )}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
