import { BRAND } from "../brand.js";
import { BOOT_STRINGS as S } from "../strings.js";
import { h } from "../util/h.js";
import { recoverConnection } from "./connection.js";
export function bootPhase({ ready, connected, elapsed, skipped }) {
  return ready && connected && (skipped || elapsed >= 2200) ? "who" : "booting";
}
export function mountBoot({
  root,
  wm,
  store,
  context,
  demo = false,
  preview = false,
}) {
  const started = performance.now();
  let assetsReady = false,
    skipped = false,
    stage = demo && !preview ? "desktop" : "booting",
    timer = null,
    auto = null,
    lastActivity = Date.now(),
    previousPlayers = 0,
    destroyed = false,
    arrived = false,
    initialAttract = demo && !!store.get().room?.attract;
  const wordmark = h("strong", {
    class: "os-boot-wordmark",
    text: BRAND.wordmark,
  });
  const status = h("p", { role: "status", text: S.settingRoom });
  const hint = h("p", { class: "os-boot-hint", text: S.skip });
  const retry = h("button", {
    class: "xp-button",
    text: S.retry,
    dataset: { nav: "", id: "boot-retry" },
    hidden: true,
    onclick: () => recoverConnection(store.get(), context.getSession()),
  });
  const classic = h("a", {
    class: "xp-button",
    text: S.classic,
    href: "/?shell=classic",
    hidden: true,
    dataset: { nav: "", id: "boot-classic" },
  });
  const overlay = h(
    "section",
    { class: "os-boot", hidden: stage !== "booting", "aria-label": BRAND.os },
    wordmark,
    h("div", { class: "os-boot-progress", "aria-hidden": "true" }, h("span")),
    status,
    hint,
    h("div", { class: "os-boot-actions" }, retry, classic),
  );
  root.append(overlay);
  let remembered;
  try {
    remembered = sessionStorage.getItem("chonks.os.booted");
  } catch {}
  wm.register({
    id: "who",
    title: S.who,
    kind: "tool",
    size: { w: 820, h: 520 },
    canMinimise: false,
    canMaximise: false,
    open: async (ctx) =>
      (await import("../windows/who.js")).open({ ...ctx, boot: api }),
  });
  wm.register({
    id: "attract",
    title: S.scan,
    kind: "tool",
    size: { w: 640, h: 520 },
    canMinimise: false,
    canMaximise: false,
    open: async (ctx) =>
      (await import("../windows/attract.js")).open({ ...ctx, boot: api }),
  });
  wm.register({
    id: "staff",
    title: S.staff,
    kind: "tool",
    size: { w: 480, h: 420 },
    open: async (ctx) => (await import("../windows/staff.js")).open(ctx),
  });
  function record() {
    try {
      sessionStorage.setItem(
        "chonks.os.booted",
        store.get().room?.code || "demo",
      );
    } catch {}
  }
  async function complete() {
    if (destroyed) return;
    const first = !arrived && ["booting", "who"].includes(stage),
      waking = stage === "attract";
    arrived = true;
    stage = "desktop";
    overlay.hidden = true;
    clearTimeout(auto);
    root.classList.remove("os-attracting");
    await wm.close("who", { force: true });
    await wm.close("attract", { force: true });
    record();
    lastActivity = Date.now();
    if (first) {
      context.mascot?.event("boot");
      context.audio?.cue("startup", { animation: true });
    } else if (waking) context.mascot?.event("activity");
    context.nav?.restore();
  }
  async function showWho() {
    stage = "who";
    overlay.hidden = true;
    if (
      remembered === store.get().room?.code ||
      store.get().room?.operatingMode === "kiosk"
    ) {
      await complete();
      if (
        store.get().room?.operatingMode === "kiosk" &&
        !store.get().room?.players?.some((p) => p.connected)
      )
        await attract();
      return;
    }
    await wm.open("who");
    update();
  }
  function update() {
    const state = store.get(),
      room = state.room,
      connected = demo || (state.connection === "connected" && !!room);
    if (stage === "booting") {
      const elapsed = performance.now() - started;
      const failed = ["error", "ended", "update"].includes(state.connection);
      status.textContent = failed
        ? state.error || S.connecting
        : elapsed > 6000
          ? S.stillTrying
          : !assetsReady
            ? S.loadingDesktop
            : S.settingRoom;
      retry.hidden = classic.hidden = !failed && elapsed < 6000;
      if (
        bootPhase({ ready: assetsReady, connected, elapsed, skipped }) === "who"
      )
        void showWho();
    }
    if (stage === "who") {
      const ready = room?.players?.some((p) => p.connected && p.ready);
      if (ready && !auto) auto = setTimeout(() => void complete(), 2500);
      else if (!ready && auto) {
        clearTimeout(auto);
        auto = null;
      }
    }
    const joined = (room?.players || []).filter((p) => p.connected).length;
    if (stage === "attract" && joined > previousPlayers) void complete();
    previousPlayers = joined;
    if (
      stage === "desktop" &&
      room?.phase === "lobby" &&
      room.operatingMode === "kiosk" &&
      !joined &&
      (initialAttract || Date.now() - lastActivity > 15000) &&
      !wm
        .list()
        .some(
          (w) => w.kind === "modal" || w.id === "staff" || w.id === "settings",
        )
    )
      void attract();
  }
  async function attract() {
    if (stage !== "desktop") return;
    initialAttract = false;
    stage = "attract";
    root.classList.add("os-attracting");
    await wm.open("attract");
    context.mascot?.event("attract");
  }
  function activity(event) {
    lastActivity = Date.now();
    if (
      event?.type === "keydown" &&
      event.ctrlKey &&
      event.shiftKey &&
      event.key.toLowerCase() === "k"
    ) {
      event.preventDefault();
      void complete().then(() => context.openWindow("staff"));
      return;
    }
    if (stage === "booting") {
      skipped = true;
      update();
    } else if (stage === "attract") void complete();
    if (["pointerdown", "keydown"].includes(event?.type)) {
      void context.audio?.unlock();
      if (!document.fullscreenElement && stage === "who")
        void context.enterFullscreen();
    }
  }
  document.addEventListener("pointerdown", activity, true);
  document.addEventListener("keydown", activity, true);
  const unsubscribe = store.subscribe((s) => s, update);
  timer = setInterval(() => {
    update();
    if (
      stage === "desktop" &&
      store.get().room?.phase === "lobby" &&
      Date.now() - lastActivity > 300000
    )
      void attract();
  }, 500);
  const api = {
    complete,
    activity,
    dismiss() {
      stage = "desktop";
      overlay.hidden = true;
      clearTimeout(auto);
      record();
      lastActivity = Date.now();
      root.classList.remove("os-attracting");
    },
    stage: () => stage,
    scope: () => (overlay.hidden ? null : overlay),
    ready() {
      assetsReady = true;
      update();
    },
    fail(text) {
      stage = "booting";
      overlay.hidden = false;
      status.textContent = text;
      retry.hidden = classic.hidden = false;
    },
    destroy() {
      destroyed = true;
      clearInterval(timer);
      clearTimeout(auto);
      unsubscribe();
      document.removeEventListener("pointerdown", activity, true);
      document.removeEventListener("keydown", activity, true);
      overlay.remove();
      root.classList.remove("os-attracting");
    },
  };
  return api;
}
