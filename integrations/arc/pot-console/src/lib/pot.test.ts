import { describe, expect, it, vi } from "vitest";
import {
  ContractFunctionRevertedError,
  toFunctionSelector,
  type PublicClient,
} from "viem";
import { DEFAULT_CONFIG, type ChonksConfig } from "../config";
import {
  assetLabel,
  claimOpen,
  claimableSeats,
  formatDuration,
  isRevertNamed,
  parsePotId,
  readPot,
  refundStatus,
  secondsUntil,
  type PotSnapshot,
} from "./pot";
import { conditionalPotAbi } from "./potAbi";

const POT = "0x00000000000000000000000000000000000000a1" as const;
const SEATS = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
] as const;
const ID = `0x${"ab".repeat(32)}` as const;
const config: ChonksConfig = { ...DEFAULT_CONFIG, potAddress: POT };

function snap(over: Partial<PotSnapshot> = {}): PotSnapshot {
  return {
    potId: ID,
    chainId: 5042002,
    blockNumber: 100n,
    now: 1_000n,
    contract: POT,
    asset: DEFAULT_CONFIG.usdcAddress,
    stake: 1_000_000n,
    total: 3_000_000n,
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
    lockedAt: 0n,
    termsHash: `0x${"cd".repeat(32)}`,
    metadataHash: `0x${"ef".repeat(32)}`,
    state: "Funding",
    proposal: {
      placesHash: `0x${"00".repeat(32)}`,
      resultHash: `0x${"00".repeat(32)}`,
      at: 0n,
    },
    checkedAt: 0,
    ...over,
  };
}

describe("parsePotId", () => {
  it("accepts exactly 32 hex bytes and lower-cases them", () => {
    expect(parsePotId(`0x${"AB".repeat(32)}`)).toBe(ID);
    expect(parsePotId(`  ${ID}  `)).toBe(ID);
  });
  it.each([
    [""],
    ["0x"],
    ["0x12"],
    [`0x${"a".repeat(63)}`],
    [`0x${"a".repeat(65)}`],
    [`0x${"g".repeat(64)}`],
    ["a".repeat(64)],
  ])("rejects %j", (raw) => {
    expect(parsePotId(raw)).toBeUndefined();
  });
  it("rejects missing values", () => {
    expect(parsePotId(null)).toBeUndefined();
    expect(parsePotId(undefined)).toBeUndefined();
  });
});

describe("refundStatus mirrors the contract", () => {
  it("Funding opens exactly at the fund deadline (inclusive)", () => {
    expect(refundStatus(snap({ now: 1_999n })).available).toBe(false);
    expect(refundStatus(snap({ now: 1_999n })).opensAt).toBe(2_000n);
    expect(refundStatus(snap({ now: 2_000n })).available).toBe(true);
  });
  it("Locked opens exactly at the settle deadline (inclusive)", () => {
    expect(refundStatus(snap({ state: "Locked", now: 4_999n })).available).toBe(
      false,
    );
    expect(refundStatus(snap({ state: "Locked", now: 5_000n })).available).toBe(
      true,
    );
  });
  it("Contested is refundable immediately", () => {
    expect(refundStatus(snap({ state: "Contested", now: 1n })).available).toBe(
      true,
    );
  });
  it.each(["Proposed", "Settled", "Refunded", "None"] as const)(
    "%s is never refundable",
    (state) => {
      expect(refundStatus(snap({ state, now: 9_999_999n })).available).toBe(
        false,
      );
    },
  );
});

describe("claims", () => {
  it("only opens for Settled and Refunded", () => {
    expect(claimOpen(snap({ state: "Settled" }))).toBe(true);
    expect(claimOpen(snap({ state: "Refunded" }))).toBe(true);
    for (const state of [
      "None",
      "Funding",
      "Locked",
      "Proposed",
      "Contested",
    ] as const) {
      expect(claimOpen(snap({ state }))).toBe(false);
    }
  });
  it("lists only seats with something to claim", () => {
    const s = snap({ state: "Settled" });
    s.seats[1] = { ...s.seats[1], claimable: 3_000_000n };
    expect(claimableSeats(s).map((x) => x.index)).toEqual([1]);
    expect(claimableSeats({ ...s, state: "Locked" })).toEqual([]);
  });
});

describe("formatting helpers", () => {
  it("formats durations compactly", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(300)).toBe("5m");
    expect(formatDuration(3_660)).toBe("1h 1m");
    expect(formatDuration(90_000)).toBe("1d 1h");
  });
  it("never returns negative time", () => {
    expect(secondsUntil(snap(), 900n)).toBe(0);
    expect(secondsUntil(snap(), 1_030n)).toBe(30);
  });
  it("names configured assets only", () => {
    const withEurc: ChonksConfig = {
      ...config,
      eurcAddress: "0x4444444444444444444444444444444444444444",
    };
    expect(
      assetLabel(
        withEurc,
        DEFAULT_CONFIG.usdcAddress.toUpperCase().replace("0X", "0x"),
      ),
    ).toBe("USDC");
    expect(
      assetLabel(withEurc, "0x4444444444444444444444444444444444444444"),
    ).toBe("EURC");
    expect(
      assetLabel(config, "0x4444444444444444444444444444444444444444"),
    ).toBe("Unlisted asset");
  });
});

// ------------------------------------------------------------------ readPot

interface Call {
  functionName: string;
  blockNumber?: bigint;
  args?: unknown[];
}

function onchainPot(over: Record<string, unknown> = {}) {
  return {
    asset: DEFAULT_CONFIG.usdcAddress,
    stake: 1_000_000n,
    seats: [...SEATS],
    fundedBitmap: 3,
    acceptedBitmap: 3,
    rule: 1,
    oracle: SEATS[0],
    fundDeadline: 2_000n,
    settleDeadline: 5_000n,
    challengeWindow: 300,
    minPlaySeconds: 60,
    lockedAt: 0n,
    metadataHash: `0x${"ef".repeat(32)}`,
    termsHash: `0x${"cd".repeat(32)}`,
    state: 1,
    proposal: {
      placesHash: `0x${"00".repeat(32)}`,
      resultHash: `0x${"00".repeat(32)}`,
      at: 0n,
    },
    total: 3_000_000n,
    ...over,
  };
}

function fakeClient(
  opts: {
    chainId?: number;
    code?: string;
    decimals?: number;
    pot?: unknown;
    getPotError?: Error;
  } = {},
) {
  const calls: Call[] = [];
  const client = {
    getChainId: vi.fn(() => Promise.resolve(opts.chainId ?? 5042002)),
    getCode: vi.fn(() => Promise.resolve(opts.code ?? "0x6001")),
    getBlockNumber: vi.fn(() => Promise.resolve(777n)),
    getBlock: vi.fn(() =>
      Promise.resolve({ number: 777n, hash: ID, timestamp: 1_234n }),
    ),
    readContract: vi.fn((call: Call) => {
      calls.push(call);
      if (call.functionName === "eip712Domain")
        return Promise.resolve([
          "0x0f",
          "ChonksPot",
          "1",
          5042002n,
          POT,
          ID,
          [],
        ]);
      if (call.functionName === "getPot") {
        return opts.getPotError
          ? Promise.reject(opts.getPotError)
          : Promise.resolve(opts.pot ?? onchainPot());
      }
      if (call.functionName === "decimals")
        return Promise.resolve(opts.decimals ?? 6);
      if (call.functionName === "claimableOf") {
        return Promise.resolve(call.args?.[1] === SEATS[2] ? 900_000n : 0n);
      }
      return Promise.reject(new Error(`unexpected ${call.functionName}`));
    }),
  };
  return { client: client as unknown as PublicClient, calls, mocks: client };
}

describe("readPot", () => {
  it("reads every value at one pinned block and uses chain time", async () => {
    const { client, calls } = fakeClient();
    const s = await readPot(config, ID, { client, now: () => 1234000 });
    expect(s.blockNumber).toBe(777n);
    expect(s.now).toBe(1_234n);
    expect(s.state).toBe("Funding");
    expect(s.seats.map((x) => x.funded)).toEqual([true, true, false]);
    expect(s.seats[2].claimable).toBe(900_000n);
    expect(s.checkedAt).toBe(1234000);
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect(calls.every((c) => c.blockNumber === 777n)).toBe(true);
  });

  it("refuses when no contract address is configured, without touching the network", async () => {
    const { client, mocks } = fakeClient();
    await expect(
      readPot(DEFAULT_CONFIG, ID, { client, now: () => 1234000 }),
    ).rejects.toMatchObject({ kind: "config" });
    expect(mocks.getChainId).not.toHaveBeenCalled();
  });

  it("checks the chain before reading anything else", async () => {
    const { client, mocks } = fakeClient({ chainId: 1 });
    await expect(
      readPot(config, ID, { client, now: () => 1234000 }),
    ).rejects.toMatchObject({ kind: "wrong-chain" });
    expect(mocks.readContract).not.toHaveBeenCalled();
  });

  it("reports a missing contract", async () => {
    const { client } = fakeClient({ code: "0x" });
    await expect(
      readPot(config, ID, { client, now: () => 1234000 }),
    ).rejects.toMatchObject({ kind: "not-deployed" });
  });

  it("maps the UnknownPot revert to not-found", async () => {
    const revert = new ContractFunctionRevertedError({
      abi: conditionalPotAbi,
      functionName: "getPot",
      data: toFunctionSelector("UnknownPot()"),
    });
    expect(isRevertNamed(revert, "UnknownPot")).toBe(true);
    expect(isRevertNamed(revert, "WrongState")).toBe(false);
    expect(isRevertNamed(new Error("x"), "UnknownPot")).toBe(false);
    const { client } = fakeClient({ getPotError: revert });
    await expect(
      readPot(config, ID, { client, now: () => 1234000 }),
    ).rejects.toMatchObject({ kind: "not-found" });
  });

  it("rejects an asset that is not six decimals", async () => {
    const { client } = fakeClient({ decimals: 18 });
    await expect(
      readPot(config, ID, { client, now: () => 1234000 }),
    ).rejects.toMatchObject({ kind: "decimals" });
  });

  it("wraps unexpected failures as RPC errors", async () => {
    const { client } = fakeClient({ getPotError: new Error("boom") });
    await expect(
      readPot(config, ID, { client, now: () => 1234000 }),
    ).rejects.toMatchObject({ kind: "rpc" });
  });
});

describe("ABI used by the console", () => {
  it("has the read and write entry points the console calls", () => {
    const names = conditionalPotAbi
      .filter((x) => x.type === "function")
      .map((x) => x.name);
    for (const n of ["getPot", "claimableOf", "refund", "claim", "hashTerms"])
      expect(names).toContain(n);
  });
});
