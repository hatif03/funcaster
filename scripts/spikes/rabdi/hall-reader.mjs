// Shared by the G0 browser and worker probes. No key, relay or wallet dependency.
import { eq, gt, asc } from "@arkiv-network/sdk/query";
import { hexToBytes } from "viem";
import { key, u64 } from "@arkiv-network/sdk/schema";
import { Score } from "./final-schema.mjs";
export function classifyScore(row, creators) {
  if (!creators.some((a) => a.toLowerCase() === row.$creator?.toLowerCase()))
    return "unverified";
  try {
    if (
      !row.$creationFlags?.readonly ||
      row.project.value !== "chonks_g0" ||
      row.game.value !== "synthetic"
    )
      return "invalid";
    const p = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        hexToBytes(row.payload.value),
      ),
    );
    if (
      p.synthetic !== true ||
      !Number.isSafeInteger(p.ordinal) ||
      p.ordinal < 0 ||
      p.ordinal !== row.ordinal.value ||
      !Number.isSafeInteger(p.score) ||
      p.score < 0 ||
      p.score !== row.score.value ||
      !/^0x[0-9a-fA-F]{40}$/.test(p.winner) ||
      p.winner.toLowerCase() !== row.winner.value.toLowerCase()
    )
      return "invalid";
    return "trusted";
  } catch {
    return "invalid";
  }
}
export async function walkScores(
  client,
  run,
  { creator, bucket, maxPages = 30, onPage = () => {} } = {},
) {
  const rows = [],
    seen = new Set();
  let after, previousBlock;
  for (let pageNo = 0; pageNo < maxPages; pageNo++) {
    let query = client
      .select("*")
      .from(Score, { onMismatch: "throw" })
      .where(eq("run", run));
    if (creator) query = query.createdBy(creator);
    if (bucket !== undefined)
      query = query.where(eq("board_bucket", u64(BigInt(bucket))));
    if (after) query = query.where(gt("$key", key(after)));
    const page = await query.orderBy(asc("$key")).limit(100).fetch();
    if (
      page.skipped ||
      (previousBlock !== undefined && page.blockNumber < previousBlock)
    )
      throw Error("Unsafe page continuation");
    previousBlock = page.blockNumber;
    for (const row of page.entities) {
      if (seen.has(row.$key) || (after && row.$key <= after))
        throw Error("Duplicate or unordered key");
      seen.add(row.$key);
      rows.push(row);
      after = row.$key;
    }
    onPage({
      page: pageNo,
      count: page.entities.length,
      block: String(page.blockNumber),
    });
    if (page.entities.length < 100) return rows;
  }
  throw Error("Page ceiling reached; narrow the board bucket");
}
export function createBoardCache({ now = Date.now, ttl = 10000 } = {}) {
  const cache = new Map();
  return async function read(key, load, onRefresh = () => {}) {
    let entry = cache.get(key);
    if (!entry) {
      const rows = await load();
      entry = { rows, at: now() };
      cache.set(key, entry);
      return { rows, stale: false };
    }
    const stale = now() - entry.at >= ttl;
    if (stale && !entry.pending) {
      entry.pending = Promise.resolve()
        .then(load)
        .then((rows) => {
          entry.rows = rows;
          entry.at = now();
          onRefresh({ rows, stale: false });
        })
        .catch(() => onRefresh({ rows: entry.rows, stale: true }))
        .finally(() => {
          entry.pending = null;
        });
    }
    return { rows: entry.rows, stale };
  };
}
