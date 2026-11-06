import { games } from "../../core/catalog.js";
import { SEATS } from "../../core/seats.js";
import { WINDOW_CONTENT_STRINGS as S } from "./strings.js";
const known = new Set(games.map((g) => g.id));
export const PLAYLISTS = Object.freeze({
  quick: ["star-catch", "bubble-burst", "table-tennis"],
  sports: ["table-tennis", "star-catch", "bubble-burst"],
  race: ["mario-kart", "neon-drift", "alien-attack"],
  kiosk: ["star-catch", "bubble-burst", "neon-drift"],
});
export const canEdit = (state) =>
  state?.connection === "connected" &&
  ["lobby", "results"].includes(state.room?.phase);
export const canNextPlayer = (state) =>
  canEdit(state) &&
  state.room?.setup?.mode === "solo" &&
  state.room.players?.filter((p) => p.connected && p.ready).length >= 2;
export const safePlaylist = (ids) =>
  Array.isArray(ids)
    ? [...new Set(ids.filter((id) => known.has(id)))].slice(0, 13)
    : [];
export function playerRows(room) {
  return SEATS.map((seat, slot) => {
    const player = room?.players?.find((p) => p.slot === slot);
    const status = !player
      ? "empty"
      : ["dnf", "forfeit", "removed"].includes(player.status)
        ? player.status
        : !player.connected
          ? "away"
          : player.status === "active"
            ? "active"
            : player.ready
              ? "ready"
              : "joined";
    return {
      ...seat,
      slot,
      player,
      name: player?.name || seat.name,
      status,
      host: room?.hostSeat === slot,
      pending: room?.pendingHost?.slot === slot,
    };
  });
}
export function recentRecords(storage, code) {
  const rows = storage.read(`records.${code}`, []);
  return Array.isArray(rows)
    ? rows
        .filter(
          (r) =>
            r &&
            typeof r.matchId === "string" &&
            r.matchId.length <= 128 &&
            typeof r.title === "string",
        )
        .slice(0, 20)
        .map((r) => ({
          matchId: r.matchId,
          title: r.title.slice(0, 150),
          verification: r.verification,
          round: r.round,
        }))
    : [];
}
export const verificationText = (value) =>
  ["verified", "attested", "failed", "unverified"].includes(value)
    ? S[value]
    : S.unverified;
export function safeWebUrl(value, base = globalThis.location?.origin) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function screenUrl(identity, base = globalThis.location?.origin) {
  if (!identity?.code || !identity.displayToken) return null;
  const url = safeWebUrl("/screen", base);
  if (!url) return null;
  const target = new URL(url);
  target.searchParams.set("room", identity.code);
  target.searchParams.set("key", identity.displayToken);
  return target.href;
}
export function modeOptions(mode, pin) {
  if (!["party", "kiosk"].includes(mode)) return { error: S.error };
  if (mode === "kiosk" && !/^\d{6}$/.test(pin)) return { error: S.invalidPin };
  return mode === "kiosk" ? { mode, pin } : { mode };
}
export function ageText(createdAt, serverTime) {
  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(serverTime) ||
    createdAt > serverTime
  )
    return S.unavailable;
  const seconds = Math.floor((serverTime - createdAt) / 1000);
  return S.age(Math.floor(seconds / 60), seconds % 60);
}
