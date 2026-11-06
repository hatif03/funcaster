import test from "node:test";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyTypedData } from "viem";
import {
  fundingIntent,
  fundingNonce,
} from "../../integrations/market/intents.mjs";
import { cachedMarketClient } from "../../integrations/market/read-cache.mjs";
const addr = (n) => `0x${n.toString(16).padStart(40, "0")}`;
test("phone live prediction and cheer signatures bind all economic fields and stay testnet-only", async () => {
  const account = privateKeyToAccount(generatePrivateKey()),
    now = Date.now(),
    q = {
      kind: "prediction",
      chainId: 5042002,
      contract: addr(1),
      marketRef: `0x${"ab".repeat(32)}`,
      chainMarketId: "1",
      asset: addr(2),
      symbol: "USDC",
      bettor: account.address,
      outcome: 0,
      amount: "50000",
      minPayout: "50000",
      salt: `0x${"cd".repeat(32)}`,
      validAfter: "0",
      validBefore: String(Math.floor(now / 1000) + 60),
    };
  const signature = await account.signTypedData(fundingIntent(q, { now }));
  assert.equal(
    await verifyTypedData({
      ...fundingIntent(q, { now }),
      address: account.address,
      signature,
    }),
    true,
  );
  assert.equal(
    await verifyTypedData({
      ...fundingIntent({ ...q, outcome: 1 }, { now }),
      address: account.address,
      signature,
    }),
    false,
  );
  assert.notEqual(fundingNonce(q), fundingNonce({ ...q, kind: "cheer" }));
  assert.throws(() => fundingIntent({ ...q, chainId: 1 }, { now }), /testnet/);
  assert.throws(
    () => fundingIntent({ ...q, amount: "1000001" }, { now }),
    /bounded/,
  );
});
test("concurrent readers share RPC work only within the short freshness window", async () => {
  let at = 0,
    calls = 0;
  const raw = {
      async getBlock() {
        calls++;
        return { number: BigInt(calls) };
      },
      sendRawTransaction() {
        throw Error("This must never be wrapped");
      },
    },
    client = cachedMarketClient(raw, { now: () => at });
  const first = await Promise.all(
    Array.from({ length: 12 }, () => client.getBlock({ blockTag: "latest" })),
  );
  assert.equal(calls, 1);
  assert.ok(first.every((v) => v.number === 1n));
  at = 3001;
  assert.equal((await client.getBlock({ blockTag: "latest" })).number, 2n);
  assert.equal(client.sendRawTransaction, raw.sendRawTransaction);
});
