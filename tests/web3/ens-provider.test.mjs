import test from "node:test";
import assert from "node:assert/strict";
import {
  ensLimits,
  createLiveEnsProvider,
} from "../../integrations/ens/provider.mjs";
const limits = {
  ENS_MAX_TOTAL_GAS_ETH: "0.02",
  ENS_MAX_TRANSACTIONS: 80,
  ENS_MAX_FEE_GWEI: "30",
  ENS_PRIORITY_FEE_GWEI: "1",
  WEB3_MAX_TX_PER_ROOM: 40,
  WEB3_MAX_TX_PER_HOUR: 80,
};
test("live ENS caps are explicit, positive and preserve decimal units", () => {
  const p = ensLimits(limits);
  assert.equal(p.budgetWei, 20000000000000000n);
  assert.equal(p.priorityFeeWei, 1000000000n);
  assert.equal(p.maxFeePerGasWei, 30000000000n);
  for (const key of Object.keys(limits))
    assert.throws(() => ensLimits({ ...limits, [key]: "" }), /required/);
  assert.throws(
    () => ensLimits({ ...limits, ENS_MAX_TOTAL_GAS_ETH: "0" }),
    /positive/,
  );
  assert.throws(
    () => ensLimits({ ...limits, ENS_PRIORITY_FEE_GWEI: "31" }),
    /ceiling/,
  );
});
test("the live provider refuses mock mode before loading a key or making an RPC call", async () => {
  await assert.rejects(
    createLiveEnsProvider({ PARTNERS: "mock", WEB3_ENS: "mock" }),
    (e) => e.code === "INVALID_CONFIG",
  );
});
