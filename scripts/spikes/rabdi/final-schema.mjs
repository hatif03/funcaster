import {
  defineSchema,
  str,
  i32,
  u64,
  addr,
  bytes,
} from "@arkiv-network/sdk/schema";
// Synthetic G0 schema, never used as a production match schema.
export const Score = defineSchema("chonks_g0_score_v2", {
  project: str().indexed(),
  run: str().indexed(),
  game: str().indexed(),
  season: u64().indexed(),
  board_bucket: u64().indexed(),
  ordinal: i32().indexed(),
  score: i32().indexed(),
  winner: addr().indexed(),
  payload: bytes(),
});
