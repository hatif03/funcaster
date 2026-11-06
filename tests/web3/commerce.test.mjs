import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  registration,
  splitPayment,
  FREE_BAND,
} from "../../integrations/commerce/math.mjs";
import { createCommerceStore } from "../../integrations/commerce/store.mjs";
import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData } from "viem";
import {
  paymentData,
  claimData,
  commerceId,
} from "../../integrations/commerce/signatures.mjs";
import { createCommerceChain } from "../../integrations/commerce/chain.mjs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  express = require("express");
const A = "0x1111111111111111111111111111111111111111",
  B = "0x2222222222222222222222222222222222222222",
  P = "0x3333333333333333333333333333333333333333",
  V = "0x4444444444444444444444444444444444444444",
  R = "0x5555555555555555555555555555555555555555";
const config = { platformAddress: P, venueAddress: V },
  base = {
    creator: A,
    price: "1000001",
    collaborators: [
      { address: A, bps: 6667 },
      { address: B, bps: 3333 },
    ],
    referralAddress: R,
    referralBps: 1000,
  };
const make = (t, extras = {}) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "commerce-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return {
    directory,
    store: createCommerceStore({
      directory,
      mode: "mock",
      ...config,
      firstPartyGames: [
        { id: "star-catcher", title: "Star Catch", bundleHash: "a".repeat(64) },
      ],
      ...extras,
    }),
  };
};
test("commerce splits conserve every smallest unit, freeze rates, and place rounding with creator", () => {
  const terms = registration(base, config),
    q = splitPayment(terms, FREE_BAND.toString(), {
      referred: true,
      atVenue: true,
    });
  assert.equal(
    Object.values(q.credits).reduce((sum, n) => sum + BigInt(n), 0n),
    1000001n,
  );
  assert.equal(q.platform, "100000");
  assert.equal(q.venue, "100000");
  assert.equal(q.referral, "100000");
  assert.equal(BigInt(q.credits[A]) + BigInt(q.credits[B]), 700001n);
  assert.equal(
    splitPayment(terms, FREE_BAND.toString(), { creatorBrought: true })
      .platform,
    "50000",
  );
  assert.throws(
    () => splitPayment({ ...terms, standardBps: 1501 }, FREE_BAND.toString()),
    /INVALID_FEE/,
  );
});
test("commerce free band charges only amount above threshold", () => {
  const terms = registration({ ...base, price: "1000000" }, config);
  assert.equal(splitPayment(terms, "0").platform, "0");
  assert.equal(
    splitPayment(terms, (FREE_BAND - 500000n).toString()).platform,
    "50000",
  );
  assert.throws(
    () => registration({ ...base, referralBps: 499 }, config),
    /INVALID_REFERRAL/,
  );
  assert.throws(
    () => registration({ ...base, referralBps: 2001 }, config),
    /INVALID_REFERRAL/,
  );
});
test("immutable publishing, signed payer identity and idempotent room passes persist across restart", (t) => {
  let now = 100000;
  const { store, directory } = make(t, { now: () => now });
  const v = store.register(
    { ...base, gameId: "star-catcher", version: "1.0.0" },
    A,
  );
  assert.throws(
    () => store.register({ ...base, gameId: "star-catcher" }, A),
    /IMMUTABLE_VERSION/,
  );
  assert.throws(
    () => store.register({ ...base, gameId: "external-game" }, A),
    /FIRST_PARTY_ONLY/,
  );
  assert.throws(
    () => store.register({ ...base, gameId: "star-catcher" }, B),
    /WRONG_CREATOR/,
  );
  const input = {
    versionId: v.id,
    roomCode: "ROOM01",
    paymentId: "PAYMENT01",
    atVenue: true,
    code: v.referralCode,
  };
  const paid = store.pay(input, B);
  assert.deepEqual(store.pay(input, B), paid);
  assert.throws(
    () => store.pay({ ...input, roomCode: "ROOM02" }, B),
    /PAYMENT_CONFLICT/,
  );
  assert.equal(
    store.access({ versionId: v.id, roomCode: "ROOM01", buyer: B }).allowed,
    true,
  );
  assert.equal(
    store.access({ versionId: v.id, roomCode: "ROOM02", buyer: B }).allowed,
    false,
  );
  assert.equal(store.earnings(A).gross, base.price);
  const restored = createCommerceStore({
    directory,
    mode: "mock",
    ...config,
    now: () => now,
  });
  assert.equal(restored.earnings(A).gross, base.price);
  assert.equal(restored.receipts().length, 1);
  now += 86400001;
  assert.equal(
    restored.access({ versionId: v.id, roomCode: "ROOM01", buyer: B }).allowed,
    false,
  );
});
test("free demo expires once and cannot renew itself", (t) => {
  let now = 1000;
  const { store } = make(t, { now: () => now });
  const v = store.register({ ...base, gameId: "star-catcher" }, A),
    request = { versionId: v.id, roomCode: "ROOM01" };
  const original = store.demo(request, B);
  assert.equal(store.access({ ...request, buyer: B }).kind, "free-demo");
  now += 120001;
  assert.deepEqual(store.demo(request, B), original);
  assert.equal(store.access({ ...request, buyer: B }).freeDemoAvailable, false);
});
test("one blocked recipient cannot block another independent claim", (t) => {
  const { store } = make(t, {
    mockTransfer: ({ recipient }) => {
      if (recipient === A) throw Error("BLOCKED_RECIPIENT");
    },
  });
  const v = store.register({ ...base, gameId: "star-catcher" }, A);
  store.pay({ versionId: v.id, paymentId: "PAYMENT01", roomCode: "ROOM01" }, B);
  const before = store.earnings(A).claimable;
  assert.throws(
    () => store.claim({ claimId: "CLAIM001" }, A),
    /BLOCKED_RECIPIENT/,
  );
  assert.equal(store.earnings(A).claimable, before);
  const claim = store.claim({ claimId: "CLAIM002" }, B);
  assert.equal(store.earnings(B).claimable, "0");
  assert.deepEqual(store.claim({ claimId: "CLAIM002" }, B), claim);
  assert.equal(claim.mock, true);
  assert.equal(claim.tx, null);
});
test("on-mode never creates mock monetary evidence", (t) => {
  const { store } = make(t, { mode: "on" });
  assert.throws(
    () => store.register({ ...base, gameId: "star-catcher" }, A),
    /VERIFIED_ROUTER_REQUIRED/,
  );
  assert.equal(store.receipts().length, 0);
  assert.equal(
    store.access({ versionId: "anything", roomCode: "ROOM01", buyer: A })
      .reason,
    "VERIFIED_ROUTER_REQUIRED",
  );
});
test("commerce live signing binds the pass attribution and fixed recipient, and protects the balance floor", async () => {
  const account = privateKeyToAccount("0x" + "34".repeat(32)),
    config = { chainId: 5042002, contract: P };
  const request = {
    versionId: commerceId("version"),
    paymentId: commerceId("payment"),
    payer: account.address,
    roomCode: "ROOM01",
    price: "1000000",
    chainTime: "1000",
    balance: "1050000",
    referred: true,
  };
  const data = paymentData(config, request),
    signature = await account.signTypedData(data.permit);
  assert.equal(data.authorization.message.to, P);
  assert.equal(data.authorization.message.nonce, data.permit.message.paymentId);
  assert.equal(
    await verifyTypedData({
      ...data.permit,
      address: account.address,
      signature,
    }),
    true,
  );
  assert.equal(
    await verifyTypedData({
      ...data.permit,
      message: { ...data.permit.message, referred: false },
      address: account.address,
      signature,
    }),
    false,
  );
  assert.throws(
    () => paymentData(config, { ...request, balance: "1049999" }),
    /DRAIN_FLOOR/,
  );
  assert.throws(
    () => paymentData({ ...config, chainId: 1 }, request),
    /ARC_TESTNET_ONLY/,
  );
  assert.throws(
    () => paymentData(config, { ...request, attribution: true }),
    /INVALID_ATTRIBUTION/,
  );
  const claim = claimData(config, { recipient: A, nonce: 0, chainTime: 1000 });
  assert.equal(claim.message.recipient, A);
  assert.equal(Object.hasOwn(claim.message, "destination"), false);
  assert.equal(claim.message.deadline, 1300n);
});
test("commerce live port rejects missing provenance or a wrong-chain RPC before any write", async () => {
  let writes = 0;
  const clients = [
      { getChainId: async () => 1 },
      { getChainId: async () => 5042002 },
    ],
    transactions = { execute: async () => writes++ };
  await assert.rejects(
    createCommerceChain({
      clients,
      transactions,
      deployment: { chainId: 5042002 },
    }),
    /VERIFIED_DEPLOYMENT_REQUIRED/,
  );
  await assert.rejects(
    createCommerceChain({
      clients,
      transactions,
      deployment: {
        chainId: 5042002,
        address: P,
        operator: A,
        platform: B,
        blockNumber: 1,
        runtimeHash: "0x" + "11".repeat(32),
      },
    }),
    /WRONG_CHAIN/,
  );
  assert.equal(writes, 0);
});
test("HTTP mutations need the exact expiring browser signature and reject replay", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "commerce-http-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { createCommerce } = require("../../server/commerce/index.cjs");
  const { router } = await createCommerce({
    directory,
    mode: "mock",
    ...config,
    firstPartyGames: [{ id: "star-catcher", title: "Star Catch" }],
  });
  const app = express();
  app.use("/api/commerce", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const origin = `http://127.0.0.1:${server.address().port}`,
    post = (url, body) =>
      fetch(origin + "/api/commerce" + url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
  const key = privateKeyToAccount("0x" + "12".repeat(32)),
    payload = {
      gameId: "star-catcher",
      creator: key.address,
      price: "1000000",
    };
  const response = await post("/challenge", {
      action: "register",
      address: key.address,
      payload,
    }),
    c = await response.json();
  assert.equal(
    c.typedData.message.requestHash,
    "0x" + createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  );
  const signature = await key.signTypedData(c.typedData);
  assert.equal(
    (await post("/execute", { nonce: c.nonce, signature: "0x00" })).status,
    400,
  );
  const good = await post("/execute", { nonce: c.nonce, signature });
  assert.equal(good.status, 200);
  assert.equal((await good.json()).creator, key.address.toLowerCase());
  assert.equal(
    (await post("/execute", { nonce: c.nonce, signature })).status,
    400,
  );
});
