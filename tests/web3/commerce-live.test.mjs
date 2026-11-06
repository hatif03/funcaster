import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { privateKeyToAccount } from "viem/accounts";
import {
  verifyTypedData,
  hashDomain,
  keccak256,
  encodeFunctionData,
  createPublicClient,
  custom,
  toFunctionSelector,
} from "viem";
import { createLiveCommerce } from "../../integrations/commerce/live.mjs";
import { createCommerceJobProvider } from "../../integrations/commerce/provider.mjs";
import {
  paymentData,
  claimData,
  commerceId,
} from "../../integrations/commerce/signatures.mjs";
import { splitPayment } from "../../integrations/commerce/math.mjs";
import {
  commerceTransactionId,
  hash,
} from "../../integrations/commerce/jobs.mjs";
import { prepareCommerceDeployment } from "../../integrations/commerce/deployment.mjs";
import {
  createCommerceChain,
  ROUTER_ABI,
} from "../../integrations/commerce/chain.mjs";
import { registration } from "../../integrations/commerce/math.mjs";
import {
  USDC,
  commerceDomain,
} from "../../integrations/commerce/signatures.mjs";
const require = createRequire(import.meta.url),
  express = require("express");
const account = privateKeyToAccount("0x" + "56".repeat(32)),
  actor = account.address.toLowerCase();
const P = "0x3333333333333333333333333333333333333333",
  OTHER = "0x4444444444444444444444444444444444444444";
const deployment = {
  chainId: 5042002,
  address: P,
  runtimeHash: "0x" + "11".repeat(32),
  blockNumber: 1,
  operator: actor,
  platform: OTHER,
};
const intentHash = (job) =>
  hash({ type: job.type, room: job.room, payload: job.payload });
import { fixture } from "./fixtures/commerce-chain.mjs";
async function publish(service, f) {
  const queued = await service.register(
    { gameId: "star-catch", creator: actor, price: "1000000" },
    actor,
  );
  assert.equal(queued.status, "queued");
  await f.pump();
  await service.poll();
  return service.catalog().versions[0];
}
test("live HTTP → durable jobs → provider → verified room pass and fixed-recipient claim", async (t) => {
  const f = fixture(t),
    { createCommerce } = require("../../server/commerce/index.cjs"),
    { router, service } = await createCommerce(f.options);
  t.after(() => service.close());
  const app = express();
  app.use("/api/commerce", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api/commerce`;
  const missing = await fetch(base + "/operations/never-prepared");
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "OPERATION_NOT_FOUND" });
  const post = async (url, body) => {
    const r = await fetch(base + url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await r.json();
    assert.equal(r.status, 200, JSON.stringify(value));
    return value;
  };
  const signed = async (action, payload) => {
    const c = await post("/challenge", {
      action,
      payload,
      address: account.address,
    });
    return post("/execute", {
      nonce: c.nonce,
      signature: await account.signTypedData(c.typedData),
    });
  };
  const published = await signed("register", {
    gameId: "star-catch",
    creator: actor,
    price: "1000000",
  });
  await f.pump();
  await service.poll();
  assert.equal(service.operation(published.operationId).status, "confirmed");
  const v = service.catalog().versions[0];
  const prepared = await post("/prepare", {
    action: "pay",
    address: actor,
    payload: {
      operationId: "payment-one",
      versionId: v.id,
      roomCode: "ROOM01",
    },
  });
  const data = paymentData(prepared.config, prepared.input);
  const paid = await signed("pay", {
    operationId: prepared.operationId,
    permitSignature: await account.signTypedData(data.permit),
    authorizationSignature: await account.signTypedData(data.authorization),
  });
  assert.equal(paid.status, "queued");
  assert.equal(
    service.access({ versionId: v.id, roomCode: "ROOM01", buyer: OTHER })
      .allowed,
    false,
  );
  await f.pump();
  await service.poll();
  assert.equal(service.operation(paid.operationId).status, "confirmed");
  assert.equal(
    service.access({ versionId: v.id, roomCode: "ROOM01", buyer: OTHER })
      .allowed,
    true,
    "one payer unlocks the room",
  );
  assert.equal(
    service.access({ versionId: v.id, roomCode: "ROOM02", buyer: actor })
      .allowed,
    false,
  );
  const claim = await post("/prepare", {
    action: "claim",
    address: actor,
    payload: { operationId: "claim-one" },
  });
  await signed("claim", {
    operationId: claim.operationId,
    signature: await account.signTypedData(
      claimData(claim.config, claim.input),
    ),
  });
  await f.pump();
  await service.poll();
  assert.equal((await service.earnings(actor)).claimable, "0");
  assert.equal(service.operation("claim-one").amount, "1000000");
  assert.equal(f.sends, 3);
});
test("restart reconciles a mined pass without another send and never trusts mock receipts", async (t) => {
  const f = fixture(t);
  let service = await createLiveCommerce(f.options);
  const v = await publish(service, f);
  const prepared = await service.prepare(
      "pay",
      { operationId: "restart-payment", versionId: v.id, roomCode: "ROOM01" },
      actor,
    ),
    data = paymentData(prepared.config, prepared.input);
  await service.pay(
    {
      operationId: prepared.operationId,
      permitSignature: await account.signTypedData(data.permit),
      authorizationSignature: await account.signTypedData(data.authorization),
    },
    actor,
  );
  const job = f.jobs.at(-1);
  await f.provider.execute(job);
  assert.equal(f.sends, 2);
  await service.close();
  service = await createLiveCommerce(f.options);
  t.after(() => service.close());
  f.advance(400000);
  const recovered = await f.provider.lookup(job.idempotencyKey);
  assert(recovered?.tx);
  assert.equal(
    f.sends,
    2,
    "lookup is read-only even after authorization expiry",
  );
  f.terminal.set(job.id, { status: "done", ...recovered, mock: true });
  await service.poll();
  assert.equal(service.operation("restart-payment").status, "queued");
  f.terminal.set(job.id, { status: "done", ...recovered });
  await service.poll();
  assert.equal(service.operation("restart-payment").status, "confirmed");
  assert.equal(
    service.access({ versionId: v.id, roomCode: "ROOM01", buyer: OTHER })
      .allowed,
    true,
  );
  assert.equal(f.sends, 2);
});
test("unsigned owner deployment description pins source, role order and Arc testnet", () => {
  const data = prepareCommerceDeployment({ operator: actor, platform: OTHER });
  assert.deepEqual(
    data.constructorArgs.map((v) => v.toLowerCase()),
    ["0x3600000000000000000000000000000000000000", OTHER, actor],
  );
  assert.equal(data.chainId, 5042002);
  assert.equal(data.value, 0n);
  assert.equal(data.to, null);
  assert.match(data.creationHash, /^0x[\da-f]{64}$/);
});
test("chain port shares cached reads and uses the real transact/receipts interface with canonical recovery", async (t) => {
  const now = Date.now(),
    blockTime = BigInt(Math.floor(now / 1000)),
    blockHash = "0x" + "22".repeat(32),
    txHash = "0x" + "33".repeat(32);
  let height = 100n,
    writes = 0,
    heightReads = 0,
    saved = null;
  const version = {
    ...registration(
      {
        creator: actor,
        price: "1000000",
        collaborators: [
          { address: actor, bps: 7000 },
          { address: P, bps: 3000 },
        ],
      },
      { platformAddress: OTHER },
    ),
    id: "11".repeat(32),
  };
  const actualVersion = {
    creator: actor,
    price: 1000000n,
    venue: "0x" + "0".repeat(40),
    referral: "0x" + "0".repeat(40),
    referralBps: 0,
    creatorWeightBps: 7000,
    collaborators: [{ account: P, weightBps: 3000 }],
    exists: true,
  };
  const domainTypes = {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
  };
  const publicPin = { ...deployment, runtimeHash: keccak256("0x6000") };
  const client = {
    getChainId: async () => 5042002,
    getBlockNumber: async () => {
      heightReads++;
      return height;
    },
    getBlock: async ({ blockNumber }) => ({
      number: blockNumber,
      timestamp: blockTime,
      hash: blockHash,
    }),
    getCode: async ({ address }) => (address === P ? "0x6000" : "0x6001"),
    readContract: async ({ address, functionName }) => {
      if (address === USDC)
        return {
          name: "USDC",
          version: "2",
          decimals: 6,
          paused: false,
          DOMAIN_SEPARATOR: hashDomain({
            domain: {
              name: "USDC",
              version: "2",
              chainId: 5042002,
              verifyingContract: USDC,
            },
            types: domainTypes,
          }),
          balanceOf: 2000000n,
        }[functionName];
      return {
        token: USDC,
        operator: actor,
        platform: OTHER,
        DOMAIN_SEPARATOR: hashDomain({
          domain: commerceDomain({ chainId: 5042002, contract: P }),
          types: domainTypes,
        }),
        credit: 0n,
        claimNonces: 0n,
        lifetimeGross: 0n,
        getVersion: actualVersion,
      }[functionName];
    },
    getTransactionReceipt: async () => ({
      status: "success",
      transactionHash: txHash,
      blockHash,
      blockNumber: 101n,
      logs: [],
    }),
    getTransaction: async () => ({
      hash: txHash,
      chainId: 5042002,
      from: actor,
      to: P,
      input: encodeFunctionData(saved.call),
      blockHash,
      value: 0n,
    }),
  };
  const transactions = {
    receipts: async () =>
      saved ? [{ id: saved.id, hash: txHash, status: "success" }] : [],
    transact: async (id, call) => {
      assert.equal(call.functionName, "registerVersion");
      writes++;
      saved = { id, call };
      height = 101n;
      return { tx: txHash };
    },
  };
  const versionModes = ["present", "present"];
  const clients = versionModes.map((_, index) => ({
    ...client,
    readContract: async (request) => {
      if (
        request.functionName !== "getVersion" ||
        versionModes[index] === "present"
      )
        return client.readContract(request);
      if (versionModes[index] === "false-tuple") return { exists: false };
      const wire = createPublicClient({
        transport: custom(
          {
            request: async ({ method }) => {
              assert.equal(method, "eth_call");
              if (versionModes[index] === "outage")
                throw Error("fixture RPC unavailable");
              const data = toFunctionSelector(
                versionModes[index] === "other-revert"
                  ? "Unauthorized()"
                  : "UnknownVersion()",
              );
              throw { code: 3, message: "execution reverted", data };
            },
          },
          { retryCount: 0 },
        ),
      });
      return wire.readContract(request);
    },
  }));
  const chain = await createCommerceChain({
    clients,
    deployment: publicPin,
    transactions,
    now: () => now,
  });
  await Promise.all(Array.from({ length: 6 }, () => chain.earnings(actor)));
  assert.equal(
    heightReads,
    2,
    "concurrent phone reads reuse the same snapshot",
  );
  const snapshot = await chain.snapshot();
  await t.test(
    "real viem RPC errors prove absence only when both pinned hosts return UnknownVersion",
    async () => {
      versionModes.fill("absent");
      assert.equal(await snapshot.versionExists("0x" + version.id), false);
      await assert.rejects(
        snapshot.read("getVersion", ["0x" + version.id]),
        (error) => error.name === "ContractFunctionExecutionError",
        "ordinary reads retain their strict revert behavior",
      );
    },
  );
  for (const mode of ["present", "outage", "other-revert", "false-tuple"])
    await t.test(
      `absence proof rejects a second host returning ${mode}`,
      async () => {
        versionModes[0] = "absent";
        versionModes[1] = mode;
        await assert.rejects(snapshot.versionExists("0x" + version.id));
      },
    );
  versionModes.fill("present");
  assert.equal(await snapshot.versionExists("0x" + version.id), true);
  const job = {
    type: "commerce.register",
    room: "creator-room",
    idempotencyKey: "commerce:register:test-one",
    payload: { operationId: "test-one", actor, version },
  };
  const result = await chain.execute(job, commerceTransactionId(job));
  assert.equal(result.tx, txHash);
  assert.equal(result.data.versionId, version.id);
  assert.equal(writes, 1);
  assert.equal(
    (await chain.reconcile(job, commerceTransactionId(job))).tx,
    txHash,
  );
  assert.equal(writes, 1, "canonical recovery never calls transact again");
  const reordered = {
    ...version,
    recipients: version.recipients.map(({ address, bps }) => ({
      bps,
      address,
    })),
  };
  assert.equal(
    (await chain.paymentContext({ version: reordered, payer: actor })).balance,
    "2000000",
    "JSONB recipient key order does not change the verified split",
  );
  for (const bps of [3001, "3000"]) {
    const changed = structuredClone(reordered);
    changed.recipients[1].bps = bps;
    await assert.rejects(
      chain.paymentContext({ version: changed, payer: actor }),
      { code: "VERSION_TERMS_MISMATCH" },
    );
  }
  assert.equal(writes, 1, "payment context checks are read-only");
});
