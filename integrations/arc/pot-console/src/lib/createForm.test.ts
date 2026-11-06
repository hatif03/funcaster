import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type ChonksConfig } from "../config";
import {
  EMPTY_FORM,
  MAX_UINT256,
  randomPotId,
  toCreateArgs,
  validateCreateForm,
  type CreateFormValues,
} from "./createForm";
import { hashTerms } from "./signing";

const NOW = 1_700_000_000n;
const config: ChonksConfig = {
  ...DEFAULT_CONFIG,
  potAddress: "0x00000000000000000000000000000000000000A1",
};
const A = "0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7";
const B = "0x0376AAc07Ad725E01357B1725B5ceC61aE10473c";
const C = "0x0F89F1868aF3b14a5eca86ed9a5404A742a11454";

const good: CreateFormValues = {
  potId: `0x${"ab".repeat(32)}`,
  asset: "usdc",
  stake: "1.5",
  seats: [A, B, "", ""],
  rule: "TOP2_70_30",
  noOracle: false,
  oracle: C,
  fundDeadline: "1700003600",
  settleDeadline: "1700086400",
  challengeWindow: "300",
  minPlaySeconds: "60",
  metadataHash: `0x${"00".repeat(32)}`,
};

const errorsFor = (patch: Partial<CreateFormValues>) => {
  const r = validateCreateForm({ ...good, ...patch }, config, NOW);
  if (r.ok) throw new Error("expected validation errors");
  return r.errors;
};

describe("validateCreateForm", () => {
  it("accepts a complete form and computes the canonical hash from exactly those terms", () => {
    const r = validateCreateForm(good, config, NOW);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.value.terms.stake).toBe(1_500_000n);
    expect(r.value.total).toBe(3_000_000n);
    expect(r.value.assetLabel).toBe("USDC");
    expect(r.value.terms.seats).toEqual([A, B]);
    expect(r.value.termsHash).toBe(hashTerms(r.value.terms));
  });

  it("refuses an empty form with an error on every required field and no defaults", () => {
    const r = validateCreateForm(EMPTY_FORM, config, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    for (const key of [
      "potId",
      "asset",
      "stake",
      "seats",
      "rule",
      "oracle",
      "fundDeadline",
      "settleDeadline",
      "challengeWindow",
      "minPlaySeconds",
      "metadataHash",
    ] as const) {
      expect(r.errors[key], key).toBeTruthy();
    }
  });

  it.each([
    ["not hex", "hello"],
    ["too short", "0x1234"],
    ["too long", `0x${"ab".repeat(33)}`],
    ["bad characters", `0x${"zz".repeat(32)}`],
  ])("rejects a malformed pot id (%s)", (_name, potId) => {
    expect(errorsFor({ potId }).potId).toBeTruthy();
  });

  it.each([
    ["seven decimals", "1.0000001", /6 decimal/i],
    ["negative", "-1", /above zero/i],
    ["zero", "0", /above zero/i],
    ["zero with decimals", "0.000000", /above zero/i],
    ["scientific notation", "1e6", /plain decimal/i],
    ["letters", "abc", /plain decimal/i],
    ["comma decimal", "1,5", /plain decimal/i],
    ["thousands separator", "1,000.00", /plain decimal/i],
    ["hex", "0x10", /plain decimal/i],
  ])("rejects a malformed stake: %s", (_name, stake, message) => {
    expect(errorsFor({ stake }).stake).toMatch(message);
  });

  it("accepts the smallest and an exact six-decimal stake without rounding", () => {
    const r = validateCreateForm({ ...good, stake: "0.000001" }, config, NOW);
    expect(r.ok && r.value.terms.stake).toBe(1n);
    const s = validateCreateForm({ ...good, stake: "123.456789" }, config, NOW);
    expect(s.ok && s.value.terms.stake).toBe(123_456_789n);
  });

  it("bounds stake times seats to 256 bits", () => {
    const atLimit = (MAX_UINT256 / 2n).toString();
    // base units -> decimal string with 6 places
    const toDecimal = (raw: bigint) =>
      `${raw / 1_000_000n}.${(raw % 1_000_000n).toString().padStart(6, "0")}`;
    expect(
      validateCreateForm(
        { ...good, stake: toDecimal(BigInt(atLimit)) },
        config,
        NOW,
      ).ok,
    ).toBe(true);
    expect(errorsFor({ stake: toDecimal(BigInt(atLimit) + 1n) }).stake).toMatch(
      /256 bits/,
    );
    expect(errorsFor({ stake: toDecimal(MAX_UINT256) }).stake).toMatch(
      /256 bits/,
    );
  });

  it("rejects bad seat lists", () => {
    expect(errorsFor({ seats: [A, "", "", ""] }).seats).toMatch(/2 to 4/);
    expect(errorsFor({ seats: [A, A, "", ""] }).seats).toMatch(/repeats/);
    expect(errorsFor({ seats: [A, A.toLowerCase(), "", ""] }).seats).toMatch(
      /repeats/,
    );
    expect(errorsFor({ seats: [A, "nope", "", ""] }).seats).toMatch(
      /Seat 2 is not a valid address/,
    );
    expect(
      errorsFor({
        seats: [A, "0x0000000000000000000000000000000000000000", "", ""],
      }).seats,
    ).toMatch(/zero address/);
    expect(errorsFor({ seats: [A, "", C, ""] }).seats).toMatch(
      /Seat 2 is empty/,
    );
  });

  it("accepts three and four seats and normalises case", () => {
    const three = validateCreateForm(
      { ...good, seats: [A, B, C.toLowerCase(), ""] },
      config,
      NOW,
    );
    expect(three.ok && three.value.terms.seats).toEqual([A, B, C]);
    const four = validateCreateForm(
      {
        ...good,
        seats: [A, B, C, "0x00000000000000000000000000000000000000B2"],
      },
      config,
      NOW,
    );
    expect(four.ok && four.value.total).toBe(6_000_000n);
  });

  it('requires an oracle or an explicit "no oracle"', () => {
    expect(errorsFor({ oracle: "" }).oracle).toMatch(/No oracle/);
    expect(errorsFor({ oracle: "zzz" }).oracle).toMatch(/valid non-zero/);
    expect(
      errorsFor({ oracle: "0x0000000000000000000000000000000000000000" })
        .oracle,
    ).toMatch(/valid non-zero/);
    const none = validateCreateForm(
      { ...good, oracle: "", noOracle: true },
      config,
      NOW,
    );
    expect(none.ok && none.value.terms.oracle).toBe(
      "0x0000000000000000000000000000000000000000",
    );
  });

  it.each([
    ["fundDeadline", "1.5", /whole number/],
    ["fundDeadline", "-5", /whole number/],
    ["fundDeadline", "1e9", /whole number/],
    ["fundDeadline", "", /Required/],
    ["fundDeadline", "18446744073709551616", /64 bits/],
    ["settleDeadline", "12 34", /whole number/],
    ["challengeWindow", "4294967296", /32 bits/],
    ["minPlaySeconds", "soon", /whole number/],
  ] as const)('rejects malformed timing %s = "%s"', (field, value, message) => {
    expect(errorsFor({ [field]: value })[field]).toMatch(message);
  });

  it("enforces the timing rules the contract enforces", () => {
    expect(errorsFor({ challengeWindow: "59" }).challengeWindow).toMatch(/60/);
    expect(
      validateCreateForm({ ...good, challengeWindow: "60" }, config, NOW).ok,
    ).toBe(true);
    expect(errorsFor({ minPlaySeconds: "0" }).minPlaySeconds).toMatch(
      /above zero/,
    );
    expect(errorsFor({ fundDeadline: NOW.toString() }).fundDeadline).toMatch(
      /future/,
    );
    expect(errorsFor({ fundDeadline: "1699999999" }).fundDeadline).toMatch(
      /future/,
    );
    // settle must be strictly after fund + minPlay
    expect(
      errorsFor({
        fundDeadline: "1700003600",
        minPlaySeconds: "100",
        settleDeadline: "1700003700",
      }).settleDeadline,
    ).toMatch(/later than/);
    expect(
      validateCreateForm(
        { ...good, minPlaySeconds: "100", settleDeadline: "1700003701" },
        config,
        NOW,
      ).ok,
    ).toBe(true);
  });

  it("uses the supplied clock, so chain time can replace the browser clock", () => {
    const r = validateCreateForm(good, config, 1_700_003_600n);
    expect(r.ok).toBe(false);
  });

  it("rejects a malformed off-chain terms hash", () => {
    expect(errorsFor({ metadataHash: "" }).metadataHash).toMatch(/Required/);
    expect(errorsFor({ metadataHash: "0x12" }).metadataHash).toMatch(/64 hex/);
  });

  it("requires a configured EURC address for EURC", () => {
    const none: ChonksConfig = { ...config, eurcAddress: undefined };
    const r = validateCreateForm({ ...good, asset: "eurc" }, none, NOW);
    expect(!r.ok && r.errors.asset).toMatch(/No EURC/);
    const ok = validateCreateForm({ ...good, asset: "eurc" }, config, NOW);
    expect(ok.ok && ok.value.terms.asset).toBe(config.eurcAddress);
  });

  it("builds create() arguments in ABI order", () => {
    const r = validateCreateForm(good, config, NOW);
    if (!r.ok) throw new Error("invalid");
    const [id, params] = toCreateArgs(r.value.terms);
    expect(id).toBe(good.potId);
    expect(params.rule).toBe(1);
    expect(params.stake).toBe(1_500_000n);
    expect(params.seats).toEqual([A, B]);
    expect(Object.keys(params)).toEqual([
      "asset",
      "stake",
      "seats",
      "rule",
      "oracle",
      "fundDeadline",
      "settleDeadline",
      "challengeWindow",
      "minPlaySeconds",
      "metadataHash",
    ]);
  });

  it("generates 32-byte ids from the supplied entropy source only", () => {
    const id = randomPotId((b) => b.fill(0xab));
    expect(id).toBe(`0x${"ab".repeat(32)}`);
    expect(randomPotId()).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
