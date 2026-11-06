import test from "node:test";
import assert from "node:assert/strict";
import {
  deploymentMode,
  matchRuntime,
} from "../../scripts/web3-live-deploy.mjs";
test("live deployment defaults to reads and requires the exact owner confirmation", () => {
  assert.equal(deploymentMode([]), false);
  assert.equal(deploymentMode(["--check"]), false);
  assert.equal(
    deploymentMode(["--apply", "--confirm-funcaster-testnet"]),
    true,
  );
  for (const args of [
    ["--apply"],
    ["--mainnet"],
    ["--apply", "--confirm-funcaster-testnet", "--resend"],
  ])
    assert.throws(() => deploymentMode(args), /INVALID_ARGUMENTS/);
});
test("runtime verification permits only compiler-declared immutable byte ranges", () => {
  assert.equal(
    matchRuntime("0x11223344", "0x11003344", { x: [{ start: 1, length: 1 }] }),
    true,
  );
  assert.equal(
    matchRuntime("0x11223355", "0x11003344", { x: [{ start: 1, length: 1 }] }),
    false,
  );
  assert.equal(matchRuntime("0x11223344", "0x11003344"), false);
  assert.equal(
    matchRuntime("0x", "0x11003344", { x: [{ start: 1, length: 1 }] }),
    false,
  );
});
