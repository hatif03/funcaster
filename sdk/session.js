import { GameLink } from "../core/net.js";
import { validateManifest } from "../core/catalog.js";
export function scopedStorage(gameId, storage) {
  if (!storage) {
    try {
      storage = globalThis.localStorage;
    } catch {}
  }
  if (!storage) {
    const memory = new Map();
    storage = {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => memory.set(k, v),
      removeItem: (k) => memory.delete(k),
    };
  }
  if (!/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/.test(gameId))
    throw Error("A namespaced gameId is required");
  const key = (name) => {
    if (!/^[a-z0-9.-]{1,64}$/i.test(name)) throw Error("Invalid storage key");
    return `chonks.game.${gameId}.${name}`;
  };
  return {
    get(name, fallback = null) {
      try {
        const raw = storage.getItem(key(name));
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(name, value) {
      const data = JSON.stringify(value);
      if (data.length > 65536)
        throw Error("Game storage values are limited to 64 KB");
      storage.setItem(key(name), data);
    },
    remove(name) {
      storage.removeItem(key(name));
    },
  };
}
export class GameSession {
  constructor(manifest, { onInput, onAction, onPlayers } = {}) {
    const errors = validateManifest(manifest);
    if (errors.length) throw Error(errors.join("; "));
    this.manifest = Object.freeze({ ...manifest });
    this.link = new GameLink({
      onOrientation: onInput,
      onCommand: onAction,
      onPresence: onPlayers,
    });
    this.storage = scopedStorage(manifest.gameId);
  }
  get seats() {
    return this.link.slots;
  }
  get setup() {
    return this.link.setup;
  }
  get authoritative() {
    return this.link.authority;
  }
  report(scores) {
    this.link.report(scores);
  }
  finish(scores) {
    this.link.finish(scores);
  }
  feedback(slot, type = "rumble") {
    this.link.feedback({ slot, type, pattern: [15] });
  }
  bindState(read, after) {
    this.link.bindState(read, after);
  }
  dispose() {
    this.link.dispose();
  }
}
