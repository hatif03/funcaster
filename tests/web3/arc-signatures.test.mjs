import test from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { hashTypedData, verifyTypedData, hashDomain } from "viem";
import {
  acceptData,
  settleData,
  contestData,
  fundingData,
  fundingNonce,
  assetDomain,
  termsHash,
  normalizeTerms,
} from "../../integrations/arc/signatures.mjs";
import {
  verifyAsset,
  verifyPotDomain,
} from "../../integrations/arc/assets.mjs";
// Public deterministic offline-only signing fixture; never used on a network.
const seat = privateKeyToAccount(`0x${"11".repeat(32)}`),
  contract = `0x${"22".repeat(20)}`,
  potId = `0x${"33".repeat(32)}`;
const config = { chainId: 5042002, contract },
  asset = {
    chainId: config.chainId,
    name: "USDC",
    version: "2",
    decimals: 6,
    address: `0x${"44".repeat(20)}`,
  };
const input = {
  potId,
  seat: seat.address,
  contract,
  stake: 500000n,
  validAfter: 0n,
  validBefore: 200n,
  fundDeadline: 200n,
  chainTime: 100n,
  balance: 550000n,
  floor: 50000n,
};
const terms = {
  asset: asset.address,
  stake: 500000n,
  seats: [seat.address, contract],
  rule: "top2",
  oracle: `0x${"66".repeat(20)}`,
  fundDeadline: 200n,
  settleDeadline: 1000n,
  challengeWindow: 120,
  minPlaySeconds: 60,
  metadataHash: `0x${"77".repeat(32)}`,
};
test("canonical terms bind each immutable field and seat ordering without losing integer precision", () => {
  const expected = termsHash(potId, terms);
  assert.equal(termsHash(potId, normalizeTerms(terms)), expected);
  assert.notEqual(termsHash(`0x${"88".repeat(32)}`, terms), expected);
  for (const patch of [
    { asset: contract },
    { stake: 500001n },
    { seats: [...terms.seats].reverse() },
    { seats: [seat.address, terms.oracle] },
    { rule: "winner" },
    { oracle: contract },
    { fundDeadline: 201n },
    { settleDeadline: 1001n },
    { challengeWindow: 121 },
    { minPlaySeconds: 61 },
    { metadataHash: `0x${"88".repeat(32)}` },
  ])
    assert.notEqual(termsHash(potId, { ...terms, ...patch }), expected);
  for (const patch of [
    { stake: 1.5 },
    { stake: 9007199254740992 },
    { stake: (1n << 256n) - 1n },
    { seats: [seat.address, seat.address] },
    { fundDeadline: Number.MAX_SAFE_INTEGER + 1 },
    { minPlaySeconds: 0 },
    { challengeWindow: 59 },
    { challengeWindow: 1n << 32n },
    { settleDeadline: 260n },
  ])
    assert.throws(() => normalizeTerms({ ...terms, ...patch }));
});
test("Accept, Settle, Contest and asset authorization signatures are bound to their own domain and intent", async () => {
  for (const data of [
    acceptData(config, { potId, termsHash: `0x${"55".repeat(32)}` }),
    settleData(config, { potId, places: [1, 2] }),
    contestData(config, potId),
    fundingData(asset, input),
  ]) {
    const signature = await seat.signTypedData(data);
    assert.equal(
      await verifyTypedData({ ...data, signature, address: seat.address }),
      true,
    );
    assert.equal(
      await verifyTypedData({
        ...data,
        domain: { ...data.domain, chainId: 5042 },
        signature,
        address: seat.address,
      }),
      false,
    );
    assert.equal(
      await verifyTypedData({
        ...data,
        domain: { ...data.domain, verifyingContract: seat.address },
        signature,
        address: seat.address,
      }),
      false,
    );
  }
  assert.notEqual(
    fundingNonce(potId, seat.address),
    fundingNonce(`0x${"66".repeat(32)}`, seat.address),
  );
  assert.notEqual(
    hashTypedData(fundingData(asset, input)),
    hashTypedData(
      fundingData(
        { ...asset, name: "EURC", address: `0x${"77".repeat(20)}` },
        input,
      ),
    ),
  );
});
test("funding refuses drained balances, expired/future authorization and wrong token or chain", () => {
  for (const patch of [
    { balance: 549999n },
    { floor: 0n },
    { validAfter: 100n },
    { validBefore: 100n },
    { validBefore: 201n },
    { stake: 0n },
  ])
    assert.throws(() => fundingData(asset, { ...input, ...patch }));
  for (const patch of [
    { chainId: 5042 },
    { name: "USD Coin" },
    { decimals: 18 },
    { version: "1" },
  ])
    assert.throws(() => fundingData({ ...asset, ...patch }, input));
});
test("asset verification pins metadata/domain/code/pause and all reads to one fresh canonical block", async () => {
  const domain = assetDomain(asset),
    block = { number: 1n, timestamp: 100n, hash: `0x${"ab".repeat(32)}` },
    types = {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
    };
  const values = {
    name: "USDC",
    version: "2",
    decimals: 6,
    DOMAIN_SEPARATOR: hashDomain({ domain, types }),
    paused: false,
  };
  const client = {
    getChainId: async () => 5042002,
    getBlock: async () => block,
    getCode: async () => "0x6000",
    readContract: async (req) => {
      assert.equal(req.blockNumber, 1n);
      return values[req.functionName];
    },
  };
  assert.equal(
    (await verifyAsset(client, asset, { now: () => 100000 })).name,
    "USDC",
  );
  values.paused = true;
  await assert.rejects(
    verifyAsset(client, asset, { now: () => 100000 }),
    /availability/,
  );
  values.paused = false;
  values.DOMAIN_SEPARATOR = `0x${"ff".repeat(32)}`;
  await assert.rejects(
    verifyAsset(client, asset, { now: () => 100000 }),
    /domain/,
  );
  await assert.rejects(
    verifyAsset(client, asset, { now: () => 140000 }),
    /stale/,
  );
});
test("pot-domain preflight rejects a different chain, contract or extension", async () => {
  const answer = [
      "0x0f",
      "ChonksPot",
      "1",
      5042002n,
      contract,
      `0x${"00".repeat(32)}`,
      [],
    ],
    client = { readContract: async () => answer };
  assert.equal((await verifyPotDomain(client, config, 1n)).chainId, 5042002);
  answer[3] = 5042n;
  await assert.rejects(verifyPotDomain(client, config, 1n), /differs/);
  answer[3] = 5042002n;
  answer[6] = [1n];
  await assert.rejects(verifyPotDomain(client, config, 1n), /differs/);
});
