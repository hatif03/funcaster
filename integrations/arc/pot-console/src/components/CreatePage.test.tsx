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
import { installWallet, removeWallet } from "../test/fakeWallet";
import { hashTerms } from "../lib/signing";

vi.mock("../lib/wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/wallet")>();
  return { ...actual, sendPotAction: vi.fn() };
});
vi.mock("../lib/createCheck", () => ({ preflightCreate: vi.fn() }));

import { preflightCreate } from "../lib/createCheck";
import { sendPotAction } from "../lib/wallet";
import { CreatePage } from "./CreatePage";

const POT = "0x00000000000000000000000000000000000000a1" as const;
const configured: ChonksConfig = { ...DEFAULT_CONFIG, potAddress: POT };
const A = "0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7";
const B = "0x0376AAc07Ad725E01357B1725B5ceC61aE10473c";
const ID = `0x${"ab".repeat(32)}` as const;
const future = (offset: number) =>
  String(Math.floor(Date.now() / 1000) + offset);

function set(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillValid(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    "Pot id (32 bytes)": ID,
    Token: "usdc",
    "Stake per seat": "1.5",
    "Seat 1": A,
    "Seat 2": B,
    "Payout rule": "TOP2_70_30",
    "Oracle address": B,
    "Funding deadline": future(3600),
    "Settle deadline": future(90_000),
    "Challenge window (seconds, at least 60)": "300",
    "Minimum play time (seconds, above 0)": "60",
    "Off-chain terms hash (32 bytes)": `0x${"00".repeat(32)}`,
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) set(label, value);
}

beforeEach(() => window.history.replaceState({}, "", "/pot/?view=create"));
afterEach(() => {
  cleanup();
  removeWallet();
  vi.mocked(preflightCreate).mockReset();
  vi.mocked(sendPotAction).mockReset();
  window.history.replaceState({}, "", "/");
});

describe("CreatePage", () => {
  it("disables creation with a clear reason when no contract is configured", () => {
    render(<CreatePage config={DEFAULT_CONFIG} />);
    expect(screen.getByTestId("create-unconfigured").textContent).toContain(
      "VITE_CHONKS_POT_ADDRESS",
    );
    fillValid();
    expect(
      screen.getByTestId<HTMLButtonElement>("create-submit").disabled,
    ).toBe(true);
    expect(screen.getByTestId<HTMLButtonElement>("check-terms").disabled).toBe(
      true,
    );
    expect(screen.getByTestId("create-disabled-reason").textContent).toMatch(
      /No ConditionalPot address/,
    );
    // the terms can still be reviewed
    expect(screen.getByTestId("terms-review")).toBeTruthy();
  });

  it("starts empty: no timing or other defaults are filled in", () => {
    render(<CreatePage config={configured} />);
    for (const label of [
      "Funding deadline",
      "Settle deadline",
      "Challenge window (seconds, at least 60)",
      "Minimum play time (seconds, above 0)",
    ]) {
      expect(screen.getByLabelText<HTMLInputElement>(label).value).toBe("");
    }
    expect(screen.queryByTestId("terms-review")).toBeNull();
  });

  it("shows field errors for malformed input and no review until the form is valid", () => {
    render(<CreatePage config={configured} />);
    fillValid({
      "Stake per seat": "1.0000001",
      "Funding deadline": "12.5",
      "Pot id (32 bytes)": "0x12",
    });
    expect(screen.getByTestId("stake-error").textContent).toMatch(/6 decimal/);
    expect(screen.getByTestId("fundDeadline-error").textContent).toMatch(
      /whole number/,
    );
    expect(screen.getByTestId("potId-error").textContent).toMatch(/64 hex/);
    expect(screen.queryByTestId("terms-review")).toBeNull();
    expect(screen.getByTestId<HTMLButtonElement>("check-terms").disabled).toBe(
      true,
    );
  });

  it("shows every term and the canonical hash for review", () => {
    render(<CreatePage config={configured} />);
    fillValid();
    expect(screen.getByTestId("review-stake").textContent).toBe("1.5");
    expect(screen.getByTestId("review-total").textContent).toBe("3");
    expect(screen.getByTestId("review-pot-id").textContent).toBe(ID);
    const hash = screen.getByTestId("review-terms-hash").textContent;
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    const review = screen.getByTestId("terms-review").textContent ?? "";
    for (const needle of [A, B, "Top two 70/30", "5m", "1m"])
      expect(review).toContain(needle);
    // the shown hash is the canonical one
    expect(hash).toBe(
      hashTerms({
        potId: ID,
        asset: DEFAULT_CONFIG.usdcAddress,
        stake: 1_500_000n,
        seats: [A, B],
        rule: "TOP2_70_30",
        oracle: B,
        fundDeadline: BigInt(
          screen.getByLabelText<HTMLInputElement>("Funding deadline").value,
        ),
        settleDeadline: BigInt(
          screen.getByLabelText<HTMLInputElement>("Settle deadline").value,
        ),
        challengeWindow: 300,
        minPlaySeconds: 60,
        metadataHash: `0x${"00".repeat(32)}`,
      }),
    );
  });

  it("keeps the submit button disabled until the terms are checked, a wallet is connected and the chain is right", async () => {
    installWallet({ chainId: 5042002 });
    vi.mocked(preflightCreate).mockImplementation((_c, value) =>
      Promise.resolve({
        status: "ok",
        forHash: value.termsHash,
        chainTime: 1n,
        contractHash: value.termsHash,
      }),
    );
    render(<CreatePage config={configured} />);
    fillValid();
    const submit = () => screen.getByTestId<HTMLButtonElement>("create-submit");
    expect(submit().disabled).toBe(true);
    fireEvent.click(screen.getByTestId("check-terms"));
    await waitFor(() =>
      expect(
        screen.getByTestId("check-result").getAttribute("data-status"),
      ).toBe("ok"),
    );
    expect(submit().disabled).toBe(true); // still no wallet
    expect(screen.getByTestId("create-disabled-reason").textContent).toMatch(
      /Connect a wallet/,
    );
    fireEvent.click(screen.getByTestId("connect-wallet"));
    await waitFor(() => expect(submit().disabled).toBe(false));
  });

  it("blocks on stale configuration reported by the contract check", async () => {
    installWallet({ chainId: 5042002 });
    vi.mocked(preflightCreate).mockResolvedValue({
      status: "blocked",
      code: "hash-mismatch",
      message:
        "The contract computes a different terms hash. do not sign anything.",
    });
    render(<CreatePage config={configured} />);
    fillValid();
    fireEvent.click(screen.getByTestId("check-terms"));
    await waitFor(() =>
      expect(
        screen.getByTestId("check-result").getAttribute("data-status"),
      ).toBe("hash-mismatch"),
    );
    fireEvent.click(screen.getByTestId("connect-wallet"));
    await waitFor(() =>
      expect(screen.getByTestId("wallet-account")).toBeTruthy(),
    );
    expect(
      screen.getByTestId<HTMLButtonElement>("create-submit").disabled,
    ).toBe(true);
  });

  it("invalidates a passed check when any field is edited afterwards", async () => {
    vi.mocked(preflightCreate).mockImplementation((_c, value) =>
      Promise.resolve({
        status: "ok",
        forHash: value.termsHash,
        chainTime: 1n,
        contractHash: value.termsHash,
      }),
    );
    render(<CreatePage config={configured} />);
    fillValid();
    fireEvent.click(screen.getByTestId("check-terms"));
    await waitFor(() =>
      expect(screen.getByTestId("check-result")).toBeTruthy(),
    );
    set("Stake per seat", "2");
    expect(screen.queryByTestId("check-result")).toBeNull();
    expect(
      screen.getByTestId<HTMLButtonElement>("create-submit").disabled,
    ).toBe(true);
  });

  it("blocks submission on the wrong wallet chain and never switches it implicitly", async () => {
    const wallet = installWallet({ chainId: 1 });
    vi.mocked(preflightCreate).mockImplementation((_c, value) =>
      Promise.resolve({
        status: "ok",
        forHash: value.termsHash,
        chainTime: 1n,
        contractHash: value.termsHash,
      }),
    );
    render(<CreatePage config={configured} />);
    fillValid();
    fireEvent.click(screen.getByTestId("check-terms"));
    await waitFor(() =>
      expect(screen.getByTestId("check-result")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("connect-wallet"));
    await waitFor(() => expect(screen.getByTestId("wrong-chain")).toBeTruthy());
    expect(
      screen.getByTestId<HTMLButtonElement>("create-submit").disabled,
    ).toBe(true);
    expect(screen.getByTestId("create-disabled-reason").textContent).toMatch(
      /Switch your wallet/,
    );
    expect(wallet.methods()).not.toContain("wallet_switchEthereumChain");
    expect(sendPotAction).not.toHaveBeenCalled();
  });

  async function readyToSubmit() {
    installWallet({ chainId: 5042002 });
    vi.mocked(preflightCreate).mockImplementation((_c, value) =>
      Promise.resolve({
        status: "ok",
        forHash: value.termsHash,
        chainTime: 1n,
        contractHash: value.termsHash,
      }),
    );
    render(<CreatePage config={configured} />);
    fillValid();
    fireEvent.click(screen.getByTestId("check-terms"));
    await waitFor(() =>
      expect(screen.getByTestId("check-result")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("connect-wallet"));
    await waitFor(() =>
      expect(
        screen.getByTestId<HTMLButtonElement>("create-submit").disabled,
      ).toBe(false),
    );
  }

  it("submits exactly the reviewed terms, only on the explicit button", async () => {
    const hash = `0x${"56".repeat(32)}` as const;
    vi.mocked(sendPotAction).mockImplementation(
      (_p, _c, _a, _action, onSubmitted) => {
        onSubmitted?.(hash);
        return Promise.resolve({ hash, status: "success" as const });
      },
    );
    await readyToSubmit();
    expect(sendPotAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("create-submit"));
    await waitFor(() => expect(sendPotAction).toHaveBeenCalledTimes(1));
    const action = vi.mocked(sendPotAction).mock.calls[0]?.[3];
    expect(action?.kind).toBe("create");
    if (action?.kind !== "create") return;
    const [id, params] = action.args;
    expect(id).toBe(ID);
    expect(params).toMatchObject({
      stake: 1_500_000n,
      seats: [A, B],
      rule: 1,
      oracle: B,
      challengeWindow: 300,
      minPlaySeconds: 60,
    });
    await waitFor(() =>
      expect(
        screen
          .getByRole("link", { name: "Open this pot" })
          .getAttribute("href"),
      ).toContain(`?pot=${ID}`),
    );
  });

  it("shows a wallet rejection and a contract revert in plain words", async () => {
    vi.mocked(sendPotAction).mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: 4001 }),
    );
    await readyToSubmit();
    fireEvent.click(screen.getByTestId("create-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("tx-status").textContent).toMatch(/rejected/i),
    );
    vi.mocked(sendPotAction).mockRejectedValueOnce(
      new Error("simulation failed"),
    );
    fireEvent.click(screen.getByTestId("create-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("tx-status").textContent).toMatch(
        /simulation failed/,
      ),
    );
  });

  it("generates a pot id only when asked", () => {
    render(<CreatePage config={configured} />);
    expect(
      screen.getByLabelText<HTMLInputElement>("Pot id (32 bytes)").value,
    ).toBe("");
    fireEvent.click(screen.getByTestId("generate-id"));
    expect(
      screen.getByLabelText<HTMLInputElement>("Pot id (32 bytes)").value,
    ).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
