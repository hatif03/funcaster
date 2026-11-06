import { BRAND, title } from "./brand.js";
import {
  STRINGS,
  SHELL_STRINGS as S,
  DESKTOP_STRINGS as D,
  NAV_STRINGS as N,
} from "./strings.js";
import { games } from "../../core/catalog.js";
import { mountIconGrid } from "./shell/icon-grid.js";
import { mountStartMenu } from "./shell/startmenu.js";
import { mountTray } from "./shell/tray.js";
import { mountBalloons } from "./shell/balloons.js";
import { createContextMenu } from "./shell/context-menu.js";
import { windowManifest } from "./windows/manifest.js";
import { mountBoot } from "./shell/boot.js";
import { createAudioBus } from "./shell/audio.js";
import { mountMascot } from "./shell/mascot.js";
import { mountPets } from "./shell/pets.js";
import { mountAvatars } from "./shell/avatars.js";
import { mountConnection } from "./shell/connection.js";
import { createGameHost } from "./game-host.js";
import { createNavigation } from "./nav.js";
import { mountPointers } from "./pointers.js";
import { h } from "./util/h.js";
import { browserStorage, preferences } from "./storage.js";
import { createStore } from "./util/store.js";
import { mountScale } from "./scale.js";
import { loadTheme } from "./theme.js";
import { mountDesktop } from "./shell/desktop.js";
import { mountTaskbar } from "./shell/taskbar.js";
import { createWindowManager } from "./wm.js";
import { createSession } from "./session.js";
import { open as openWelcome } from "./windows/welcome.js";
import { open as openSessionStatus } from "./windows/session-status.js";

const root = document.getElementById("os");
const params = new URLSearchParams(location.search);
const demo = params.get("demo") === "1";
const [demoFixtures, demoClient] = demo
  ? await Promise.all([import("./demo-state.js"), import("./demo-session.js")])
  : [];
const storage = browserStorage();
const settings = preferences(storage);
if (["luna", "classic", "taxi"].includes(params.get("skin")))
  settings.skin = params.get("skin");
if (params.has("scale")) settings.tvScale = params.get("scale");
if (params.has("safe")) settings.safeArea = params.get("safe");
document.title = title();
document.documentElement.dataset.gentle = String(settings.gentle);
document.documentElement.dataset.skin = settings.skin;
const scale = mountScale(document.documentElement, settings);
const store = createStore({
  room: demo ? demoFixtures.demoState(params.get("state") || "empty") : null,
  connection: demo
    ? params.get("state") === "reconnecting"
      ? "reconnecting"
      : "demo"
    : "connecting",
  error: null,
  notice: null,
});
const cleanups = [() => scale.destroy()];

try {
  const theme = await loadTheme();
  const desktop = mountDesktop(root, theme);
  let wm,
    menu,
    nav,
    menuScope = null,
    contextScope = null;
  const sortedGames = games.filter((game) => !game.hidden);
  const balloons = mountBalloons(root, {
    onShow: (message) => context.audio?.cue(message.sound || "balloon"),
  });
  const showError = (text) => wm.modal({ title: D.notYet, text });
  async function openWindow(id, props = {}) {
    menu?.close();
    contextMenu.close();
    try {
      const handle = await wm.open(id, props);
      const event =
        id === "game-properties"
          ? "properties"
          : id === "invite"
            ? "invite"
            : id === "staff"
              ? "staff"
              : null;
      if (event) context.mascot?.event(event);
      return handle;
    } catch (error) {
      console.error("Could not open Funcaster window", id, error);
      return showError(D.windowError);
    }
  }
  async function openGame(gameId) {
    if (!context.session) {
      balloons.show({
        title: S.connection,
        text: S.connecting,
        key: "connecting",
      });
      return;
    }
    const recent = storage.read("recent-games", []);
    storage.write(
      "recent-games",
      [gameId, ...recent.filter((id) => id !== gameId)].slice(0, 4),
    );
    icons.select(gameId);
    return openWindow("game-properties", { gameId });
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else
        await document.documentElement.requestFullscreen({
          navigationUI: "hide",
        });
    } catch {
      balloons.show({
        title: S.fullscreenTitle,
        text: S.fullscreenUnavailable,
        key: "fullscreen",
      });
    }
  }
  function setVolume(value) {
    settings.volume = Math.max(0, Math.min(100, Number(value) || 0));
    storage.write("volume", settings.volume);
    context.audio?.setVolume(settings.volume);
    context.mascot?.event("volume");
    tray.update(store.get());
  }
  const tray = mountTray({
    theme,
    settings,
    onWindow: openWindow,
    onVolume: setVolume,
    onFullscreen: fullscreen,
  });
  const taskbar = mountTaskbar(root, {
    tray: tray.el,
    onStart: () => menu.toggle(),
    onContext: (event, id) => {
      if (id === "game-window")
        contextMenu.open(event, context.gameHost?.gameActions() || []);
    },
    onWindow(id) {
      const entry = wm.list().find((item) => item.id === id);
      if (!entry) return;
      if (entry.state === "minimised") wm.restore(id);
      else if (entry.active) wm.minimise(id);
      else wm.focus(id);
    },
  });
  const context = {
    demo,
    previewConnection: demo && params.get("state") === "reconnecting",
    theme,
    store,
    scale,
    settings,
    storage,
    session: null,
    openWindow,
    openGame,
    balloons,
    setVolume,
    fullscreen,
  };
  context.audio = createAudioBus({
    theme,
    volume: settings.volume,
    gentle: settings.gentle,
  });
  cleanups.push(() => context.audio.destroy());
  context.getSession = () => context.session;
  context.enterFullscreen = () => {
    if (!document.fullscreenElement) return fullscreen();
  };
  context.setShuttingDown = (on) => {
    context.shuttingDown = !!on;
    context.connection?.refresh();
  };
  context.applySettings = (next) => {
    Object.assign(settings, next);
    for (const [key, value] of Object.entries(next))
      storage.write(key === "gentle" ? "reduced-effects" : key, value);
    document.documentElement.dataset.gentle = String(settings.gentle);
    document.documentElement.dataset.skin = settings.skin;
    scale.update(settings);
    if ("volume" in next) setVolume(next.volume);
    context.audio?.setGentle?.(settings.gentle);
    context.mascot?.updateSettings?.(settings);
    context.pets?.updateSettings?.(settings);
    context.avatars?.updateSettings?.(settings);
    context.pointers?.updateSettings?.(settings);
  };
  context.requestPhoneText = (field) =>
    context.session?.phoneText?.(field) ||
    Promise.resolve({ error: S.clientError });
  const contextMenu = createContextMenu(root, {
    onScope: (scope) => {
      contextScope = scope;
    },
  });
  const icons = mountIconGrid(desktop.el, {
    games: sortedGames,
    theme,
    scale,
    onGame: openGame,
    onWindow: openWindow,
    contextMenu: (event, entries) => contextMenu.open(event, entries),
  });
  wm = createWindowManager({
    root,
    context,
    manifest: [
      ...windowManifest(theme),
      {
        id: "welcome",
        title: STRINGS.welcome,
        icon: theme.icon("folder.my-games"),
        size: { w: 600, h: 430 },
        kind: "tool",
        open: openWelcome,
      },
      {
        id: "session-status",
        title: S.connection,
        icon: theme.icon("invite.network"),
        size: { w: 500, h: 360 },
        kind: "tool",
        open: openSessionStatus,
      },
    ],
    getWorkArea: () => ({ ...scale.get().work, ui: scale.get().ui }),
    getViewport: () => ({
      x: 0,
      y: 0,
      w: innerWidth,
      h: innerHeight,
      ui: scale.get().ui,
    }),
    onChange: (windows) => {
      taskbar.update(windows);
      context.mascot?.position();
      context.avatars?.update();
    },
    cue: (name) => context.audio.cue(name),
    onScope: (scope) => {
      if (!scope && !menu?.isOpen()) taskbar.start.focus();
    },
  });
  async function menuAction(action) {
    const room = store.get().room,
      session = context.getSession();
    if (!session) return;
    if (action === "lock") {
      const locked = !room.locked;
      const choice = await wm.modal({
        title: locked ? D.lockTitle : D.unlockTitle,
        text: locked ? D.lockText : D.unlockText,
        buttons: [
          { id: "cancel", label: D.cancel },
          { id: "confirm", label: D.confirm },
        ],
        defaultButton: "cancel",
        cancelButton: "cancel",
      });
      if (choice === "confirm") {
        const reply = await session.cmd("lock", { locked });
        if (reply.error) await showError(reply.error);
      }
    } else if (action === "restart") {
      const choice = await wm.modal({
        title: D.restartTitle,
        text: D.restartText,
        buttons: [
          { id: "cancel", label: D.cancel },
          { id: "confirm", label: D.restart },
        ],
        defaultButton: "cancel",
        cancelButton: "cancel",
      });
      if (choice === "confirm") {
        const reply = await session.cmd("lobby");
        if (reply.error) return showError(reply.error);
        const start = await session.start();
        if (start.error) await showError(start.error);
      }
    } else await openWindow("shutdown");
  }
  menu = mountStartMenu(root, {
    theme,
    games: sortedGames,
    storage,
    button: taskbar.start,
    onGame: openGame,
    onWindow: openWindow,
    onAction: menuAction,
    onScope: (scope) => {
      menuScope = scope;
      if (scope) context.audio.cue("menu");
    },
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.repeat || event.defaultPrevented) return;
    if (root.dataset.gameOpen !== "true") return;
    if (wm.top()?.model.kind !== "game") return;
    event.preventDefault();
    context.gameHost?.openPause();
  });
  const relayout = () => wm.relayout();
  document.documentElement.addEventListener("os:resize", relayout);
  const currentScope = () => {
    if (context.boot?.scope()) return context.boot.scope();
    if (context.connection?.scope()) return context.connection.scope();
    const top = wm.top();
    const scope =
      top?.model.kind === "modal"
        ? top.el
        : contextScope ||
          menuScope ||
          (top?.model.kind === "tool" ? top.el : root);
    return scope.querySelector('[data-nav-scope="active"]') || scope;
  };
  nav = createNavigation({
    root,
    getScope: currentScope,
    desktop: desktop.el,
    taskbar: taskbar.el,
    isGame: () =>
      root.dataset.gameOpen === "true" &&
      wm.top()?.model.kind === "game" &&
      !menuScope &&
      !contextScope &&
      !context.connection?.scope(),
    onBack: () => {
      if (context.connection?.scope()) return context.connection.dismiss();
      const scope = currentScope();
      if (
        scope.dataset.navScope === "active" &&
        !scope.dispatchEvent(new CustomEvent("os:back", { cancelable: true }))
      )
        return;
      if (contextScope) contextMenu.close();
      else if (menu.isOpen()) menu.close();
      else if (wm.top()?.model.kind === "game") context.gameHost?.openPause();
      else if (wm.top()) void wm.close(wm.top().id);
    },
    onHome: () => {
      context.gameHost?.revealTaskbar();
      menu.toggle();
    },
    onVolume: (delta) => setVolume(settings.volume + delta),
    cue: (name) => context.audio.cue(name),
    onHelp: (text) =>
      balloons.show({
        title: N.help,
        text: text || N.noHelp,
        key: "control-help",
      }),
  });
  context.nav = nav;
  if (params.get("debug") === "1") {
    const debug = (await import("./debug.js")).mountDebug({ root, nav, scale });
    cleanups.push(() => debug.destroy());
  }
  cleanups.push(() => nav.destroy());
  let previousRoom = null;
  const reflect = (state) => {
    wm.update(state);
    tray.update(state);
    menu.update(state);
    const room = state.room;
    balloons.suspend(!!room && !["lobby", "results"].includes(room.phase));
    if (room && previousRoom?.code === room.code) {
      for (const player of room.players || []) {
        const previous = previousRoom.players.find(
          (p) => p.slot === player.slot,
        );
        if (player.connected && !previous?.connected)
          balloons.show({
            title: D.players,
            text: D.joined(player.name),
            key: `join-${player.slot}`,
            sound: "joined",
          });
        else if (!player.connected && previous?.connected)
          balloons.show({
            title: D.players,
            text: D.left(player.name),
            key: `leave-${player.slot}`,
            sound: "left",
          });
      }
    }
    if (room && previousRoom && room.phase !== previousRoom.phase) {
      if (room.phase === "countdown") context.audio.cue("countdown");
      else if (room.phase === "playing") context.audio.cue("go");
      else if (room.phase === "results")
        context.audio.cue(
          room.result?.status === "no-contest" ? "notify" : "win",
        );
    }
    previousRoom = room;
  };
  const fullscreenChanged = () => {
    tray.update(store.get());
    if (!document.fullscreenElement)
      balloons.show({
        title: S.fullscreenTitle,
        text: D.returnFullscreen,
        key: "return-fullscreen",
        action: { label: D.fullscreen, run: fullscreen },
      });
  };
  document.addEventListener("fullscreenchange", fullscreenChanged);
  cleanups.push(() =>
    document.removeEventListener("fullscreenchange", fullscreenChanged),
  );
  cleanups.push(store.subscribe((state) => state, reflect));
  reflect(store.get());
  cleanups.push(
    () => document.documentElement.removeEventListener("os:resize", relayout),
    () => contextMenu.destroy(),
    () => menu.destroy(),
    () => icons.destroy(),
    () => wm.destroy(),
    () => taskbar.destroy(),
    () => tray.destroy(),
    () => balloons.destroy(),
    () => desktop.destroy(),
  );
  context.mascot = mountMascot(root, { theme, settings, scale, store, wm });
  context.pets = mountPets(root, { theme, settings, scale, store });
  context.avatars = mountAvatars(root, { theme, settings, scale, store });
  context.connection = mountConnection({ root, store, context });
  context.boot = mountBoot({
    root,
    wm,
    store,
    context,
    demo,
    preview: params.get("boot") === "1",
  });
  cleanups.push(
    () => context.mascot.destroy(),
    () => context.pets.destroy(),
    () => context.avatars.destroy(),
    () => context.connection.destroy(),
    () => context.boot.destroy(),
  );
  if (demo) context.session = demoClient.createDemoSession(store);
  if (demo) cleanups.push(() => context.session.destroy());
  if (params.get("welcome") === "1") await wm.open("welcome");
  await desktop.ready;
  context.boot.ready();
  root.dataset.ready = "true";

  if (!demo) {
    try {
      const [build] = await Promise.all([
        import("/build.js"),
        new Promise((resolve, reject) => {
          const script = h("script", {
            src: "/socket.io/socket.io.js",
            onload: resolve,
            onerror: reject,
          });
          document.head.append(script);
        }),
      ]);
      context.session = createSession({
        socket: window.io("/party", { transports: ["websocket", "polling"] }),
        buildId: build.buildId,
        store,
        confirm: (options) => wm.modal(options),
      });
      context.pointers = mountPointers({
        root,
        session: context.session,
        nav,
        theme,
        settings,
        storage,
        tray,
        balloons,
        getRoom: () => store.get().room,
        onActivity: (point) => {
          context.boot.activity();
          context.mascot.pointer(point);
        },
        cue: (name) => context.audio.cue(name),
      });
      cleanups.push(
        () => context.session.destroy(),
        () => context.pointers.destroy(),
      );
    } catch {
      store.set({ connection: "error", error: S.clientError });
    }
  }
  context.gameHost = createGameHost({
    wm,
    store,
    getSession: context.getSession,
    storage: demo ? null : storage,
    settings,
    balloons,
    root,
    onHome: () => {
      context.gameHost.revealTaskbar();
      menu.toggle();
    },
    onPhase: (phase) => {
      context.onPhase?.(phase);
      if (phase === "game") context.mascot.event("loading");
      else if (phase === "loaded" || phase === "lobby")
        context.mascot.event("loaded");
      else if (phase === "results") context.mascot.event("results");
    },
  });
  cleanups.push(() => context.gameHost.destroy());
} catch {
  root.append(
    h(
      "section",
      { class: "xp-window os-welcome" },
      h("header", { class: "xp-titlebar" }, h("h1", { text: BRAND.os })),
      h(
        "div",
        { class: "os-welcome-content" },
        h("p", { text: STRINGS.themeError }),
        h("button", {
          class: "xp-button",
          text: STRINGS.retry,
          onclick: () => location.reload(),
        }),
      ),
    ),
  );
}
addEventListener(
  "pagehide",
  () => {
    cleanups.reverse().forEach((cleanup) => cleanup());
  },
  { once: true },
);
