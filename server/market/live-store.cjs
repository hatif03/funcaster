"use strict";
const path = require("node:path"),
  { randomBytes } = require("node:crypto");
const { verifyTypedData } = require("viem");
const {
  atomicJson,
  readJson,
  digest,
} = require("../../integrations/shared/outbox.mjs");
const { fundingIntent } = require("../../integrations/market/intents.mjs");
const { projectedPayout } = require("../../integrations/market/math.mjs");
const json = (value) =>
  JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? String(v) : v)),
  );
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const address = (value) => {
  if (!/^0x[\da-f]{40}$/i.test(value)) throw Error("Invalid spectator address");
  return value.toLowerCase();
};
async function createLiveMarketStore({
  config,
  outbox,
  readReceipt,
  chains,
  now = Date.now,
  requestDrip,
  onReceipt = () => {},
}) {
  const { marketRoles, createLiveMarketChains } =
    await import("../../integrations/market/provider.mjs");
  if (!outbox?.enqueue || typeof readReceipt !== "function")
    throw Error("Durable market queue is unavailable");
  chains ||= await createLiveMarketChains(config, { now });
  const roles = marketRoles(config),
    file = path.join(config.WEB3_DATA_DIR, "markets", "live-relay.json");
  const identity = digest(
    JSON.stringify({
      market: chains.market.deploymentConfig,
      cheer: chains.cheer.deploymentConfig,
      roles,
    }),
  );
  let db = (await readJson(file)) || {
    version: 1,
    identity,
    markets: {},
    actions: {},
    quotes: {},
    drips: {},
  };
  if (db.identity !== identity)
    throw Error("Market deployment changed; reconcile the retained ledger");
  for (const m of Object.values(db.markets)) m.listed = false;
  await atomicJson(file, db);
  let tail = Promise.resolve(),
    closed = false,
    polling = false,
    lastPoll = 0;
  const save = () => atomicJson(file, db),
    locked = (fn) => {
      const p = tail.then(fn);
      tail = p.catch(() => {});
      return p;
    };
  const get = (id) => {
    const m = db.markets[id];
    if (!m) throw Error("Match unavailable");
    return m;
  };
  async function enqueue(type, marketRef, suffix, payload) {
    const idempotencyKey = `${type}:${marketRef}:${suffix}`;
    const action = (db.actions[idempotencyKey] ||= {
      type,
      payload: { marketRef, ...payload },
      marketRef,
      requestedAt: now(),
    });
    await save();
    if (!action.jobId) {
      const job = await outbox.enqueue({
        type,
        idempotencyKey,
        room: digest(marketRef),
        payload: json(action.payload),
      });
      action.jobId = job.id;
      await save();
    }
    return action;
  }
  function setPhase(m) {
    const s = m.chain,
      c = m.cheerChain;
    if (!s) {
      m.phase = m.failed ? "void" : "opening";
      m.reason = m.failed
        ? "The market did not open. No prediction was charged."
        : "Opening the on-chain pool…";
      return;
    }
    m.closesAt = Number(s.params.closeTime) * 1000;
    m.startsAt = m.closesAt + (config.MARKET_GUARD_SECONDS || 5) * 1000;
    m.pools = s.pools.slice(0, m.seats.length).map(String);
    m.phase =
      Number(s.status) === 1
        ? "final"
        : Number(s.status) === 2
          ? "void"
          : s.chainTime * 1000 < m.closesAt
            ? "betting"
            : s.matched || m.finished
              ? "resolving"
              : m.started
                ? "live"
                : "locked";
    m.cheersPhase =
      Number(c?.status) === 2
        ? "paid"
        : Number(c?.status) === 3
          ? "refund"
          : "pending";
    m.reason =
      m.phase === "void"
        ? "The market was voided. Your exact stake is refundable."
        : m.phase === "opening"
          ? "Opening the on-chain pool…"
          : null;
    m.fresh = now() - m.observedAt <= 30_000;
  }
  function publicMatch(m) {
    setPhase(m);
    const total = m.pools.reduce((a, v) => a + BigInt(v), 0n);
    return {
      marketId: m.marketRef,
      matchRef: m.matchRef,
      game: m.game,
      title: m.title,
      phase: m.phase,
      mode: "on",
      asset: "Arc test USDC",
      chainVerified: false,
      chainMarketId: m.chainId || null,
      contract: chains.market.deploymentConfig.contract,
      cheerContract: chains.cheer.deploymentConfig.contract,
      tokenAddress: config.ARC_USDC,
      chainId: chains.market.deploymentConfig.chainId,
      closesAt: m.closesAt,
      startsAt: m.startsAt,
      serverTime: now(),
      humans: m.seats.length,
      pool: String(total),
      cheersPool: String(m.cheerChain?.total || 0),
      cheersPhase: m.cheersPhase,
      stale: !m.fresh,
      reason: m.reason,
      seats: m.seats.map(({ slot, label, color }) => ({ slot, label, color })),
      outcomes: m.seats.map((s, i) => ({
        index: i,
        label: s.label,
        pool: m.pools[i],
        mult: BigInt(m.pools[i])
          ? Number((total * 100n) / BigInt(m.pools[i])) / 100
          : null,
        share: total ? Number((BigInt(m.pools[i]) * 10000n) / total) / 100 : 0,
      })),
      resultSummary: m.resultHash
        ? { hash: m.resultHash, replayVerified: false }
        : null,
    };
  }
  async function refresh(m) {
    if (!m.chainId) return;
    try {
      const [s, c] = await Promise.all([
        chains.market.snapshot(m.chainId),
        m.cheerCreated ? chains.cheer.snapshot(m.marketRef) : null,
      ]);
      m.chain = json(s);
      m.cheerChain = c ? json(c) : null;
      m.observedAt = now();
      m.fresh = true;
      setPhase(m);
    } catch {
      m.fresh = false;
    }
  }
  async function dispatchResult(m) {
    if (!m.pendingResult || !m.fresh || now() - m.observedAt > 30_000) return;
    const record = m.pendingResult;
    // Prediction and cheer pools settle independently. A thin/void prediction
    // pool refunds through worker recovery while the human seats can earn cheers.
    if (
      Number(m.chain?.status) === 0 &&
      Number(m.chain.fundedOutcomes) >= 2 &&
      m.chain.chainTime < Number(m.chain.params.resolveDeadline)
    ) {
      await enqueue("market.report", m.marketRef, "report-A", {
        layer: "A",
        record,
      });
      await enqueue("verify.market", m.marketRef, "report-B", { record });
    }
    if (
      Number(m.cheerChain?.status) === 1 &&
      m.cheerChain.chainTime < Number(m.cheerChain.params.resolveDeadline)
    ) {
      await enqueue("cheer.report", m.marketRef, "report-A", {
        layer: "A",
        record,
      });
      await enqueue("verify.cheer", m.marketRef, "report-B", { record });
    }
    delete m.pendingResult;
    await save();
  }
  async function poll() {
    if (closed || polling || now() - lastPoll < 3000) return;
    polling = true;
    lastPoll = now();
    try {
      await locked(async () => {
        for (const [key, a] of Object.entries(db.actions)) {
          if (a.receipt) continue;
          if (!a.jobId) {
            const job = await outbox.enqueue({
              type: a.type,
              idempotencyKey: key,
              room: digest(a.marketRef),
              payload: a.payload,
            });
            a.jobId = job.id;
            await save();
          }
          const receipt = await readReceipt(a.jobId);
          if (!receipt || !["done", "failed"].includes(receipt.status))
            continue;
          a.receipt = receipt;
          const m = get(a.marketRef);
          if (receipt.status === "done" && !receipt.mock) {
            if (a.type === "market.create")
              m.chainId = String(receipt.data?.marketId || "");
            if (a.type === "cheer.create") m.cheerCreated = true;
          } else if (a.type === "market.create") m.failed = true;
          await save();
          await onReceipt(receipt);
        }
        for (const m of Object.values(db.markets).slice(-100)) {
          if (
            m.pendingResult ||
            ![1, 2].includes(Number(m.chain?.status)) ||
            ![2, 3].includes(Number(m.cheerChain?.status))
          )
            await refresh(m);
          await dispatchResult(m);
        }
        await save();
      });
    } finally {
      polling = false;
    }
  }
  const actionRows = (m, owner) =>
    Object.values(db.actions).filter(
      (a) => a.marketRef === m.marketRef && same(a.payload.bettor, owner),
    );
  const api = {
    mode: "on",
    poll,
    snapshot(id) {
      const m = db.markets[id];
      return m ? json(m) : null;
    },
    async create({
      game,
      title,
      seats,
      windowSeconds = 60,
      context,
      frozenContext,
    }) {
      return locked(async () => {
        if (
          seats.length < 2 ||
          seats.length > 4 ||
          new Set(seats.map((s) => address(s.address))).size !== seats.length ||
          !frozenContext?.bundleHash
        )
          throw Error("Two to four frozen human seats are required");
        const block = await chains.market.deployment(),
          marketRef = `0x${randomBytes(32).toString("hex")}`,
          closeTime =
            Number(block.timestamp) +
            Math.min(120, Math.max(40, windowSeconds + 10)),
          resolveDeadline =
            closeTime + (config.MARKET_RESOLVE_DEADLINE_SECONDS || 1800);
        const m = {
          marketRef,
          marketId: marketRef,
          matchRef: randomBytes(18).toString("hex"),
          game,
          title,
          seats: seats.map((s) => ({
            slot: s.slot,
            address: address(s.address),
            label: String(s.label || `Player ${s.slot + 1}`).slice(0, 32),
            color: String(s.color || "blue").slice(0, 20),
          })),
          context,
          frozenContext,
          closesAt: closeTime * 1000,
          startsAt: (closeTime + 5) * 1000,
          pools: seats.map(() => "0"),
          phase: "opening",
          listed: true,
          createdAt: now(),
          observedAt: 0,
        };
        db.markets[marketRef] = m;
        await save();
        await enqueue("market.create", marketRef, "create", {
          params: {
            asset: config.ARC_USDC,
            operator: roles.operator,
            outcomeCount: seats.length,
            closeTime,
            resolveDeadline,
            liveness: config.MARKET_LIVENESS_SECONDS || 90,
            feeBps: 0,
            minBet: "50000",
            perUserCap: "1000000",
            poolCap: "25000000",
            reporterA: roles.reporterA,
            verifierB: roles.verifierB,
            excluded: seats.map((s) => s.address),
          },
          context: frozenContext,
        });
        await enqueue("cheer.create", marketRef, "create", {
          params: {
            asset: config.ARC_USDC,
            operator: roles.operator,
            recipients: seats.map((s) => s.address),
            closeTime,
            resolveDeadline,
            reporterA: roles.reporterA,
            reporterB: roles.verifierB,
          },
          context: frozenContext,
        });
        return json(m);
      });
    },
    async list() {
      await poll();
      return Object.values(db.markets)
        .filter((m) => m.listed)
        .slice(-100)
        .reverse()
        .map(publicMatch);
    },
    async personal(owner) {
      owner = address(owner);
      await poll();
      const account = await chains.market.tokenAccount(config.ARC_USDC, owner),
        positions = [],
        matches = [];
      for (const m of Object.values(db.markets).slice(-100)) {
        const actions = actionRows(m, owner),
          seated = m.seats.some((s) => same(s.address, owner));
        if (!actions.length && !seated) continue;
        let stakes = m.pools.map(() => "0"),
          claimed = false,
          cheered = "0",
          cheersClaimed = false,
          claimable = "0";
        if (m.chainId) {
          const r = await chains.market.readMany([
            ...m.seats.map((_, i) => [
              "stakeOf",
              [BigInt(m.chainId), owner, i],
            ]),
            ["claimed", [BigInt(m.chainId), owner]],
            ["previewClaim", [BigInt(m.chainId), owner]],
          ]);
          stakes = r.slice(0, m.seats.length).map(String);
          claimed = !!r[m.seats.length];
          claimable = String(r[m.seats.length + 1]);
        }
        if (m.cheerCreated) {
          const [c, paid, refunded, payout] = await chains.cheer.readMany([
            ["cheerOf", [m.marketRef, owner]],
            ["payoutClaimed", [m.marketRef, owner]],
            ["refunded", [m.marketRef, owner]],
            ["previewPayout", [m.marketRef, owner]],
          ]);
          cheered = String(c);
          cheersClaimed = seated
            ? !!paid
            : !!refunded || m.cheersPhase === "paid";
          if (m.cheersPhase === "refund" && !refunded)
            claimable = String(BigInt(claimable) + c);
          else claimable = String(BigInt(claimable) + payout);
        }
        positions.push({
          marketId: m.marketRef,
          title: m.title,
          phase: m.phase,
          stakes,
          claimed,
          cheered,
          cheersClaimed,
          cheersPhase: m.cheersPhase,
          seated,
          claimable,
          pending: actions.some((a) => !a.receipt),
          actions: actions.slice(-10).map((a) => ({
            kind: a.type,
            status: a.receipt?.status || "queued",
            tx: a.receipt?.tx || null,
            explorer: a.receipt?.explorer || null,
            error:
              a.receipt?.status === "failed"
                ? "This request was not confirmed. Check its receipt before retrying."
                : null,
          })),
        });
        matches.push(publicMatch(m));
      }
      return {
        mode: "on",
        asset: "Arc test USDC",
        balance: String(account.balance),
        positions,
        matches,
        bankrollStatus: db.drips[owner]?.jobId ? "requested" : "not-requested",
      };
    },
    async refill(owner, meta = {}) {
      owner = address(owner);
      if (!requestDrip)
        throw Error("Test-token bankroll is unavailable; contact the host");
      return locked(async () => {
        const prior = db.drips[owner];
        if (prior && now() - prior.at < 86_400_000)
          return { queued: true, ...prior };
        const balance = await chains.market.tokenAccount(
          config.ARC_USDC,
          owner,
        );
        if (balance.balance >= 100_000n)
          throw Error("Refill is available below 0.10 test USDC");
        const result = await requestDrip(owner, meta);
        db.drips[owner] = { at: now(), jobId: result.id };
        await save();
        return { queued: true, ...db.drips[owner] };
      });
    },
    async quote(owner, input) {
      owner = address(owner);
      await poll();
      return locked(async () => {
        const m = get(input.marketId);
        setPhase(m);
        if (
          !m.fresh ||
          m.phase !== "betting" ||
          !m.chainId ||
          (input.kind === "cheer" && !m.cheerCreated)
        )
          throw Error("This on-chain pool is not open or its proof is stale");
        if (m.seats.some((s) => s.address === owner))
          throw Error("Players cannot predict or cheer their own table");
        const amount = BigInt(input.amount),
          minPayout = BigInt(input.minPayout || 0);
        if (
          input.kind !== "cheer" &&
          projectedPayout(m.pools, input.outcome, amount) < minPayout
        )
          throw Error("Odds moved. Review the new estimate");
        const q = {
          quoteId: randomBytes(24).toString("hex"),
          marketRef: m.marketRef,
          kind: input.kind,
          chainId: chains.market.deploymentConfig.chainId,
          chainMarketId: m.chainId,
          contract:
            input.kind === "cheer"
              ? chains.cheer.deploymentConfig.contract
              : chains.market.deploymentConfig.contract,
          asset: config.ARC_USDC,
          symbol: "USDC",
          bettor: owner,
          outcome: input.outcome,
          amount: String(amount),
          minPayout: String(minPayout),
          salt: `0x${randomBytes(32).toString("hex")}`,
          validAfter: "0",
          validBefore: String(m.closesAt / 1000),
        };
        fundingIntent(q, {
          allowLocal: !!chains.market.local,
          now: Math.max(now(), m.chain.chainTime * 1000),
        });
        db.quotes[q.quoteId] = { quote: q, createdAt: now() };
        for (const [key, value] of Object.entries(db.quotes))
          if (Number(value.quote.validBefore) * 1000 < now() - 86_400_000)
            delete db.quotes[key];
        await save();
        return q;
      });
    },
    async bet(owner, intent, signature) {
      owner = address(owner);
      return locked(async () => {
        const saved = db.quotes[intent.quoteId],
          q = saved?.quote;
        if (!q || !same(q.bettor, owner))
          throw Error("Prediction quote is unavailable for this phone");
        if (
          !(await verifyTypedData({
            ...fundingIntent(q, {
              allowLocal: !!chains.market.local,
              now: now(),
            }),
            address: owner,
            signature,
          }))
        )
          throw Error("Prediction authorization does not match the quote");
        const m = get(q.marketRef);
        if (now() >= m.closesAt) throw Error("Predictions closed");
        const type = q.kind === "cheer" ? "cheer.contribute" : "market.bet",
          payload = {
            bettor: owner,
            outcome: q.outcome,
            amount: q.amount,
            minPayout: q.minPayout,
            salt: q.salt,
            validAfter: q.validAfter,
            validBefore: q.validBefore,
            signature,
          };
        const action = await enqueue(type, m.marketRef, q.quoteId, payload);
        return {
          queued: true,
          mode: "on",
          jobId: action.jobId,
          status: action.receipt?.status || "queued",
        };
      });
    },
    startReason(id) {
      const m = get(id);
      if (!m.chainId || !m.cheerCreated) return "Opening predictions on Arc";
      if (!m.fresh || now() - m.observedAt > 30_000)
        return "Waiting for fresh Arc confirmation";
      if (m.chain.chainTime * 1000 < m.startsAt)
        return `Predictions close before play · ${Math.max(1, Math.ceil((m.startsAt - m.chain.chainTime * 1000) / 1000))}s`;
      if (
        Object.values(db.actions).some(
          (a) =>
            a.marketRef === id &&
            ["market.bet", "cheer.contribute"].includes(a.type) &&
            !a.receipt,
        )
      )
        return "Finishing the last prediction transactions";
      return null;
    },
    async start(id, { matchId } = {}) {
      return locked(async () => {
        const reason = api.startReason(id);
        if (reason) throw Error(reason);
        const m = get(id);
        m.started = true;
        m.matchId = matchId;
        await save();
        await enqueue("market.started", id, "started", { matchId });
        await enqueue("cheer.started", id, "started", { matchId });
      });
    },
    async finish(id, record) {
      return locked(async () => {
        const m = get(id);
        if (!m.started) return;
        m.finished = true;
        m.resultHash = record.result?.hash;
        await save();
        if (
          record.result?.status !== "completed" ||
          record.result?.verification !== "verified"
        )
          return;
        m.pendingResult = record;
        await save();
        await refresh(m);
        await dispatchResult(m);
      });
    },
    async void(id) {
      return locked(async () => {
        const m = get(id);
        m.listed = false;
        await refresh(m);
        await save();
        if (m.chainId && Number(m.chain.status) === 0) {
          const type =
            m.chain.chainTime * 1000 < m.closesAt
              ? "market.cancel"
              : "market.void";
          if (
            type === "market.cancel" ||
            m.chain.chainTime >= Number(m.chain.params.resolveDeadline) ||
            m.chain.fundedOutcomes < 2
          )
            await enqueue(type, id, "cancel", {});
        }
        if (m.cheerCreated && Number(m.cheerChain?.status) === 1) {
          const type =
            m.cheerChain.chainTime * 1000 < m.closesAt
              ? "cheer.cancel"
              : "cheer.void";
          if (
            type === "cheer.cancel" ||
            m.cheerChain.chainTime >=
              Number(m.cheerChain.params.resolveDeadline)
          )
            await enqueue(type, id, "cancel", {});
        }
      });
    },
    async claim(id, owner) {
      owner = address(owner);
      return locked(async () => {
        const m = get(id),
          actions = actionRows(m, owner);
        if (!m.seats.some((s) => s.address === owner) && !actions.length)
          throw Error("This phone has no position in this match");
        await refresh(m);
        if (!m.fresh) throw Error("Wait for a fresh Arc payout proof");
        const jobs = [];
        if (
          [1, 2].includes(Number(m.chain?.status)) &&
          actions.some((a) => a.type === "market.bet")
        )
          jobs.push(
            await enqueue("market.claim", id, `claim-${owner}`, {
              bettor: owner,
            }),
          );
        if (
          [2, 3].includes(Number(m.cheerChain?.status)) &&
          (m.seats.some((s) => s.address === owner) ||
            actions.some((a) => a.type === "cheer.contribute"))
        )
          jobs.push(
            await enqueue("cheer.claim", id, `claim-${owner}`, {
              bettor: owner,
            }),
          );
        if (!jobs.length) throw Error("Payouts are not ready yet");
        return { mode: "on", queued: true, jobs: jobs.map((a) => a.jobId) };
      });
    },
    async close() {
      closed = true;
      await tail;
    },
  };
  return api;
}
module.exports = { createLiveMarketStore };
