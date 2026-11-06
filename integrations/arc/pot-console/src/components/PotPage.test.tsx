// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { DEFAULT_CONFIG, type ChonksConfig } from "../config";
import { ReadError } from "../lib/reader";
import type { PotSnapshot } from "../lib/pot";
import { PotPage } from "./PotPage";
import { Header } from "./Header";

const POT = "0x00000000000000000000000000000000000000a1" as const;
const ID = `0x${"ab".repeat(32)}` as const;
const SEATS = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
] as const;
const config: ChonksConfig = { ...DEFAULT_CONFIG, potAddress: POT };

function snap(over: Partial<PotSnapshot> = {}): PotSnapshot {
  return {
    potId: ID,
    chainId: 5042002,
    blockNumber: 321n,
    now: 1_000n,
    contract: POT,
    asset: DEFAULT_CONFIG.usdcAddress,
    stake: 1_500_000n,
    total: 3_000_000n,
    seats: SEATS.map((address, index) => ({
      index,
      address,
      funded: true,
      accepted: true,
      claimable: 0n,
    })),
    rule: 1,
    oracle: SEATS[0],
    fundDeadline: 2_000n,
    settleDeadline: 5_000n,
    challengeWindow: 300,
    minPlaySeconds: 60,
    lockedAt: 900n,
    termsHash: `0x${"cd".repeat(32)}`,
    metadataHash: `0x${"ef".repeat(32)}`,
    state: "Locked",
    proposal: {
      placesHash: `0x${"00".repeat(32)}`,
      resultHash: `0x${"00".repeat(32)}`,
      at: 0n,
    },
    checkedAt: 0,
    ...over,
  };
}

function open(search: string) {
  window.history.replaceState({}, "", `/pot/${search}`);
}

beforeEach(() => open(""));
afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("Header", () => {
  it("always shows the play-money label and the Funcaster name", () => {
    render(<Header />);
    expect(screen.getByTestId("play-money-label").textContent).toBe(
      "PLAY MONEY · ARC TESTNET",
    );
    expect(screen.getByRole("heading", { name: "Funcaster Pot" })).toBeTruthy();
  });
});

describe("PotPage states", () => {
  it("shows an empty state and reads nothing without a pot id", () => {
    const read = vi.fn();
    render(<PotPage config={config} read={read} />);
    expect(screen.getByTestId("pot-empty")).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects a malformed ?pot= and reads nothing", () => {
    open("?pot=0x1234");
    const read = vi.fn();
    render(<PotPage config={config} read={read} />);
    expect(screen.getByTestId("pot-invalid").textContent).toContain("0x1234");
    expect(read).not.toHaveBeenCalled();
  });

  it("says when the contract is not configured, and reads nothing", () => {
    open(`?pot=${ID}`);
    const read = vi.fn();
    render(<PotPage config={DEFAULT_CONFIG} read={read} />);
    expect(screen.getByTestId("pot-unconfigured").textContent).toContain(
      "not connected to a deployed pot",
    );
    expect(read).not.toHaveBeenCalled();
  });

  it("shows a loading state without inventing values", () => {
    open(`?pot=${ID}`);
    render(
      <PotPage
        config={config}
        read={() => new Promise<PotSnapshot>(() => {})}
      />,
    );
    expect(screen.getByTestId("pot-loading")).toBeTruthy();
    expect(screen.queryByTestId("pot-total")).toBeNull();
  });

  it.each([
    ["not-found", "Pot not found"],
    ["wrong-chain", "Wrong chain"],
    ["rpc", "RPC unavailable"],
    ["decimals", "Unsupported asset"],
    ["not-deployed", "Not deployed"],
  ] as const)("shows a %s error", async (kind, title) => {
    open(`?pot=${ID}`);
    render(
      <PotPage
        config={config}
        read={() => Promise.reject(new ReadError(kind, "details here"))}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("pot-error")).toBeTruthy());
    expect(screen.getByTestId("pot-error").textContent).toContain(title);
    expect(screen.getByTestId("pot-error").textContent).toContain(
      "details here",
    );
  });

  it("loads a pot from the deep link without a wallet", async () => {
    open(`?pot=${ID.toUpperCase().replace("0X", "0x")}`);
    const read = vi.fn(() => Promise.resolve(snap()));
    render(<PotPage config={config} read={read} />);
    await waitFor(() =>
      expect(screen.getByTestId("pot-state").textContent).toContain("Locked"),
    );
    expect(read).toHaveBeenCalledWith(config, ID);
    expect(screen.getByTestId("pot-total").textContent).toContain("3.000000");
    expect(screen.getByTestId("pot-total").textContent).toContain("USDC");
    expect(screen.getByTestId("seat-0")).toBeTruthy();
    expect(screen.getByTestId("seat-1")).toBeTruthy();
  });

  it("keeps Refund disabled before its deadline and explains why", async () => {
    open(`?pot=${ID}`);
    render(<PotPage config={config} read={() => Promise.resolve(snap())} />);
    await waitFor(() =>
      expect(screen.getByTestId("refund-button")).toBeTruthy(),
    );
    expect(
      screen.getByTestId<HTMLButtonElement>("refund-button").disabled,
    ).toBe(true);
    expect(screen.getByTestId("refund-reason").textContent).toMatch(
      /settle deadline/i,
    );
  });

  it("keeps Refund disabled without a wallet even when the contract would accept it", async () => {
    open(`?pot=${ID}`);
    render(
      <PotPage
        config={config}
        read={() => Promise.resolve(snap({ now: 5_000n }))}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("refund-needs-wallet")).toBeTruthy(),
    );
    expect(
      screen.getByTestId<HTMLButtonElement>("refund-button").disabled,
    ).toBe(true);
    expect(screen.getByTestId("refund-reason").textContent).toMatch(
      /stake back/i,
    );
  });

  it("shows Claim only for seats with a payout after settlement", async () => {
    open(`?pot=${ID}`);
    const s = snap({ state: "Settled" });
    s.seats[1] = { ...s.seats[1], claimable: 3_000_000n };
    render(<PotPage config={config} read={() => Promise.resolve(s)} />);
    await waitFor(() =>
      expect(screen.getByTestId("seat-1-claimable").textContent).toContain(
        "3.000000",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Claim for seat 2" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Claim for seat 1" }),
    ).toBeNull();
  });

  it("shows no Claim button before settlement", async () => {
    open(`?pot=${ID}`);
    render(<PotPage config={config} read={() => Promise.resolve(snap())} />);
    await waitFor(() => expect(screen.getByTestId("seat-0")).toBeTruthy());
    expect(
      screen.queryByRole("button", { name: /^Claim for seat/ }),
    ).toBeNull();
  });

  it("loads a pot from the form and writes the deep link", async () => {
    const read = vi.fn(() => Promise.resolve(snap()));
    render(<PotPage config={config} read={read} />);
    fireEvent.change(screen.getByLabelText(/pot id/i), {
      target: { value: ID },
    });
    fireEvent.click(screen.getByRole("button", { name: /load pot/i }));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(window.location.search).toBe(`?pot=${ID}`);
    expect(window.location.pathname).toBe(import.meta.env.BASE_URL);
  });

  it("refuses to submit an invalid id", () => {
    const read = vi.fn();
    render(<PotPage config={config} read={read} />);
    fireEvent.change(screen.getByLabelText(/pot id/i), {
      target: { value: "nope" },
    });
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: /load pot/i })
        .disabled,
    ).toBe(true);
    expect(read).not.toHaveBeenCalled();
  });

  it("stays inside a 320px screen: wrapping addresses, single column, full-width buttons", async () => {
    open(`?pot=${ID}`);
    const { container } = render(
      <PotPage
        config={config}
        read={() => Promise.resolve(snap({ now: 5_000n }))}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("refund-button")).toBeTruthy(),
    );
    // no hard-coded widths anywhere
    for (const el of container.querySelectorAll<HTMLElement>("[style]")) {
      expect(el.style.width).toBe("");
      expect(el.style.minWidth).toBe("");
    }
    expect(container.innerHTML).not.toMatch(/\bw-\[\d+px\]|\bmin-w-\[\d+px\]/);
    // long hashes and addresses can wrap
    for (const mono of container.querySelectorAll(".mono:not(input)")) {
      expect(mono.className).toMatch(/break-all|break-words/);
    }
    expect(screen.getByTestId("refund-button").className).toContain("w-full");
  });
});
