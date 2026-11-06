import test from "node:test";
import assert from "node:assert/strict";
import {
  validateMode,
  assertEmptyOrExpected,
  assertBudget,
} from "../../scripts/spikes/ens-bootstrap.mjs";
const zero = "0x0000000000000000000000000000000000000000";
const expected = "0x1111111111111111111111111111111111111111";
test("bootstrap defaults to read-only and refuses malformed apply commands", () => {
  assert.equal(validateMode([]), "--check");
  assert.equal(validateMode(["--rehearse"]), "--rehearse");
  for (const args of [
    ["--apply"],
    ["--apply", "--confirm-parent", "other.eth"],
    ["--apply", "--confirm-parent", "funcaster.eth", "--rpc", "evil"],
    ["--check", "--apply"],
    ["--deploy"],
  ])
    assert.throws(() => validateMode(args));
  assert.equal(
    validateMode(["--apply", "--confirm-parent", "funcaster.eth"]),
    "--apply",
  );
});
test("bootstrap refuses overwriting an unrelated ENS subtree", () => {
  assertEmptyOrExpected(zero, expected, "parent");
  assertEmptyOrExpected(expected, expected, "parent");
  assert.throws(
    () =>
      assertEmptyOrExpected(
        "0x2222222222222222222222222222222222222222",
        expected,
        "parent",
      ),
    /refusing overwrite/,
  );
});
test("bootstrap bounds total maximum transaction gas cost", () => {
  assertBudget(10n, 2n, 80n, 100n);
  assert.throws(() => assertBudget(11n, 2n, 80n, 100n), /budget exceeded/);
  assert.throws(() => assertBudget(0n, 2n, 0n, 100n), /Invalid gas/);
});
