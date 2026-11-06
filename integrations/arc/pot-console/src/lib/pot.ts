/**
 * ConditionalPot reads and derived view state for the console.
 *
 * Reads are public RPC only and need no wallet. Every contract read of one
 * snapshot is pinned to the same block, and "now" is that block's timestamp
 * (chain time), never the browser clock, so the Refund and Claim buttons agree
 * with what the contract will accept.
 */

import {
  BaseError,
  ContractFunctionRevertedError,
  type Address,
  type Hex,
  type PublicClient,
  erc20Abi,
} from "viem";
import type { ChonksConfig } from "../config";
import { USDC_DECIMALS, isValidAddress } from "./format";
import { conditionalPotAbi } from "./potAbi";
import { ReadError, createReadClient } from "./reader";
import { readDeployment, finishRead } from "./chainGuard";

export const POT_STATES = [
  "None",
  "Funding",
  "Locked",
  "Proposed",
  "Contested",
  "Settled",
  "Refunded",
] as const;
export type PotStateName = (typeof POT_STATES)[number];

export const RULE_LABELS = [
  "Winner takes all",
  "Top two 70/30",
  "Equal among top",
] as const;

const POT_ID_RE = /^0x[0-9a-fA-F]{64}$/;

/** Returns the lower-cased bytes32 id, or undefined when `raw` is not exactly 32 hex bytes. */
export function parsePotId(raw: string | null | undefined): Hex | undefined {
  const value = raw?.trim();
  if (!value || !POT_ID_RE.test(value)) return undefined;
  return value.toLowerCase() as Hex;
}

export interface SeatSnapshot {
  index: number;
  address: Address;
  funded: boolean;
  accepted: boolean;
  claimable: bigint;
}

export interface PotSnapshot {
  potId: Hex;
  chainId: number;
  blockNumber: bigint;
  /** Timestamp (seconds) of `blockNumber`. */
  now: bigint;
  contract: Address;
  asset: Address;
  stake: bigint;
  total: bigint;
  seats: SeatSnapshot[];
  rule: number;
  oracle: Address;
  fundDeadline: bigint;
  settleDeadline: bigint;
  challengeWindow: number;
  minPlaySeconds: number;
  lockedAt: bigint;
  termsHash: Hex;
  metadataHash: Hex;
  state: PotStateName;
  proposal: { placesHash: Hex; resultHash: Hex; at: bigint };
  checkedAt: number;
}

export interface PotDeps {
  client?: PublicClient;
  now?: () => number;
}

function isZeroAddress(a: string): boolean {
  return /^0x0{40}$/i.test(a);
}

/** True when `error` is a revert with the given custom error name. */
export function isRevertNamed(error: unknown, name: string): boolean {
  if (!(error instanceof BaseError)) return false;
  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
  return (
    revert instanceof ContractFunctionRevertedError &&
    revert.data?.errorName === name
  );
}

export async function readPot(
  config: ChonksConfig,
  potId: Hex,
  deps: PotDeps = {},
): Promise<PotSnapshot> {
  const contract = config.potAddress;
  if (!contract) {
    throw new ReadError(
      "config",
      "This demo is not connected to a deployed pot yet.",
    );
  }
  const client = deps.client ?? createReadClient(config);
  const now = deps.now ?? Date.now;

  try {
    const block = await readDeployment(config, client, now);
    const blockNumber = block.number;
    const chainId = config.chainId;
    const pot = await client
      .readContract({
        address: contract,
        abi: conditionalPotAbi,
        functionName: "getPot",
        args: [potId],
        blockNumber,
      })
      .catch((error: unknown) => {
        if (isRevertNamed(error, "UnknownPot")) {
          throw new ReadError(
            "not-found",
            "No pot with this id exists on this contract.",
          );
        }
        throw error;
      });

    const [decimals, claimables] = await Promise.all([
      client.readContract({
        address: pot.asset,
        abi: erc20Abi,
        functionName: "decimals",
        blockNumber,
      }),
      Promise.all(
        pot.seats.map((seat) =>
          client.readContract({
            address: contract,
            abi: conditionalPotAbi,
            functionName: "claimableOf",
            args: [potId, seat],
            blockNumber,
          }),
        ),
      ),
    ]);
    if (decimals !== USDC_DECIMALS) {
      throw new ReadError(
        "decimals",
        `Unsupported asset: decimals() returned ${decimals}, but this console only shows ${USDC_DECIMALS}-decimal assets.`,
      );
    }

    await finishRead(client, block, now);
    return {
      potId,
      chainId,
      blockNumber,
      now: block.timestamp,
      contract,
      asset: pot.asset,
      stake: pot.stake,
      total: pot.total,
      seats: pot.seats.map((address, index) => ({
        index,
        address,
        funded: (pot.fundedBitmap & (1 << index)) !== 0,
        accepted: (pot.acceptedBitmap & (1 << index)) !== 0,
        claimable: claimables[index] ?? 0n,
      })),
      rule: pot.rule,
      oracle: pot.oracle,
      fundDeadline: BigInt(pot.fundDeadline),
      settleDeadline: BigInt(pot.settleDeadline),
      challengeWindow: pot.challengeWindow,
      minPlaySeconds: pot.minPlaySeconds,
      lockedAt: BigInt(pot.lockedAt),
      termsHash: pot.termsHash,
      metadataHash: pot.metadataHash,
      state: POT_STATES[pot.state] ?? "None",
      proposal: {
        placesHash: pot.proposal.placesHash,
        resultHash: pot.proposal.resultHash,
        at: BigInt(pot.proposal.at),
      },
      checkedAt: now(),
    };
  } catch (error) {
    if (error instanceof ReadError) throw error;
    const detail =
      error instanceof BaseError
        ? error.shortMessage
        : error instanceof Error
          ? error.message
          : "unknown error";
    throw new ReadError("rpc", `Could not read from the public RPC: ${detail}`);
  }
}

// ---------------------------------------------------------------- derived view

export interface RefundStatus {
  /** The contract would accept refund(potId) at the snapshot block. */
  available: boolean;
  /** Plain-language reason, shown next to the button. */
  reason: string;
  /** Chain time at which a time-gated refund opens, when it is still in the future. */
  opensAt?: bigint;
}

/** Mirrors ConditionalPot.refund(): same states, same inclusive deadline boundaries. */
export function refundStatus(s: PotSnapshot): RefundStatus {
  switch (s.state) {
    case "Funding":
      return s.now >= s.fundDeadline
        ? {
            available: true,
            reason:
              "Funding window closed before every seat paid in. Funded seats get their stake back.",
          }
        : {
            available: false,
            reason: "Opens when the funding window closes.",
            opensAt: s.fundDeadline,
          };
    case "Locked":
      return s.now >= s.settleDeadline
        ? {
            available: true,
            reason:
              "No result was settled in time. Every seat gets its stake back.",
          }
        : {
            available: false,
            reason: "Opens if nothing is settled by the settle deadline.",
            opensAt: s.settleDeadline,
          };
    case "Contested":
      return {
        available: true,
        reason:
          "A seat contested the oracle result. Every seat gets its stake back.",
      };
    case "Proposed":
      return {
        available: false,
        reason:
          "An oracle result is waiting out its challenge window. A seat can contest it.",
      };
    case "Settled":
      return {
        available: false,
        reason: "Already settled. Seats claim their payout instead.",
      };
    case "Refunded":
      return {
        available: false,
        reason: "Already refunded. Seats claim their stake back.",
      };
    case "None":
      return { available: false, reason: "This pot does not exist." };
  }
}

export function claimOpen(s: PotSnapshot): boolean {
  return s.state === "Settled" || s.state === "Refunded";
}

/** Seats that can be paid right now. */
export function claimableSeats(s: PotSnapshot): SeatSnapshot[] {
  return claimOpen(s) ? s.seats.filter((seat) => seat.claimable > 0n) : [];
}

/** Seconds until `target` in chain time, never negative. */
export function secondsUntil(s: PotSnapshot, target: bigint): number {
  return target > s.now ? Number(target - s.now) : 0;
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0s";
  const d = Math.floor(totalSeconds / 86_400);
  const h = Math.floor((totalSeconds % 86_400) / 3_600);
  const m = Math.floor((totalSeconds % 3_600) / 60);
  const sec = totalSeconds % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m && !d) parts.push(`${m}m`);
  if (sec && !d && !h) parts.push(`${sec}s`);
  return parts.join(" ");
}

export function formatChainTime(seconds: bigint): string {
  return new Date(Number(seconds) * 1000)
    .toISOString()
    .replace("T", " ")
    .replace(".000Z", " UTC");
}

export function assetLabel(config: ChonksConfig, asset: string): string {
  const eq = (a?: string) => !!a && a.toLowerCase() === asset.toLowerCase();
  if (eq(config.usdcAddress)) return "USDC";
  if (eq(config.eurcAddress)) return "EURC";
  return "Unlisted asset";
}

export function hasOracle(s: PotSnapshot): boolean {
  return isValidAddress(s.oracle) && !isZeroAddress(s.oracle);
}
