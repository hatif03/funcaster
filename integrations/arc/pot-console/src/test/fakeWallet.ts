import { vi } from "vitest";

interface FakeWalletOptions {
  chainId: number;
  accounts?: string[];
  /** Make eth_requestAccounts reject like a user refusal. */
  rejectConnect?: boolean;
}

type Handler = (...args: unknown[]) => void;

/** A stand-in for window.ethereum. Records every request so tests can prove what was NOT asked. */
export function installWallet(options: FakeWalletOptions) {
  let chainId = options.chainId;
  const listeners = new Map<string, Handler[]>();
  const request = vi.fn(
    ({ method }: { method: string; params?: unknown }): Promise<unknown> => {
      if (method === "eth_requestAccounts") {
        return options.rejectConnect
          ? Promise.reject(
              Object.assign(new Error("User rejected the request."), {
                code: 4001,
              }),
            )
          : Promise.resolve(
              options.accounts ?? [
                "0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7",
              ],
            );
      }
      if (method === "eth_chainId")
        return Promise.resolve(`0x${chainId.toString(16)}`);
      if (method === "wallet_switchEthereumChain") {
        chainId = 5042002;
        return Promise.resolve(null);
      }
      return Promise.reject(new Error(`unexpected wallet method ${method}`));
    },
  );
  const provider = {
    request,
    on: (event: string, handler: Handler) =>
      listeners.set(event, [...(listeners.get(event) ?? []), handler]),
    removeListener: (event: string, handler: Handler) =>
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((h) => h !== handler),
      ),
  };
  Object.defineProperty(window, "ethereum", {
    value: provider,
    configurable: true,
    writable: true,
  });
  return {
    request,
    methods: () => request.mock.calls.map(([arg]) => arg.method),
    emit: (event: string, ...args: unknown[]) =>
      (listeners.get(event) ?? []).forEach((h) => h(...args)),
  };
}

export function removeWallet() {
  Reflect.deleteProperty(window, "ethereum");
}
