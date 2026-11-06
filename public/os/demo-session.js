import { gameById } from "../../core/catalog.js";
import { demoSetup, demoFrame, demoStartReason } from "./demo-state.js";
import { DESKTOP_STRINGS as S } from "./strings.js";
export function createDemoSession(store, { now = Date.now } = {}) {
  let destroyed = false;
  const listeners = new Map(),
    denied = async () => ({ error: S.demoAction }),
    editable = () =>
      !destroyed && ["lobby", "results"].includes(store.get().room?.phase),
    signal = (name, value) => listeners.get(name)?.forEach((fn) => fn(value)),
    emit = (patch) => {
      const room = { ...store.get().room, ...patch };
      if (patch.phase === "lobby")
        room.players = room.players.map((p) => ({
          ...p,
          score: 0,
          status: !p.connected ? "away" : p.ready ? "ready" : "joined",
        }));
      room.startReason = demoStartReason(room);
      store.set({ room });
      signal("state", room);
    };
  const api = {
    async stakes() {
      return {
        error:
          "Stakes are unavailable in the wallpaper demo. Use a local MOCK room to try them.",
      };
    },
    store,
    get: store.get,
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      if (name === "frame")
        queueMicrotask(() => {
          const frame = demoFrame(store.get().room);
          if (!destroyed && listeners.get(name)?.has(fn) && frame) fn(frame);
        });
      return () => listeners.get(name)?.delete(fn);
    },
    remainingMs: (endsAt) => Math.max(0, (Number(endsAt) || 0) - now()),
    select(game) {
      if (!editable() || gameById(game).id !== game)
        return { error: S.demoAction };
      emit({
        game,
        phase: "lobby",
        active: [],
        match: null,
        result: null,
        setup: demoSetup(
          game,
          store.get().room.setup,
          store.get().room.players.length,
        ),
      });
      return { ok: true };
    },
    async setup(patch, { replace = false } = {}) {
      if (
        !editable() ||
        !patch ||
        typeof patch !== "object" ||
        Array.isArray(patch)
      )
        return denied();
      const room = store.get().room,
        requested = replace ? patch : { ...room.setup, ...patch },
        playlist = Array.isArray(patch.playlist)
          ? [
              ...new Set(patch.playlist.filter((id) => gameById(id).id === id)),
            ].slice(0, 8)
          : room.playlist;
      emit({
        setup: demoSetup(
          room.game,
          requested,
          room.players.filter((p) => p.connected && p.ready).length,
        ),
        playlist,
        playlistIndex: 0,
      });
      return { ok: true };
    },
    async cmd(name, args = {}) {
      if (!destroyed && name === "lock" && typeof args?.locked === "boolean") {
        emit({ locked: args.locked });
        return { ok: true };
      }
      return denied();
    },
    async lobby() {
      if (destroyed) return denied();
      emit({
        phase: "lobby",
        active: [],
        match: null,
        result: null,
        paused: false,
        endsAt: 0,
        resultsHeld: false,
        resultsRemainingMs: null,
      });
      return { ok: true };
    },
    async pause() {
      if (destroyed || store.get().room?.phase !== "playing") return denied();
      emit({ paused: !store.get().room.paused });
      return { ok: true };
    },
    async resultHold(on) {
      const room = store.get().room;
      if (destroyed || room?.phase !== "results" || typeof on !== "boolean")
        return denied();
      if (room.resultsHeld === on) return { ok: true };
      emit({
        resultsHeld: on,
        resultsRemainingMs: on ? api.remainingMs(room.endsAt) : null,
        endsAt:
          !on && room.resultsHeld
            ? now() + room.resultsRemainingMs
            : room.endsAt,
      });
      return { ok: true };
    },
    reconnect() {
      if (destroyed) return denied();
      emit({ hostConnected: true });
      store.set({ connection: "demo", error: null, notice: null });
      return { ok: true };
    },
    destroy() {
      destroyed = true;
      listeners.clear();
    },
  };
  for (const name of [
    "start",
    "extend",
    "remove",
    "nextPlayer",
    "record",
    "arcadeConfigure",
    "hostAssign",
    "remoteConfigure",
    "assignSeat",
    "revokeView",
    "pointerMode",
    "restorePlayer",
    "phoneText",
    "endRoom",
    "retryPairing",
    "newParty",
  ])
    api[name] = denied;
  return api;
}
