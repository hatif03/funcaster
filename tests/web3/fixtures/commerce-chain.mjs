import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData } from "viem";
import { createCommerceJobProvider } from "../../../integrations/commerce/provider.mjs";
import {
  paymentData,
  claimData,
} from "../../../integrations/commerce/signatures.mjs";
import { splitPayment } from "../../../integrations/commerce/math.mjs";
import { hash } from "../../../integrations/commerce/jobs.mjs";
const actor = privateKeyToAccount("0x" + "56".repeat(32)).address.toLowerCase();
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
// Deterministic chain port fixture, not a public acceptance claim or signer.
export function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "commerce-live-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  let clock = Date.now(),
    sends = 0;
  const jobs = [],
    terminal = new Map(),
    transactions = new Map(),
    versions = new Map(),
    credits = {},
    gross = {},
    nonces = {},
    passes = new Map();
  const chain = {
    async paymentContext() {
      return {
        chainTime: String(Math.floor(clock / 1000)),
        balance: "2000000",
      };
    },
    async earnings(who) {
      return {
        credit: credits[who] || "0",
        nonce: nonces[who] || "0",
        lifetimeGross: gross[who] || "0",
        chainTime: String(Math.floor(clock / 1000)),
        block: "1",
      };
    },
    async access({ versionId, roomCode }) {
      const expiresAt = passes.get(versionId + roomCode) || 0;
      return { allowed: expiresAt > clock, expiresAt };
    },
    async verifyReceipt(job, tx) {
      const item = [...transactions.values()].find((r) => r.tx === tx);
      assert(item, "unknown fixture receipt");
      assert.equal(item.jobHash, intentHash(job));
      return structuredClone(item);
    },
    async reconcile(job, key) {
      const item = transactions.get(key);
      return item ? chain.verifyReceipt(job, item.tx) : null;
    },
    async execute(job, key) {
      if (transactions.has(key)) return chain.reconcile(job, key);
      sends++;
      const p = job.payload;
      let data = {};
      if (job.type === "commerce.register") {
        versions.set(p.version.id, p.version);
        data = { versionId: p.version.id };
      }
      if (job.type === "commerce.pay") {
        const v = versions.get(p.request.versionId.slice(2));
        const source = {
          versionId: p.request.versionId,
          paymentId: p.request.paymentId,
          payer: p.actor,
          roomCode: p.roomCode,
          price: v.price,
          attribution: p.request.attribution,
          referred: p.request.referred,
          atVenue: p.request.atVenue,
          chainTime: String(BigInt(p.request.validBefore) - 300n),
          balance: "2000000",
        };
        const typed = paymentData({ chainId: 5042002, contract: P }, source);
        assert(
          await verifyTypedData({
            ...typed.permit,
            address: p.actor,
            signature: p.permitSignature,
          }),
        );
        assert(
          await verifyTypedData({
            ...typed.authorization,
            address: p.actor,
            signature: p.authorizationSignature,
          }),
        );
        const split = splitPayment(v, gross[v.creator] || "0");
        for (const [who, n] of Object.entries(split.credits))
          credits[who] = String(BigInt(credits[who] || 0) + BigInt(n));
        gross[v.creator] = String(
          BigInt(gross[v.creator] || 0) + BigInt(v.price),
        );
        const expiresAt = clock + 86400000;
        passes.set(p.request.versionId + p.roomCode, expiresAt);
        data = {
          versionId: v.id,
          buyer: p.actor,
          roomCode: p.roomCode,
          amount: v.price,
          credits: split.credits,
          expiresAt,
        };
      }
      if (job.type === "commerce.claim") {
        const typed = claimData(
          { chainId: 5042002, contract: P },
          {
            recipient: p.recipient,
            nonce: p.nonce,
            chainTime: String(BigInt(p.deadline) - 300n),
          },
        );
        assert(
          await verifyTypedData({
            ...typed,
            address: p.actor,
            signature: p.signature,
          }),
        );
        data = {
          recipient: p.recipient,
          amount: credits[p.recipient],
          nonce: p.nonce,
        };
        credits[p.recipient] = "0";
        nonces[p.recipient] = String(BigInt(p.nonce) + 1n);
      }
      const output = {
        tx: "0x" + hash(key),
        mock: false,
        explorer: "https://explorer.testnet.arc.io/tx/0x" + hash(key),
        data,
        jobHash: intentHash(job),
      };
      transactions.set(key, output);
      return structuredClone(output);
    },
  };
  const options = {
    dataDir,
    directory: path.join(dataDir, "commerce"),
    mode: "on",
    deployment,
    chain,
    platformAddress: OTHER,
    firstPartyGames: [{ id: "star-catch", title: "Star Catch" }],
    now: () => clock,
    pollMs: 0,
    outbox: {
      async enqueue(job) {
        const result = { ...structuredClone(job), id: randomUUID() };
        jobs.push(result);
        return result;
      },
    },
    readJobReceipt: async (_dir, id) => terminal.get(id),
  };
  const provider = createCommerceJobProvider({ chain, dir: dataDir });
  return {
    options,
    jobs,
    chain,
    provider,
    terminal,
    get sends() {
      return sends;
    },
    advance(n) {
      clock += n;
    },
    async pump() {
      for (const job of jobs) {
        if (terminal.has(job.id)) continue;
        const output =
          (await provider.lookup(job.idempotencyKey)) ||
          (await provider.execute(job));
        terminal.set(job.id, { status: "done", ...output });
      }
    },
  };
}
