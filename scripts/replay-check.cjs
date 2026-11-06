const fs = require("node:fs"),
  { hash } = require("../server/records.cjs"),
  { createRound, stepRound } = require("../server/party-engine.cjs");
const file = process.argv[2];
if (!file) throw Error("Pass an exported round JSON file");
const { result, replay } = JSON.parse(fs.readFileSync(file, "utf8"));
if (hash(replay) !== result.replayHash) throw Error("Replay hash mismatch");
const { hash: expected, ...unsigned } = result;
if (hash(unsigned) !== expected) throw Error("Result hash mismatch");
const { games } = require("../core/catalog.js");
const rules = games.find(
  (g) => g.gameId === replay.gameId || g.legacyIds.includes(replay.gameId),
);
if (rules && replay.version !== rules.version)
  throw Error(
    `This replay uses ${replay.version}; these rules are ${rules.version}. Use the archived build that produced the record.`,
  );
if (
  result.bundleHashVersion === 1 &&
  rules &&
  result.bundleHash !==
    require("../server/bundle-hash.cjs").bundleHash(rules.id)
)
  throw Error(
    "Game bundle differs. Use the exact archived build that produced this record.",
  );
if (replay.sharedFrames) {
  if (
    !require("../server/shared-round.cjs").verifyShared(replay, result.scores)
  )
    throw Error("Shared replay scores do not agree");
  console.log(
    "Verified: server-sequenced shared round matches recorded scores.",
  );
  process.exit(0);
}
if (rules && require("../server/logic-replay.cjs").SUPPORTED.has(rules.id)) {
  if (!require("../server/logic-replay.cjs").verifyLogic(replay, result.scores))
    throw Error("Logic replay scores do not agree");
  console.log("Verified: fixed-step logic replay matches the recorded scores.");
  process.exit(0);
}
if (["chonks.fruit-ninja", "chonks.slice-dojo"].includes(replay.gameId)) {
  if (!require("../server/slice-replay.cjs").verifySlice(replay, result.scores))
    throw Error("Slice replay scores do not agree");
  console.log("Verified: seeded Slice Dojo replay and final scores agree.");
  process.exit(0);
}
if (
  !["chonks.star-catch", "chonks.neon-drift", "chonks.bubble-burst"].includes(
    replay.gameId,
  )
)
  throw Error("This result is attested; it has no independent score verifier.");
const round = createRound(
  replay.gameId.slice(7),
  replay.slots,
  replay.seed,
  replay.setup,
);
for (const [dt, inputs] of replay.frames) stepRound(round, inputs, dt);
if (
  !round.players.every(
    (p) =>
      Math.floor(p.score) ===
      result.scores.find((s) => s.slot === p.slot)?.score,
  )
)
  throw Error("Replayed scores do not agree");
console.log("Verified: hash, seed, input replay and final scores agree.");
