import test from "node:test";
import assert from "node:assert/strict";
import { keccak256 } from "viem";
import {
  requireCompletedAcceptance,
  verifyAcceptanceTransaction,
  main,
} from "../../scripts/web3-arc-verify-acceptance.mjs";

test("independent audit refuses partial, duplicate or locally rehearsed acceptance", () => {
  const report = {
    complete: true,
    checks: ["usdc", "eurc"].flatMap((a) =>
      [
        "bankroll seat 1",
        "bankroll seat 2",
        "cooperative",
        "refund",
        "contest",
        "finalize",
      ].map((k) => ({ id: `${a} ${k}`, status: "PASS-PUBLIC-SCRIPT" })),
    ),
    transactions: Array.from({ length: 54 }, (_, i) => ({
      hash: `0x${i.toString(16).padStart(64, "0")}`,
    })),
  };
  assert.equal(requireCompletedAcceptance(report).length, 12);
  for (const patch of [
    { complete: false },
    { failure: { code: "UNAVAILABLE" } },
    { checks: report.checks.slice(1) },
    { checks: report.checks.map((c) => ({ ...c, status: "PASS-LOCAL" })) },
    { checks: report.checks.map(() => report.checks[0]) },
    { transactions: report.transactions.slice(1) },
    { transactions: report.transactions.map(() => report.transactions[0]) },
  ])
    assert.throws(() => requireCompletedAcceptance({ ...report, ...patch }), {
      code: "INVALID_PROOF",
    });
});
const address = (n) => `0x${String(n).repeat(40)}`;
function fixture(txPatch = {}, receiptPatch = {}, entryPatch = {}) {
  const hash = `0x${"aa".repeat(32)}`,
    blockHash = `0x${"bb".repeat(32)}`,
    input = "0x12345678";
  const tx = {
    hash,
    chainId: 5042002,
    blockHash,
    blockNumber: 42n,
    from: address(1),
    to: address(2),
    value: 0n,
    nonce: 5,
    input,
    gas: 30000n,
    maxFeePerGas: 40000000000n,
    maxPriorityFeePerGas: 0n,
    ...txPatch,
  };
  const receipt = {
    transactionHash: hash,
    blockHash,
    blockNumber: 42n,
    status: "success",
    gasUsed: 21000n,
    effectiveGasPrice: 20000000000n,
    ...receiptPatch,
  };
  const entry = {
    hash,
    to: address(2),
    dataHash: keccak256(input),
    nonce: 5,
    gas: "30000",
    maxFeePerGas: "40000000000",
    status: "success",
    costWei: "420000000000000",
    blockNumber: "42",
    ...entryPatch,
  };
  const client = {
    getTransaction: async () => tx,
    getTransactionReceipt: async () => receipt,
    getBlock: async () => ({ hash: blockHash }),
  };
  return { client, entry, owner: address(1) };
}
test("independent receipt audit checks the exact admitted intent, canonical block and bounded gas", async () => {
  assert.equal(
    (await verifyAcceptanceTransaction(fixture())).cost,
    420000000000000n,
  );
  for (const patch of [
    { chainId: 5042 },
    { hash: `0x${"cc".repeat(32)}` },
    { from: address(3) },
    { to: address(3) },
    { blockHash: `0x${"cc".repeat(32)}` },
    { blockNumber: 43n },
    { value: 1n },
    { nonce: 6 },
    { input: "0x12345679" },
    { gas: 30001n },
    { maxPriorityFeePerGas: 1n },
    { maxFeePerGas: 100000000001n },
  ])
    await assert.rejects(verifyAcceptanceTransaction(fixture(patch)), {
      code: "INVALID_PROOF",
    });
});
test("independent receipt audit rejects reverted, over-budget and altered journal evidence", async () => {
  for (const patch of [
    { status: "reverted" },
    { gasUsed: 0n },
    { gasUsed: 30001n },
    { effectiveGasPrice: 40000000001n },
    { blockHash: `0x${"cc".repeat(32)}` },
  ])
    await assert.rejects(verifyAcceptanceTransaction(fixture({}, patch)), {
      code: "INVALID_PROOF",
    });
  for (const patch of [
    { costWei: "0" },
    { status: "prepared" },
    { blockNumber: "41" },
    { maxFeePerGas: "50000000000" },
  ])
    await assert.rejects(verifyAcceptanceTransaction(fixture({}, {}, patch)), {
      code: "INVALID_PROOF",
    });
});
test("read-only verifier accepts no apply flag or env argument", async () => {
  for (const args of [
    ["--apply"],
    ["--confirm-arc-a4"],
    ["--env-file=.env.worker"],
  ])
    await assert.rejects(main(args), { code: "INVALID_CONFIG" });
});
