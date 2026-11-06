import { createStore } from "./util/store.js";
import { SESSION_STRINGS as S } from "./strings.js";

export const HOST_KEY = "chonks.host";
const editing = (room) => !!room && ["lobby", "results"].includes(room.phase);
export const isLobby = editing;
export const isClassic = (room) => room?.phase === "classic";
export const isArena = (room) =>
  ["practice", "countdown", "playing"].includes(room?.phase);
export const connectedPlayers = (room) =>
  (room?.players || []).filter((p) => p.connected);
export const readyPlayers = (room) =>
  connectedPlayers(room).filter((p) => p.ready);
export const canStart = (room) =>
  editing(room) && room.startReason === "Ready to play";

function browserSessionStorage() {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}
function identityOf(value) {
  return value &&
    typeof value.code === "string" &&
    typeof value.token === "string" &&
    typeof value.displayToken === "string"
    ? { code: value.code, token: value.token, displayToken: value.displayToken }
    : null;
}

/** A shell client of the existing party protocol; room state stays server-owned. */
export function createSession({
  socket,
  buildId,
  storage = browserSessionStorage(),
  fetcher = globalThis.fetch,
  store = createStore(),
  now = Date.now,
  timeoutMs = 5000,
  retryMs = 3000,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  confirm = async () => "cancel",
} = {}) {
  if (!socket) throw new TypeError("A party socket is required");
  let destroyed = false,
    generation = 0,
    commandSeq = 0,
    commandTail = Promise.resolve(),
    setupTail = Promise.resolve();
  let pairingTimer = null,
    pairingAbort = null,
    pairingSerial = 0,
    identity = null;
  const listeners = new Map(),
    bindings = [];
  store.set({
    room: null,
    identity: null,
    connection: "connecting",
    error: null,
    notice: null,
    pairing: null,
    pairingError: null,
    pairingLoading: false,
    serverOffset: 0,
    displays: [],
  });
  const signal = (name, data) => {
    for (const fn of listeners.get(name) || []) fn(data);
  };
  const bind = (name, fn) => {
    socket.on(name, fn);
    bindings.push([name, fn]);
  };
  const remember = (value) => {
    identity = value;
    try {
      value
        ? storage?.setItem(HOST_KEY, JSON.stringify(value))
        : storage?.removeItem(HOST_KEY);
    } catch {
      /* Same-tab play still works without persistent storage. */
    }
    store.set({ identity: value });
  };
  const recall = () => {
    if (identity) return identity;
    try {
      return identityOf(JSON.parse(storage?.getItem(HOST_KEY) || "null"));
    } catch {
      return null;
    }
  };
  const request = (name, payload = {}) =>
    new Promise((resolve) => {
      if (destroyed || !socket.connected)
        return resolve({
          error: S.reconnecting,
        });
      socket.timeout(timeoutMs).emit(name, payload, (error, answer) =>
        resolve(
          error
            ? {
                error: S.noReply,
              }
            : answer || { error: S.incompleteReply },
        ),
      );
    });
  function clearPairing() {
    clearTimeout(pairingTimer);
    pairingTimer = null;
    pairingAbort?.abort();
    pairingAbort = null;
    pairingSerial++;
  }
  async function pairingFor(screen = null) {
    if (destroyed || !identity || store.get().connection !== "connected")
      return null;
    clearPairing();
    const serial = pairingSerial,
      code = identity.code;
    pairingAbort = new AbortController();
    store.set({ pairingLoading: true, pairingError: null });
    const url = `/api/party/pairing/${encodeURIComponent(code)}${screen ? `?screen=${encodeURIComponent(screen)}` : ""}`;
    try {
      const response = await fetcher(url, { signal: pairingAbort.signal });
      if (!response.ok) throw new Error(S.pairingUnavailable);
      const value = await response.json();
      if (typeof value.url !== "string" || typeof value.qr !== "string")
        throw new Error(S.pairingUnavailable);
      if (destroyed || serial !== pairingSerial) return null;
      store.set({ pairing: value, pairingError: null, pairingLoading: false });
      signal("pairing", value);
      return value;
    } catch (error) {
      if (destroyed || serial !== pairingSerial || error.name === "AbortError")
        return null;
      store.set({
        pairingError: S.pairingError,
        pairingLoading: false,
      });
      pairingTimer = setTimeout(() => {
        void pairingFor(screen);
      }, retryMs);
      pairingTimer?.unref?.();
      return null;
    }
  }
  async function handshake() {
    const current = ++generation;
    clearPairing();
    store.set({ connection: "connecting", error: null });
    const saved = recall();
    let answer = await request("host", {
      ...(saved || {}),
      buildId,
      arcade: true,
    });
    if (destroyed || current !== generation) return;
    if (answer.update) {
      store.set({
        connection: "update",
        error: answer.error || S.update,
      });
      signal("update", answer);
      return;
    }
    if (answer.error && saved) {
      remember(null);
      store.set({ notice: answer.error });
      answer = await request("host", { buildId, arcade: true });
      if (destroyed || current !== generation) return;
    }
    if (answer.update) {
      store.set({
        connection: "update",
        error: answer.error || S.update,
      });
      signal("update", answer);
      return;
    }
    const next = identityOf(answer);
    if (answer.error || !next) {
      const error = answer.error || S.createError;
      store.set({ connection: "error", error });
      signal("error", error);
      return;
    }
    remember(next);
    store.set({ connection: "connected", error: null });
    signal("connected", next);
    void pairingFor();
  }
  bind("connect", () => {
    void handshake();
  });
  bind("disconnect", () => {
    generation++;
    clearPairing();
    if (!["ended", "update"].includes(store.get().connection))
      store.set({ connection: "reconnecting", pairingLoading: false });
  });
  bind("connect_error", () => {
    store.set({
      connection: "reconnecting",
      error: S.reconnectingNotice,
    });
  });
  bind("state", (room) => {
    store.set({
      room,
      serverOffset: Number.isFinite(room.serverTime)
        ? room.serverTime - now()
        : 0,
    });
    signal("state", room);
  });
  bind("pause", (data) => {
    if (store.get().room)
      store.set({
        room: { ...store.get().room, paused: data.paused === true },
      });
    signal("pause", data);
  });
  for (const event of ["frame", "match.finish", "pointer", "shell-button"])
    bind(event, (data) => signal(event, data));
  bind("displays", (displays) => {
    store.set({ displays });
    signal("displays", displays);
  });
  bind("ended", () => {
    generation++;
    clearPairing();
    remember(null);
    store.set({
      connection: "ended",
      room: null,
      pairing: null,
      error: S.ended,
    });
    signal("ended");
  });
  const available = () =>
    store.get().connection === "connected" && socket.connected;
  function cmd(name, args = {}) {
    const issuedGeneration = generation;
    const run = async () => {
      if (!available() || issuedGeneration !== generation)
        return { error: S.reconnecting };
      const packet = { seq: ++commandSeq, cmd: name, args };
      let answer = await request("host.cmd", packet);
      if (answer.error === "Give it a moment.") {
        store.set({ notice: S.rateLimited });
        await delay(1050);
        if (!available() || issuedGeneration !== generation)
          return { error: S.connectionChanged };
        answer = await request("host.cmd", packet);
      }
      if (answer.error) signal("command-error", answer);
      return answer;
    };
    const result = commandTail.then(run, run);
    commandTail = result.catch(() => {});
    return result;
  }
  async function destructive(cmdName, args, title, text, send = cmd) {
    const issuedGeneration = generation;
    const result = await confirm({
      title,
      text,
      buttons: [
        { id: "cancel", label: S.cancel },
        { id: "confirm", label: S.confirm, danger: true },
      ],
      defaultButton: "cancel",
      cancelButton: "cancel",
    });
    if (issuedGeneration !== generation || !available())
      return { error: S.connectionChanged };
    return result === "confirm"
      ? send(cmdName, { ...args, confirmed: true })
      : { cancelled: true };
  }
  const api = {
    stakes: (payload) => request("stakes", payload),
    predictions: (payload) => request("predictions", payload),
    commerce: (payload) => request("commerce", payload),
    socket,
    store,
    get: store.get,
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name)?.delete(fn);
    },
    remainingMs: (endsAt) =>
      Math.max(0, (Number(endsAt) || 0) - now() - store.get().serverOffset),
    select(game) {
      if (!available() || !editing(store.get().room))
        return { error: S.selectBetween };
      socket.emit("select", { game });
      return { ok: true };
    },
    setup(patch, { replace = false } = {}) {
      const issuedGeneration = generation;
      const run = () =>
        available() &&
        issuedGeneration === generation &&
        editing(store.get().room)
          ? request(
              "setup",
              replace ? { ...patch } : { ...store.get().room.setup, ...patch },
            )
          : Promise.resolve({ error: S.setupBetween });
      const result = setupTail.then(run, run);
      setupTail = result.catch(() => {});
      return result;
    },
    cmd,
    start: () => cmd("start"),
    pause: () => cmd("pause"),
    extend: () => cmd("extend"),
    lobby: () =>
      editing(store.get().room)
        ? cmd("lobby")
        : destructive("lobby", {}, S.endTitle, S.endText),
    remove: (slot) =>
      destructive("remove", { slot }, S.removeTitle, S.removeText),
    async nextPlayer() {
      if (!editing(store.get().room)) {
        const issuedGeneration = generation;
        const reply = await destructive("lobby", {}, S.nextTitle, S.nextText);
        if (reply?.error || reply?.cancelled) return reply;
        if (issuedGeneration !== generation || !available())
          return { error: S.connectionChanged };
      }
      return cmd("next-player");
    },
    record: (matchId) => request("record", { matchId }),
    arcadeConfigure: (options) => request("arcade.configure", options),
    hostAssign: (slot) => request("host.assign", { slot }),
    remoteConfigure: (enabled) => request("remote.configure", { enabled }),
    assignSeat: (slot, ref) => request("assign-seat", { slot, ref }),
    revokeView: (slot) =>
      destructive(
        "revoke-view",
        { slot },
        S.revokeTitle,
        S.revokeText,
        request,
      ),
    pointerMode: (on) => request("pointer-mode", { on }),
    restorePlayer: (restoreId) =>
      request("restore-player", { restoreId, confirmed: true }),
    phoneText: (field) => request("phone-text", { field }),
    endRoom: () => request("end-room", { confirmed: true }),
    resultHold: (on) =>
      request("results-hold", { on, roundId: store.get().room?.roundId }),
    retryPairing: pairingFor,
    newParty() {
      generation++;
      remember(null);
      store.set({
        room: null,
        pairing: null,
        connection: "connecting",
        error: null,
      });
      socket.disconnect();
      socket.connect();
    },
    reconnect() {
      socket.disconnect();
      socket.connect();
    },
    destroy() {
      destroyed = true;
      generation++;
      clearPairing();
      bindings.forEach(([name, fn]) => socket.off(name, fn));
      listeners.clear();
      socket.disconnect();
    },
  };
  if (socket.connected)
    queueMicrotask(() => {
      if (!destroyed) void handshake();
    });
  return api;
}
