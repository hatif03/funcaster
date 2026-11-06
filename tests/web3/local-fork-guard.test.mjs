import test from "node:test";
import assert from "node:assert/strict";
import { assertLocalFork } from "../../scripts/spikes/local-fork-guard.mjs";
test("G0 mutations require a disposable local Anvil, never a public chain", () => {
  assert.doesNotThrow(() =>
    assertLocalFork("http://127.0.0.1:18545", 31337, "anvil/v1.7.1"),
  );
  for (const [url, id, client] of [
    ["https://11155111.rpc.thirdweb.com", 11155111, "Geth/v1"],
    ["http://127.0.0.1:18545", 11155111, "anvil/v1.7.1"],
    ["http://127.0.0.1:18545", 31337, "Geth/v1"],
    ["http://127.0.0.1.evil.test", 31337, "anvil/v1.7.1"],
    ["http://user:secret@127.0.0.1:18545", 31337, "anvil/v1.7.1"],
    ["http://127.0.0.1:18545/key", 31337, "anvil/v1.7.1"],
  ])
    assert.throws(() => assertLocalFork(url, id, client), /Refusing mutations/);
});
