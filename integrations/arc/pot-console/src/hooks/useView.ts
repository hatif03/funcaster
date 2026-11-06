import { useCallback, useEffect, useState } from "react";

export type View = "pot" | "create" | "about";

export function parseView(search: string): View {
  const raw = new URLSearchParams(search).get("view");
  return raw === "create" || raw === "about" ? raw : "pot";
}

/** `?view=create|about` (default: the pot page). Navigation is plain history state, no router. */
export function useView() {
  const [view, setViewState] = useState<View>(() =>
    parseView(window.location.search),
  );

  useEffect(() => {
    const onPop = () => setViewState(parseView(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setView = useCallback((next: View) => {
    const url = new URL(window.location.href);
    if (next === "pot") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.pushState({}, "", `${url.pathname}${url.search}`);
    setViewState(next);
  }, []);

  return { view, setView };
}
