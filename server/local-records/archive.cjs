"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  readJson,
  atomicJson,
  listDocuments,
} = require("../../integrations/shared/outbox.mjs");
const { hash } = require("../records.cjs");
const ID = /^[a-f0-9]{64}$/;
const MAX_RECORD_BYTES = 16 * 1024 * 1024;

function validateRecord(record) {
  if (!record || !record.result || !record.replay)
    throw Error("INVALID_RECORD");
  const { hash: digest, ...unsigned } = record.result;
  if (
    !ID.test(digest) ||
    hash(unsigned) !== digest ||
    hash(record.replay) !== record.result.replayHash
  )
    throw Error("RECORD_HASH_MISMATCH");
  if (
    !Array.isArray(record.result.scores) ||
    record.result.scores.length > 8 ||
    typeof record.result.gameId !== "string" ||
    !/^chonks\.[a-z0-9-]{1,64}$/.test(record.result.gameId)
  )
    throw Error("INVALID_RECORD");
  return digest;
}
function summarize(record) {
  const r = record.result;
  const { seed: _seed, ...rules } = r.setup || {};
  return {
    id: r.hash,
    gameId: r.gameId,
    version: r.version,
    bundleHash: r.bundleHash,
    rulesHash: hash({
      rules,
      players: record.replay.slots?.length || r.scores.length,
    }),
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    status: r.status,
    gameVerification: r.verification,
    provenance: "local-record",
    replayHash: r.replayHash,
    scores: r.scores.map((s) => ({
      slot: s.slot,
      rank: s.rank,
      score: s.score,
      ...(s.outcome ? { outcome: s.outcome } : {}),
    })),
  };
}
function createArchive(dataDir) {
  const directory = path.join(dataDir, "records", "rounds");
  let summaries = new Map();
  const ready = (async () => {
    for (const { name: file, value: record } of await listDocuments(
      directory,
    )) {
      if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
      if (validateRecord(record) !== file.slice(0, -5))
        throw Error("RECORD_FILENAME_MISMATCH");
      summaries.set(record.result.hash, summarize(record));
    }
  })();
  ready.catch(() => {});
  return {
    directory,
    async save(record) {
      await ready;
      const id = validateRecord(record);
      if (summaries.has(id)) return summaries.get(id);
      const body = JSON.stringify({
        result: record.result,
        replay: record.replay,
      });
      if (Buffer.byteLength(body) > MAX_RECORD_BYTES)
        throw Error("RECORD_TOO_LARGE");
      const dest = path.join(directory, id + ".json");
      await atomicJson(dest, JSON.parse(body));
      const summary = summarize(record);
      summaries.set(id, summary);
      return summary;
    },
    async get(id) {
      await ready;
      if (!ID.test(id)) return null;
      try {
        const record = await readJson(path.join(directory, id + ".json"));
        if (!record) return null;
        validateRecord(record);
        return record;
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async list({ gameId, limit = 100 } = {}) {
      await ready;
      return [...summaries.values()]
        .filter((row) => !gameId || row.gameId === gameId)
        .sort((a, b) => b.endedAt - a.endedAt || a.id.localeCompare(b.id))
        .slice(0, Math.min(10000, Math.max(1, Number(limit) || 100)));
    },
    async leaderboard({ gameId, limit = 20 } = {}) {
      await ready;
      // Scores from different games/builds/rules are never mixed. Player slots
      // are round-local, never treated as persistent identities.
      const { games } = require("../../core/catalog.js");
      const groups = new Map();
      for (const row of summaries.values()) {
        if (
          row.status !== "completed" ||
          row.gameVerification !== "verified" ||
          (gameId && row.gameId !== gameId)
        )
          continue;
        const key = `${row.gameId}:${row.version}:${row.bundleHash}:${row.rulesHash}`;
        const direction =
          games.find((game) => game.gameId === row.gameId)?.scoring
            ?.direction || "higher";
        if (!groups.has(key))
          groups.set(key, {
            gameId: row.gameId,
            version: row.version,
            bundleHash: row.bundleHash,
            rulesHash: row.rulesHash,
            direction,
            matches: 0,
            wins: [],
          });
        const group = groups.get(key);
        group.matches++;
        for (const score of row.scores.filter((s) => s.rank === 1))
          group.wins.push({ record: row.id, endedAt: row.endedAt, ...score });
      }
      return [...groups.values()].map((group) => ({
        ...group,
        wins: group.wins
          .sort(
            (a, b) =>
              (group.direction === "lower"
                ? a.score - b.score
                : b.score - a.score) || b.endedAt - a.endedAt,
          )
          .slice(0, Math.min(100, Math.max(1, Number(limit) || 20))),
      }));
    },
    ready,
  };
}
module.exports = { createArchive, validateRecord, summarize, MAX_RECORD_BYTES };
