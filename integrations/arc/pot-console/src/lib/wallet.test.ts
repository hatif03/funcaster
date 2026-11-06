import { describe, expect, it, vi } from "vitest";
import { ContractFunctionRevertedError, toFunctionSelector } from "viem";
import { DEFAULT_CONFIG } from "../config";
import { conditionalPotAbi } from "./potAbi";
import {
  assertWalletOnChain,
  chainFor,
  describeTxError,
  getInjectedProvider,
  readWalletChainId,
  sendPotAction,
  switchWalletChain,
  WrongWalletChainError,
  type Eip1193Provider,
} from "./wallet";

describe("wallet helpers", () => {
  it("finds no provider when there is no injected wallet", () => {
    expect(getInjectedProvider({})).toBeUndefined();
    expect(getInjectedProvider({ ethereum: {} })).toBeUndefined();
    const provider = { request: () => Promise.resolve(null) };
    expect(getInjectedProvider({ ethereum: provider })).toBe(provider);
  });

  it("builds the Arc Testnet chain from the registry", () => {
    const chain = chainFor(DEFAULT_CONFIG);
    expect(chain.id).toBe(5042002);
    expect(chain.nativeCurrency.symbol).toBe("USDC");
    expect(chain.testnet).toBe(true);
  });

  it("explains a user rejection", () => {
    expect(describeTxError({ code: 4001 })).toMatch(/rejected/i);
  });

  it("explains known contract reverts in plain language", () => {
    const revert = new ContractFunctionRevertedError({
      abi: conditionalPotAbi,
      functionName: "refund",
      data: toFunctionSelector("NotRefundable()"),
    });
    expect(describeTxError(revert)).toMatch(/not refundable yet/i);
    const nothing = new ContractFunctionRevertedError({
      abi: conditionalPotAbi,
      functionName: "claim",
      data: toFunctionSelector("NothingToClaim()"),
    });
    expect(describeTxError(nothing)).toMatch(/nothing to claim/i);
  });

  it("falls back to the error message", () => {
    expect(describeTxError(new Error("plain"))).toBe("plain");
  });

  describe("chain guard", () => {
    const provider = (
      chainId: unknown,
    ): Eip1193Provider & { request: ReturnType<typeof vi.fn> } => ({
      request: vi.fn(({ method }: { method: string }) => {
        if (method === "eth_chainId") return Promise.resolve(chainId);
        return Promise.reject(new Error(`unexpected ${method}`));
      }),
    });

    it("reads the wallet chain id and tolerates garbage", async () => {
      expect(await readWalletChainId(provider("0x4cef52"))).toBe(5042002);
      expect(await readWalletChainId(provider(undefined))).toBeUndefined();
      expect(await readWalletChainId(provider("nonsense"))).toBeUndefined();
    });

    it("passes on the configured chain and throws on any other, without switching", async () => {
      await expect(
        assertWalletOnChain(provider("0x4cef52"), DEFAULT_CONFIG),
      ).resolves.toBeUndefined();
      const other = provider("0x1");
      await expect(
        assertWalletOnChain(other, DEFAULT_CONFIG),
      ).rejects.toBeInstanceOf(WrongWalletChainError);
      await expect(
        assertWalletOnChain(provider(undefined), DEFAULT_CONFIG),
      ).rejects.toThrow(/Could not read/);
      expect(
        other.request.mock.calls.map(([a]) => (a as { method: string }).method),
      ).toEqual(["eth_chainId"]);
    });

    it("describes the wrong-chain error for the user", () => {
      expect(
        describeTxError(new WrongWalletChainError(1, "Arc Testnet (5042002)")),
      ).toMatch(/chain 1.*Arc Testnet/);
    });

    it("refuses to send on the wrong chain, before simulating or prompting", async () => {
      const wrong = provider("0x1");
      const config = {
        ...DEFAULT_CONFIG,
        potAddress: "0x00000000000000000000000000000000000000A1" as const,
      };
      await expect(
        sendPotAction(
          wrong,
          config,
          "0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7",
          { kind: "refund", potId: `0x${"ab".repeat(32)}` },
        ),
      ).rejects.toBeInstanceOf(WrongWalletChainError);
      expect(wrong.request).toHaveBeenCalledTimes(1);
    });

    it("refuses to send without a configured contract", async () => {
      await expect(
        sendPotAction(
          provider("0x4cef52"),
          DEFAULT_CONFIG,
          "0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7",
          {
            kind: "refund",
            potId: `0x${"ab".repeat(32)}`,
          },
        ),
      ).rejects.toThrow(/No ConditionalPot address/);
    });

    it("switches only when asked, and adds the chain when the wallet does not know it", async () => {
      const calls: string[] = [];
      const p: Eip1193Provider = {
        request: ({ method }) => {
          calls.push(method);
          if (method === "wallet_switchEthereumChain")
            return Promise.reject(
              Object.assign(new Error("unknown chain"), { code: 4902 }),
            );
          return Promise.resolve(null);
        },
      };
      await switchWalletChain(p, DEFAULT_CONFIG);
      expect(calls).toEqual([
        "wallet_switchEthereumChain",
        "wallet_addEthereumChain",
      ]);
      const refused: Eip1193Provider = {
        request: () =>
          Promise.reject(Object.assign(new Error("no"), { code: 4001 })),
      };
      await expect(
        switchWalletChain(refused, DEFAULT_CONFIG),
      ).rejects.toMatchObject({ code: 4001 });
    });
  });
});
