import { buildId } from "/build.js";
import { gameById, independentViews, sharedWorld } from "./catalog.js";
import { PartyRenderer } from "./render.js";
const $ = (id) => document.getElementById(id),
  params = new URLSearchParams(location.search),
  code = params.get("room"),
  key = params.get("key");
if (key) {
  sessionStorage.setItem("chonks.display." + code, key);
  history.replaceState(null, "", `/screen?room=${encodeURIComponent(code)}`);
}
const token = sessionStorage.getItem("chonks.display." + code),
  socket = io("/party");
let state,
  frameKey,
  renderer,
  screenRef = null,
  offer = null,
  playingView = null,
  wake = null,
  pairingKey = "",
  screenActivated = false;
const health = document.createElement("span");
health.setAttribute("role", "status");
health.className = "screen-health";
document.querySelector(".display-toolbar").append(health);
let rtt = 0;
const probe = setInterval(() => {
  if (!socket.connected) return;
  const at = performance.now();
  socket.timeout(3000).emit("ping-check", {}, (err) => {
    rtt = err ? 3000 : performance.now() - at;
    health.textContent = err
      ? "Connection interrupted"
      : `${Math.round(rtt)}ms${rtt > 500 ? " · Slow connection" : rtt > 200 ? " · Some delay" : " · Connected"}`;
  });
}, 3000);
window.addEventListener("pagehide", () => clearInterval(probe), { once: true });
function graphicsReady() {
  const c = document.createElement("canvas"),
    g = c.getContext("webgl2") || c.getContext("webgl");
  if (g) g.getExtension("WEBGL_lose_context")?.loseContext();
  return !!g;
}
async function activate() {
  screenActivated = true;
  try {
    wake = await navigator.wakeLock?.request("screen");
  } catch {}
  socket.emit("display.ready", { ready: true, webgl: graphicsReady() }, (r) => {
    $("screen-pairing-note").textContent =
      r.error || "Screen ready. Choose a game on the main screen.";
  });
}
socket.on("connect", () =>
  socket.emit(
    "display",
    {
      code,
      token,
      buildId,
      resumeKey: sessionStorage.getItem("chonks.screen." + code),
    },
    (r) => {
      if (r.error) $("display-title").textContent = r.error;
      else if (r.ref) {
        screenRef = r.ref;
        sessionStorage.setItem("chonks.screen." + code, r.resumeKey);
        if (state) draw(state);
      }
    },
  ),
);
socket.on("disconnect", () => {
  $("display-title").textContent = "Reconnecting to the party…";
});
function draw(next) {
  state = next;
  const pairing =
    state.remoteViews &&
    screenRef &&
    ["lobby", "results"].includes(state.phase);
  $("screen-pairing").hidden = !pairing && !offer;
  if (pairing && pairingKey !== screenRef) {
    pairingKey = screenRef;
    fetch(`/api/party/pairing/${code}?screen=${encodeURIComponent(screenRef)}`)
      .then((r) => r.json())
      .then((r) => {
        if (r.qr) {
          $("screen-qr").src = r.qr;
          $("screen-controller").href = r.url;
        } else $("screen-pairing-note").textContent = r.error;
      })
      .catch(() => {
        $("screen-pairing-note").textContent =
          "Couldn’t load the code. Reconnect this screen.";
      });
  }
  const paired = state.screenPairings?.find((p) => p.ref === screenRef);
  if (paired)
    $("screen-pairing-note").textContent =
      `${state.players.find((p) => p.slot === paired.slot)?.name || "Your phone"} is paired · ${paired.ready ? "ready" : "tap Ready below"}`;
  if (playingView !== null && state.phase === "classic") return;
  if (playingView !== null) {
    playingView = null;
    offer = null;
    sessionStorage.removeItem("chonks.view." + code);
  }

  for (const option of $("display-seats").options)
    option.disabled =
      !!option.value &&
      option.value.split(",").every((s) => Number(s) >= state.active.length);
  if ($("display-seats").selectedOptions[0]?.disabled)
    $("display-seats").value = "";
  if ($("display-note") && state.phase === "lobby")
    $("display-note").textContent =
      `${state.players.length} of 4 players are here. ${pairing ? "Scan the QR above to pair your phone." : "The host will start the next game."}`;
  const pairedIndex = paired ? state.active.indexOf(paired.slot) : -1;
  const ownView =
    state.phase === "classic" &&
    state.match?.serverSimulation &&
    pairedIndex >= 0;
  $("display-seats").disabled = !!ownView || state.phase !== "classic";
  if (ownView) $("display-seats").value = String(pairedIndex);
  else if (state.phase !== "classic") $("display-seats").value = "";
  const game = gameById(state.game),
    selection = $("display-seats").value,
    viewKey = [
      state.game,
      state.roundId,
      state.phase,
      selection,
      paired?.slot,
    ].join(":");
  $("display-title").textContent =
    `${game.title} · ${state.code}${state.paused ? " · Paused" : ""}`;
  if (frameKey === viewKey) return;
  frameKey = viewKey;
  $("display-stage").replaceChildren();
  if (renderer) {
    renderer.running = false;
    renderer.observer.disconnect();
  }
  renderer = null;
  if (state.phase === "classic") {
    const independent = independentViews(state.game, state.match);
    const selected = selection
      ? selection.split(",").map(Number)
      : state.active.map((_, i) => i);
    const views = independent
      ? selected.filter((s) => s < state.active.length)
      : [0];
    $("display-stage").dataset.count = views.length;
    const loading = document.createElement("p");
    loading.id = "display-loading";
    loading.textContent = "Getting the view ready…";
    loading.setAttribute("role", "status");
    $("display-stage").append(loading);
    for (const view of views) {
      const frame = document.createElement("iframe");
      frame.title = game.title;
      frame.style.visibility = "hidden";
      frame.allow = "autoplay; fullscreen";
      frame.src = `/games/${state.game}/${sharedWorld(state.game, state.match) ? "shared.html" : ""}?party=${code}&round=${state.roundId}&view=${view}&views=${views.length}&display=1&seats=${state.match?.serverSimulation && paired ? state.active.indexOf(paired.slot) : selection}${state.match?.serverSimulation ? "&shared=1" : ""}`;
      $("display-stage").append(frame);
    }
  } else if (["practice", "playing", "countdown"].includes(state.phase)) {
    const canvas = document.createElement("canvas");
    $("display-stage").append(canvas);
    renderer = new PartyRenderer(canvas);
    renderer.resize();
  } else {
    const note = document.createElement("p");
    note.id = "display-note";
    note.textContent =
      state.phase === "results"
        ? `Nice moves! ${state.result?.scores.map((s) => `Player ${s.slot + 1}: ${s.score}`).join(" · ") || ""}`
        : `Scan the host’s QR to join. ${state.players.length} of 4 players are here.`;
    $("display-stage").append(note);
  }
}
socket.on("state", draw);
socket.on("frame", (f) => {
  const slot = state?.screenPairings?.find((p) => p.ref === screenRef)?.slot;
  renderer?.setFrame(
    slot == null
      ? f
      : { ...f, players: f.players.filter((p) => p.slot === slot) },
  );
});
$("screen-ready").onclick = activate;
socket.on("view-offer", (next) => {
  offer = next;
  $("screen-pairing").hidden = false;
  $("screen-offer").textContent = `${next.name} · ${gameById(next.game).title}`;
  $("view-play").hidden = false;
  $("view-decline").hidden = false;
});
$("view-play").onclick = () => {
  if (!offer) return;
  const chosen = offer;
  socket.emit("view-accept", { roundId: chosen.roundId }, (r) => {
    if (r.error) {
      $("screen-offer").textContent = r.error;
      return;
    }
    sessionStorage.setItem("chonks.view." + code, chosen.token);
    playingView = chosen.view;
    offer = null;
    $("screen-pairing").hidden = true;
    $("display-stage").replaceChildren();
    const frame = document.createElement("iframe");
    frame.title = `${chosen.name} playing ${gameById(chosen.game).title}`;
    frame.allow = "autoplay; fullscreen";
    frame.dataset.playing = "true";
    frame.src = `/games/${chosen.game}/?party=${code}&round=${chosen.roundId}&view=${chosen.view}&play=1`;
    $("display-stage").append(frame);
  });
};
$("view-decline").onclick = () => {
  if (offer) socket.emit("view-decline", { roundId: offer.roundId });
  offer = null;
  $("screen-pairing").hidden = true;
};
socket.on("view-revoked", () => {
  offer = null;
  playingView = null;
  sessionStorage.removeItem("chonks.view." + code);
  frameKey = null;
  $("display-stage").replaceChildren();
  $("screen-pairing").hidden = true;
  if (state) draw(state);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    socket.emit("display.ready", { ready: false });
    wake?.release().catch(() => {});
  } else if (screenActivated) activate();
});

$("display-seats").onchange = () => {
  if (state) draw(state);
};
$("display-fullscreen").onclick = () =>
  document.documentElement.requestFullscreen?.();

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin) return;
  const frame = [...$("display-stage").querySelectorAll("iframe")].find(
    (f) => f.contentWindow === event.source,
  );
  if (!frame) return;
  if (event.data?.type === "chonks:view-ready") {
    frame.style.visibility = "";
    frame.dataset.ready = "true";
    if (
      [...$("display-stage").querySelectorAll("iframe")].every(
        (f) => f.dataset.ready,
      )
    )
      $("display-loading")?.remove();
  }
  if (event.data?.type === "chonks:error") {
    const note = $("display-loading");
    if (note) note.textContent = event.data.message;
  }
});
