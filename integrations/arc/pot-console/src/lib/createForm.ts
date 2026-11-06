/**
 * Validation for the Create page. Pure functions: no network, no wallet.
 *
 * Every input is explicit. There are no timing defaults, amounts are parsed exactly in six
 * decimals (never rounded), and the result carries the same TermsInput the canonical terms hash is
 * computed from.
 */

import {
  getAddress,
  isAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { AmountError, parseUsdc } from "@/onchain-money";
import type { ChonksConfig } from "../config";
import { parsePotId } from "./pot";
import { RULES, hashTerms, type RuleName, type TermsInput } from "./signing";

export const MAX_UINT256 = (1n << 256n) - 1n;
export const MAX_UINT64 = (1n << 64n) - 1n;
export const MAX_UINT32 = (1n << 32n) - 1n;
export const MIN_CHALLENGE_WINDOW = 60n;
export const MAX_SEATS = 4;
export const MIN_SEATS = 2;

export type AssetChoice = "usdc" | "eurc" | "";

export interface CreateFormValues {
  potId: string;
  asset: AssetChoice;
  stake: string;
  /** Always MAX_SEATS rows; empty trailing rows are ignored. */
  seats: string[];
  rule: RuleName | "";
  noOracle: boolean;
  oracle: string;
  fundDeadline: string;
  settleDeadline: string;
  challengeWindow: string;
  minPlaySeconds: string;
  metadataHash: string;
}

export const EMPTY_FORM: CreateFormValues = {
  potId: "",
  asset: "",
  stake: "",
  seats: ["", "", "", ""],
  rule: "",
  noOracle: false,
  oracle: "",
  fundDeadline: "",
  settleDeadline: "",
  challengeWindow: "",
  minPlaySeconds: "",
  metadataHash: "",
};

export type FieldKey =
  | "potId"
  | "asset"
  | "stake"
  | "seats"
  | "rule"
  | "oracle"
  | "fundDeadline"
  | "settleDeadline"
  | "challengeWindow"
  | "minPlaySeconds"
  | "metadataHash";

export type FormErrors = Partial<Record<FieldKey, string>>;

export interface ValidTerms {
  terms: TermsInput;
  termsHash: Hex;
  assetLabel: "USDC" | "EURC";
  /** stake * seats, exact. */
  total: bigint;
}

export type FormResult =
  { ok: true; value: ValidTerms } | { ok: false; errors: FormErrors };

const INTEGER = /^\d+$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;

function parseUint(
  raw: string,
  max: bigint,
):
  | { ok: true; value: bigint }
  | { ok: false; reason: "empty" | "format" | "range" } {
  const text = raw.trim();
  if (text === "") return { ok: false, reason: "empty" };
  if (!INTEGER.test(text)) return { ok: false, reason: "format" };
  const value = BigInt(text);
  return value > max ? { ok: false, reason: "range" } : { ok: true, value };
}

function parseAddress(raw: string): Address | undefined {
  const text = raw.trim();
  if (!isAddress(text, { strict: false })) return undefined;
  return getAddress(text);
}

/**
 * Validates the whole form. `nowSeconds` should be chain time when known (the page passes the last
 * block timestamp after a contract check) and otherwise the browser clock.
 */
export function validateCreateForm(
  values: CreateFormValues,
  config: ChonksConfig,
  nowSeconds: bigint,
): FormResult {
  const errors: FormErrors = {};

  // pot id
  const potId = parsePotId(values.potId);
  if (values.potId.trim() === "")
    errors.potId = 'Required. Use "Generate" or paste a 32-byte hex id.';
  else if (!potId)
    errors.potId = "A pot id is 0x followed by exactly 64 hex characters.";

  // asset
  let asset: Address | undefined;
  let assetLabel: "USDC" | "EURC" | undefined;
  if (values.asset === "") errors.asset = "Choose USDC or EURC.";
  else if (values.asset === "usdc") {
    asset = config.usdcAddress;
    assetLabel = "USDC";
  } else if (config.eurcAddress) {
    asset = config.eurcAddress;
    assetLabel = "EURC";
  } else errors.asset = "No EURC address is configured.";

  // seats (rows are positional; a gap is an error, trailing empties are ignored)
  const rows = values.seats.map((s) => s.trim());
  let used = rows.length;
  while (used > 0 && rows[used - 1] === "") used -= 1;
  const seats: Address[] = [];
  const seatProblems: string[] = [];
  for (let i = 0; i < used; i++) {
    const row = rows[i] ?? "";
    if (row === "") {
      seatProblems.push(
        `Seat ${i + 1} is empty. Fill seats in order without gaps.`,
      );
      continue;
    }
    const addr = parseAddress(row);
    if (!addr) seatProblems.push(`Seat ${i + 1} is not a valid address.`);
    else if (addr === zeroAddress)
      seatProblems.push(`Seat ${i + 1} is the zero address.`);
    else if (seats.includes(addr))
      seatProblems.push(`Seat ${i + 1} repeats an earlier seat.`);
    else seats.push(addr);
  }
  if (seatProblems.length > 0) errors.seats = seatProblems.join(" ");
  else if (seats.length < MIN_SEATS || seats.length > MAX_SEATS) {
    errors.seats = `A pot needs ${MIN_SEATS} to ${MAX_SEATS} seats.`;
  }

  // stake: exact six-decimal units, positive, and stake * seats must fit in uint256
  let stake: bigint | undefined;
  if (values.stake.trim() === "") errors.stake = "Required, for example 1.5.";
  else {
    try {
      stake = parseUsdc(values.stake);
      if (stake <= 0n) {
        errors.stake = "The stake must be above zero.";
        stake = undefined;
      }
    } catch (error) {
      errors.stake =
        error instanceof AmountError &&
        error.code === "TOO_MANY_FRACTION_DIGITS"
          ? "At most 6 decimal places. Nothing is rounded."
          : "Enter a plain decimal number such as 1.5.";
    }
  }
  if (
    stake !== undefined &&
    seats.length >= MIN_SEATS &&
    seats.length <= MAX_SEATS
  ) {
    if (stake > MAX_UINT256 / BigInt(seats.length))
      errors.stake = "Too large: stake times seats must fit in 256 bits.";
  }

  // rule
  const rule = RULES.find((r) => r === values.rule);
  if (!rule) errors.rule = "Choose a payout rule.";

  // oracle
  let oracle: Address | undefined;
  if (values.noOracle) oracle = zeroAddress;
  else if (values.oracle.trim() === "")
    errors.oracle = 'Enter an oracle address, or tick "No oracle".';
  else {
    const parsed = parseAddress(values.oracle);
    if (!parsed || parsed === zeroAddress)
      errors.oracle = "The oracle must be a valid non-zero address.";
    else oracle = parsed;
  }

  // timing: every field explicit, integers only
  const fund = parseUint(values.fundDeadline, MAX_UINT64);
  const settle = parseUint(values.settleDeadline, MAX_UINT64);
  const window = parseUint(values.challengeWindow, MAX_UINT32);
  const minPlay = parseUint(values.minPlaySeconds, MAX_UINT32);
  const timing = (
    r: typeof fund,
    name: string,
    key: FieldKey,
    bits: string,
  ) => {
    if (r.ok) return;
    errors[key] =
      r.reason === "empty"
        ? "Required."
        : r.reason === "format"
          ? `${name} must be a whole number of seconds (digits only).`
          : `${name} must fit in ${bits}.`;
  };
  timing(fund, "Funding deadline", "fundDeadline", "64 bits");
  timing(settle, "Settle deadline", "settleDeadline", "64 bits");
  timing(window, "Challenge window", "challengeWindow", "32 bits");
  timing(minPlay, "Minimum play time", "minPlaySeconds", "32 bits");

  if (window.ok && window.value < MIN_CHALLENGE_WINDOW)
    errors.challengeWindow = "At least 60 seconds.";
  if (minPlay.ok && minPlay.value === 0n)
    errors.minPlaySeconds = "Must be above zero.";
  if (fund.ok && fund.value <= nowSeconds)
    errors.fundDeadline = "Must be in the future.";
  if (
    fund.ok &&
    settle.ok &&
    minPlay.ok &&
    !errors.minPlaySeconds &&
    fund.value + minPlay.value >= settle.value
  ) {
    errors.settleDeadline =
      "Must be later than the funding deadline plus the minimum play time.";
  }

  // off-chain terms commitment
  const metadata = values.metadataHash.trim();
  if (metadata === "")
    errors.metadataHash =
      "Required: 0x plus 64 hex characters (use all zeros only if there are no off-chain terms).";
  else if (!BYTES32.test(metadata))
    errors.metadataHash = "Must be 0x followed by exactly 64 hex characters.";

  if (
    Object.keys(errors).length > 0 ||
    !potId ||
    !asset ||
    !assetLabel ||
    stake === undefined ||
    !rule ||
    oracle === undefined ||
    !fund.ok ||
    !settle.ok ||
    !window.ok ||
    !minPlay.ok
  ) {
    return { ok: false, errors };
  }

  const terms: TermsInput = {
    potId,
    asset,
    stake,
    seats,
    rule,
    oracle,
    fundDeadline: fund.value,
    settleDeadline: settle.value,
    challengeWindow: Number(window.value),
    minPlaySeconds: Number(minPlay.value),
    metadataHash: metadata.toLowerCase() as Hex,
  };
  return {
    ok: true,
    value: {
      terms,
      termsHash: hashTerms(terms),
      assetLabel,
      total: stake * BigInt(seats.length),
    },
  };
}

/** Arguments for create(potId, params), in ABI order. */
export function toCreateArgs(terms: TermsInput) {
  return [
    terms.potId,
    {
      asset: terms.asset,
      stake: terms.stake,
      seats: [...terms.seats],
      rule: RULES.indexOf(terms.rule),
      oracle: terms.oracle,
      fundDeadline: terms.fundDeadline,
      settleDeadline: terms.settleDeadline,
      challengeWindow: terms.challengeWindow,
      minPlaySeconds: terms.minPlaySeconds,
      metadataHash: terms.metadataHash,
    },
  ] as const;
}

/** A fresh random 32-byte pot id from the browser's CSPRNG. Called only from an explicit button. */
export function randomPotId(
  fill: (bytes: Uint8Array<ArrayBuffer>) => void = (b) =>
    void crypto.getRandomValues(b),
): Hex {
  const bytes = new Uint8Array(32);
  fill(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
