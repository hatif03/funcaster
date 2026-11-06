import { useCallback, useEffect, useState } from "react";
import type { Hex } from "viem";
import { parsePotId } from "../lib/pot";

/** Raw `?pot=` value from a query string, trimmed, or '' when absent. */
export function rawPotParam(search: string): string {
  return new URLSearchParams(search).get("pot")?.trim() ?? "";
}

/**
 * Keeps the `?pot=` deep link and React state in sync, under the app base (`/pot/`).
 * `raw` is what the URL holds (even when invalid, so the page can say why);
 * `potId` is the parsed bytes32 or undefined.
 */
export function usePotParam() {
  const [raw, setRaw] = useState(() => rawPotParam(window.location.search));

  useEffect(() => {
    const onPop = () => setRaw(rawPotParam(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setPot = useCallback((next: string) => {
    const base = import.meta.env.BASE_URL;
    const url = next ? `${base}?pot=${encodeURIComponent(next)}` : base;
    window.history.pushState({}, "", url);
    setRaw(next);
  }, []);

  const potId: Hex | undefined = parsePotId(raw);
  return { raw, potId, setPot };
}
