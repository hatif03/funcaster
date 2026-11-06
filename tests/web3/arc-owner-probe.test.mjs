import test from "node:test";
import assert from "node:assert/strict";
import {
  validateArcMode,
  topUpAmount,
} from "../../scripts/spikes/arc-owner-probe.mjs";

test("EURC requires its own confirmation; a USDC approval cannot switch assets", () => {
  assert.equal(
    validateArcMode(
      ["--apply", "--confirm-network", "arc-testnet-EURC"],
      "EURC",
    ),
    "--apply",
  );
  assert.throws(() =>
    validateArcMode(
      ["--apply", "--confirm-network", "arc-testnet-USDC"],
      "EURC",
    ),
  );
  assert.throws(() => validateArcMode([], "ETH"));
});
test("Arc owner probe defaults to reads and requires exact network confirmation", () => {
  assert.equal(validateArcMode([]), "--check");
  assert.equal(
    validateArcMode(["--apply", "--confirm-network", "arc-testnet-USDC"]),
    "--apply",
  );
  for (const args of [
    ["--apply"],
    ["--apply", "--confirm-network", "arc-mainnet"],
    ["--apply", "--confirm-network", "arc-testnet-USDC", "--rpc", "other"],
    ["--check", "--apply"],
  ])
    assert.throws(() => validateArcMode(args));
});
test("Arc top-up retains 0.05 test USDC and does not overfund a resumed probe", () => {
  assert.equal(topUpAmount(0n), 51000n);
  assert.equal(topUpAmount(50000n), 1000n);
  assert.equal(topUpAmount(51000n), 0n);
  assert.equal(topUpAmount(1000000n), 0n);
  assert.throws(() => topUpAmount(-1n));
  assert.throws(() => topUpAmount(0n, 1000000n));
});
