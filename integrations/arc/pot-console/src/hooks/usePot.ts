import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import { ReadError, type ReadErrorKind } from "../lib/reader";
import type { PotSnapshot } from "../lib/pot";

export type PotLoadState =
  | { status: "idle" }
  | { status: "loading"; previous?: PotSnapshot }
  | { status: "ready"; snapshot: PotSnapshot }
  | {
      status: "error";
      kind: ReadErrorKind;
      message: string;
      observedChainId?: number;
    };

type Outcome =
  | { status: "ready"; snapshot: PotSnapshot }
  | {
      status: "error";
      kind: ReadErrorKind;
      message: string;
      observedChainId?: number;
    };

function toOutcome(error: unknown): Outcome {
  if (error instanceof ReadError) {
    return {
      status: "error",
      kind: error.kind,
      message: error.message,
      observedChainId: error.observedChainId,
    };
  }
  return {
    status: "error",
    kind: "rpc",
    message:
      error instanceof Error
        ? error.message
        : "Unexpected error while reading.",
  };
}

/**
 * Loads `potId` whenever it changes and on every `refresh()`. Stale responses are
 * discarded. Without a pot id nothing is read. State is derived: a result only
 * counts for the pot id it was read for, so switching pots never shows stale data.
 */
export function usePot(
  read: (potId: Hex) => Promise<PotSnapshot>,
  potId: Hex | undefined,
) {
  const [result, setResult] = useState<
    { id: Hex; outcome: Outcome } | undefined
  >();
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });

  useEffect(() => {
    if (!potId) return;
    const ctl = { cancelled: false };
    readRef.current(potId).then(
      (snapshot) => {
        if (ctl.cancelled) return;
        setResult({ id: potId, outcome: { status: "ready", snapshot } });
        setRefreshing(false);
      },
      (error: unknown) => {
        if (ctl.cancelled) return;
        setResult({ id: potId, outcome: toOutcome(error) });
        setRefreshing(false);
      },
    );
    return () => {
      ctl.cancelled = true;
    };
  }, [potId, nonce]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setNonce((n) => n + 1);
  }, []);

  let state: PotLoadState;
  const current = potId && result?.id === potId ? result.outcome : undefined;
  if (!potId) state = { status: "idle" };
  else if (!current) state = { status: "loading" };
  else if (refreshing)
    state = {
      status: "loading",
      previous: current.status === "ready" ? current.snapshot : undefined,
    };
  else state = current;
  return { state, refresh };
}
