import assert from "node:assert/strict";
import {
  defineSchema,
  str,
  i32,
  u64,
  addr,
  bytes,
} from "@arkiv-network/sdk/schema";
import { ExpirationTime } from "@arkiv-network/sdk";
import { NETWORK } from "./protocol.mjs";
import { Score } from "./final-schema.mjs";
export { Score };
export const FINAL_BUDGET = 2000000000000000000n;
export const SECOND_TOPUP = 20000000000000000n;
export function scoreFixture(
  run,
  ordinal,
  { forged = false, malformed = false } = {},
) {
  const winner = forged ? NETWORK.recipient : NETWORK.owner;
  const score = forged ? 2147483647 : ordinal;
  return {
    schema: Score,
    salt: BigInt(10000 + ordinal),
    flags: { readonly: true },
    expiration: ExpirationTime.fromSeconds(86400),
    values: {
      project: "chonks_g0",
      run,
      game: "synthetic",
      season: u64(0),
      board_bucket: u64(Math.floor(ordinal / 100)),
      ordinal,
      score,
      winner: addr(winner),
      payload: new TextEncoder().encode(
        JSON.stringify(
          malformed
            ? { synthetic: true }
            : { synthetic: true, ordinal, score, winner },
        ),
      ),
    },
  };
}
export const COST_CASES = Object.freeze(
  [
    [1000, 4, 90],
    [1000, 4, 2592000],
    [1000, 4, 15552000],
    [64000, 4, 90],
    [128000, 4, 90],
    [129000, 4, 90],
    [131072, 4, 90],
    [1000, 15, 2592000],
    [1000, 30, 2592000],
    [1000, 31, 15552000],
  ].map(([size, columns, seconds], ordinal) => ({
    ordinal,
    size,
    columns,
    seconds,
  })),
);
export function costFixture(run, c) {
  const fields = {
    run: str().indexed(),
    ordinal: i32().indexed(),
    payload: bytes(),
  };
  const values = {
    run,
    ordinal: c.ordinal,
    payload: new Uint8Array(c.size).fill(0x53),
  };
  for (let i = 3; i < c.columns; i++) {
    fields["c" + i] = str().indexed();
    values["c" + i] = "synthetic";
  }
  return {
    schema: defineSchema("chonks_g0_cost_" + c.columns, fields),
    values,
    expiration: ExpirationTime.fromSeconds(c.seconds),
    salt: BigInt(c.ordinal + 1),
    flags: { readonly: true },
  };
}
export function finalMode(args) {
  if (!args.length || (args.length === 1 && args[0] === "--check"))
    return "check";
  assert.deepEqual(args, ["--apply", "--confirm-network", "rabdi-g0-final"]);
  return "apply";
}
export function budgetCost({ spent, gas, gasPrice, value = 0n, balance }) {
  const maximum = gas * gasPrice + value;
  assert(spent >= 0n && gas > 0n && gasPrice > 0n && value >= 0n);
  assert(spent + maximum <= FINAL_BUDGET, "Aggregate 2 tGLM ceiling reached");
  assert(maximum + 1000000000000000n <= balance, "Retain recovery gas");
  return maximum;
}
