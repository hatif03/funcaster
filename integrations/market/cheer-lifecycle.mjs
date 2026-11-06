import path from "node:path";
import { mkdir } from "node:fs/promises";
import { atomicJson, readJson, digest } from "../shared/outbox.mjs";
import { acquireWorkerLock } from "../shared/worker.mjs";
import { parseSignature, verifyTypedData } from "viem";
import { fundingIntent } from "./intents.mjs";
import { processVerifier } from "./store.mjs";
import { reportData } from "./types.mjs";
import { resolveMarket } from "./math.mjs";
import records from "../../server/records.cjs";
const json = (v) =>
  JSON.parse(
    JSON.stringify(v, (_, x) => (typeof x === "bigint" ? String(x) : x)),
  );
const norm = (v) =>
  JSON.parse(
    JSON.stringify(v, (_, x) =>
      typeof x === "bigint" || typeof x === "number"
        ? String(x)
        : typeof x === "string" && /^0x[\da-f]{40}$/i.test(x)
          ? x.toLowerCase()
          : x,
    ),
  );
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const requireIt = (condition, message) => {
  if (!condition) throw Error(message);
};
export async function createCheerLifecycle({
  dir,
  chain,
  roles,
  transactions,
  verifierKey,
  verifyRecord = processVerifier,
  killed = async () => false,
}) {
  requireIt(
    new Set(Object.values(roles).map((a) => a.toLowerCase())).size === 3,
    "Distinct cheer roles required",
  );
  const folder = path.join(dir, "cheer-live");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const release = await acquireWorkerLock(folder),
    file = path.join(folder, "journal.json"),
    identity = digest(
      records.canonical(json({ deployment: chain.deploymentConfig, roles })),
    );
  let db;
  try {
    db = (await readJson(file)) || { identity, tables: {}, jobs: {} };
    requireIt(db.identity === identity, "Cheer deployment changed");
    await atomicJson(file, db);
  } catch (e) {
    await release();
    throw e;
  }
  let tail = Promise.resolve(),
    closed = false;
  const save = () => atomicJson(file, db);
  async function snapshot(m) {
    const s = await chain.snapshot(m.tableId);
    requireIt(
      records.canonical(norm(s.params)) === records.canonical(norm(m.params)),
      "Cheer table terms changed",
    );
    return s;
  }
  async function execute(job) {
    requireIt(!closed, "Cheer worker closed");
    const p = job.payload || {},
      ref = p.marketRef;
    requireIt(
      /^0x[\da-f]{64}$/i.test(ref) &&
        typeof job.idempotencyKey === "string" &&
        job.idempotencyKey.length <= 256,
      "Invalid cheer job",
    );
    const stamp = digest(
        records.canonical(json({ type: job.type, payload: p })),
      ),
      prior = db.jobs[job.idempotencyKey];
    if (prior) {
      requireIt(prior.stamp === stamp, "Cheer intent changed");
      if (prior.result) return prior.result;
    }
    db.jobs[job.idempotencyKey] ||= { stamp };
    await save();
    const role =
        job.type === "cheer.report"
          ? p.layer === "B"
            ? "verifierB"
            : "reporterA"
          : "operator",
      txKey = `room:${digest(ref)}:cheer:${digest(job.idempotencyKey)}`,
      events = {
        "cheer.create": ["TableCreated"],
        "cheer.contribute": ["Cheered"],
        "cheer.report": ["ResultReported"],
        "cheer.cancel": ["TableVoided"],
        "cheer.void": ["TableVoided"],
        "cheer.claim": ["PayoutClaimed", "RefundClaimed"],
      }[job.type];
    let m = db.tables[ref],
      tx = null;
    const receiptEvent = async (hash) => {
      const receipt = await chain.receipt(hash),
        event = receipt.events.find(
          (e) => events.includes(e.eventName) && same(e.args.tableId, ref),
        );
      requireIt(event, "Cheer transaction lacks its canonical event");
      return event;
    };
    let effect;
    if (events) {
      const old = (await transactions[role].receipts({ prefix: txKey })).find(
        (r) => r.id === txKey && r.status === "success",
      );
      if (old) {
        effect = await receiptEvent(old.hash);
        tx = old.hash;
      }
    }
    const send = async (fn, args) => {
      requireIt(!(await killed()), "Cheer sending stopped");
      await chain.deployment();
      const sent = await transactions[role].transact(
        txKey,
        chain.call(fn, args, roles[role]),
      );
      tx = sent.tx;
      return receiptEvent(tx);
    };
    if (job.type === "cheer.create") {
      requireIt(!m || effect, "Cheer table already reserved");
      const params = p.params;
      requireIt(
        same(params.operator, roles.operator) &&
          same(params.reporterA, roles.reporterA) &&
          same(params.reporterB, roles.verifierB) &&
          params.recipients?.length >= 2 &&
          params.recipients.length <= 4 &&
          new Set(params.recipients.map((a) => a.toLowerCase())).size ===
            params.recipients.length &&
          p.context?.bundleHash &&
          p.context?.gameId &&
          p.context.slots?.length === params.recipients.length,
        "Invalid frozen cheer table",
      );
      const block = await chain.deployment();
      if (!effect) {
        requireIt(
          BigInt(params.closeTime) > block.timestamp,
          "Cheer creation window closed",
        );
        await send("createTable", [ref, params]);
      }
      m ||= {
        tableId: ref,
        params: json(params),
        context: p.context,
        spectators: [],
      };
      db.tables[ref] = m;
    } else {
      requireIt(m, "Cheer table has not been created");
      const s = await snapshot(m);
      if (effect) {
        if (
          job.type === "cheer.contribute" &&
          !m.spectators.some((a) => same(a, p.bettor))
        )
          m.spectators.push(p.bettor);
      } else if (job.type === "cheer.started") {
        requireIt(
          s.chainTime >= Number(s.params.closeTime) + 5 &&
            (!m.matchId || m.matchId === p.matchId),
          "Cheer match cannot start before close",
        );
        m.matchId = p.matchId;
      } else if (job.type === "cheer.contribute") {
        requireIt(
          Number(s.status) === 1 &&
            !s.params.recipients.some((a) => same(a, p.bettor)),
          "Cheers are closed or this phone is playing",
        );
        const q = {
          ...p,
          kind: "cheer",
          chainId: chain.deploymentConfig.chainId,
          contract: chain.deploymentConfig.contract,
          asset: s.params.asset,
          symbol: "USDC",
          minPayout: "0",
        };
        requireIt(
          await verifyTypedData({
            ...fundingIntent(q, {
              allowLocal: !!chain.local,
              now: s.chainTime * 1000,
            }),
            address: p.bettor,
            signature: p.signature,
          }),
          "Cheer authorization differs from its intent",
        );
        requireIt(
          BigInt(p.validBefore) <= BigInt(s.params.closeTime),
          "Cheer authorization exceeds close",
        );
        const account = await chain.tokenAccount(s.params.asset, p.bettor);
        requireIt(
          !account.blocked && account.balance >= BigInt(p.amount) + 50_000n,
          "Cheer requires the retained token floor",
        );
        const sig = parseSignature(p.signature);
        await send("cheer", [
          ref,
          p.bettor,
          BigInt(p.amount),
          p.salt,
          BigInt(p.validAfter),
          BigInt(p.validBefore),
          Number(sig.yParity) + 27,
          sig.r,
          sig.s,
        ]);
        m.spectators.push(p.bettor);
      } else if (job.type === "cheer.report") {
        requireIt(["A", "B"].includes(p.layer), "Unknown cheer reporter");
        const record = p.record,
          result = record?.result;
        requireIt(
          m.matchId &&
            result?.matchId === m.matchId &&
            result.gameId === m.context.gameId &&
            result.bundleHash === m.context.bundleHash,
          "Cheer result differs from its frozen match",
        );
        const { hash, ...unsigned } = result;
        requireIt(
          records.hash(unsigned) === hash &&
            records.hash(record.replay) === result.replayHash,
          "Cheer result hashes differ",
        );
        const winMask = resolveMarket(m.context.slots, result);
        requireIt(winMask > 0, "Incomplete cheers wait for refundable expiry");
        if (role === "verifierB") {
          const proof = await verifyRecord({
            record,
            marketId: ref,
            slots: m.context.slots,
            key: verifierKey,
          });
          requireIt(
            same(proof.address, roles.verifierB) &&
              proof.replayed &&
              proof.resultHash === hash &&
              proof.winMask === winMask &&
              (await verifyTypedData({
                ...reportData(ref, hash, winMask),
                address: roles.verifierB,
                signature: proof.signature,
              })),
            "Cheer replay was not independently verified",
          );
        }
        await send("report", [ref, `0x${hash}`, true]);
      } else if (job.type === "cheer.cancel") {
        requireIt(
          Number(s.status) === 1 && s.chainTime < Number(s.params.closeTime),
          "Cheer cancellation requires the open window",
        );
        await send("cancel", [ref]);
      } else if (job.type === "cheer.void") {
        if (Number(s.status) !== 3) {
          requireIt(
            Number(s.status) === 1 &&
              s.chainTime >= Number(s.params.resolveDeadline),
            "Cheer refund deadline has not arrived",
          );
          await send("voidExpired", [ref]);
        }
      } else if (job.type === "cheer.claim") {
        const recipient = s.params.recipients.some((a) => same(a, p.bettor));
        requireIt(
          recipient || m.spectators.some((a) => same(a, p.bettor)),
          "Unknown cheer claimant",
        );
        requireIt(
          [2, 3].includes(Number(s.status)),
          "Cheer payout is not ready",
        );
        const account = await chain.tokenAccount(s.params.asset, p.bettor);
        requireIt(!account.blocked, "Cheer claimant is blocked");
        if (Number(s.status) === 2) {
          if (recipient && (await chain.claimable(ref, p.bettor)) > 0n)
            await send("claimPayout", [ref, p.bettor]);
        } else if (!recipient && (await chain.refundable(ref, p.bettor)) > 0n)
          await send("claimRefund", [ref, p.bettor]);
      } else throw Error("Unsupported cheer job");
    }
    const s = await snapshot(m),
      result = {
        mock: false,
        tx,
        explorer: tx ? `${chain.deploymentConfig.explorer}/tx/${tx}` : null,
        data: {
          mode: "on",
          marketRef: ref,
          tableId: ref,
          state: Number(s.status),
          blockNumber: s.blockNumber,
          blockHash: s.blockHash,
          chainTime: s.chainTime,
          chainVerified: false,
          outcome: effect ? "reconciled" : "applied",
        },
      };
    db.jobs[job.idempotencyKey] = { stamp, result };
    await save();
    return result;
  }
  return {
    execute(job) {
      const result = tail.then(() => execute(job));
      tail = result.catch(() => {});
      return result;
    },
    async recover() {
      for (const [marketRef, m] of Object.entries(db.tables)) {
        let s = await snapshot(m);
        if (
          Number(s.status) === 1 &&
          s.chainTime >= Number(s.params.resolveDeadline)
        ) {
          await this.execute({
            type: "cheer.void",
            idempotencyKey: `cheer:recover:${marketRef}:void`,
            payload: { marketRef },
          });
          s = await snapshot(m);
        }
        if ([2, 3].includes(Number(s.status)))
          for (const bettor of Number(s.status) === 2
            ? m.params.recipients
            : m.spectators) {
            try {
              await this.execute({
                type: "cheer.claim",
                idempotencyKey: `cheer:recover:${marketRef}:${bettor}`,
                payload: { marketRef, bettor },
              });
            } catch (e) {
              if (!/blocked/.test(e.message)) throw e;
            }
          }
      }
    },
    async close() {
      if(closed)return;
      closed = true;
      await tail;
      await release();
    },
  };
}
