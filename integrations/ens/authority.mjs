import abi from "./lifecycle-abi.json" with { type: "json" };
import { createHierarchyReader } from "./hierarchy.mjs";
import { readRecord, request, textCalls } from "./lifecycle-calls.mjs";
import { EnsError, requireEns } from "./errors.mjs";
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();

export function enforcement(result, mode) {
  if (result.outcome === "allowed")
    return {
      allowed: true,
      source: "chain",
      message: "Host power is on-chain.",
    };
  if (
    result.outcome === "unavailable" &&
    result.code === "RPC_UNAVAILABLE" &&
    mode === "soft"
  )
    return {
      allowed: true,
      source: "server",
      message: "Host power is server-checked right now.",
    };
  return {
    allowed: false,
    source: result.outcome === "denied" ? "chain" : "unavailable",
    message:
      result.outcome === "denied"
        ? "The chain says no: this phone's host role was revoked."
        : "Host permissions are unavailable. Use the main screen or try again.",
  };
}

export function createEnsAuthority({
  client,
  protocol,
  parent,
  owner,
  now = Date.now,
  hierarchy = createHierarchyReader({ client, protocol, parent, now }),
  ttlMs = 5000,
}) {
  requireEns(
    ttlMs > 0 && ttlMs <= 5000,
    "INVALID_CONFIG",
    "Authority cache must expire within five seconds",
  );
  const cache = new Map(),
    generations = new Map(),
    watches = new Map();
  let closed = false,
    polling = false;
  function invalidate(name) {
    generations.set(name, (generations.get(name) || 0) + 1);
    for (const [key, value] of cache)
      if (value.name === name) cache.delete(key);
  }
  async function check(input, { fresh = false } = {}) {
    const { name, seatName, address, capability } = input;
    if (closed) return { outcome: "unavailable", code: "CLOSED" };
    if (
      typeof name !== "string" ||
      name.split(".").length !== 4 ||
      !name.endsWith(`.play.${parent}`) ||
      !["control", "kick"].includes(capability) ||
      !/^0x[\da-fA-F]{40}$/.test(address || "") ||
      typeof seatName !== "string" ||
      seatName.split(".").length !== 5 ||
      !seatName.endsWith(`.${name}`)
    )
      return { outcome: "denied", code: "INVALID_AUTHORITY" };
    const key = `${name}:${seatName}:${address.toLowerCase()}:${capability}`,
      hit = cache.get(key);
    if (!fresh && hit && hit.until > now())
      return { ...hit.result, cached: true };
    const generation = generations.get(name) || 0;
    try {
      const proof = await hierarchy.walk(seatName, {
        expectedOwner: owner,
        requireResolver: true,
      });
      const party = proof.nodes.find((node) => node.name === name),
        seat = proof.leaf;
      requireEns(
        party &&
          same(party.owner, owner) &&
          same(seat.owner, address) &&
          same(seat.resolver, party.resolver),
        "OWNER_MISMATCH",
        "Host phone does not own its canonical seat",
      );
      const at = { blockNumber: proof.blockNumber };
      const [, resource, bitmap] = await client.readContract({
        ...request("resolver", party.resolver, "decodeSetter", [
          textCalls(name, { "chonks.control": "" })[0],
        ]),
        ...at,
      });
      requireEns(
        bitmap === protocol.hostRoles.control && resource !== 0n,
        "DEPLOYMENT_DRIFT",
        "Unexpected resolver control scope",
      );
      const target =
        capability === "control"
          ? request("resolver", party.resolver, "hasRoles", [
              resource,
              bitmap,
              address,
            ])
          : request("registry", party.subregistry, "hasRootRoles", [
              protocol.hostRoles.kick,
              address,
            ]);
      const role = await client.readContract({ ...target, ...at });
      const currentHost = await readRecord(
        client,
        party.resolver,
        name,
        "chonks.host",
        at,
      );
      const block = await client.getBlock({ blockNumber: proof.blockNumber });
      requireEns(
        same(block.hash, proof.blockHash) &&
          now() / 1000 - Number(proof.chainTime) <= 30,
        "STALE_CHAIN",
        "Authority proof is no longer fresh or canonical",
      );
      if (closed || (generations.get(name) || 0) !== generation)
        return { outcome: "unavailable", code: "INVALIDATED" };
      const result = {
        outcome:
          role === true && same(currentHost, address) ? "allowed" : "denied",
        code:
          role === true && same(currentHost, address)
            ? "ROLE_PRESENT"
            : "ROLE_REVOKED",
        blockNumber: String(proof.blockNumber),
      };
      cache.set(key, {
        name,
        result,
        until:
          now() +
          Math.min(ttlMs, Number(proof.expiresAt - proof.chainTime) * 1000),
      });
      const old = watches.get(name);
      if (
        !old ||
        !same(old.registry, party.subregistry) ||
        !same(old.resolver, party.resolver)
      )
        watches.set(name, {
          registry: party.subregistry,
          resolver: party.resolver,
          block: proof.blockNumber,
          hash: proof.blockHash,
        });
      return result;
    } catch (error) {
      const unavailable =
        !(error instanceof EnsError) ||
        ["STALE_CHAIN", "REORG", "INVALID_BLOCK"].includes(error.code);
      return {
        outcome: unavailable ? "unavailable" : "denied",
        code: unavailable ? "RPC_UNAVAILABLE" : error.code,
      };
    }
  }
  async function poll() {
    if (closed || polling || !watches.size) return;
    polling = true;
    try {
      const head = await client.getBlock({ blockTag: "latest" });
      for (const [name, w] of watches) {
        try {
          if (
            head.number < w.block ||
            !same(
              (await client.getBlock({ blockNumber: w.block })).hash,
              w.hash,
            )
          ) {
            invalidate(name);
            watches.delete(name);
            continue;
          }
          // Bound public-RPC work; a long gap invalidates everything and relies
          // on the next fresh hierarchy walk rather than an unbounded log scan.
          if (head.number - w.block > 100n) {
            invalidate(name);
            watches.delete(name);
            continue;
          }
          for (let from = w.block + 1n; from <= head.number; from += 10n) {
            const logs = await client.getLogs({
              address: [w.registry, w.resolver],
              event: abi.registry.find(
                (x) => x.type === "event" && x.name === "EACRolesChanged",
              ),
              fromBlock: from,
              toBlock: from + 9n < head.number ? from + 9n : head.number,
              strict: true,
            });
            if (logs.length) invalidate(name);
          }
          w.block = head.number;
          w.hash = head.hash;
        } catch {
          invalidate(name);
        }
      }
    } catch {
      for (const name of watches.keys()) invalidate(name);
    } finally {
      polling = false;
    }
  }
  return {
    check,
    invalidate,
    poll,
    forget(name) {
      invalidate(name);
      watches.delete(name);
    },
    close() {
      closed = true;
      cache.clear();
      watches.clear();
    },
  };
}
