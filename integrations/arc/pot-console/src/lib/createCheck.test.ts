import { describe, expect, it, vi } from "vitest";
import {
  ContractFunctionRevertedError,
  toFunctionSelector,
  type PublicClient,
} from "viem";
import { DEFAULT_CONFIG, type ChonksConfig } from "../config";
import { preflightCreate } from "./createCheck";
import {
  validateCreateForm,
  type CreateFormValues,
  type ValidTerms,
} from "./createForm";
import { conditionalPotAbi } from "./potAbi";

const POT = "0x00000000000000000000000000000000000000A1" as const;
const config: ChonksConfig = { ...DEFAULT_CONFIG, potAddress: POT };
const values: CreateFormValues = {
  potId: `0x${"ab".repeat(32)}`,
  asset: "usdc",
  stake: "1.5",
  seats: [
    "0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7",
    "0x0376AAc07Ad725E01357B1725B5ceC61aE10473c",
    "",
    "",
  ],
  rule: "TOP2_70_30",
  noOracle: true,
  oracle: "",
  fundDeadline: "1700003600",
  settleDeadline: "1700086400",
  challengeWindow: "300",
  minPlaySeconds: "60",
  metadataHash: `0x${"00".repeat(32)}`,
};
const valid = (): ValidTerms => {
  const r = validateCreateForm(values, config, 1_700_000_000n);
  if (!r.ok) throw new Error("fixture invalid");
  return r.value;
};

interface Opts {
  chainId?: number;
  code?: string;
  allowed?: boolean;
  contractHash?: string;
  exists?: boolean;
  timestamp?: bigint;
  rpcError?: Error;
}
function fake(o: Opts = {}) {
  const v = valid();
  const unknownPot = new ContractFunctionRevertedError({
    abi: conditionalPotAbi,
    functionName: "getPot",
    data: toFunctionSelector("UnknownPot()"),
  });
  const client = {
    getChainId: vi.fn(() =>
      o.rpcError
        ? Promise.reject(o.rpcError)
        : Promise.resolve(o.chainId ?? 5042002),
    ),
    getCode: vi.fn(() => Promise.resolve(o.code ?? "0x6001")),
    getBlock: vi.fn(() =>
      Promise.resolve({
        number: 10n,
        hash: values.potId,
        timestamp: o.timestamp ?? 1_700_000_000n,
      }),
    ),
    readContract: vi.fn(({ functionName }: { functionName: string }) => {
      if (functionName === "eip712Domain")
        return Promise.resolve([
          "0x0f",
          "ChonksPot",
          "1",
          5042002n,
          POT,
          values.potId,
          [],
        ]);
      if (functionName === "isAllowedAsset")
        return Promise.resolve(o.allowed ?? true);
      if (functionName === "hashTerms")
        return Promise.resolve(o.contractHash ?? v.termsHash);
      if (functionName === "getPot")
        return o.exists ? Promise.resolve({}) : Promise.reject(unknownPot);
      return Promise.reject(new Error(`unexpected ${functionName}`));
    }),
  };
  return { client: client as unknown as PublicClient, spy: client };
}

describe("preflightCreate", () => {
  it("passes when the contract agrees with the page", async () => {
    const { client } = fake();
    const r = await preflightCreate(config, valid(), {
      client,
      now: () => 1700000000000,
    });
    expect(r).toMatchObject({
      status: "ok",
      forHash: valid().termsHash,
      chainTime: 1_700_000_000n,
    });
  });

  it("blocks, reading nothing, when no contract is configured", async () => {
    const { client, spy } = fake();
    const r = await preflightCreate(DEFAULT_CONFIG, valid(), {
      client,
      now: () => 1700000000000,
    });
    expect(r).toMatchObject({ status: "blocked", code: "not-configured" });
    expect(spy.getChainId).not.toHaveBeenCalled();
  });

  it("blocks on the wrong chain before reading the contract", async () => {
    const { client, spy } = fake({ chainId: 1 });
    const r = await preflightCreate(config, valid(), {
      client,
      now: () => 1700000000000,
    });
    expect(r).toMatchObject({ status: "blocked", code: "wrong-chain" });
    expect(spy.getCode).not.toHaveBeenCalled();
  });

  it("blocks when nothing is deployed at the configured address (stale address)", async () => {
    const { client } = fake({ code: "0x" });
    expect(
      await preflightCreate(config, valid(), {
        client,
        now: () => 1700000000000,
      }),
    ).toMatchObject({ code: "not-deployed" });
  });

  it("blocks when the contract does not allow the chosen token (stale asset list)", async () => {
    const { client } = fake({ allowed: false });
    const r = await preflightCreate(config, valid(), {
      client,
      now: () => 1700000000000,
    });
    expect(r).toMatchObject({ status: "blocked", code: "asset-not-allowed" });
  });

  it("blocks when the contract computes a different terms hash (stale or mismatched build)", async () => {
    const { client } = fake({ contractHash: `0x${"11".repeat(32)}` });
    const r = await preflightCreate(config, valid(), {
      client,
      now: () => 1700000000000,
    });
    expect(r).toMatchObject({ status: "blocked", code: "hash-mismatch" });
    expect(r.status === "blocked" && r.message).toContain("do not sign");
  });

  it("blocks an id that is already taken", async () => {
    const { client } = fake({ exists: true });
    expect(
      await preflightCreate(config, valid(), {
        client,
        now: () => 1700000000000,
      }),
    ).toMatchObject({ code: "pot-exists" });
  });

  it("blocks when the funding deadline has already passed in chain time", async () => {
    const { client } = fake({ timestamp: 1_700_003_600n });
    expect(
      await preflightCreate(config, valid(), {
        client,
        now: () => 1700003600000,
      }),
    ).toMatchObject({ code: "deadline-passed" });
  });

  it("reports an RPC failure instead of throwing", async () => {
    const { client } = fake({ rpcError: new Error("boom") });
    const r = await preflightCreate(config, valid(), {
      client,
      now: () => 1700000000000,
    });
    expect(r).toMatchObject({ status: "blocked", code: "rpc" });
  });
});
