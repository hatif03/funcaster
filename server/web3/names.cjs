"use strict";
const RESERVED = new Set([
  "play",
  "players",
  "legends",
  "fans",
  "booth",
  "hall",
  "www",
  "games",
  "agents",
  "host",
  "tv",
  "admin",
  "chonks",
]);
const BLOCKED = new Set(["fuck", "shit", "bitch"]);
function sanitizeName(nick) {
  if (typeof nick !== "string" || nick.length > 80) return null;
  const name = nick.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "-");
  if (
    !/^[a-z0-9](?:[a-z0-9-]{1,18})[a-z0-9]$/.test(name) ||
    name.includes("--") ||
    name.split("-").some((p) => RESERVED.has(p) || BLOCKED.has(p))
  )
    return null;
  return name;
}
function uniqueName(base, players, self) {
  const used = new Set(
    players.filter((p) => p && p !== self).map((p) => p.displayName),
  );
  if (!used.has(base)) return base;
  for (let n = 2; n <= players.length + 2; n++) {
    const suffix = `-${n}`,
      candidate = base.slice(0, 20 - suffix.length).replace(/-$/, "") + suffix;
    if (!used.has(candidate)) return candidate;
  }
  throw Error("No unique seat label");
}
function createNames({ now, config }) {
  const attempts = new WeakMap();
  return {
    bind(socket, getMembership, broadcast) {
      socket.on("name", (data, ack) => {
        if (typeof ack !== "function") return;
        const m = getMembership();
        if (
          m?.role !== "player" ||
          m.player.socket !== socket.id ||
          m.room.players[m.player.slot] !== m.player
        )
          return ack({ error: "Join a player seat first." });
        const p = m.player,
          last = attempts.get(p);
        if (last !== undefined && now() - last < config.WEB3_NAME_COOLDOWN_MS)
          return ack({
            error: "Wait three seconds before changing your name.",
          });
        attempts.set(p, now());
        const clean =
          data &&
          typeof data === "object" &&
          !Array.isArray(data) &&
          Object.keys(data).join(",") === "nick"
            ? sanitizeName(data.nick)
            : null;
        if (!clean)
          return ack({
            error: "Use 3–20 letters, numbers or hyphens; choose another name.",
          });
        p.displayName = uniqueName(clean, m.room.players, p);
        ack({ ok: true, name: p.displayName });
        broadcast(m.room);
      });
    },
    release(p) {
      attempts.delete(p);
      delete p.displayName;
    },
  };
}
module.exports = { sanitizeName, uniqueName, createNames };
