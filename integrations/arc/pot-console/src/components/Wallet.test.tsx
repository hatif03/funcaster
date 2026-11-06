// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { DEFAULT_CONFIG, type ChonksConfig } from "../config";
import type { PotSnapshot } from "../lib/pot";
import { installWallet, removeWallet } from "../test/fakeWallet";

vi.mock("../lib/wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/wallet")>();
  return { ...actual, sendPotAction: vi.fn() };
});

import { sendPotAction } from "../lib/wallet";
import { PotPage } from "./PotPage";

const POT = "0x00000000000000000000000000000000000000a1" as const;
const ID = `0x${"ab".repeat(32)}` as const;
const SEATS = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
] as const;
const config: ChonksConfig = { ...DEFAULT_CONFIG, potAddress: POT };
const HASH = `0x${"00".repeat(32)}` as const;

function snap(over: Partial<PotSnapshot> = {}): PotSnapshot {
  return {
    potId: ID,
    chainId: 5042002,
    blockNumber: 1n,
    now: 5_000n, // past the settle deadline: refund is open
    contract: POT,
    asset: DEFAULT_CONFIG.usdcAddress,
    stake: 1_000_000n,
    total: 2_000_000n,
    seats: SEATS.map((address, index) => ({
      index,
      address,
      funded: true,
      accepted: true,
      claimable: 0n,
    })),
    rule: 0,
    oracle: SEATS[0],
    fundDeadline: 2_000n,
    settleDeadline: 5_000n,
    challengeWindow: 300,
    minPlaySeconds: 60,
    lockedAt: 900n,
    termsHash: HASH,
    metadataHash: HASH,
    state: "Locked",
    proposal: { placesHash: HASH, resultHash: HASH, at: 0n },
    checkedAt: 0,
    ...over,
  };
}

beforeEach(() => window.history.replaceState({}, "", `/pot/?pot=${ID}`));
afterEach(() => {
  cleanup();
  removeWallet();
  vi.mocked(sendPotAction).mockReset();
  window.history.replaceState({}, "", "/");
});

async function connect() {
  fireEvent.click(await screen.findByTestId("connect-wallet"));
  await waitFor(() =>
    expect(screen.getByTestId("wallet-account")).toBeTruthy(),
  );
}

describe("wallet use on the pot page", () => {
  it("admits only one transaction when a button is pressed repeatedly before rendering", async () => {
    installWallet({ chainId: 5042002 });
    vi.mocked(sendPotAction).mockImplementation(() => new Promise(() => {}));
    render(<PotPage config={config} read={() => Promise.resolve(snap())} />);
    await connect();
    const button = screen.getByTestId("refund-button");
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(sendPotAction).toHaveBeenCalledTimes(1);
  });
  it("asks the wallet for nothing until a button is pressed", async () => {
    const wallet = installWallet({ chainId: 5042002 });
    render(<PotPage config={config} read={() => Promise.resolve(snap())} />);
    await waitFor(() =>
      expect(screen.getByTestId("refund-button")).toBeTruthy(),
    );
    expect(wallet.request).not.toHaveBeenCalled();
  });

  it("connects only on the explicit button and never switches the network by itself", async () => {
    const wallet = installWallet({ chainId: 1 });
    render(<PotPage config={config} read={() => Promise.resolve(snap())} />);
    await connect();
    expect(wallet.methods()).toEqual(["eth_requestAccounts", "eth_chainId"]);
    expect(wallet.methods()).not.toContain("wallet_switchEthereumChain");
    expect(wallet.methods()).not.toContain("wallet_addEthereumChain");
  });

  it("blocks every transaction button on the wrong chain and explains it", async () => {
    installWallet({ chainId: 1 });
    const s = snap({ state: "Settled" });
    s.seats[0] = { ...s.seats[0], claimable: 2_000_000n };
    render(<PotPage config={config} read={() => Promise.resolve(s)} />);
    await connect();
    expect(screen.getByTestId("wrong-chain").textContent).toContain("chain 1");
    expect(
      screen.getByTestId<HTMLButtonElement>("refund-button").disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Claim for seat 1",
      }).disabled,
    ).toBe(true);
    expect(sendPotAction).not.toHaveBeenCalled();
  });

  it('switches networks only when the user presses "Switch wallet network"', async () => {
    const wallet = installWallet({ chainId: 1 });
    render(<PotPage config={config} read={() => Promise.resolve(snap())} />);
    await connect();
    fireEvent.click(
      screen.getByRole("button", { name: /switch wallet network/i }),
    );
    await waitFor(() =>
      expect(wallet.methods()).toContain("wallet_switchEthereumChain"),
    );
    await waitFor(() => expect(screen.queryByTestId("wrong-chain")).toBeNull());
    expect(
      screen.getByTestId<HTMLButtonElement>("refund-button").disabled,
    ).toBe(false);
  });

  it("follows the wallet when the user changes network themselves", async () => {
    const wallet = installWallet({ chainId: 5042002 });
    render(<PotPage config={config} read={() => Promise.resolve(snap())} />);
    await connect();
    expect(
      screen.getByTestId<HTMLButtonElement>("refund-button").disabled,
    ).toBe(false);
    act(() => wallet.emit("chainChanged", "0x1"));
    await waitFor(() => expect(screen.getByTestId("wrong-chain")).toBeTruthy());
    expect(
      screen.getByTestId<HTMLButtonElement>("refund-button").disabled,
    ).toBe(true);
  });

  it("sends a refund only after connect plus an explicit press, and shows the real hash", async () => {
    installWallet({ chainId: 5042002 });
    const hash = `0x${"12".repeat(32)}` as const;
    vi.mocked(sendPotAction).mockImplementation(
      (_p, _c, _a, _action, onSubmitted) => {
        onSubmitted?.(hash);
        return Promise.resolve({ hash, status: "success" as const });
      },
    );
    render(<PotPage config={config} read={() => Promise.resolve(snap())} />);
    await connect();
    fireEvent.click(screen.getByTestId("refund-button"));
    await waitFor(() => expect(sendPotAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(sendPotAction).mock.calls[0]?.[3]).toEqual({
      kind: "refund",
      potId: ID,
    });
    await waitFor(() =>
      expect(screen.getByTestId("tx-status").textContent).toContain("Refund"),
    );
    expect(screen.getByTestId("tx-status").textContent).toContain(
      hash.slice(2, 8),
    );
  });

  it("shows a plain message when the user rejects in the wallet", async () => {
    installWallet({ chainId: 5042002 });
    vi.mocked(sendPotAction).mockRejectedValue(
      Object.assign(new Error("denied"), { code: 4001 }),
    );
    render(<PotPage config={config} read={() => Promise.resolve(snap())} />);
    await connect();
    fireEvent.click(screen.getByTestId("refund-button"));
    await waitFor(() =>
      expect(screen.getByTestId("tx-status").textContent).toMatch(/rejected/i),
    );
  });

  it("shows a reverted transaction as a failure, not a success", async () => {
    installWallet({ chainId: 5042002 });
    const hash = `0x${"34".repeat(32)}` as const;
    vi.mocked(sendPotAction).mockResolvedValue({ hash, status: "reverted" });
    render(<PotPage config={config} read={() => Promise.resolve(snap())} />);
    await connect();
    fireEvent.click(screen.getByTestId("refund-button"));
    await waitFor(() =>
      expect(screen.getByTestId("tx-status").textContent).toMatch(/reverted/i),
    );
  });

  it("reports a refused connection and stays disconnected", async () => {
    installWallet({ chainId: 5042002, rejectConnect: true });
    render(<PotPage config={config} read={() => Promise.resolve(snap())} />);
    fireEvent.click(await screen.findByTestId("connect-wallet"));
    await waitFor(() =>
      expect(screen.getByTestId("wallet-error").textContent).toMatch(
        /rejected/i,
      ),
    );
    expect(screen.queryByTestId("wallet-account")).toBeNull();
    expect(
      screen.getByTestId<HTMLButtonElement>("refund-button").disabled,
    ).toBe(true);
  });

  it("says so when there is no browser wallet, and reading still works", async () => {
    removeWallet();
    render(<PotPage config={config} read={() => Promise.resolve(snap())} />);
    await waitFor(() => expect(screen.getByTestId("seat-0")).toBeTruthy());
    expect(
      screen.getByTestId<HTMLButtonElement>("connect-wallet").disabled,
    ).toBe(true);
    expect(screen.getByTestId("connect-wallet").textContent).toMatch(
      /no browser wallet/i,
    );
  });
});
