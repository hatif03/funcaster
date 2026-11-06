// Only read RPCs are shared. No signing/broadcast method is cached or wrapped.
export function cachedMarketClient(
  client,
  { now = Date.now, ttl = 3000 } = {},
) {
  const entries = new Map(),
    wrapped = { ...client };
  for (const name of [
    "getChainId",
    "getBlock",
    "getCode",
    "readContract",
    "getTransactionReceipt",
  ]) {
    if (typeof client[name] !== "function") continue;
    wrapped[name] = (input = {}) => {
      const key = `${name}:${JSON.stringify(input, (_, v) => (typeof v === "bigint" ? String(v) : v))}`,
        old = entries.get(key);
      if (old && now() - old.at < ttl) return old.promise;
      const entry = { at: now(), promise: null };
      entry.promise = Promise.resolve()
        .then(() => client[name](input))
        .catch((error) => {
          entries.delete(key);
          throw error;
        });
      entries.set(key, entry);
      if (entries.size > 1000)
        for (const [key, value] of entries)
          if (now() - value.at >= ttl) entries.delete(key);
      return entry.promise;
    };
  }
  return wrapped;
}
