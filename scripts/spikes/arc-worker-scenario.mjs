// Shared acceptance driver: it uses the real file outbox, worker and lifecycle.
// The caller supplies keys/clock/clients; this module never loads env secrets.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  createOutbox,
  digest,
  atomicJson,
  readJson,
} from "../../integrations/shared/outbox.mjs";
import { createWorker } from "../../integrations/shared/worker.mjs";
import { reservePotIntent } from "../../integrations/arc/intents.mjs";
import {
  acceptData,
  fundingData,
  settleData,
  contestData,
} from "../../integrations/arc/signatures.mjs";
import records from "../../server/records.cjs";
import { arcReadOutage } from "../../integrations/arc/rpc.mjs";
import { arcFailure } from "../../integrations/arc/diagnostics.mjs";

// A worker may need its configured backoff to reconcile a just-mined effect.
// Missing receipts are pending work, never a reason to resend or reset a job.
export async function waitForWorkerReceipt({
  dir,
  job,
  worker,
  wait = delay,
  wallNow = Date.now,
  timeoutMs = 180000,
}) {
  const deadline = wallNow() + timeoutMs;
  for (;;) {
    await worker.poll();
    let lines = "";
    try {
      lines = await readFile(path.join(dir, "receipts.jsonl"), "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const receipt = lines
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse)
      .find((r) => r.id === job.id);
    if (receipt) {
      if (receipt.status === "done") return receipt;
      throw Object.assign(
        Error("Worker step failed; inspect its retained journal"),
        {
          code: "ACCEPTANCE_STEP_FAILED",
          step: job.type,
        },
      );
    }
    if (wallNow() >= deadline)
      throw Object.assign(
        Error("Worker step still pending; keep its existing admission"),
        {
          code: "ACCEPTANCE_STEP_PENDING",
          step: job.type,
        },
      );
    await wait(1000);
  }
}

// Recovery runs in the worker's idle lane, independently of outbox receipts.
// A mined refund/finalization can precede canonical readback and pull claims.
// Wait for the complete observable outcome, retaining the existing admissions.
export async function waitForPotOutcome({
  worker,
  chain,
  potId,
  state,
  step,
  wait = delay,
  wallNow = Date.now,
  timeoutMs = 180000,
}) {
  const deadline = wallNow() + timeoutMs;
  for (;;) {
    try {
      await worker.poll();
      const proof = await chain.snapshot(potId);
      if (
        ["Settled", "Refunded"].includes(proof.state) &&
        proof.state !== state
      )
        throw Object.assign(Error("Unexpected terminal pot outcome"), {
          code: "ACCEPTANCE_WRONG_OUTCOME",
          step,
        });
      if (proof.state === state && proof.claimables.every((v) => v === 0n))
        return proof;
    } catch (error) {
      if (
        !arcReadOutage(error).transient &&
        arcFailure(error).code !== "STALE_READ"
      )
        throw error;
    }
    if (wallNow() >= deadline)
      throw Object.assign(
        Error("Pot recovery still pending; retain its existing admissions"),
        { code: "ACCEPTANCE_RECOVERY_PENDING", step },
      );
    await wait(1000);
  }
}

export async function runArcWorkerScenario({
  dir,
  chain,
  oracle,
  accounts,
  sign,
  advanceTo,
  restartProvider,
  initialProvider,
  now,
  record,
  kinds = ["cooperative", "refund", "contest", "finalize"],
  crashCreate = false,
  beforeCooperative = async () => {},
  afterCooperative = async () => {},
  waitRetry = delay,
  outcomeTimeoutMs = 180000,
}) {
  let provider = initialProvider || (await restartProvider()),
    worker;
  const queue = createOutbox(dir, { now }),
    domain = { chainId: 5042002, contract: chain.deploymentConfig.contract };
  async function remember(key, make) {
    const file = path.join(dir, "scenario", `${digest(key)}.json`);
    const prior = await readJson(file);
    if (prior) return prior;
    const value = await make();
    await atomicJson(file, value);
    return value;
  }
  const start = (crash = false) =>
    createWorker({
      dir,
      providers: { arc: provider },
      now,
      afterExecute: crash
        ? () => {
            throw Object.assign(Error("Controlled post-effect crash"), {
              simulateCrash: true,
            });
          }
        : undefined,
    });
  worker = start();
  async function submit(type, payload, room, key) {
    assert(key, "Acceptance steps need durable identities");
    const saved = await remember(`job:${key}`, async () =>
      typeof payload === "function" ? payload() : payload,
    );
    const job = await queue.enqueue({
      type,
      payload: saved,
      room,
      idempotencyKey: key,
    });
    const receipt = await waitForWorkerReceipt({
      dir,
      job,
      worker,
      wait: waitRetry,
    });
    assert.equal(receipt.data.chainVerified, false);
    return receipt;
  }
  try {
    for (const asset of chain.deploymentConfig.assets) {
      const symbol = asset.symbol.toLowerCase(),
        seats = accounts[symbol],
        room = `A4_${asset.symbol}`;
      for (let i = 0; i < seats.length; i++) {
        const value = await submit(
          "arc.drip",
          {
            asset: symbol,
            address: seats[i].address,
            device: digest(`a4:${symbol}:${i}`),
            ip: digest(`a4:${symbol}`),
          },
          room,
          `a4:${symbol}:drip:${i}`,
        );
        record(`${symbol} bankroll seat ${i + 1}`, {
          tx: value.tx,
          amount: value.data.amount,
        });
      }
      if (symbol === "eurc")
        assert.equal(
          await chain.client.getBalance({ address: seats[0].address }),
          0n,
          "EURC phone must require no native gas",
        );
      for (const kind of kinds) {
        const before = await chain.deployment(),
          time = before.block.timestamp;
        const context = {
          gameId: "chonks.star-catch",
          version: "1.0.0",
          bundleHash: "a".repeat(64),
          slots: [0, 1],
        };
        const intent = await remember(`intent:${symbol}:${kind}`, () =>
          reservePotIntent({
            dir,
            attemptId: `a4:${symbol}:${kind}`,
            room,
            context,
            terms: {
              asset: asset.address,
              stake: "1000",
              seats: seats.map((a) => a.address),
              rule: 1,
              oracle,
              fundDeadline: String(time + 180n),
              settleDeadline: String(time + 900n),
              challengeWindow: 60,
              minPlaySeconds: 60,
            },
          }),
        );
        const base = { potId: intent.potId, termsHash: intent.termsHash };
        if (crashCreate) {
          await worker.close();
          worker = start(true);
          await queue.enqueue({
            type: "arc.pot.create",
            room,
            idempotencyKey: `create:${intent.potId}`,
            payload: { potId: intent.potId, terms: intent.terms, context },
          });
          await assert.rejects(worker.poll(), /Controlled/);
          await worker.close();
          provider = await restartProvider();
          worker = start();
          await worker.poll();
          assert.equal((await chain.snapshot(intent.potId)).state, "Funding");
          record("post-effect restart", {
            potId: intent.potId,
            detail:
              "Real worker/role journals reopened; existing create reconciled",
          });
          crashCreate = false;
        } else
          await submit(
            "arc.pot.create",
            { potId: intent.potId, terms: intent.terms, context },
            room,
            `create:${intent.potId}`,
          );
        for (let i = 0; i < (kind === "refund" ? 1 : seats.length); i++) {
          const seat = seats[i];
          const value = await submit(
            "arc.pot.fund",
            async () => {
              const proof = await chain.tokenSnapshot(symbol, [seat.address]);
              const typed = fundingData(
                { ...proof.asset, chainId: 5042002 },
                {
                  potId: intent.potId,
                  seat: seat.address,
                  contract: domain.contract,
                  stake: 1000n,
                  validAfter: 0n,
                  validBefore: BigInt(intent.terms.fundDeadline),
                  fundDeadline: BigInt(intent.terms.fundDeadline),
                  chainTime: BigInt(proof.chainTime),
                  balance: proof.accounts[0].balance,
                  floor: 50000n,
                },
              );
              return {
                ...base,
                seat: seat.address,
                acceptSig: await sign(seat, acceptData(domain, base)),
                validAfter: "0",
                validBefore: intent.terms.fundDeadline,
                nonce: typed.message.nonce,
                authSig: await sign(seat, typed),
              };
            },
            room,
            `fund:${intent.potId}:${i}`,
          );
          assert(value.tx);
          assert(value.data.fundedBitmap & (1 << i));
        }
        if (kind === "refund") {
          const waiting = await submit(
            "arc.pot.refund",
            base,
            room,
            `refund:${intent.potId}`,
          );
          assert(
            ["waiting", "reconciled", "applied"].includes(waiting.data.outcome),
          );
          await worker.close();
          provider = await restartProvider();
          worker = start();
          await advanceTo(BigInt(intent.terms.fundDeadline));
        } else {
          const locked = await remember(`locked:${intent.potId}`, async () => {
            const s = await chain.snapshot(intent.potId);
            return { state: s.state, chainTime: s.chainTime };
          });
          assert.equal(locked.state, "Locked");
          const unsigned = {
            ...context,
            matchId: `synthetic-a4-${symbol}-${kind}`,
            status: "completed",
            verification: "verified",
            startedAt: locked.chainTime * 1000,
            endedAt: (locked.chainTime + 1) * 1000,
            scores: [
              { slot: 0, rank: 1, score: 2 },
              { slot: 1, rank: 2, score: 1 },
            ],
          };
          const result = { ...unsigned, hash: records.hash(unsigned) },
            places = [1, 2];
          await advanceTo(
            BigInt(locked.chainTime + (kind === "cooperative" ? 6 : 61)),
          );
          if (kind === "cooperative") {
            await beforeCooperative({ asset, seats, intent });
            const sigs = await Promise.all(
              seats.map((a) =>
                sign(a, settleData(domain, { potId: intent.potId, places })),
              ),
            );
            const receipt = await submit(
              "arc.pot.settle",
              { ...base, places, sigs, result },
              room,
              `settle:${intent.potId}`,
            );
            assert.equal(receipt.data.state, "Settled");
            await afterCooperative({ asset, seats, intent, receipt });
          } else {
            const receipt = await submit(
              "arc.pot.propose",
              { ...base, places, result },
              room,
              `propose:${intent.potId}`,
            );
            assert.equal(receipt.data.state, "Proposed");
            if (kind === "contest") {
              await submit(
                "arc.pot.contest",
                {
                  ...base,
                  seat: seats[0].address,
                  signature: await sign(
                    seats[0],
                    contestData(domain, intent.potId),
                  ),
                },
                room,
                `contest:${intent.potId}`,
              );
              await advanceTo(BigInt(receipt.data.proposalAt + 5));
            } else {
              await worker.close();
              provider = await restartProvider();
              worker = start();
              await advanceTo(BigInt(receipt.data.proposalAt + 60));
            }
          }
        }
        const refund = kind === "refund" || kind === "contest";
        const final = await waitForPotOutcome({
          worker,
          chain,
          potId: intent.potId,
          state: refund ? "Refunded" : "Settled",
          step: refund
            ? "arc.pot.refund"
            : kind === "finalize"
              ? "arc.pot.finalize"
              : "arc.pot.settle",
          wait: waitRetry,
          wallNow: now,
          timeoutMs: outcomeTimeoutMs,
        });
        record(`${symbol} ${kind}`, {
          potId: intent.potId,
          state: final.state,
          blockNumber: final.blockNumber,
          blockHash: final.blockHash,
          claimables: final.claimables.map(String),
          scope:
            "SCRIPTED WORKER JOBS; synthetic canonical relay-result fixture, not gameplay acceptance",
        });
      }
    }
  } finally {
    await worker.close();
    await queue.close();
  }
}
