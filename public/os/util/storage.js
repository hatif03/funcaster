/** Settings only. Owner and display credentials must remain in sessionStorage. */
export function createStorage(storage) {
  const memory = new Map();
  const keyFor = (key) =>
    key.startsWith("chonks.") || key.startsWith("openwii.")
      ? key
      : `chonks.${key}`;
  function write(key, value) {
    key = keyFor(key);
    if (key === "chonks.host" || key.startsWith("chonks.player."))
      throw new TypeError("Session identities are not OS preferences");
    if (value === undefined) return;
    if (value === null) memory.delete(key);
    else memory.set(key, value);
    try {
      value === null
        ? storage?.removeItem(key)
        : storage?.setItem(key, JSON.stringify(value));
    } catch {
      /* Memory settings work in private browsing. */
    }
  }
  function read(key, fallback = null, legacy = []) {
    key = keyFor(key);
    for (const candidate of [key, ...legacy]) {
      let value;
      try {
        const raw = storage?.getItem(candidate);
        if (raw != null) {
          try {
            value = JSON.parse(raw);
          } catch {
            value = raw;
          }
        }
      } catch {}
      value ??= memory.get(candidate);
      if (value != null) {
        if (candidate !== key) write(key, value);
        return value;
      }
    }
    return fallback;
  }
  return { read, write };
}
export function browserStorage() {
  let storage;
  try {
    storage = globalThis.localStorage;
  } catch {}
  return createStorage(storage);
}
export function preferences(storage) {
  return {
    tvScale: storage.read("tvScale", "auto"),
    safeArea: storage.read("safeArea", 0),
    skin: storage.read("skin", "luna"),
    cursorSkin:
      storage.read("cursorSkin", "arrow") === "glove" ? "glove" : "arrow",
    volume: Math.min(
      100,
      Math.max(
        0,
        Number(storage.read("volume", 70, ["chonks.party-volume"])) || 0,
      ),
    ),
    mascot: storage.read("mascot", true),
    pets: storage.read("pets", true),
    avatars: storage.read("avatars", true),
    gentle: storage.read("reduced-effects", false),
  };
}
