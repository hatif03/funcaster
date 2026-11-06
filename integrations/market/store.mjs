import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyTypedData } from "viem";
import { atomicJson, readJson } from "../shared/outbox.mjs";
import { betData, reportData } from "./types.mjs";
import {
  payoutVector,
  projectedPayout,
  claimPayout,
  resolveMarket,
} from "./math.mjs";
const clone = (value) => JSON.parse(JSON.stringify(value));
const key = (address) => {
  if (!/^0x[\da-f]{40}$/i.test(address)) throw Error("Invalid address");
  return address.toLowerCase();
};
const hex = () => `0x${randomBytes(32).toString("hex")}`;
export function processVerifier(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL("../../scripts/market-verifier.mjs", import.meta.url),
        ),
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    const timer = setTimeout(() => child.kill(), 35_000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 32_000) child.kill();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        if (code !== 0)
          throw Error(
            "Independent replay check failed; coins will be refunded",
          );
        resolve(JSON.parse(output));
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}
export async function createMarketStore({
  dir,
  now = Date.now,
  verifyRecord = processVerifier,
  livenessSeconds = 90,
  guardSeconds = 5,
  resolveSeconds = 1800,
  onReceipt = () => {},
} = {}) {
  const file = path.join(dir, "markets", "local-ledger.json");
  let db = await readJson(file),
    queue = Promise.resolve();
  if (!db) {
    db = {
      schema: 1,
      mode: "mock",
      reporterA: generatePrivateKey(),
      verifierB: generatePrivateKey(),
      accounts: {},
      markets: {},
    };
    await atomicJson(file, db);
  }
  if (db.schema !== 1 || db.mode !== "mock")
    throw Error("Unexpected local market ledger");
  // An interrupted server cannot prove that its former room still exists.
  // Open records become refunds, while completed pull claims survive restart.
  let recovered = false;
  for (const m of Object.values(db.markets))
    if (!["final", "void"].includes(m.phase)) {
      m.phase = "void";
      m.reason = "Console restarted; your prediction is refundable";
      m.cheersPhase = "refund";
      recovered = true;
    }
  if (recovered) await atomicJson(file, db);
  function receipt(state, type, id, amount = "0") {
    state.activities ||= {};
    state.activities[id] ||= {
      id,
      type,
      status: "posted",
      mock: true,
      at: now(),
      data: { amount: String(amount), asset: "play-USDC" },
    };
  }
  async function mutate(fn) {
    const task = queue.then(async () => {
      const next = clone(db);
      const result = await fn(next);
      for (const m of Object.values(next.markets))
        if (m.phase === "void" && db.markets[m.marketId]?.phase !== "void")
          receipt(next, "market.void", `market:void:${m.marketId}`);
      const fresh = Object.values(next.activities || {}).filter(
        (r) => !db.activities?.[r.id],
      );
      await atomicJson(file, next);
      db = next;
      for (const r of fresh) {
        try {
          await onReceipt(r);
        } catch {
          /* Durable activities allow later reconciliation without replaying coins. */
        }
      }
      return result;
    });
    queue = task.catch(() => {});
    return task;
  }
  const get = (state, id) => {
    const m = state.markets[id];
    if (!m) throw Error("Match unavailable");
    return m;
  };
  const account = (state, address) =>
    (state.accounts[key(address)] ||= {
      balance: "1000000",
      lastRefill: now(),
    });
  function age(m) {
    if (m.cheersPhase === "pending" && now() >= m.deadline)
      m.cheersPhase = "refund";
    if (m.phase === "betting" && now() >= m.closesAt) {
      m.phase =
        m.pools.filter((p) => BigInt(p) > 0n).length < 2 ? "void" : "locked";
      if (m.phase === "void")
        m.reason = "Nobody picked the other side; your coins come back";
    }
    if (!["final", "void"].includes(m.phase) && now() >= m.deadline) {
      m.phase = "void";
      m.reason = "Result could not be verified in time";
      m.cheersPhase = "refund";
    }
    if (m.phase === "resolving" && m.readyAt && now() >= m.readyAt) {
      m.phase = "final";
      m.cheersPhase = "paid";
    }
  }
  function position(m, address) {
    const a = key(address);
    return {
      marketId: m.marketId,
      title: m.title,
      phase: m.phase,
      stakes: m.stakes[a] || m.pools.map(() => "0"),
      claimed: !!m.claimed[a],
      cheered: m.cheers[a] || "0",
      cheersClaimed: !!m.cheersClaimed[a],
      seated: m.seats.some((s) => s.address === a),
      cheersPhase: m.cheersPhase,
    };
  }
  function publicMatch(m) {
    const total = m.pools.reduce((s, p) => s + BigInt(p), 0n);
    return {
      matchRef: m.matchRef,
      marketId: m.marketId,
      game: m.game,
      title: m.title,
      phase: m.phase,
      mode: "mock",
      asset: "local play coins",
      chainVerified: false,
      closesAt: m.closesAt,
      startsAt: m.startsAt,
      endsAt: m.deadline,
      serverTime: now(),
      humans: m.seats.length,
      seats: m.seats.map(({ slot, label, color }) => ({ slot, label, color })),
      outcomes: m.seats.map((s, i) => ({
        index: i,
        label: s.label,
        pool: m.pools[i],
        share: total ? Number((BigInt(m.pools[i]) * 10000n) / total) / 100 : 0,
        mult: BigInt(m.pools[i])
          ? Number((total * 100n) / BigInt(m.pools[i])) / 100
          : null,
      })),
      pool: String(total),
      cheersPool: Object.values(m.cheers)
        .reduce((a, v) => a + BigInt(v), 0n)
        .toString(),
      cheersPhase: m.cheersPhase,
      reason: m.reason || null,
      resultSummary: m.resultHash
        ? {
            hash: m.resultHash,
            winMask: m.winMask,
            replayVerified: m.replayVerified === true,
          }
        : null,
    };
  }
  return {
    activities() {
      return clone(Object.values(db.activities || {}));
    },
    async create({ game, title, seats, windowSeconds = 60, context }) {
      if (
        !Number.isInteger(windowSeconds) ||
        windowSeconds < 30 ||
        windowSeconds > 120 ||
        seats.length < 2 ||
        seats.length > 4 ||
        new Set(seats.map((s) => key(s.address))).size !== seats.length
      )
        throw Error(
          "Predictions need two to four distinct bound players and a 30–120 second window",
        );
      return mutate((s) => {
        const marketId = hex(),
          matchRef = randomBytes(18).toString("hex"),
          closesAt = now() + windowSeconds * 1000;
        const m = {
          marketId,
          matchRef,
          game,
          title: String(title).slice(0, 80),
          seats: seats.map((seat) => ({
            slot: seat.slot,
            address: key(seat.address),
            label: String(seat.label || `Player ${seat.slot + 1}`).slice(0, 32),
            color: String(seat.color || "blue").slice(0, 20),
          })),
          context,
          closesAt,
          startsAt: closesAt + guardSeconds * 1000,
          deadline: closesAt + resolveSeconds * 1000,
          phase: "betting",
          pools: seats.map(() => "0"),
          claimedStake: seats.map(() => "0"),
          stakes: {},
          claimed: {},
          nonces: {},
          cheers: {},
          cheersClaimed: {},
          cheersPhase: "pending",
        };
        s.markets[marketId] = m;
        return clone(m);
      });
    },
    async list() {
      await mutate((s) => Object.values(s.markets).forEach(age));
      return Object.values(db.markets).slice(-100).reverse().map(publicMatch);
    },
    snapshot(id) {
      const m = db.markets[id];
      return m ? clone(m) : null;
    },
    async personal(address) {
      await mutate((s) => {
        account(s, address);
        Object.values(s.markets).forEach(age);
      });
      const a = key(address);
      return {
        mode: "mock",
        balance: db.accounts[a].balance,
        positions: Object.values(db.markets)
          .filter(
            (m) =>
              m.stakes[a] ||
              m.cheers[a] ||
              m.seats.some((s) => s.address === a),
          )
          .map((m) => position(m, a)),
      };
    },
    async refill(address) {
      return mutate((s) => {
        const a = account(s, address);
        if (BigInt(a.balance) >= 100_000n || now() - a.lastRefill < 86_400_000)
          throw Error("Refill is available once a day below 0.10 coins");
        a.balance = String(BigInt(a.balance) + 1_000_000n);
        a.lastRefill = now();
        return { balance: a.balance };
      });
    },
    async bet(address, intent, signature) {
      const a = key(address);
      if (
        !(await verifyTypedData({ ...betData(intent), address: a, signature }))
      )
        throw Error("Prediction signature does not match this phone");
      return mutate((s) => {
        const m = get(s, intent.marketId);
        age(m);
        if (
          m.phase !== "betting" ||
          now() >= m.closesAt ||
          intent.expiresAt <= now() ||
          intent.expiresAt > m.closesAt
        )
          throw Error("Predictions are closed");
        if (m.seats.some((seat) => seat.address === a))
          throw Error(
            "You are playing this match. Pick another match to predict",
          );
        if (m.nonces[intent.nonce]) return { duplicate: true };
        const amount = BigInt(intent.amount),
          wallet = account(s, a);
        if (BigInt(wallet.balance) < amount)
          throw Error("Not enough play coins");
        if (intent.kind === "cheer") {
          if (![50_000n, 100_000n, 250_000n].includes(amount))
            throw Error("Choose a cheer preset");
          if (
            BigInt(m.cheers[a] || 0) + amount > 1_000_000n ||
            Object.values(m.cheers).reduce((v, p) => v + BigInt(p), 0n) +
              amount >
              25_000_000n
          )
            throw Error("Cheer limit reached");
          m.cheers[a] = String(BigInt(m.cheers[a] || 0) + amount);
        } else {
          const stake = (m.stakes[a] ||= m.pools.map(() => "0"));
          if (intent.outcome >= m.pools.length) throw Error("Unknown outcome");
          if (
            stake.reduce((x, v) => x + BigInt(v), 0n) + amount > 1_000_000n ||
            m.pools.reduce((x, v) => x + BigInt(v), 0n) + amount > 25_000_000n
          )
            throw Error("Prediction limit reached");
          if (
            projectedPayout(m.pools, intent.outcome, amount) <
            BigInt(intent.minPayout)
          )
            throw Error("Odds moved. Review your new estimate");
          stake[intent.outcome] = String(
            BigInt(stake[intent.outcome]) + amount,
          );
          m.pools[intent.outcome] = String(
            BigInt(m.pools[intent.outcome]) + amount,
          );
        }
        wallet.balance = String(BigInt(wallet.balance) - amount);
        m.nonces[intent.nonce] = a;
        receipt(
          s,
          intent.kind === "cheer" ? "market.cheer" : "market.bet",
          `market:${intent.kind || "prediction"}:${m.marketId}:${intent.nonce}`,
          amount,
        );
        return { accepted: true, mode: "mock" };
      });
    },
    async start(id) {
      return mutate((s) => {
        const m = get(s, id);
        age(m);
        if (now() < m.startsAt)
          throw Error("Predictions must close before the match starts");
        if (m.phase === "locked") m.phase = "live";
        m.started = true;
      });
    },
    async void(
      id,
      reason = "Match did not finish fairly; coins are refundable",
    ) {
      return mutate((s) => {
        const m = get(s, id);
        if (!["final", "void"].includes(m.phase)) {
          m.phase = "void";
          m.reason = reason;
        }
        if (m.cheersPhase === "pending") m.cheersPhase = "refund";
      });
    },
    async finish(id, record) {
      const m = this.snapshot(id);
      if (!m || !m.started) return;
      if (m.cheersPhase === "refund" || now() >= m.deadline)
        return this.void(id);
      const winMask = resolveMarket(
        m.seats.map((s) => s.slot),
        record?.result,
      );
      if (!winMask || record.result.gameId !== m.game) return this.void(id);
      let b;
      try {
        b = await verifyRecord({
          marketId: id,
          record,
          slots: m.seats.map((s) => s.slot),
          key: db.verifierB,
        });
        const expectedB = privateKeyToAccount(db.verifierB).address;
        if (
          b.address.toLowerCase() !== expectedB.toLowerCase() ||
          b.resultHash !== record.result.hash ||
          b.winMask !== winMask ||
          b.replayed !== true ||
          !(await verifyTypedData({
            ...reportData(id, b.resultHash, b.winMask),
            address: expectedB,
            signature: b.signature,
          }))
        )
          throw Error("Reports disagree");
      } catch {
        return this.void(
          id,
          "Independent replay could not confirm the result; coins are refundable",
        );
      }
      const a = privateKeyToAccount(db.reporterA);
      if (a.address.toLowerCase() === b.address.toLowerCase())
        return this.void(id, "Distinct reporters are required");
      const aSig = await a.signTypedData(
        reportData(id, record.result.hash, winMask),
      );
      return mutate((s) => {
        const current = get(s, id);
        age(current);
        if (current.resultHash || current.cheersPhase === "refund") return;
        if (!["void", "live", "locked"].includes(current.phase)) return;
        current.resultHash = record.result.hash;
        current.winMask = winMask;
        current.replayVerified = true;
        current.reports = [
          { address: a.address, signature: aSig },
          { address: b.address, signature: b.signature },
        ];
        current.readyAt = now() + livenessSeconds * 1000;
        current.cheersPhase = "paid";
        if (current.phase !== "void") {
          const vector = payoutVector(current.pools, winMask);
          if (vector.void) {
            current.phase = "void";
            current.reason =
              "Nobody backed the winning side; coins are refundable";
          } else {
            current.phase = "resolving";
            current.slices = vector.slices.map(String);
          }
        }
      });
    },
    async claim(id, address) {
      const a = key(address);
      return mutate((s) => {
        const m = get(s, id);
        age(m);
        let payout = 0n;
        const stake = m.stakes[a] || m.pools.map(() => "0");
        if (!m.claimed[a] && ["final", "void"].includes(m.phase)) {
          for (let i = 0; i < stake.length; i++) {
            const amount = BigInt(stake[i]);
            if (m.phase === "void") payout += amount;
            else if (amount && m.winMask & (1 << i)) {
              payout += claimPayout(
                amount,
                m.pools[i],
                m.slices[i],
                m.claimedStake[i],
              );
              m.claimedStake[i] = String(BigInt(m.claimedStake[i]) + amount);
            }
          }
          m.claimed[a] = true;
        }
        if (!m.cheersClaimed[a]) {
          if (m.cheersPhase === "refund") {
            payout += BigInt(m.cheers[a] || 0);
            m.cheersClaimed[a] = true;
          } else if (m.cheersPhase === "paid") {
            const seat = m.seats.findIndex((s) => s.address === a);
            if (seat >= 0) {
              const total = Object.values(m.cheers).reduce(
                (sum, v) => sum + BigInt(v),
                0n,
              );
              payout +=
                total / BigInt(m.seats.length) +
                (seat === 0 ? total % BigInt(m.seats.length) : 0n);
            }
            m.cheersClaimed[a] = true;
          }
        }
        const wallet = account(s, a);
        wallet.balance = String(BigInt(wallet.balance) + payout);
        if (payout > 0n)
          receipt(
            s,
            "market.claim",
            `market:claim:${id}:${randomBytes(16).toString("hex")}`,
            payout,
          );
        return {
          amount: String(payout),
          balance: wallet.balance,
          mode: "mock",
        };
      });
    },
    async close() {
      await queue;
    },
  };
}
