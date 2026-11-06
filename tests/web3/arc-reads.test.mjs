import test from "node:test";
import assert from "node:assert/strict";
import { keccak256 } from "viem";
import { createPotReader } from "../../integrations/arc/reads.mjs";
import { termsHash } from "../../integrations/arc/signatures.mjs";
const contract = `0x${"11".repeat(20)}`,
  asset = `0x${"22".repeat(20)}`,
  potId = `0x${"33".repeat(32)}`,
  blockHash = `0x${"44".repeat(32)}`;
function fixture() {
  let time = 100000,
    chain = 5042002;
  const block = { number: 1n, hash: blockHash, timestamp: 100n };
  const pot = {
    asset,
    stake: 500000n,
    seats: [`0x${"55".repeat(20)}`, `0x${"66".repeat(20)}`],
    rule: 1,
    oracle: contract,
    fundDeadline: 180n,
    settleDeadline: 900n,
    challengeWindow: 120,
    minPlaySeconds: 60,
    metadataHash: potId,
    total: 1000000n,
    state: 2,
    fundedBitmap: 3,
    acceptedBitmap: 3,
    lockedAt: 95n,
    proposal: { placesHash: potId, resultHash: potId, at: 0n },
  };
  pot.termsHash = termsHash(potId, pot);
  const values = {
    getPot: pot,
    allowedAssets: [asset],
    eip712Domain: ["0x0f", "ChonksPot", "1", 5042002n, contract, potId, []],
    claimableOf: 0n,
  };
  const client = {
    getChainId: async () => chain,
    getBlock: async () => ({ ...block }),
    getCode: async () => "0x6000",
    readContract: async (r) => {
      assert.equal(r.blockNumber, 1n);
      return values[r.functionName];
    },
  };
  const config = {
    chainId: 5042002,
    contract,
    assets: [asset],
    runtimeCodeHash: keccak256("0x6000"),
  };
  return {
    client,
    config,
    pot,
    values,
    block,
    advance: () => (time += 31000),
    setChain: (id) => (chain = id),
    reader: createPotReader({ client, abi: [], config, now: () => time }),
  };
}
test("pot reads bind deployment, terms, assets, funding and domain at one fresh canonical block", async () => {
  const f = fixture(),
    value = await f.reader.snapshot(potId);
  assert.equal(value.state, "Locked");
  assert.equal(value.blockHash, blockHash);
  assert.equal(value.termsHash, f.pot.termsHash);
  assert.equal(value.chainVerified, false);
});
test("modified terms, bytecode, domain, allowlist and claimables fail closed", async () => {
  for (const mutate of [
    (f) => (f.pot.rule = 0),
    (f) => (f.client.getCode = async () => "0x6001"),
    (f) => (f.values.eip712Domain[3] = 5042n),
    (f) => (f.values.allowedAssets = [contract]),
    (f) => (f.pot.fundedBitmap = 1),
    (f) => (f.pot.total = 1n),
    (f) => (f.values.claimableOf = 1n),
    (f) => f.setChain(5042),
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(f.reader.snapshot(potId));
  }
});
test("a stalled or inconsistent RPC cannot pass the final freshness and canonical-block checks", async () => {
  const f = fixture();
  let calls = 0;
  f.client.getBlock = async () => {
    if (++calls === 2) f.advance();
    return { ...f.block };
  };
  await assert.rejects(f.reader.snapshot(potId), /stale/);
  const g = fixture();
  calls = 0;
  g.client.getBlock = async () => ({
    ...g.block,
    hash: ++calls === 2 ? potId : blockHash,
  });
  await assert.rejects(g.reader.snapshot(potId), /changed/);
});
