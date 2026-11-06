import { useCallback, useRef, useState } from "react";
import type { Hex } from "viem";
import type { ChonksConfig } from "../config";
import {
  describeTxError,
  getInjectedProvider,
  sendPotAction,
  type PotAction,
} from "../lib/wallet";
import type { WalletState } from "./useWallet";

export type ActionStatus =
  | { phase: "idle" }
  | { phase: "wallet"; label: string }
  | { phase: "confirming"; label: string; hash: Hex }
  | { phase: "done"; label: string; hash: Hex }
  | { phase: "error"; message: string; hash?: Hex };

/**
 * Sends one transaction (refund, claim or create) on an explicit button press. It requires a wallet
 * the user already connected and never requests accounts or switches networks by itself.
 */
export function usePotActions(
  config: ChonksConfig,
  wallet: WalletState,
  onSettled: () => void,
) {
  const [status, setStatus] = useState<ActionStatus>({ phase: "idle" });
  const inFlight = useRef(false);
  const busy = status.phase === "wallet" || status.phase === "confirming";

  const run = useCallback(
    async (action: PotAction, label: string) => {
      if (inFlight.current) return;
      const provider = getInjectedProvider();
      if (!provider || !wallet.account) {
        setStatus({ phase: "error", message: "Connect your wallet first." });
        return;
      }
      const tracker: { hash?: Hex } = {};
      inFlight.current = true;
      try {
        setStatus({ phase: "wallet", label });
        const result = await sendPotAction(
          provider,
          config,
          wallet.account,
          action,
          (hash) => {
            tracker.hash = hash;
            setStatus({ phase: "confirming", label, hash });
          },
        );
        if (result.status === "success")
          setStatus({ phase: "done", label, hash: result.hash });
        else
          setStatus({
            phase: "error",
            message: `${label} was reverted onchain.`,
            hash: result.hash,
          });
        onSettled();
      } catch (error) {
        setStatus({
          phase: "error",
          message: describeTxError(error),
          hash: tracker.hash,
        });
      } finally {
        inFlight.current = false;
      }
    },
    [config, wallet.account, onSettled],
  );

  const dismiss = useCallback(() => setStatus({ phase: "idle" }), []);
  return { status, busy, run, dismiss };
}
