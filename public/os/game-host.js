import { gameById, independentViews, sharedWorld } from "../../core/catalog.js";
import { GAME_STRINGS as S } from "./strings.js";
import { h } from "./util/h.js";

export const activeRound = (room) =>
  ["classic", "practice", "countdown", "playing"].includes(room?.phase);
export function localViews(room) {
  return independentViews(room.game, room.match)
    ? (room.active || [])
        .map((_, i) => i)
        .filter(
          (i) =>
            !room.seatViews?.some(
              (view) => view.view === i && view.where !== "host",
            ),
        )
    : [0];
}
export function frameKey(room) {
  return `${room.game}:${room.roundId}:${localViews(room).join(",")}`;
}
export function gameFrameUrl(room, view, count = localViews(room).length) {
  const id = gameById(room.game).id;
  if (id !== room.game || !Number.isInteger(view) || view < 0 || view > 3)
    throw new RangeError("Invalid game view");
  const params = new URLSearchParams({
    party: room.code,
    round: String(room.roundId),
    view: String(view),
    views: String(Math.max(1, count)),
    shell: "os",
  });
  if (room.match?.serverSimulation) params.set("shared", "1");
  return `/games/${id}/${sharedWorld(id, room.match) ? "shared.html" : ""}?${params}`;
}
export function trustedGameMessage(event, origin, frames) {
  return (
    event.origin === origin &&
    frames.some((frame) => frame.contentWindow === event.source) &&
    ["chonks:loaded", "chonks:home", "chonks:error"].includes(event.data?.type)
  );
}

/** Own the round surface; game modules and their renderers are loaded only on demand. */
export function createGameHost({
  wm,
  store,
  getSession,
  storage,
  settings,
  balloons,
  root = document.getElementById("os"),
  onPhase = () => {},
  onHome = null,
}) {
  let destroyed = false,
    gameHandle = null,
    latestFrame = null,
    phaseKey = null,
    loadedKey = null,
    revision = 0,
    tail = Promise.resolve(),
    loadingTimer = null,
    hideTaskbar = null,
    edgeTimer = null,
    pausePromise = null,
    errorKey = null,
    unsubscribeFrame = null;
  let loading = null,
    session = null;
  const edge = h("div", {
    class: "os-game-edge",
    "aria-hidden": "true",
    hidden: true,
  });
  root.append(edge);
  const openWindow = (module) => async (ctx, props) =>
    (await import(`./windows/${module}.js`)).open(
      { ...ctx, gameHost: api },
      props,
    );
  wm.register({
    id: "game-window",
    title: S.game,
    kind: "game",
    canClose: false,
    open: openWindow("game-window"),
  });
  wm.register({
    id: "loading",
    title: S.loading,
    kind: "tool",
    size: { w: 420, h: 260 },
    canMinimise: false,
    canMaximise: false,
    open: openWindow("loading"),
  });
  wm.register({
    id: "results",
    title: S.results,
    kind: "tool",
    size: { w: 640, h: 460 },
    canMinimise: false,
    open: openWindow("results"),
  });
  const report = (text) => wm.modal({ title: S.notYet, text });
  const remainingMs = (endsAt) =>
    Math.max(
      0,
      Number(endsAt || 0) - Date.now() - Number(store.get().serverOffset || 0),
    );
  function rememberResult(room) {
    if (room.result?.status !== "completed" || !room.result.matchId || !storage)
      return;
    const key = `records.${room.code}`,
      saved = storage.read(key, []),
      records = Array.isArray(saved)
        ? saved.filter((record) => record && typeof record.matchId === "string")
        : [];
    if (!records.some((record) => record.matchId === room.result.matchId)) {
      const game = gameById(room.game),
        top = room.result.scores?.find(
          (score) =>
            (!score.outcome || score.outcome === "finished") &&
            Number.isFinite(score.score),
        );
      if (top)
        storage.write(`last-score.${room.game}`, {
          score: top.score,
          unit: game.scoring.unit,
          at: Date.now(),
        });
      storage.write(
        key,
        [
          {
            matchId: room.result.matchId,
            title: gameById(room.game).title,
            round: room.roundId,
            verification: room.result.verification,
          },
          ...records,
        ].slice(0, 20),
      );
    }
  }
  function connectFrames() {
    const next = getSession();
    if (next === session) return;
    unsubscribeFrame?.();
    session = next;
    unsubscribeFrame = session?.on?.("frame", (frame) => {
      latestFrame = frame;
      gameHandle?.content?.setFrame?.(frame);
    });
  }
  async function reconcile(issued) {
    if (destroyed || issued !== revision) return;
    const state = store.get(),
      room = state.room;
    connectFrames();
    const key = room
      ? `${room.code}:${room.game}:${room.roundId}:${activeRound(room) ? "game" : room.phase}`
      : "none";
    if (key !== phaseKey) {
      phaseKey = key;
      onPhase(
        activeRound(room)
          ? "game"
          : room?.phase === "results"
            ? "results"
            : room?.phase === "lobby"
              ? "lobby"
              : "desktop",
      );
    }
    edge.hidden = !activeRound(room);
    if (activeRound(room)) {
      if (!gameHandle) {
        for (const entry of wm.list().filter((entry) => entry.kind === "tool"))
          await wm.close(entry.id, { force: true });
        gameHandle = await wm.open("game-window");
        if (destroyed || issued !== revision) {
          if (destroyed) await wm.close("game-window", { force: true });
        }
      }
      gameHandle?.content?.update?.(store.get());
      if (latestFrame) gameHandle?.content?.setFrame?.(latestFrame);
    } else {
      clearTimeout(loadingTimer);
      loading = null;
      await wm.close("loading", { force: true });
      if (gameHandle) {
        await wm.close("game-window", { force: true });
        gameHandle = null;
        latestFrame = null;
      }
      if (room?.phase === "results") {
        rememberResult(room);
        if (
          !wm
            .list()
            .some(
              (entry) =>
                entry.id === "results" || entry.id === "game-properties",
            )
        )
          await wm.open("results");
      } else {
        if (wm.list().some((entry) => entry.id === "results")) {
          await wm.close("results", { force: true });
          balloons?.show?.({
            title: S.results,
            text: S.atDesktop,
            key: "results-finished",
          });
        }
        if (root) delete root.dataset.gameTaskbar;
      }
    }
  }
  function changed() {
    const issued = ++revision;
    tail = tail
      .then(
        () => reconcile(issued),
        () => reconcile(issued),
      )
      .catch((error) => {
        if (!destroyed) void report(error.message || S.loadError);
      });
  }
  function revealTaskbar() {
    if (!activeRound(store.get().room)) return;
    root.dataset.gameTaskbar = "true";
    clearTimeout(hideTaskbar);
    hideTaskbar = setTimeout(() => {
      delete root.dataset.gameTaskbar;
    }, 2000);
  }
  const edgeEnter = () => {
    clearTimeout(edgeTimer);
    edgeTimer = setTimeout(revealTaskbar, 400);
  };
  const edgeLeave = () => clearTimeout(edgeTimer);
  edge.addEventListener("pointerenter", edgeEnter);
  edge.addEventListener("pointerleave", edgeLeave);
  const pointerActivity = (event) => {
    if (event.target.closest(".os-taskbar")) revealTaskbar();
  };
  const dragStart = (event) => {
    if (
      event.target.closest(".os-window-titlebar") &&
      !event.target.closest("button")
    )
      api.setPointerShield(true);
  };
  const dragEnd = () => api.setPointerShield(false);
  root.addEventListener("pointermove", pointerActivity);
  root.addEventListener("pointerdown", dragStart);
  document.addEventListener("pointerup", dragEnd);
  const api = {
    get: () => store.get(),
    remainingMs,
    loading: () => loading,
    update: changed,
    setLoading(value) {
      if (destroyed) return;
      clearTimeout(loadingTimer);
      loading = value;
      if (!value) {
        const room = store.get().room,
          key = room && frameKey(room);
        if (activeRound(room) && loadedKey !== key) {
          loadedKey = key;
          onPhase("loaded");
        }
        void wm.close("loading", { force: true });
        return;
      }
      if (!activeRound(store.get().room)) return;
      loadedKey = null;
      void wm.open("loading", { keep: true });
      if (!value.slow)
        loadingTimer = setTimeout(() => {
          if (loading && activeRound(store.get().room)) {
            loading = { ...loading, slow: true };
            wm.update(store.get());
          }
        }, 20000);
    },
    async retry() {
      errorKey = null;
      gameHandle?.content?.retry?.();
    },
    async error(message, key) {
      if (errorKey === key || !activeRound(store.get().room)) return;
      errorKey = key;
      await wm.modal({
        title: S.error,
        text: String(message || S.endError).slice(0, 500),
      });
      if (activeRound(store.get().room) && frameKey(store.get().room) === key)
        await getSession()?.cmd("lobby");
    },
    revealTaskbar,
    home() {
      revealTaskbar();
      return onHome ? onHome() : api.openPause();
    },
    setPointerShield(on) {
      gameHandle?.content?.setPointerShield?.(on);
    },
    gameActions() {
      const room = store.get().room,
        current = getSession();
      if (!activeRound(room)) return [];
      return [
        {
          id: "pause",
          label: room.paused ? S.resume : S.pause,
          action: () => current.pause(),
        },
        { id: "extend", label: S.extend, action: () => current.extend() },
        ...(room.setup?.mode === "solo" &&
        room.players.filter((p) => p.connected && p.ready).length > 1
          ? [
              {
                id: "next-player",
                label: S.nextPlayer,
                action: () => current.nextPlayer(),
              },
            ]
          : []),
        { id: "end-game", label: S.end, action: () => current.lobby() },
      ].map((entry) => ({
        ...entry,
        action: async () => {
          const answer = await entry.action();
          if (answer?.error) report(answer.error);
          return answer;
        },
      }));
    },
    openPause() {
      if (pausePromise) return pausePromise;
      const initial = store.get().room;
      if (!activeRound(initial)) return getSession()?.lobby();
      revealTaskbar();
      api.setPointerShield(true);
      pausePromise = (async () => {
        if (!initial.paused) {
          const answer = await getSession().pause();
          if (answer?.error) return report(answer.error);
        }
        const choice = await wm.modal({
          title: `${gameById(initial.game).title} · ${S.paused}`,
          text: S.pauseText,
          buttons: [
            { id: "resume", label: S.resume },
            { id: "end", label: S.end },
          ],
          defaultButton: "resume",
          cancelButton: "resume",
        });
        const room = store.get().room;
        if (
          !activeRound(room) ||
          room.roundId !== initial.roundId ||
          room.code !== initial.code
        )
          return;
        const answer =
          choice === "end"
            ? await getSession().lobby()
            : room.paused
              ? await getSession().pause()
              : null;
        if (answer?.error) report(answer.error);
      })().finally(() => {
        pausePromise = null;
        api.setPointerShield(false);
      });
      return pausePromise;
    },
    destroy() {
      destroyed = true;
      revision++;
      off();
      unsubscribeFrame?.();
      clearTimeout(loadingTimer);
      clearTimeout(hideTaskbar);
      clearTimeout(edgeTimer);
      edge.remove();
      root.removeEventListener("pointermove", pointerActivity);
      root.removeEventListener("pointerdown", dragStart);
      document.removeEventListener("pointerup", dragEnd);
      void wm.close("loading", { force: true });
      void wm.close("results", { force: true });
      void wm.close("game-window", { force: true });
    },
  };
  const off = store.subscribe((state) => state, changed);
  changed();
  return api;
}
