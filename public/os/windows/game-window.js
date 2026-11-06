import { gameById, independentViews } from "../../../core/catalog.js";
import { SEATS } from "../../../core/seats.js";
import { gameViewLayout } from "../game-fit.js";
import {
  frameKey,
  localViews,
  gameFrameUrl,
  trustedGameMessage,
  activeRound,
} from "../game-host.js";
import { GAME_STRINGS as S } from "../strings.js";
import { h } from "../util/h.js";
export async function open(ctx) {
  const host = ctx.gameHost;
  const el = h("div", { class: "os-game-surface" }),
    frameWrap = h("div", { class: "os-game-frames" });
  const arena = h("div", { class: "os-arena" }),
    canvas = h("canvas", { class: "os-arena-canvas" });
  const title = h("strong"),
    phase = h("span"),
    timer = h("strong", { class: "os-arena-timer" }),
    scores = h("div", { class: "os-arena-scores" }),
    countdown = h("div", { class: "os-arena-countdown", role: "status" });
  const instruction = h("strong"),
    detail = h("span"),
    hint = h("p");
  const paused = h("div", {
    class: "os-game-paused",
    text: S.paused,
    hidden: true,
  });
  const pause = h("button", {
    type: "button",
    class: "os-game-menu",
    text: S.menu,
    dataset: { nav: "", id: "game-menu" },
    onclick: () => host.openPause(),
  });
  const arenaHud = h(
    "header",
    { class: "os-arena-hud" },
    h("div", { class: "os-arena-heading" }, title, phase),
    timer,
    scores,
  );
  const arenaInstruction = h(
    "footer",
    { class: "os-arena-instruction" },
    instruction,
    detail,
    hint,
  );
  arena.append(canvas, arenaHud, arenaInstruction, countdown);
  const shield = h("div", { class: "os-game-shield", hidden: true });
  el.append(frameWrap, arena, paused, pause, shield);
  let state = ctx.store.get(),
    currentKey = null,
    frames = [],
    cells = [],
    ready = new Set(),
    renderer = null,
    rendererPromise = null,
    destroyed = false,
    scoreKey = null,
    lastFrame = null;
  const name = (slot) =>
    state.room?.players?.find((player) => player.slot === slot)?.name ||
    SEATS[slot]?.name ||
    "";
  function measureArena() {
    if (!renderer || arena.hidden) return;
    const box = arena.getBoundingClientRect(),
      header = arenaHud.getBoundingClientRect(),
      footer = arenaInstruction.getBoundingClientRect();
    const top = Math.max(0, header.bottom - box.top + 10),
      bottom = Math.max(0, box.bottom - footer.top + 10);
    renderer.setInsets({ top, bottom });
    Object.assign(canvas.dataset, {
      playableTop: String(top),
      playableBottom: String(bottom),
      playableHeight: String(Math.max(0, box.height - top - bottom)),
    });
  }
  function layout() {
    const room = state.room;
    if (!room) return;
    if (!cells.length) {
      measureArena();
      return;
    }
    const rect = frameWrap.getBoundingClientRect();
    const layouts = gameViewLayout(room.game, rect.width, rect.height, {
      count: cells.length,
      sharedScreens:
        room.game === "drawing" &&
        (room.displays > 0 ||
          room.seatViews?.some((view) => view.where !== "host")),
    });
    cells.forEach((cell, i) => {
      const { cell: box, frame } = layouts[i];
      Object.assign(cell.el.style, {
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      });
      Object.assign(cell.frame.style, {
        left: `${frame.x - box.x}px`,
        top: `${frame.y - box.y}px`,
        width: `${frame.width}px`,
        height: `${frame.height}px`,
      });
      // The parent menu scales with the whole screen, even when a game is split.
      // Keep its measured width available to the owned same-origin HUD stylesheet.
      try {
        cell.frame.contentDocument?.body?.style.setProperty(
          "--shell-menu-clearance",
          `${Math.max(150, Math.ceil(pause.getBoundingClientRect().width + parseFloat(getComputedStyle(pause).right || 0) + 16))}px`,
        );
      } catch {
        /* Cross-origin frames are never part of this host contract. */
      }
    });
  }
  const observer = new ResizeObserver(layout);
  observer.observe(frameWrap);
  observer.observe(arenaHud);
  observer.observe(arenaInstruction);
  function releaseRenderer() {
    if (renderer) {
      renderer.running = false;
      renderer.observer.disconnect();
      renderer.clear();
      renderer = null;
    }
  }
  function clearFrames() {
    for (const cell of cells) cell.detachKeys?.();
    for (const frame of frames) frame.removeAttribute("src");
    frames = [];
    cells = [];
    ready = new Set();
    frameWrap.replaceChildren();
  }
  function classic(room) {
    const key = frameKey(room);
    if (key === currentKey) {
      layout();
      return;
    }
    currentKey = key;
    clearFrames();
    releaseRenderer();
    const views = localViews(room),
      independent = independentViews(room.game, room.match),
      game = gameById(room.game);
    frameWrap.dataset.views = Math.max(1, views.length);
    if (!views.length) {
      frameWrap.append(
        h("p", {
          class: "os-remote-view-note",
          text:
            room.seatViews
              ?.map((view) => S.remote(name(view.slot), view.label))
              .join(" · ") || S.remoteOnly,
        }),
      );
      host.setLoading(null);
      return;
    }
    host.setLoading({ gameId: room.game, ready: 0, total: views.length });
    for (const view of views) {
      const slot = room.active?.[view],
        frame = h("iframe", {
          title: `${game.title}${independent ? ` · ${name(slot)}` : ""}`,
          allow: "autoplay; fullscreen",
          dataset: { gameFrame: String(view), round: String(room.roundId) },
        });
      const cell = h("div", { class: "os-game-cell" }, frame);
      if (independent) {
        const badge = h("span", {
          class: "os-game-view-name",
          text: `${SEATS[slot]?.shape || ""} ${name(slot)}`,
        });
        badge.style.background = SEATS[slot]?.color || "#fff";
        cell.append(badge);
      }
      let keyTarget = null;
      const reservedKey = (event) => {
        if (event.key === "Escape") {
          if (event.repeat) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          host.openPause();
          return;
        }
        if (!["Home", "F10"].includes(event.key)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        host.home();
      };
      const attachKeys = () => {
        try {
          keyTarget?.removeEventListener("keydown", reservedKey, true);
          keyTarget = frame.contentWindow;
          keyTarget.addEventListener("keydown", reservedKey, true);
          layout();
        } catch {
          /* Only owned same-origin frames receive shell key bindings. */
        }
      };
      frame.addEventListener("load", attachKeys);
      cells.push({
        el: cell,
        frame,
        detachKeys() {
          keyTarget?.removeEventListener("keydown", reservedKey, true);
          frame.removeEventListener("load", attachKeys);
        },
      });
      frames.push(frame);
      frameWrap.append(cell);
      frame.src = gameFrameUrl(room, view, views.length);
    }
    requestAnimationFrame(layout);
  }
  async function ensureRenderer() {
    if (renderer || rendererPromise) return;
    rendererPromise = import("../../party/render.js")
      .then(({ PartyRenderer }) => {
        if (destroyed || state.room?.phase === "classic") return;
        renderer = new PartyRenderer(canvas);
        renderer.motion = !ctx.settings?.gentle && renderer.motion;
        if (lastFrame) renderer.setFrame(lastFrame);
        measureArena();
        host.setLoading(null);
      })
      .catch((error) => host.error(error.message, frameKey(state.room)))
      .finally(() => {
        rendererPromise = null;
      });
  }
  function update(next) {
    state = next;
    const room = next.room;
    if (!room || !activeRound(room)) return;
    const isClassic = room.phase === "classic",
      game = gameById(room.game);
    frameWrap.hidden = !isClassic;
    arena.hidden = isClassic;
    paused.hidden = !room.paused;
    ctx.wm.setTitle(ctx.window.id, game.title);
    if (isClassic) classic(room);
    else {
      if (currentKey) {
        currentKey = null;
        clearFrames();
      }
      if (!renderer && !rendererPromise)
        host.setLoading({ gameId: room.game, ready: 0, total: 1 });
      void ensureRenderer();
      title.textContent = game.title;
      phase.textContent = S.phase[room.phase] || "";
      instruction.textContent = game.verb;
      detail.textContent = game.detail;
      hint.hidden = room.phase === "playing";
      requestAnimationFrame(measureArena);
      hint.textContent =
        room.phase === "practice"
          ? S.practiceHint
          : (room.active?.length || room.players?.length) === 1
            ? S.soloHint(game.target)
            : S.crewHint;
      const active = room.players.filter((player) =>
        (room.active || room.players.map((p) => p.slot)).includes(player.slot),
      );
      const signature = JSON.stringify(
        active.map((p) => [p.slot, p.name, p.score, p.connected]),
      );
      if (scoreKey !== signature) {
        scoreKey = signature;
        scores.replaceChildren(
          ...active.map((player) => {
            const pill = h(
              "div",
              { class: "os-arena-score" },
              h("span", {
                text: `${SEATS[player.slot]?.shape || ""} ${player.name}${!player.connected ? ` · ${S.reconnecting}` : ""}`,
              }),
              h("b", { text: String(player.score || 0) }),
            );
            pill.style.setProperty(
              "--seat",
              SEATS[player.slot]?.color || "#fff",
            );
            return pill;
          }),
        );
      }
    }
    updateTimer();
  }
  function updateTimer() {
    const room = state.room;
    if (!room) return;
    const remaining = Math.ceil(host.remainingMs(room.endsAt) / 1000);
    timer.textContent = `${String(remaining).padStart(2, "0")} ${room.phase === "practice" ? S.warmup : S.seconds}`;
    countdown.hidden = room.phase !== "countdown";
    countdown.textContent = remaining || S.go;
  }
  const clock = setInterval(updateTimer, 100);
  const message = (event) => {
    if (
      state.room?.phase !== "classic" ||
      !trustedGameMessage(event, location.origin, frames)
    )
      return;
    if (event.data.type === "chonks:loaded") {
      ready.add(event.source);
      if (ready.size === frames.length) host.setLoading(null);
      else
        host.setLoading({
          gameId: state.room.game,
          ready: ready.size,
          total: frames.length,
        });
    } else if (event.data.type === "chonks:home") void host.openPause();
    else void host.error(event.data.message, currentKey);
  };
  window.addEventListener("message", message);
  update(state);
  return {
    el,
    update,
    setFrame(frame) {
      if (!state.room || frame.game !== state.room.game) return;
      lastFrame = frame;
      renderer?.setFrame(frame);
    },
    retry() {
      currentKey = null;
      update(state);
    },
    setPointerShield(on) {
      shield.hidden = !on;
    },
    destroy() {
      destroyed = true;
      clearInterval(clock);
      observer.disconnect();
      releaseRenderer();
      clearFrames();
      window.removeEventListener("message", message);
    },
  };
}
