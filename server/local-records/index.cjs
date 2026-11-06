"use strict";
const express = require("express");
const { createArchive } = require("./archive.cjs");

function createLocalRecords({
  dataDir,
  verificationRpcUrls = {},
  maxPending = 64,
  isRoomActive = () => false,
  onError = () => {},
  now = Date.now,
}) {
  if (!dataDir) throw Error("Local records require a persistent dataDir");
  const archive = createArchive(dataDir);
  const queue = [],
    verificationQueue = [];
  const confirmedReceipts = new Set(),
    scheduledVerifications = new Set();
  let running = null,
    verifying = null,
    closed = false,
    lastError = null,
    receiptFault = null,
    dropped = 0;
  const ready = Promise.all([
    import("../../integrations/ledger/store.mjs"),
    import("../../integrations/ledger/verify.mjs"),
    archive.ready,
  ]).then(async ([storeModule, verifyModule]) => {
    const store = storeModule.createLedgerStore(dataDir, { now });
    for (const receipt of storeModule.ledgerView(await store.snapshot()).rows)
      if (receipt.verification?.status === "confirmed")
        confirmedReceipts.add(receipt.id);
    return { ...storeModule, ...verifyModule, store };
  });
  ready.catch(report);
  function report(error) {
    lastError = error.code || error.message || "LOCAL_STORAGE_UNAVAILABLE";
    onError(lastError);
  }
  function enqueue(task) {
    if (closed || queue.length >= maxPending) {
      dropped++;
      report(Error("LOCAL_RECORD_QUEUE_FULL"));
      return false;
    }
    queue.push(task);
    drain();
    return true;
  }
  function drain() {
    if (running) return;
    running = (async () => {
      try {
        const modules = await ready;
        while (queue.length) {
          const task = queue.shift();
          try {
            if (task.kind === "round") await archive.save(task.record);
            else {
              const observation = modules.receiptObservation(task.receipt);
              if (!observation) continue;
              await modules.store.append(
                "receipt",
                observation,
                `receipt:${observation.id}`,
              );
              if (
                observation.tx &&
                !observation.mock &&
                !confirmedReceipts.has(observation.id) &&
                !scheduledVerifications.has(observation.id) &&
                verificationRpcUrls[observation.partner]?.length === 2 &&
                verificationQueue.length < maxPending
              ) {
                scheduledVerifications.add(observation.id);
                verificationQueue.push(observation);
                verifyNext();
              }
            }
          } catch (error) {
            if (task.kind === "receipt") receiptFault = error;
            report(error);
          }
        }
      } catch (error) {
        report(error);
        queue.length = 0;
      }
    })().finally(() => {
      running = null;
      if (queue.length) drain();
    });
  }
  function verifyNext() {
    if (verifying) return;
    verifying = (async () => {
      const modules = await ready;
      while (verificationQueue.length) {
        const observation = verificationQueue.shift();
        const proof = await modules.verifyReceipt(
          observation,
          verificationRpcUrls[observation.partner],
          { now },
        );
        await modules.store.append("verification", {
          id: observation.id,
          proof,
        });
        if (proof.status === "confirmed") confirmedReceipts.add(observation.id);
        scheduledVerifications.delete(observation.id);
      }
    })()
      .catch(report)
      .finally(() => {
        verifying = null;
        if (verificationQueue.length) verifyNext();
      });
  }
  async function ledger() {
    const m = await ready;
    return m.ledgerView(await m.store.snapshot());
  }
  const router = express.Router();
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  const route = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch {
      res.status(503).json({
        error:
          "Local records are temporarily unavailable. Saved data has not been discarded.",
      });
    }
  };
  router.get(
    "/",
    route(async (req, res) =>
      res.json({
        provenance: "Local durable records; no Arkiv or Swarm publication.",
        pending: queue.length,
        dropped,
        storage: lastError ? "attention-needed" : "ready",
        records: await archive.list({
          gameId: req.query.game,
          limit: Math.min(200, Number(req.query.limit) || 100),
        }),
      }),
    ),
  );
  router.get(
    "/leaderboard",
    route(async (req, res) =>
      res.json({
        scope:
          "Best scores reported by verified local game replays, grouped by game/build/rules. Player numbers are local to each round.",
        groups: await archive.leaderboard({ gameId: req.query.game }),
      }),
    ),
  );
  router.get(
    "/ledger",
    route(async (req, res) => res.json(await ledger())),
  );
  router.get(
    "/ledger/head",
    route(async (_req, res) => {
      const m = await ready,
        snapshot = await m.store.snapshot();
      res.json({
        head: snapshot.head,
        count: snapshot.count,
        externallyAnchored: false,
      });
    }),
  );
  router.get(
    "/ledger/export",
    route(async (_req, res) => {
      const m = await ready,
        snapshot = await m.store.snapshot();
      res
        .type("application/x-ndjson")
        .attachment("chonks-ledger.jsonl")
        .send(snapshot.rows.map((row) => JSON.stringify(row) + "\n").join(""));
    }),
  );
  router.get(
    "/:id",
    route(async (req, res) => {
      const record = await archive.get(req.params.id);
      if (!record) {
        res.status(404).json({ error: "Round not found" });
        return;
      }
      const parts = String(record.result.matchId || "").split(".");
      const code =
        parts.length === 3 ? parts[1] : parts.length === 2 ? parts[0] : null;
      if (!code || isRoomActive(code)) {
        res.status(409).json({ error: "Replay available after table closes." });
        return;
      }
      res
        .attachment(`chonks-round-${req.params.id.slice(0, 12)}.json`)
        .json(record);
    }),
  );
  async function flush({ includeVerification = true } = {}) {
    while (running || (includeVerification && verifying))
      await Promise.all([running, ...(includeVerification ? [verifying] : [])]);
    const m = await ready;
    await m.store.flush();
    if (receiptFault) throw receiptFault;
  }
  return {
    router,
    finish: (_room, record) => enqueue({ kind: "round", record }),
    recordReceipt: (receipt) => enqueue({ kind: "receipt", receipt }),
    list: archive.list,
    get: archive.get,
    leaderboard: archive.leaderboard,
    ledger,
    flush,
    async close() {
      closed = true;
      await flush();
    },
    status: () => ({
      pending: queue.length,
      verificationPending: verificationQueue.length,
      dropped,
      lastError,
    }),
  };
}
module.exports = { createLocalRecords };
