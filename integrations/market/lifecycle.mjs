// Owner-operated live plumbing with injected, budgeted Arc transaction ports.
// No credentials, RPC construction, activation or automatic uncertain resends.
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { atomicJson, readJson, digest } from "../shared/outbox.mjs";
import { acquireWorkerLock } from "../shared/worker.mjs";
import { verifyTypedData, parseSignature } from "viem";
import { resolveMarket } from "./math.mjs";
import { marketNonce } from "./chain.mjs";
import { processVerifier } from "./store.mjs";
import { reportData } from "./types.mjs";
import records from "../../server/records.cjs";
const json = (v) =>
  JSON.parse(
    JSON.stringify(v, (_, x) => (typeof x === "bigint" ? String(x) : x)),
  );
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const normalizedTerms = (value) =>
  JSON.parse(
    JSON.stringify(value, (_, v) =>
      typeof v === "number" || typeof v === "bigint"
        ? String(v)
        : typeof v === "string" && /^0x[\da-f]{40}$/i.test(v)
          ? v.toLowerCase()
          : v,
    ),
  );
const check = (value, message) => {
  if (!value) throw Error(message);
};
const AUTH_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};
export async function createMarketLifecycle({
  dir,
  chain,
  transactions,
  roles,
  verifyRecord = processVerifier,
  verifierKey,
  killed = async () => false,
}) {
  check(
    new Set(
      [roles.operator, roles.reporterA, roles.verifierB].map((a) =>
        a.toLowerCase(),
      ),
    ).size === 3,
    "Operator and both market reporters must be distinct",
  );
  const folder = path.join(dir, "market-live");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const unlock = await acquireWorkerLock(folder),
    file = path.join(folder, "journal.json");
  const identity = digest(
    records.canonical(json({ deployment: chain.deploymentConfig, roles })),
  );
  let state;
  try {
    state = (await readJson(file)) || {
      version: 1,
      identity,
      markets: {},
      jobs: {},
    };
    check(
      state.identity === identity,
      "Market journal belongs to another deployment or roles",
    );
    await atomicJson(file, state);
  } catch (error) {
    await unlock();
    throw error;
  }
  let tail = Promise.resolve(),
    closed = false;
  const save = () => atomicJson(file, state);
  async function snapshot(m) {
    const current = await chain.snapshot(m.id);
    check(
      records.canonical(normalizedTerms(current.params)) ===
        records.canonical(normalizedTerms(m.params)),
      "Market terms changed",
    );
    return current;
  }
  async function send(m, key, fn, args, event, role = "operator") {
    check(!(await killed()), "Market sending is stopped");
    await chain.deployment();
    const tx = await transactions[role].transact(
      key,
      chain.call(fn, args, roles[role]),
    );
    const receipt = await chain.receipt(tx.tx);
    const proof = receipt.events.find(
      (e) =>
        (Array.isArray(event)
          ? event.includes(e.eventName)
          : e.eventName === event) &&
        (!m || String(e.args.marketId) === String(m.id)),
    );
    check(proof, "Market receipt lacks its expected event");
    return { tx: tx.tx, proof };
  }
  async function execute(job) {
    check(!closed, "Market lifecycle is closed");
    check(
      typeof job.idempotencyKey === "string" &&
        job.idempotencyKey.length <= 256,
      "Market job needs an idempotency key",
    );
    const p = job.payload || {},
      stamp = digest(records.canonical(json({ type: job.type, payload: p })));
    const txKey = `room:${digest(String(p.marketRef))}:market:${digest(job.idempotencyKey)}`;
    const prior = state.jobs[job.idempotencyKey];
    if (prior) {
      check(prior.stamp === stamp, "Market idempotency conflict");
      if (prior.result) return prior.result;
    }
    state.jobs[job.idempotencyKey] ||= { stamp };
    await save();
    let m = state.markets[p.marketRef],
      tx = null,
      outcome = "applied";
    const role =
      job.type === "market.report"
        ? p.layer === "B"
          ? "verifierB"
          : "reporterA"
        : "operator";
    const events = {
      "market.create": ["MarketCreated"],
      "market.bet": ["BetPlaced"],
      "market.report": ["ResultReported"],
      "market.finalize": ["MarketResolved", "MarketVoided"],
      "market.void": ["MarketVoided"],
      "market.cancel": ["MarketVoided"],
      "market.claim": ["Claimed"],
    }[job.type];
    let effect;
    if (events) {
      const priorTx = (
        await transactions[role].receipts({ prefix: txKey })
      ).find((r) => r.id === txKey && r.status === "success");
      if (priorTx) {
        const proof = await chain.receipt(priorTx.hash);
        const event = proof.events.find(
          (e) =>
            events.includes(e.eventName) &&
            (!m || String(e.args.marketId) === m.id),
        );
        check(event, "Saved market transaction lacks canonical proof");
        effect = { tx: priorTx.hash, proof: event };
        tx = effect.tx;
        outcome = "reconciled";
      }
    }
    if (job.type === "market.create") {
      check(!m || effect, "Market reference is already reserved");
      check(
        /^0x[\da-f]{64}$/i.test(p.marketRef),
        "New opaque market reference required",
      );
      check(
        p.context?.gameId &&
          /^[\da-f]{64}$/i.test(p.context.bundleHash) &&
          Array.isArray(p.context.slots) &&
          p.context.slots.length >= 2 &&
          p.context.slots.length <= 4,
        "Frozen game context required",
      );
      const params = { ...p.params, token: p.params.asset || p.params.token };
      delete params.asset;
      check(
        same(params.operator, roles.operator) &&
          same(params.reporterA, roles.reporterA) &&
          same(params.verifierB, roles.verifierB) &&
          params.outcomeCount === p.context.slots.length &&
          params.excluded.length === params.outcomeCount &&
          new Set(params.excluded.map((a) => a.toLowerCase())).size ===
            params.excluded.length,
        "Frozen player and reporter roster required",
      );
      check(
        params.feeBps === 0 &&
          BigInt(params.minBet) >= 50_000n &&
          BigInt(params.perUserCap) <= 1_000_000n &&
          BigInt(params.poolCap) <= 25_000_000n,
        "Basic market caps exceeded",
      );
      const block = await chain.deployment();
      if (!effect)
        check(
          BigInt(params.closeTime) >= block.timestamp + 30n &&
            BigInt(params.closeTime) <= block.timestamp + 120n,
          "Market window must be 30 to 120 seconds",
        );
      const sent =
        effect ||
        (await send(null, txKey, "createMarket", [params], "MarketCreated"));
      tx = sent.tx;
      m ||= {
        id: String(sent.proof.args.marketId),
        params: json(params),
        context: json(p.context),
        bettors: [],
        createdTx: tx,
      };
      state.markets[p.marketRef] = m;
      await snapshot(m);
    } else {
      check(m, "Market must be created first");
      const s = await snapshot(m),
        id = BigInt(m.id);
      if (effect) {
        if (
          job.type === "market.bet" &&
          !m.bettors.some((a) => same(a, p.bettor))
        )
          m.bettors.push(p.bettor);
      } else if (job.type === "market.started") {
        check(
          !m.matchId || m.matchId === p.matchId,
          "Market already bound to another match",
        );
        check(
          typeof p.matchId === "string" &&
            p.matchId.length <= 180 &&
            s.chainTime >= Number(s.params.closeTime) + 5,
          "Match cannot start before chain close and guard",
        );
        m.matchId = p.matchId;
      } else if (job.type === "market.bet") {
        check(
          Number(s.status) === 0 && s.chainTime < Number(s.params.closeTime),
          "Predictions closed",
        );
        check(
          !s.params.excluded.some((a) => same(a, p.bettor)),
          "Seated players cannot predict this match",
        );
        check(
          Number.isInteger(p.outcome) &&
            p.outcome >= 0 &&
            p.outcome < s.params.outcomeCount &&
            BigInt(p.amount) >= 50_000n &&
            BigInt(p.amount) <= 1_000_000n,
          "Invalid prediction",
        );
        check(
          BigInt(p.validBefore) <= BigInt(s.params.closeTime) &&
            BigInt(p.validBefore) > BigInt(s.chainTime),
          "Invalid authorization deadline",
        );
        const asset = chain.deploymentConfig.assets.find((a) =>
          same(a.address, s.params.token),
        );
        check(asset, "Unrecognized asset");
        const nonce = marketNonce({
          ...p,
          marketId: id,
          contract: chain.deploymentConfig.contract,
          chainId: chain.deploymentConfig.chainId,
        });
        const typed = {
          domain: {
            name: asset.symbol,
            version: "2",
            chainId: chain.deploymentConfig.chainId,
            verifyingContract: asset.address,
          },
          types: AUTH_TYPES,
          primaryType: "ReceiveWithAuthorization",
          message: {
            from: p.bettor,
            to: chain.deploymentConfig.contract,
            value: BigInt(p.amount),
            validAfter: BigInt(p.validAfter),
            validBefore: BigInt(p.validBefore),
            nonce,
          },
        };
        check(
          await verifyTypedData({
            ...typed,
            address: p.bettor,
            signature: p.signature,
          }),
          "Prediction authorization does not bind this intent",
        );
        const account = await chain.tokenAccount(asset.address, p.bettor);
        check(
          !account.blocked && account.balance >= BigInt(p.amount) + 50_000n,
          "Preserve the test-token floor and unblock the spectator first",
        );
        const sig = parseSignature(p.signature);
        tx = (
          await send(
            m,
            txKey,
            "placeBet",
            [
              id,
              p.outcome,
              BigInt(p.amount),
              BigInt(p.minPayout),
              p.bettor,
              BigInt(p.validAfter),
              BigInt(p.validBefore),
              p.salt,
              Number(sig.yParity) + 27,
              sig.r,
              sig.s,
            ],
            "BetPlaced",
          )
        ).tx;
        if (!m.bettors.some((a) => same(a, p.bettor))) m.bettors.push(p.bettor);
      } else if (job.type === "market.report") {
        const record = p.record,
          result = record?.result;
        check(
          m.matchId &&
            result?.matchId === m.matchId &&
            result.gameId === m.context.gameId &&
            result.bundleHash === m.context.bundleHash,
          "Result differs from the frozen match",
        );
        const { hash, ...unsigned } = result;
        check(
          records.hash(unsigned) === hash &&
            records.hash(record.replay) === result.replayHash,
          "Canonical replay hash mismatch",
        );
        const winMask = resolveMarket(m.context.slots, result);
        check(
          winMask > 0,
          "Unverified or abandoned match must expire into refunds",
        );
        check(p.layer === "A" || p.layer === "B", "Unknown reporting layer");
        const role = p.layer === "A" ? "reporterA" : "verifierB";
        if (role === "verifierB") {
          check(verifierKey, "Separate verifier process key required");
          const proof = await verifyRecord({
            record,
            marketId: p.marketRef,
            slots: m.context.slots,
            key: verifierKey,
          });
          check(
            same(proof.address, roles.verifierB) &&
              proof.replayed &&
              proof.resultHash === hash &&
              proof.winMask === winMask &&
              (await verifyTypedData({
                ...reportData(p.marketRef, hash, winMask),
                address: roles.verifierB,
                signature: proof.signature,
              })),
            "Independent report differs",
          );
        }
        tx = (
          await send(
            m,
            txKey,
            "reportResult",
            [id, `0x${hash}`, winMask],
            "ResultReported",
            role,
          )
        ).tx;
      } else if (job.type === "market.finalize") {
        check(
          Number(s.status) === 0 &&
            s.matched &&
            s.chainTime >= Number(s.livenessEnd) &&
            s.chainTime < Number(s.params.resolveDeadline),
          "Matching reports and completed liveness are required",
        );
        tx = (
          await send(
            m,
            txKey,
            "finalize",
            [id],
            ["MarketResolved", "MarketVoided"],
          )
        ).tx;
      } else if (job.type === "market.void") {
        if (Number(s.status) === 2) outcome = "reconciled";
        else {
          check(Number(s.status) === 0, "Terminal market cannot be voided");
          const fn =
            s.chainTime >= Number(s.params.resolveDeadline)
              ? "voidExpired"
              : s.chainTime >= Number(s.params.closeTime) &&
                  s.fundedOutcomes < 2
                ? "voidUnderfunded"
                : null;
          check(fn, "Refund deadline is not reached");
          tx = (await send(m, txKey, fn, [id], "MarketVoided")).tx;
        }
      } else if (job.type === "market.cancel") {
        check(
          Number(s.status) === 0 && s.chainTime < Number(s.params.closeTime),
          "Lineup cancellation is allowed before close only",
        );
        tx = (await send(m, txKey, "cancel", [id], "MarketVoided")).tx;
      } else if (job.type === "market.claim") {
        check(
          m.bettors.some((a) => same(a, p.bettor)),
          "Unknown prediction claimant",
        );
        check(Number(s.status) !== 0, "Payouts are not ready");
        const amount = await chain.claimable(id, p.bettor);
        if (amount === 0n) outcome = "reconciled";
        else {
          const account = await chain.tokenAccount(s.params.token, p.bettor);
          check(
            !account.blocked,
            "This claim is blocked; other people may still claim",
          );
          tx = (await send(m, txKey, "claim", [id, p.bettor], "Claimed")).tx;
          check(
            (await chain.claimable(id, p.bettor)) === 0n,
            "Claim did not reconcile",
          );
        }
      } else throw Error("Unknown market job");
    }
    const proof = await snapshot(m),
      result = {
        mock: false,
        tx,
        explorer: tx ? `${chain.deploymentConfig.explorer}/tx/${tx}` : null,
        data: {
          mode: "on",
          marketRef: p.marketRef,
          marketId: m.id,
          state: Number(proof.status),
          blockNumber: proof.blockNumber,
          blockHash: proof.blockHash,
          chainTime: proof.chainTime,
          chainVerified: false,
          outcome,
        },
      };
    state.jobs[job.idempotencyKey] = { stamp, result };
    await save();
    return result;
  }
  return {
    execute(job) {
      const task = tail.then(() => execute(job));
      tail = task.catch(() => {});
      return task;
    },
    async recover() {
      for (const [marketRef, m] of Object.entries(state.markets)) {
        const s = await snapshot(m);
        const base = `market:recover:${marketRef}`;
        if (Number(s.status) === 0) {
          if (
            s.chainTime >= Number(s.params.resolveDeadline) ||
            (s.chainTime >= Number(s.params.closeTime) && s.fundedOutcomes < 2)
          )
            await this.execute({
              type: "market.void",
              idempotencyKey: `${base}:void`,
              payload: { marketRef },
            });
          else if (s.matched && s.chainTime >= Number(s.livenessEnd))
            await this.execute({
              type: "market.finalize",
              idempotencyKey: `${base}:finalize`,
              payload: { marketRef },
            });
        }
        if (Number((await snapshot(m)).status) !== 0)
          for (const bettor of m.bettors) {
            try {
              await this.execute({
                type: "market.claim",
                idempotencyKey: `${base}:claim:${bettor.toLowerCase()}`,
                payload: { marketRef, bettor },
              });
            } catch (error) {
              if (!/blocked/.test(error.message)) throw error;
            }
          }
      }
    },
    async close() {
      if(closed)return;
      closed = true;
      await tail;
      await unlock();
    },
  };
}

export function createMarketProvider({ lifecycle, now = Date.now }) {
  let next = 0;
  return {
    independentJobs: true,
    lookup: async () => null,
    execute: (job) => lifecycle.execute(job),
    async idle() {
      if (now() < next) return;
      next = now() + 5000;
      await lifecycle.recover();
    },
    close: () => lifecycle.close(),
  };
}
