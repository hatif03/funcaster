import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import type { ChonksConfig } from "../config";
import {
  connectWallet,
  describeTxError,
  getInjectedProvider,
  readWalletChainId,
  switchWalletChain,
} from "../lib/wallet";

/**
 * Optional browser wallet. Nothing here runs on its own: `connect` and `switchChain` are called only
 * from explicit buttons. Before connecting, only the presence of an injected provider is checked.
 */
export function useWallet(config: ChonksConfig) {
  const [account, setAccount] = useState<Address | undefined>();
  const [walletChainId, setWalletChainId] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const hasWallet = getInjectedProvider() !== undefined;

  const connect = useCallback(async () => {
    if (inFlight.current) return;
    const provider = getInjectedProvider();
    if (!provider) {
      setError("No browser wallet found. Reading works without one.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      setAccount(await connectWallet(provider));
      setWalletChainId(await readWalletChainId(provider));
    } catch (e) {
      setError(describeTxError(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  const switchChain = useCallback(async () => {
    if (inFlight.current) return;
    const provider = getInjectedProvider();
    if (!provider) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await switchWalletChain(provider, config);
      setWalletChainId(await readWalletChainId(provider));
    } catch (e) {
      setError(describeTxError(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [config]);

  // After the user has connected, follow their wallet's own network and account changes.
  useEffect(() => {
    if (!account) return;
    const provider = getInjectedProvider();
    if (!provider?.on || !provider.removeListener) return;
    const onChain = (raw: unknown) => {
      const parsed =
        typeof raw === "string" ? Number.parseInt(raw, 16) : Number.NaN;
      setWalletChainId(Number.isSafeInteger(parsed) ? parsed : undefined);
    };
    const onAccounts = (raw: unknown) => {
      const first = Array.isArray(raw)
        ? (raw[0] as string | undefined)
        : undefined;
      setAccount(first ? (first as Address) : undefined);
    };
    provider.on("chainChanged", onChain);
    provider.on("accountsChanged", onAccounts);
    return () => {
      provider.removeListener?.("chainChanged", onChain);
      provider.removeListener?.("accountsChanged", onAccounts);
    };
  }, [account]);

  const chainOk = walletChainId === config.chainId;
  return {
    account,
    walletChainId,
    chainOk,
    /** Connected, on the configured testnet: the only state in which a transaction button is enabled. */
    ready: account !== undefined && chainOk,
    hasWallet,
    busy,
    error,
    connect,
    switchChain,
    clearError: () => setError(undefined),
  };
}

export type WalletState = ReturnType<typeof useWallet>;
