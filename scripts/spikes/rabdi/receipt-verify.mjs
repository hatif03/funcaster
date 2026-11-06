// Public receipt reconciliation shared by complete and interrupted probes. No keys.
import assert from "node:assert/strict";
import { decodeEventLog, keccak256, formatEther } from "viem";
import { ENTITY_EVENTS_ABI } from "@arkiv-network/sdk";
import { NETWORK, same } from "./protocol.mjs";
import { historicalStateUnavailable } from "./read-retry.mjs";
export async function verifyReceipts(reader, entries) {
  assert.equal(
    new Set(entries.map((e) => e.id)).size,
    entries.length,
    "Duplicate operation id",
  );
  assert.equal(
    new Set(entries.map((e) => e.hash)).size,
    entries.length,
    "Duplicate admitted hash",
  );
  const report = { receipts: [] };
  let historicalBalances = true;
  let gasTotal = 0n,
    transferTotal = 0n;
  for (const e of entries) {
    const [receipt, tx] = await Promise.all([
      reader.getTransactionReceipt({ hash: e.hash }),
      reader.getTransaction({ hash: e.hash }),
    ]);
    const block = await reader.getBlock({ blockNumber: receipt.blockNumber });
    assert.equal(block.hash, receipt.blockHash);
    assert.equal(receipt.status, e.expectedStatus);
    assert.equal(tx.chainId, NETWORK.id);
    assert(same(tx.from, e.from));
    assert(same(tx.to, e.to));
    assert.equal(tx.nonce, e.nonce);
    assert.equal(tx.value, BigInt(e.value));
    assert.equal(keccak256(tx.input), e.dataHash);
    assert([NETWORK.owner, NETWORK.recipient].some((a) => same(a, tx.from)));
    const native = e.id === "fund second synthetic writer";
    assert(
      same(
        tx.to,
        native
          ? NETWORK.recipient
          : "0x4400000000000000000000000000000000000044",
      ),
    );
    assert.equal(tx.value, native ? 20000000000000000n : 0n);
    if (receipt.status === "reverted") {
      assert.equal(e.id, "atomic failed last operation");
      assert(receipt.gasUsed < BigInt(e.gas));
    }
    const created = receipt.logs
      .filter((l) => same(l.address, tx.to))
      .flatMap((l) => {
        try {
          const event = decodeEventLog({
            abi: ENTITY_EVENTS_ABI,
            data: l.data,
            topics: l.topics,
          });
          return event.eventName === "EntityCreated"
            ? [event.args.entityKey]
            : [];
        } catch {
          return [];
        }
      });
    assert.deepEqual(created, e.created);
    assert.equal(created.length, e.createCount);
    assert(receipt.gasUsed <= BigInt(e.gas), "Gas exceeds journal admission");
    assert.equal(tx.gas, BigInt(e.gas));
    assert.equal(tx.gasPrice, BigInt(e.gasPrice));
    const cost = receipt.gasUsed * receipt.effectiveGasPrice;
    assert(
      cost + tx.value <= BigInt(e.maxCost),
      "Cost exceeds journal admission",
    );
    assert.equal(String(cost), e.gasCost);
    gasTotal += cost;
    transferTotal += tx.value;
    if (e.id.startsWith("cost ")) {
      assert.equal(
        BigInt(e.balanceBefore) - BigInt(e.balanceAfter),
        cost,
        "Owner balance observation differs from receipt",
      );
      if (historicalBalances)
        try {
          const [before, after] = await Promise.all([
            reader.getBalance({
              address: e.from,
              blockNumber: receipt.blockNumber - 1n,
            }),
            reader.getBalance({
              address: e.from,
              blockNumber: receipt.blockNumber,
            }),
          ]);
          assert.equal(before - after, cost);
          assert.equal(String(after), e.balanceAfter);
        } catch (error) {
          if (!historicalStateUnavailable(error)) throw error;
          historicalBalances = false;
        }
    }
    report.receipts.push({
      id: e.id,
      hash: e.hash,
      block: String(receipt.blockNumber),
      blockHash: receipt.blockHash,
      status: receipt.status,
      gasCost: String(cost),
      created,
      gasUsed: String(receipt.gasUsed),
    });
  }
  assert(gasTotal + transferTotal <= 2000000000000000000n);
  report.gasTGLM = formatEther(gasTotal);
  report.topupTGLM = formatEther(transferTotal);
  report.costBalanceEvidence = historicalBalances
    ? "Historical balance deltas independently verified where cost fixtures are present"
    : "RPC does not serve historical balances. Costs independently verified from canonical receipts; per-case balance deltas are owner-run observations.";
  return report;
}
