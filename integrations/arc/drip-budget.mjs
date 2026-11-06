import path from "node:path";
import { getAddress } from "viem";
import { atomicJson, readJson, digest } from "../shared/outbox.mjs";
import { acquireWorkerLock } from "../shared/worker.mjs";
import { mkdir } from "node:fs/promises";

const hash = (s) => typeof s === "string" && /^[\da-f]{64}$/.test(s);
// Admissions count even after an ambiguous send. Only an explicit reconciliation
// may release an unused reservation; restarting or changing the room cannot.
// IP/device identities are private salted hashes supplied by the relay, not URLs
// or raw addresses. They never appear in the public transaction/receipt metadata.
export async function createDripBudget({ dir, limits }) {
  const fields = [
    "perDevice",
    "perIpHour",
    "perRoom",
    "total",
    "bankroll",
    "floor",
  ];
  if (
    !limits ||
    !Object.keys(limits).length ||
    Object.entries(limits).some(
      ([asset, limit]) =>
        !["usdc", "eurc"].includes(asset) ||
        fields.some((f) => typeof limit[f] !== "bigint" || limit[f] <= 0n) ||
        limit.bankroll < limit.floor,
    )
  )
    throw Error("Explicit per-asset drip limits are required");
  const folder = path.join(dir, "arc-drip-budget"),
    file = path.join(folder, "journal.json");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const unlock = await acquireWorkerLock(folder);
  let journal;
  try {
    journal = (await readJson(file)) || { version: 1, entries: [] };
    if (journal.version !== 1 || !Array.isArray(journal.entries))
      throw Error("Invalid drip budget journal");
    const ids = new Set();
    for (const entry of journal.entries) {
      const limit = limits[entry.asset];
      if (
        !limit ||
        typeof entry.id !== "string" ||
        ids.has(entry.id) ||
        !hash(entry.fingerprint) ||
        ![entry.device, entry.ip, entry.room].every(hash) ||
        !/^0x[\da-f]{40}$/.test(entry.address || "") ||
        !/^[1-9]\d*$/.test(entry.amount || "") ||
        !Number.isSafeInteger(entry.chainTime) ||
        entry.chainTime <= 0
      )
        throw Error("Invalid drip budget admission");
      ids.add(entry.id);
      const rows = journal.entries.filter((r) => r.asset === entry.asset);
      const sum = (test) =>
        rows.filter(test).reduce((n, r) => n + BigInt(r.amount), 0n);
      if (
        sum(() => true) > limit.total ||
        sum((r) => r.device === entry.device || r.address === entry.address) >
          limit.perDevice ||
        sum((r) => r.room === entry.room) > limit.perRoom ||
        sum(
          (r) =>
            r.ip === entry.ip &&
            r.chainTime <= entry.chainTime &&
            r.chainTime > entry.chainTime - 3600,
        ) > limit.perIpHour
      )
        throw Error("Saved drip admissions exceed the configured budget");
    }
    await atomicJson(file, journal);
  } catch (e) {
    await unlock();
    throw e;
  }
  let tail = Promise.resolve(),
    closed = false;
  async function reserve(id, input) {
    const { asset, room, device, ip, address, balance, chainTime } =
      input || {};
    const limit = limits[asset];
    if (
      !limit ||
      !hash(room) ||
      !hash(device) ||
      !hash(ip) ||
      typeof id !== "string" ||
      !id.length ||
      id.length > 256 ||
      typeof balance !== "bigint" ||
      balance < 0n ||
      !Number.isSafeInteger(chainTime) ||
      chainTime <= 0 ||
      !/^0x[\da-f]{40}$/i.test(address || "")
    )
      throw Error("Invalid drip admission");
    getAddress(address);
    const fingerprint = digest(
      JSON.stringify({
        asset,
        room,
        device,
        ip,
        address: address.toLowerCase(),
      }),
    );
    const prior = journal.entries.find((e) => e.id === id);
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw Error("Drip idempotency payload conflict");
      return { amount: BigInt(prior.amount), reserved: true };
    }
    if (journal.entries.some((e) => e.chainTime > chainTime))
      throw Error("Drip chain clock moved backwards");
    const amount = balance >= limit.bankroll ? 0n : limit.bankroll - balance;
    if (!amount) return { amount: 0n, reserved: false };
    const rows = journal.entries.filter((e) => e.asset === asset);
    const sum = (predicate) =>
      rows.filter(predicate).reduce((n, e) => n + BigInt(e.amount), 0n);
    if (
      sum(() => true) + amount > limit.total ||
      sum((e) => e.device === device || e.address === address.toLowerCase()) +
        amount >
        limit.perDevice ||
      sum((e) => e.room === room) + amount > limit.perRoom ||
      sum((e) => e.ip === ip && e.chainTime > chainTime - 3600) + amount >
        limit.perIpHour
    )
      throw Error("Play-money drip budget reached");
    journal.entries.push({
      id,
      fingerprint,
      asset,
      room,
      device,
      ip,
      address: address.toLowerCase(),
      amount: String(amount),
      chainTime,
    });
    await atomicJson(file, journal);
    return { amount, reserved: true };
  }
  return {
    reserve(id, input) {
      if (closed) throw Error("Drip budget is closed");
      const result = tail.then(() => reserve(id, input));
      tail = result.catch(() => {});
      return result;
    },
    async close() {
      if (closed) return;
      closed = true;
      await tail;
      await unlock();
    },
  };
}
