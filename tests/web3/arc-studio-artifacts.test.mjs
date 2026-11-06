import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { payoutVector } from "../../integrations/arc/payouts.mjs";

const base = new URL("../../integrations/arc/onchain/", import.meta.url);
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, base), "utf8"));
test("Studio ABI keeps full-width stake and only the reviewed mutation surface", () => {
  const abi = read("abi/ConditionalPot.abi.json");
  const methods = abi.filter((x) => x.type === "function");
  assert.equal(
    methods
      .find((x) => x.name === "create")
      .inputs[1].components.find((x) => x.name === "stake").type,
    "uint256",
  );
  assert.deepEqual(
    methods
      .filter((x) => !["view", "pure"].includes(x.stateMutability))
      .map((x) => x.name)
      .sort(),
    [
      "claim",
      "contestWithSig",
      "create",
      "finalize",
      "fundWithAuthorization",
      "propose",
      "refund",
      "settleCooperative",
    ],
  );
});
test("contract-generated payout vectors agree with the relay's integer arithmetic", () => {
  const fixture = read("docs/payout-vectors.json");
  const vectors = Array.isArray(fixture) ? fixture : fixture.vectors;
  assert.ok(vectors.length >= 273);
  for (const row of vectors) {
    const rule = ["WINNER_TAKES_ALL", "TOP2_70_30", "EQUAL_AMONG_TOP"].indexOf(
      row.rule,
    );
    assert.deepEqual(
      payoutVector(BigInt(row.stake), row.places, rule).map(String),
      row.payouts.map(String),
    );
  }
});
