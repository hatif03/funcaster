import { mountPhoneAdmin } from "./phone-admin.js";
import {
  requestMotionPermissions,
  probeDevice,
  deviceProfile,
  sensorErrorMessage,
  createWakeKeeper,
  createOrientationControl,
  installSafariFill,
} from "./phone-capabilities.js";
import { PhonePointer } from "./phone-pointer.js";
import { playPhoneCue } from "./phone-audio.js";
import {
  normalizeRemoteSkin,
  paintSeatLamps,
  GAME_REMOTE,
  remoteButtonMap,
  remotePosture,
  racingRemote,
  paintButtons,
  HomeGesture,
  kartGasCaption,
  remoteInputInterrupted,
} from "./remote.js";
import {
  detectInAppBrowser,
  installPhonePageGuards,
  phoneFeedback,
} from "./phone-page.js";
import { InputPacer } from "/core/input-pacer.js";
import { SEATS } from "/core/seats.js";
import { holdButton } from "./hold.js";
import { buildId } from "/build.js";
import { MotionSettings, MOTION_PROFILES } from "/core/motion-settings.js";
import { RacingMotion } from "/core/racing-motion.js";
import { DriveControls } from "/core/drive-controls.js";
import { GYRO_GAMES, axisTargets, mountPad, padSpec, toolAim } from "./pads.js";
import { PartyMotion } from "/core/party-motion.js";
import { gameById, remember, recalled } from "./catalog.js";
const pairingScreen = new URLSearchParams(location.search).get("screen");
const $ = (id) => document.getElementById(id),
  socket = io("/party", { transports: ["websocket", "polling"] });
let code =
    new URLSearchParams(location.search).get("room")?.toUpperCase() || "",
  identity = null,
  state = null,
  mode = "motion",
  started = false,
  ready = false,
  removed = false,
  latest = null,
  lastSample = 0,
  lastSend = 0,
  lastPulse = false,
  generic = null,
  offset = 0,
  joinPending = false,
  retryTimer = null,
  sensorTimeout = null,
  gravity = null,
  latency = null;
let pendingWeb3Challenge = null,
  web3Phone = null,
  web3Loading = null;
let stakesPhone = null,
  pendingStakeRequest = null;
socket.on("web3.request", (request) => {
  pendingStakeRequest = request;
  stakesPhone?.receive(request);
});
socket.on("web3.challenge", (challenge) => {
  pendingWeb3Challenge = challenge;
  if (state?.web3 && web3Phone) void web3Phone.challenge(challenge);
});
socket.on("disconnect", () => {
  pendingWeb3Challenge = null;
});
function syncWeb3Identity() {
  if (!state?.web3 || !identity || identity.queued || web3Phone || web3Loading)
    return;
  web3Loading = import("../web3/phone-identity.js")
    .then(async ({ createPhoneIdentity }) => {
      web3Phone = createPhoneIdentity(socket, () =>
        state?.web3 && identity && !identity.queued
          ? { room: code, slot: identity.slot, token: identity.token }
          : null,
      );
      if (pendingWeb3Challenge) void web3Phone.challenge(pendingWeb3Challenge);
      const { mountPhoneStakes } = await import("./phone-stakes.js");
      stakesPhone = mountPhoneStakes(
        socket,
        () => state,
        () => identity,
      );
      if (pendingStakeRequest) stakesPhone.receive(pendingStakeRequest);
    })
    .catch(() => {})
    .finally(() => {
      web3Loading = null;
    });
}
let preferenceStorage;
try {
  preferenceStorage = localStorage;
} catch {}
const motionSettings = new MotionSettings(preferenceStorage);
const motion = new PartyMotion({ sensitivity: motionSettings.get("party") });
const wheelMotion = new RacingMotion({
  sensitivity: motionSettings.get("racing"),
});
const pedals = new DriveControls();
const holds = new Set();
let padKey = "";
let releasePad = () => {};
let drawLock = null;
let stickAxes = null;
let axes = { x: 0, y: 0 };
let easeAt = 0;
const pacer = new InputPacer();
const pointerStream = new PhonePointer();
const wakeKeeper = createWakeKeeper(navigator);
const orientationControl = createOrientationControl(screen.orientation);
function holdPosture(force = false) {
  if (!started || removed) {
    orientationControl.release();
    return;
  }
  // Landscape for the whole round. Portrait only while waiting in the lobby.
  orientationControl.set(playingNow() ? "landscape" : "portrait", force);
}
let gateGeneration = 0;
let gateTask = null,
  pendingDevice = null,
  currentDevice = null,
  genericObserver = null,
  sensorDiagnostic = "",
  relativeAt = -Infinity,
  pointerFlushTimer = 0;
const pointerOn = () =>
  state?.pointerMode === true &&
  !!identity &&
  !identity.queued &&
  started &&
  !document.hidden;
function flushPointer() {
  clearTimeout(pointerFlushTimer);
  const time = performance.now(),
    enabled = pointerOn() && socket.connected,
    writable = socket.io.engine?.transport?.writable !== false;
  const packet = pointerStream.flush(time, { enabled, writable, mode });
  if (packet) socket.emit("pointer", packet);
  // Deliver the final touch position if it arrived inside the 8ms floor.
  // Backpressure waits for transport drain, never an unbounded retry loop.
  if (enabled && writable && pointerStream.pending(time, mode))
    pointerFlushTimer = setTimeout(
      flushPointer,
      Math.max(1, 8 - (time - pointerStream.lastSent)),
    );
}
function shellButton(button) {
  if (!pointerOn() || !socket.connected) return false;
  // Shell actions are discrete presses; an artificial release would consume the
  // shared rate-limit window and could swallow the visitor's next button.
  socket.emit("shell-button", { button, pressed: true });
  buzz(8);
  return true;
}
let shotAim = 0,
  feedbackAudio = null,
  terminalReason = "";
let sketchStatus = null;
let faceMap = null;
let sampleOffset = null;
let raceStatus = null,
  playStatus = null,
  shotStarted = 0;
const isWheel = () => gameById(state?.game).mode === "wheel";
const landscape = () => matchMedia("(orientation: landscape)").matches;
function releasePedals() {
  if (shotStarted)
    socket.emit("action", { action: "cancel", seq: shotSequence });
  shotStarted = 0;
  releasePad();
  holds.clear();
  drawLock = null;
  if (stickAxes) stickAxes = { x: 0, y: 0 };
  axes = { x: 0, y: 0 };
  easeAt = 0;
  lastPulse = false;
  if (padKey) latest = { x: 0, y: 0 };
  pedals.release();
  for (const id of ["gas", "brake", "boost"]) $(id).classList.remove("pressed");
  if (identity && socket.connected)
    socket.emit("input", {
      x: 0,
      y: 0,
      gas: false,
      brake: false,
      boost: false,
    });
}
function syncSettings() {
  const wheel = isWheel(),
    name = wheel ? "racing" : "party",
    profile = MOTION_PROFILES[name];
  $("settings-title").textContent = wheel
    ? "Find your steering feel."
    : "Your kind of motion.";
  $("settings-description").textContent = wheel
    ? "Gentle near the center. Tilt farther for tighter turns."
    : "Small moves or big moves. Find your sweet spot.";
  $("sensitivity-label").textContent = wheel
    ? "Steering sensitivity"
    : "Motion sensitivity";
  $("sensitivity").min = String(profile.min * 100);
  $("sensitivity").max = String(profile.max * 100);
  $("sensitivity").value = String(motionSettings.get(name) * 100);
  $("sensitivity-value").textContent =
    `${Math.round(motionSettings.get(name) * 100)}%`;
  $("range-low").textContent = wheel ? "Gentler" : "Steady";
  $("range-middle").textContent = wheel ? "Default" : "Balanced";
  $("range-high").textContent = wheel ? "Quicker" : "Extra lively";
  $("settings-note").textContent = wheel
    ? "Saved for racing only. Lower it for gentler steering. Recenter whenever you change your grip."
    : "Calibration filters your phone’s natural wobble. Recenter whenever you change your grip.";
}
function setSensitivity(value) {
  const wheel = isWheel();
  const sensitivity = motionSettings.set(wheel ? "racing" : "party", value);
  (wheel ? wheelMotion : motion).setSensitivity(sensitivity);
  syncSettings();
}
syncSettings();
const buzz = (pattern, cue = "click") =>
  phoneFeedback(
    {
      visual() {
        document.body.classList.add("feedback-pulse");
        $("remote").classList.add("feedback-pulse");
        $("speaker").classList.add("talk");
        clearTimeout(buzz.talkTimer);
        buzz.talkTimer = setTimeout(
          () => $("speaker").classList.remove("talk"),
          cue === "thud" ? 500 : cue === "swoosh" ? 220 : 120,
        );
        clearTimeout(buzz.timer);
        buzz.timer = setTimeout(() => {
          document.body.classList.remove("feedback-pulse");
          $("remote").classList.remove("feedback-pulse");
        }, 90);
      },
      haptics: $("phone-haptics").checked,
      vibrate: navigator.vibrate?.bind(navigator),
      userActivation: navigator.userActivation,
      sound: $("phone-sound").checked,
      playSound() {
        playPhoneCue(feedbackAudio, cue);
      },
    },
    pattern,
  );
function message(text) {
  $("join-error").textContent = text;
  $("join-error").hidden = !text;
}
function status(text, online = false) {
  $("phone-status").textContent = text;
  $("phone-status").classList.toggle("online", online);
  $("power").classList.toggle("linked", online);
  $("power").classList.toggle("err", !online);
  $("power").setAttribute("aria-label", `Link status: ${text}`);
  paintSeatLamps($("seat-lamp"), SEATS, identity);
  $("remote").classList.toggle("asleep", !started || !!identity?.queued);
}
function setReady(value) {
  ready = value;
  if (identity && socket.connected)
    socket.emit("ready", { ready: value, mode });
}
function keepAwake() {
  return wakeKeeper.keep();
}

function join() {
  if (!code || removed || joinPending || identity || !socket.connected) return;
  joinPending = true;
  const saved = recalled(`chonks.player.${code}`);
  socket.emit(
    "join",
    {
      buildId,
      code,
      screen: new URLSearchParams(location.search).get("screen") || undefined,
      token: saved?.token,
    },
    (answer) => {
      joinPending = false;
      if (answer.error) {
        message(answer.error);
        status(answer.full ? "Waiting for a spot" : "Party unavailable");
        $("join-title").textContent = answer.full
          ? "Good things are worth the wait."
          : "Let’s find your party.";
        $("join-description").textContent = answer.full
          ? "We’ll save you a place when one opens."
          : "Scan the current code on the big screen.";
        if (answer.full) retryTimer = setTimeout(join, 3000);
        return;
      }
      acceptIdentity(answer);
      buzz([25, 50, 25]);
    },
  );
}
function acceptIdentity(answer) {
  if (!answer.queued && new URLSearchParams(location.search).has("screen"))
    history.replaceState(
      history.state,
      "",
      `/controller?room=${encodeURIComponent(code)}`,
    );
  identity = answer;
  remember(`chonks.player.${code}`, answer);
  // Queue promotion can deliver its challenge before the promoted acknowledgement.
  if (!answer.queued && web3Phone && pendingWeb3Challenge)
    void web3Phone.challenge(pendingWeb3Challenge);
  $("waiting-view").hidden = !answer.queued;
  if (answer.queued) {
    releasePedals();
    ready = false;
    $("play-view").hidden = true;
    $("join-view").hidden = true;
    $("queue-position").textContent =
      `${answer.position || "Your"} spot in line`;
    paintSeatLamps($("seat-lamp"), SEATS, answer);
    status("Place saved", true);
    return;
  }
  $("join-view").hidden = started;
  $("play-view").hidden = !started;
  paintSeatLamps($("seat-lamp"), SEATS, answer);
  remember(`chonks.player.${code}`, answer);
  document.documentElement.style.setProperty("--player", answer.color);
  $("player-identity").textContent =
    `You’re ${answer.name} · Player ${answer.slot + 1}`;
  $("play-identity").textContent = `You’re ${answer.name}`;
  $("join-title").innerHTML = "Your phone. <br>Your superpower.";
  $("join-description").textContent = "One little tilt. A whole lot of fun.";
  $("enable").disabled = false;
  $("touch-mode").disabled = false;
  message("");
  status("You’re connected", true);
  if (pendingDevice) {
    activateDevice(pendingDevice);
    return;
  }
  if (currentDevice) socket.emit("device", currentDevice);
  if (started) {
    if (mode === "touch") setReady(true);
    else calibrate();
  }
}
socket.on("promoted", (answer) => {
  acceptIdentity(answer);
  buzz([50, 50, 100]);
});
socket.on("queued", acceptIdentity);
socket.on("queue", ({ position, total }) => {
  if (identity?.queued)
    $("queue-position").textContent = `${position} of ${total} in line`;
});

if (!code) {
  $("code-form").hidden = false;
  $("join-view").hidden = true;
}
$("code-form").onsubmit = (event) => {
  event.preventDefault();
  code = $("code-input").value.trim().toUpperCase();
  history.replaceState(
    history.state,
    "",
    `/controller?room=${encodeURIComponent(code)}`,
  );
  $("code-form").hidden = true;
  $("join-view").hidden = false;
  removed = false;
  join();
};
if (!code)
  fetch("/api/web3/health", { signal: AbortSignal.timeout(5000) })
    .then((response) => (response.ok ? response.json() : null))
    .then(async (health) => {
      if (health?.tableNames) {
        const { mountPhoneNames } = await import("../web3/phone-names.js");
        mountPhoneNames($("code-form"), $("code-input"));
      }
    })
    .catch(() => {});
socket.on("connect", () => {
  socket.io.engine?.on("drain", flushPointer);
  identity = null;
  joinPending = false;
  status("Finding your party…");
  clearTimeout(retryTimer);
  join();
});
socket.on("replaced", () => {
  terminalReason =
    "This phone is playing in another tab. Close that tab before rejoining here.";
});
socket.on("disconnect", (reason) => {
  $("waiting-view").hidden = true;
  releasePedals();
  identity = null;
  ready = false;
  if (reason === "io server disconnect") {
    removed = true;
    started = false;
    $("play-view").hidden = true;
    $("join-view").hidden = false;
    status("Connection ended");
    message(
      terminalReason ||
        "The host ended this connection. Scan the current QR to join again.",
    );
    $("recover-connection").hidden = false;
  } else status("Reconnecting…");
  $("enable").disabled = false;
  $("touch-mode").disabled = false;
  $("connection-detail").textContent =
    reason === "io server disconnect"
      ? "Connection ended"
      : "Connection lost · retrying";
});
socket.on("removed", () => {
  terminalReason =
    "Your spot was freed on the big screen. Scan again to join a new round.";
  releasePedals();
  removed = true;
  started = false;
  identity = null;
  remember(`chonks.player.${code}`, null);
  $("play-view").hidden = true;
  $("join-view").hidden = false;
  message(
    "Your spot was freed on the big screen. Scan again to join a new round.",
  );
});
socket.on("ended", () => {
  terminalReason = "That party has ended. Scan the new code on the big screen.";
  releasePedals();
  removed = true;
  setReady(false);
  $("play-view").hidden = true;
  $("join-view").hidden = false;
  message("That party has ended. Scan the new code on the big screen.");
});
function calibrate() {
  releasePedals();
  motion.reset();
  wheelMotion.reset();
  latest = null;
  setReady(false);
  $("calibration-track").hidden = false;
  $("sensor-message").hidden = true;
  $("retry-sensors").hidden = true;
  render();
  clearTimeout(sensorTimeout);
  sensorTimeout = setTimeout(() => {
    if (!ready && mode === "motion") {
      sensorProblem(
        "No motion yet. Allow Motion & Orientation in your browser, or play with touch.",
      );
    }
  }, 5500);
}
function sensorProblem(text) {
  $("sensor-message").textContent = text;
  $("sensor-message").hidden = false;
  $("retry-sensors").hidden = false;
  $("retry-sensors").textContent = "Use touch instead";
  $("retry-sensors").onclick = () => beginTouch();
  setReady(false);
}
function playingNow() {
  return (
    started &&
    !!state &&
    !!identity &&
    !identity.queued &&
    state.pointerMode !== true &&
    ["classic", "practice", "countdown", "playing"].includes(state.phase)
  );
}
function needsGyro() {
  return GYRO_GAMES.has(state?.game);
}
function buttonPadOn() {
  return playingNow() && !needsGyro() && padKey !== "";
}
function canAct() {
  return (
    ready &&
    !!state?.active?.includes(identity?.slot) &&
    !state?.paused &&
    !!state?.hostConnected &&
    (state.phase !== "classic" || !!state.screenConnected)
  );
}
function followStick(time) {
  const dt = Math.min(0.05, easeAt ? (time - easeAt) / 1000 : 0.016);
  easeAt = time;
  const target = axisTargets(holds);
  const k = 1 - Math.exp(-14 * dt);
  axes = {
    x: axes.x + (target.x - axes.x) * k,
    y: axes.y + (target.y - axes.y) * k,
  };
  if (Math.abs(axes.x) < 0.02 && target.x === 0) axes.x = 0;
  if (Math.abs(axes.y) < 0.02 && target.y === 0) axes.y = 0;
  return axes;
}
const padHandlers = {
  onStick(partial) {
    if (!stickAxes) stickAxes = { x: 0, y: 0 };
    if (partial.x !== undefined) stickAxes.x = partial.x;
    if (partial.y !== undefined) stickAxes.y = partial.y;
  },
  onHold(name, down, pointerId) {
    if (down) holds.add(name);
    else holds.delete(name);
    if (!["gas", "brake", "boost"].includes(name)) return;
    if (down) pedals.down(name, pointerId, performance.now());
    else pedals.up(pointerId);
  },
  onTap(name) {
    if (name === "pause") {
      openPartyMenu();
      return;
    }
    if (name === "motion") {
      startPlaying();
      return;
    }
    if (!canAct()) return;
    if (name === "pulse") {
      lastPulse = true;
      buzz(12);
      return;
    }
    const action =
      name === "item" ? "right" : name === "primary" ? "primary" : name;
    if (name === "item" && raceStatus?.stage !== "racing") return;
    socket.emit("action", {
      action,
      sampledAt: Date.now() + (sampleOffset ?? offset),
    });
    buzz(12);
  },
  onSwing(down, event, inside = true) {
    if (state?.game !== "golf" || !canAct()) return;
    if (down) {
      event.preventDefault();
      shotStarted = performance.now();
      shotAim = axes.x;
      socket.emit("action", {
        action: "address",
        aim: shotAim,
        seq: ++shotSequence,
      });
      return;
    }
    if (!shotStarted) return;
    if (!inside) {
      socket.emit("action", { action: "cancel", seq: shotSequence });
      shotStarted = 0;
      return;
    }
    const power = Math.min(
      1,
      Math.max(0.12, (performance.now() - shotStarted) / 1600),
    );
    shotStarted = 0;
    socket.emit("action", { action: "release", power, seq: shotSequence });
    buzz(18);
  },
  onDraw(point, down, pointerId) {
    if (!down || !point) {
      drawLock = null;
      pedals.up(pointerId);
      return;
    }
    drawLock = point;
    latest = { x: point.x, y: point.y, ready: true, progress: 1 };
    pedals.down("gas", pointerId, performance.now());
  },
  onTool(kind, index = 0) {
    const point = toolAim(kind, index);
    drawLock = point;
    latest = { x: point.x, y: point.y, ready: true, progress: 1 };
    pedals.down("gas", "tool", performance.now());
    setTimeout(() => {
      pedals.up("tool");
      if (drawLock === point) drawLock = null;
    }, 180);
  },
};
function syncPad() {
  const guessing =
    state?.game === "drawing" &&
    !$("guess-panel").hidden &&
    !$("guess-form").hidden;
  const spec = playingNow()
    ? padSpec(state.game, {
        setup:
          state.game === "mario-kart" &&
          (!raceStatus || raceStatus.stage === "ready"),
        guessing,
        drawing: state?.sketch?.drawer === identity?.slot,
        reveal: !!state?.sketch?.reveal,
        motion: mode === "motion" && ready,
      })
    : null;
  const key = spec?.key || "";
  document.body.classList.toggle("game-pad", !!spec);
  $("game-pad").hidden = !spec;
  if (!spec) {
    if (padKey) releasePedals();
    releasePad = () => {};
    padKey = "";
    holds.clear();
    drawLock = null;
    stickAxes = null;
    axes = { x: 0, y: 0 };
    return;
  }
  if (key !== padKey) {
    if (padKey) releasePedals();
    padKey = key;
    holds.clear();
    drawLock = null;
    stickAxes = spec.cells?.some((item) => item.stick) ? { x: 0, y: 0 } : null;
    axes = { x: 0, y: 0 };
    releasePad = mountPad($("game-pad"), spec, padHandlers);
  }
  const paused = !!state?.paused || !canAct();
  for (const node of $("game-pad").querySelectorAll("button")) {
    if (node.dataset.tap === "pause" || node.dataset.tap === "motion") continue;
    if (node.dataset.hold === "boost")
      node.disabled = paused || $("boost").disabled;
    else if (node.dataset.hold === "gas")
      node.disabled = paused || $("gas").disabled;
    else if (node.dataset.hold === "brake")
      node.disabled = paused || $("brake").disabled;
    else node.disabled = paused;
  }
  for (const node of $("game-pad").querySelectorAll(".stick, .paper"))
    node.classList.toggle("locked", paused);
  const note = $("game-pad").querySelector("#pad-note");
  if (note && state?.game === "drawing")
    note.textContent = sketchStatus?.word || "Draw with a finger";
  const status = $("game-pad").querySelector("#pad-status");
  if (status) {
    const text = padNotice();
    status.hidden = !text;
    status.textContent = text;
  }
}
function padNotice() {
  if (!state?.hostConnected) return "The big screen is reconnecting.";
  if (state.phase === "classic" && !state.screenConnected)
    return "The game screen is still connecting.";
  if (state.paused) return "Paused on the big screen.";
  if (!state.active?.includes(identity?.slot)) return "You’re up next.";
  if (!ready) return needsGyro() ? "Allow motion to aim." : "";
  if (
    state.game === "mario-kart" &&
    (!raceStatus || raceStatus.stage === "ready")
  )
    return raceStatus?.confirmed
      ? "Waiting for the other phones to tap Ready."
      : "Tap Ready. Every phone has to.";
  return "";
}
function sensor(sample) {
  if (gateTask) return;
  if (buttonPadOn()) {
    lastSample = performance.now();
    if (!ready) {
      latest = { x: 0, y: 0 };
      setReady(true);
      $("calibration-track").hidden = true;
      clearTimeout(sensorTimeout);
    }
    return;
  }
  if (!started || mode !== "motion" || document.hidden) return;
  lastSample = performance.now();
  const result = (isWheel() ? wheelMotion : motion).update(sample, lastSample);
  if (!result) return;
  latest = result;
  $("calibration-progress").style.width = `${result.progress * 100}%`;
  if (result.ready && !ready) {
    setReady(true);
    clearTimeout(sensorTimeout);
    $("calibration-track").hidden = true;
    $("sensor-message").hidden = true;
    $("retry-sensors").hidden = true;
    buzz([15, 35, 25]);
    render();
  }
}
function orientation(event) {
  const time = performance.now();
  if (!pointerStream.orientation(event, time)) return;
  if (event.type === "deviceorientation") relativeAt = time;
  flushPointer();
  sensor({
    alpha: Number.isFinite(event.alpha) ? event.alpha : 0,
    beta: event.beta,
    gamma: event.gamma,
    screenAngle: screen.orientation?.angle || window.orientation || 0,
  });
}
function acceleration(event) {
  if (pointerStream.motion(event.rotationRate, performance.now()))
    flushPointer();
  if (!started || mode !== "motion" || gateTask || document.hidden) return;
  let a = event.acceleration;
  if (!a || ![a.x, a.y, a.z].every(Number.isFinite)) {
    const g = event.accelerationIncludingGravity;
    if (!g || ![g.x, g.y, g.z].every(Number.isFinite)) return;
    if (!gravity) gravity = { ...g, x: g.x, y: g.y, z: g.z };
    a = {};
    for (const k of ["x", "y", "z"]) {
      gravity[k] += (g[k] - gravity[k]) * 0.08;
      a[k] = g[k] - gravity[k];
    }
  }
  if (!isWheel() && motion.flick(a, performance.now())) lastPulse = true;
}
window.addEventListener("deviceorientation", orientation);
window.addEventListener("deviceorientationabsolute", (event) => {
  if (performance.now() - relativeAt > 250) orientation(event);
});
window.addEventListener("devicemotion", acceleration);
function genericFallback(onSample = null) {
  genericObserver = typeof onSample === "function" ? onSample : genericObserver;
  if (generic) return;
  const Ctor =
    window.RelativeOrientationSensor || window.AbsoluteOrientationSensor;
  if (!Ctor) return;
  try {
    generic = new Ctor({ frequency: 60, referenceFrame: "device" });
    generic.addEventListener("reading", () => {
      // A late native stream wins; do not alternate two attitude sources.
      if (performance.now() - relativeAt <= 250) return;
      const q = generic?.quaternion ? Array.from(generic.quaternion) : null;
      if (!pointerStream.quaternion(q, performance.now())) return;
      genericObserver?.(q);
      flushPointer();
      sensor({ quat: q, screenAngle: screen.orientation?.angle || 0 });
    });
    generic.addEventListener("error", (event) => {
      sensorDiagnostic = sensorErrorMessage(event);
    });
    generic.start();
  } catch (error) {
    sensorDiagnostic = sensorErrorMessage(error);
    generic = null;
  }
}
function unlockInteraction() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio) {
      feedbackAudio ||= new Audio();
      feedbackAudio.resume().catch(() => {});
    }
  } catch {}
  keepAwake();
  // Fullscreen is best effort. iPhone Safari has no page fullscreen, so the
  // Safari-bar fill runs as well and must not delay a playable control.
  try {
    const root = document.documentElement;
    const request =
      root.requestFullscreen ||
      root.webkitRequestFullscreen ||
      root.webkitRequestFullScreen;
    const entering = request
      ? request.call(root, { navigationUI: "hide" })
      : Promise.reject();
    Promise.resolve(entering).then(
      () => holdPosture(true),
      () => holdPosture(true),
    );
  } catch {
    holdPosture(true);
  }
}
function activateDevice(device) {
  if (removed) return;
  currentDevice = device;
  if (!identity || identity.queued) {
    pendingDevice = device;
    message("You’re ready. Finding your seat…");
    $("enable").textContent = "Waiting for your seat";
    return;
  }
  pendingDevice = null;
  socket.emit("device", device);
  $("capability-note").textContent =
    device.tier === "C"
      ? "Open this invite in Safari or Chrome for motion. Touch controls work here."
      : ["B"].includes(device.tier)
        ? sensorDiagnostic ||
          "Touch controls are ready. You can try motion again from this menu."
        : `Motion ready · ${device.hz} samples/sec${device.gyro ? " · gyroscope available" : ""}.`;
  $("copy-invite").hidden = device.tier !== "C";
  if (["B", "C"].includes(device.tier)) {
    activateTouch();
    return;
  }
  mode = "motion";
  started = true;
  $("join-view").hidden = true;
  $("play-view").hidden = false;
  lastSample = 0;
  calibrate();
}
function startPlaying() {
  if (gateTask || removed) return gateTask;
  const generation = ++gateGeneration;
  releasePedals();
  setReady(false);
  // Both APIs are called before any await or fullscreen promise can consume activation.
  const permission = requestMotionPermissions(window);
  unlockInteraction();
  sensorDiagnostic = "";
  mode = "motion";
  lastSample = 0;
  $("enable").setAttribute("aria-busy", "true");
  $("enable").textContent = "Getting ready…";
  gateTask = (async () => {
    const { denied } = await permission;
    const { device, diagnostics } = await probeDevice({
      window,
      navigator,
      document,
      denied,
      startFallback: (observer) => {
        if (generation === gateGeneration && !removed)
          genericFallback(observer);
      },
    });
    if (generation !== gateGeneration || removed) return;
    genericObserver = null;
    $("sensor-diagnostics").textContent =
      `Tier ${device.tier} · ${device.platform} · ${device.hz} Hz · ${diagnostics.samples} samples · gravity Z ${diagnostics.gravityZ ?? "unavailable"}`;
    activateDevice(device);
  })()
    .catch((error) => {
      if (generation !== gateGeneration || removed) return;
      sensorDiagnostic = sensorErrorMessage(error);
      activateDevice(
        deviceProfile({ window, navigator, document, denied: true }),
      );
    })
    .finally(() => {
      if (generation !== gateGeneration) return;
      gateTask = null;
      $("enable").removeAttribute("aria-busy");
      if (!pendingDevice) $("enable").textContent = "Tap to start";
    });
  return gateTask;
}
$("enable").onclick = () => (needsGyro() ? startPlaying() : beginTouch());
function beginTouch() {
  gateGeneration++;
  gateTask = null;
  $("enable").removeAttribute("aria-busy");
  $("enable").textContent = "Tap to start";
  unlockInteraction();
  activateDevice(deviceProfile({ window, navigator, document, denied: true }));
}
function activateTouch() {
  if (!identity) return;
  releasePedals();
  mode = "touch";
  generic?.stop();
  generic = null;
  genericObserver = null;
  $("connection-detail").textContent = "Touch controls · connected";
  started = true;
  latest = { x: 0, y: 0 };
  pointerStream.point(0, 0, performance.now());
  flushPointer();
  $("join-view").hidden = true;
  $("play-view").hidden = false;
  $("sensor-message").hidden = true;
  $("retry-sensors").hidden = true;
  $("calibration-track").hidden = true;
  clearTimeout(sensorTimeout);
  setReady(true);
  keepAwake();
  render();
}
$("touch-mode").onclick = beginTouch;
let touchId = null;
function touch(event) {
  const r = $("motion-pad").getBoundingClientRect();
  latest = {
    x: Math.max(
      -1,
      Math.min(1, ((event.clientX - r.left) / r.width - 0.5) * 2.4),
    ),
    y: Math.max(
      -1,
      Math.min(1, ((event.clientY - r.top) / r.height - 0.5) * 2.4),
    ),
  };
  pointerStream.point(latest.x, latest.y, performance.now());
  flushPointer();
}
$("motion-pad").onpointerdown = (event) => {
  // A tablet/desktop with working motion can still choose its mouse immediately.
  if (
    mode !== "touch" &&
    currentDevice?.tier === "D" &&
    event.pointerType === "mouse"
  )
    activateTouch();
  if (mode !== "touch") return;
  event.preventDefault();
  touchId = event.pointerId;
  $("motion-pad").setPointerCapture(event.pointerId);
  touch(event);
};
$("motion-pad").onpointermove = (event) => {
  if (mode === "touch" && event.pointerId === touchId) touch(event);
};
for (const name of ["pointerup", "pointercancel"])
  $("motion-pad").addEventListener(name, (event) => {
    if (event.pointerId === touchId) touchId = null;
  });
$("motion-pad").onkeydown = (event) => {
  const moves = {
    ArrowLeft: [-0.15, 0],
    ArrowRight: [0.15, 0],
    ArrowUp: [0, -0.15],
    ArrowDown: [0, 0.15],
  };
  if (moves[event.key]) {
    if (mode !== "touch" && currentDevice?.tier === "D") activateTouch();
    if (mode !== "touch") return;
    event.preventDefault();
    const [x, y] = moves[event.key];
    latest = {
      x: Math.max(-1, Math.min(1, (latest?.x || 0) + x)),
      y: Math.max(-1, Math.min(1, (latest?.y || 0) + y)),
    };
    pointerStream.point(latest.x, latest.y, performance.now());
    flushPointer();
  }
};
$("pulse").onclick = () => {
  lastPulse = true;
  buzz(12);
};
$("recenter").onclick = () => {
  if (mode === "touch") {
    $("touch-steer").value = "0";
    latest = { x: 0, y: 0 };
    setReady(true);
  } else calibrate();
};
function faceElements(racing) {
  return {
    A: $(racing ? "boost" : "btn-a"),
    B: $("btn-b"),
    1: $(racing ? "brake" : "btn-1"),
    2: $(racing ? "gas" : "btn-2"),
    up: $("dp-up"),
    down: $("dp-down"),
    left: $("dp-left"),
    right: $("dp-right"),
    minus: $("btn-minus"),
    home: $("btn-home"),
    plus: $("btn-plus"),
  };
}
function syncRemoteFace() {
  document.body.classList.toggle("shell-pointer", pointerOn());
  const context = {
    game: state?.game,
    phase: state?.phase,
    pointerMode: state?.pointerMode === true,
    landscape: landscape(),
  };
  const racing = started && racingRemote(context);
  holdPosture();
  const posture = remotePosture(context);
  $("remote").dataset.inputMode = mode;
  $("remote").dataset.mirrored = String($("left-handed").checked);
  $("remote").dataset.racing = String(racing);
  $("remote").dataset.posture = posture;
  document.body.dataset.posture = posture;
  document.body.classList.toggle("wheel-mode", racing);
  $("remote").classList.toggle("asleep", !started || !!identity?.queued);
  $("race-pedals").hidden = !racing;
  $("btn-a").hidden = racing;
  $("ones").hidden = racing;
  const action = !$("classic-action").hidden
    ? $("classic-action")
    : !$("pulse").hidden
      ? $("pulse")
      : null;
  const connected =
    !!state?.hostConnected &&
    (state?.phase !== "classic" || !!state?.screenConnected);
  const active = !!state?.active.includes(identity?.slot);
  const canDrive = ready && active && connected && racing;
  faceMap = remoteButtonMap({
    ...context,
    ready: started && ready,
    shellReady: pointerOn(),
    active,
    paused: !!state?.paused,
    connected,
    primaryEnabled: !!action && !action.disabled,
    primaryCaption: action?.textContent.trim(),
    canDrive,
    gasEnabled: !$("gas").disabled,
    boostEnabled: !$("boost").disabled,
    gasCaption:
      state?.game === "mario-kart" ? kartGasCaption(raceStatus) : "Gas",
    driverSetup: !$("driver-choices").hidden,
    shotStarted: !!shotStarted,
    guessing:
      state?.game === "drawing" &&
      !$("guess-panel").hidden &&
      !$("guess-form").hidden,
  });
  paintButtons(faceElements(racing), faceMap);
  $("golf-power").hidden =
    state?.game !== "golf" || !active || state?.phase !== "classic";
  $("golf-wind").textContent =
    state?.game === "golf"
      ? playStatus?.caption || "Aim, hold A, then release to putt."
      : "";
}

function render() {
  syncRemoteFace();
  if (identity?.queued) {
    $("waiting-view").hidden = false;
    $("join-view").hidden = true;
    $("play-view").hidden = true;
    return;
  }
  if (!started || !state || !identity) return;
  const g = gameById(state.game),
    self = state.players.find((p) => p.slot === identity.slot),
    active = state.active.includes(identity.slot);
  const wheel =
      g.mode === "wheel" &&
      racingRemote({
        game: state.game,
        phase: state.phase,
        pointerMode: state.pointerMode === true,
      }),
    rotate = false;
  $("motion-pad").hidden =
    !pointerOn() && (wheel || !(needsGyro() && playingNow()));
  $("wheel-controls").hidden = !wheel || rotate;
  $("rotate-phone").hidden = !rotate;
  $("touch-steer-wrap").hidden = mode !== "touch";
  $("classic-action").hidden =
    !g.classic ||
    ["fruit-ninja", "island-flyover"].includes(state.game) ||
    wheel ||
    !ready ||
    !active ||
    state.phase !== "classic";
  $("classic-action").textContent = g.action || "Play";
  $("classic-action").disabled = !state.screenConnected;
  $("phone-score").textContent = g.classic
    ? active
      ? "YOUR TURN"
      : "UP NEXT"
    : `${self?.score || 0} PTS`;
  const setup =
    state.game === "mario-kart" &&
    (!raceStatus || raceStatus.stage === "ready");
  $("driver-choices").hidden = !setup || !active;
  $("driver-name").textContent = raceStatus?.waiting
    ? "Waiting for your crew…"
    : raceStatus?.confirmed
      ? "Waiting for your crew…"
      : raceStatus?.driver || "Choose your driver";
  $("gas-label").textContent =
    state.game === "mario-kart" ? kartGasCaption(raceStatus) : "Accelerate";
  $("gas-hint").textContent = raceStatus?.waiting
    ? "STARTING TOGETHER"
    : setup || ["paused", "results"].includes(raceStatus?.stage)
      ? "TAP TO CONTINUE"
      : "HOLD TO GO";
  const boostIn =
    g.classic && wheel ? raceStatus?.boostIn || 0 : self?.boostIn || 0;
  const boostsLeft =
    g.classic && wheel ? raceStatus?.boostsLeft : self?.boostsLeft;
  const stockKnown = Number.isInteger(boostsLeft),
    exhausted = stockKnown && boostsLeft === 0;
  const stockLabel = stockKnown ? `${boostsLeft} LEFT` : "— LEFT";
  if ($("boost-left").textContent !== stockLabel)
    $("boost-left").textContent = stockLabel;
  $("boost-label").textContent = exhausted
    ? "ALL USED · NEXT RACE"
    : boostIn > 0
      ? `READY IN ${Math.ceil(boostIn)}s`
      : "TAP FOR NITRO";
  $("boost-recharge").hidden = !stockKnown || exhausted;
  $("boost-recharge-fill").style.width =
    `${Math.max(0, Math.min(1, 1 - boostIn / 8)) * 100}%`;
  $("gas").setAttribute("aria-label", $("gas-label").textContent);
  const canDrive =
    ready &&
    active &&
    state.hostConnected &&
    (state.phase !== "classic" || state.screenConnected) &&
    ["classic", "practice", "countdown", "playing"].includes(state.phase);
  $("gas").disabled =
    !canDrive || (setup && (raceStatus?.waiting || raceStatus?.confirmed));
  $("brake").disabled = !canDrive;
  $("boost").disabled =
    !canDrive ||
    !stockKnown ||
    exhausted ||
    boostIn > 0 ||
    (state.game === "mario-kart" && raceStatus?.stage !== "racing");
  $("pulse").disabled = !!state.paused;
  $("pulse").hidden =
    state.game !== "bubble-burst" ||
    !ready ||
    !active ||
    !["practice", "playing"].includes(state.phase);
  $("pad-caption").textContent =
    mode === "touch"
      ? "DRAG HERE TO MOVE"
      : currentDevice?.tier === "D"
        ? "TILT OR DRAG TO MOVE"
        : "A LITTLE TILT IS ALL IT TAKES";
  $("switch-mode").textContent =
    mode === "touch" ? "Try motion controls" : "Use touch controls";
  $("phone-phase").textContent = !ready
    ? "FIND YOUR BALANCE"
    : state.phase === "practice"
      ? "A LITTLE WARM-UP"
      : state.phase === "playing"
        ? g.title.toUpperCase()
        : state.phase === "results"
          ? "NICELY PLAYED"
          : "YOU’RE IN";
  if (rotate) {
    $("phone-title").textContent = "Take the wheel.";
    $("phone-hint").textContent =
      "Rotate sideways, then hold your comfortable driving grip still.";
  } else if (!ready && mode === "motion") {
    $("phone-title").innerHTML = "Hold comfy. <br>Stay still.";
    $("phone-hint").textContent = "We’re finding your natural grip.";
  } else if (!state.hostConnected) {
    $("phone-title").textContent = "Keep your spot.";
    $("phone-hint").textContent = "The big screen is reconnecting. Hang tight.";
  } else if (state.phase === "classic" && !state.screenConnected) {
    $("phone-title").textContent = "A little warm-up…";
    $("phone-hint").textContent =
      "Your phone is connected. The big screen is getting the game ready.";
  } else if (state.phase === "lobby") {
    if (!self?.ready) {
      $("phone-title").textContent = "Ready for more?";
      $("phone-hint").textContent = "Tap Recenter to join the next game.";
    } else {
      $("phone-title").textContent = "You’re ready.";
      $("phone-hint").textContent =
        "Waiting for your crew. We’ll start together.";
    }
  } else if (!active) {
    $("phone-title").textContent = "You’re up next.";
    $("phone-hint").textContent =
      "Cheer on your crew. You’ll join the next round.";
  } else if (
    wheel &&
    active &&
    ["classic", "practice", "countdown", "playing"].includes(state.phase)
  ) {
    $("phone-title").textContent = setup
      ? raceStatus?.waiting
        ? "Waiting for your crew."
        : raceStatus?.confirmed
          ? "Waiting for your crew."
          : "Pick your favorite."
      : "Easy turns. Smooth racing.";
    $("phone-hint").textContent = setup
      ? "Use the arrows. Your driver is on the big screen."
      : "Hold Accelerate. Tilt left or right. Tap Boost for a burst.";
  } else if (state.phase === "classic" && active) {
    $("phone-title").textContent = g.verb;
    $("phone-hint").textContent = g.detail;
  } else if (state.phase === "results") {
    const scored = state.players.filter((p) => state.active.includes(p.slot));
    const max = Math.max(...scored.map((p) => p.score));
    $("phone-title").textContent =
      self?.score === max ? "Good moves!" : "Nicely played!";
    $("phone-hint").textContent =
      "Another round is on the way. Keep your phone ready.";
  } else {
    $("phone-title").textContent = g.verb;
    $("phone-hint").textContent =
      state.phase === "practice"
        ? "Try it now. Find your color on the big screen."
        : g.detail;
  }
  if (playStatus && state.phase === "classic" && active) {
    $("phone-hint").textContent = playStatus.caption;
    $("classic-action").disabled = !ready || !playStatus.active;
    if (!shotStarted)
      $("classic-action").textContent = playStatus.active
        ? playStatus.action
        : "Your turn soon";
  }
  const guessing =
    state.game === "drawing" &&
    state.phase === "classic" &&
    !!state.sketch &&
    active;
  $("guess-panel").hidden = !guessing;
  if (guessing) {
    const drawing = state.sketch.drawer === identity.slot;
    $("phone-title").textContent = drawing
      ? "Your turn to draw."
      : "What could it be?";
    $("phone-hint").textContent = state.sketch.reveal
      ? "Nice guesses! Next artist in a moment."
      : drawing
        ? "Keep the word secret. Tilt to draw; tap to lift your pen."
        : "Look at the big screen. Type your guess below.";
    $("secret-word").textContent = state.sketch.reveal
      ? state.sketch.label
      : drawing
        ? sketchStatus?.word || "Your word is arriving…"
        : state.sketch.label;
    $("guess-form").hidden =
      drawing ||
      state.sketch.reveal ||
      !!sketchStatus?.guessed ||
      sketchStatus?.attemptsLeft === 0;
    $("motion-pad").hidden = !drawing;
    $("classic-action").hidden = !drawing || state.sketch.reveal;
    $("guess-text").disabled = state.paused;
    $("phone-score").textContent =
      `${state.sketch.scores[identity.slot] || 0} PTS`;
  }
  if (state.paused) {
    $("phone-title").textContent = "Taking a breather.";
    $("phone-hint").textContent = "Waiting for the host to resume.";
    for (const id of ["gas", "brake", "boost", "classic-action"])
      $(id).disabled = true;
  }
  syncRemoteFace();
  syncPad();
}
let previousScore = 0;
socket.on("state", (next) => {
  const previous = state,
    oldGame = state?.game,
    oldRound = state?.roundId,
    oldActive = state?.active.includes(identity?.slot);
  state = next;
  stakesPhone?.update();
  syncWeb3Identity();
  if (remoteInputInterrupted(previous, next, identity?.slot)) releasePedals();
  if (oldGame !== next.game) syncSettings();
  if (
    oldGame !== next.game ||
    oldRound !== next.roundId ||
    (oldActive && !next.active.includes(identity?.slot))
  ) {
    raceStatus = null;
    playStatus = null;
    sketchStatus = null;
    if (mode === "touch") {
      latest = { x: 0, y: 0 };
      $("touch-steer").value = "0";
    }
    if (started && oldGame !== next.game && needsGyro() && mode === "motion")
      calibrate();
    else if (started && oldGame !== next.game && !needsGyro()) {
      latest = latest || { x: 0, y: 0 };
      if (!ready) setReady(true);
      $("calibration-track").hidden = true;
      clearTimeout(sensorTimeout);
    }
  }
  offset = state.serverTime - Date.now();
  if (identity) {
    const self = state.players.find((p) => p.slot === identity.slot);
    if (self && self.score > previousScore) buzz(9);
    previousScore = self?.score || 0;
    // Calibration readiness belongs to this phone. An older server broadcast
    // may arrive after the user taps Join; it must not stop fresh inputs.
  }
  render();
});
function frame(time) {
  requestAnimationFrame(frame);
  if (!started) return;
  if (buttonPadOn()) {
    const aim = drawLock || stickAxes || followStick(time);
    latest = { x: aim.x, y: aim.y, ready: true, progress: 1 };
    if (!ready) {
      setReady(true);
      $("calibration-track").hidden = true;
      clearTimeout(sensorTimeout);
      syncPad();
    }
  }
  const shotPower = shotStarted
    ? Math.round(Math.min(1, (time - shotStarted) / 1600) * 100)
    : 0;
  const swing = $("game-pad")?.querySelector("[data-swing]");
  if (swing) swing.textContent = shotStarted ? `Swing ${shotPower}%` : "Swing";
  $("golf-power-meter").value = shotPower;
  $("golf-power-value").textContent = `${shotPower}%`;
  if (shotStarted) $("btn-a").dataset.caption = `Release · ${shotPower}%`;
  if (latest) {
    $("steering-dot").style.left = `${50 + latest.x * 45}%`;
    $("motion-dot").style.transform =
      `translate(${latest.x * 85}px,${(gameById(state?.game).mode === "aim" ? latest.y : 0) * 65}px)`;
  }
  if (identity && state) {
    const remaining = Math.max(
      0,
      Math.ceil((state.endsAt - Date.now() - offset) / 1000),
    );
    $("phone-countdown").hidden =
      state.phase !== "countdown" || !state.active.includes(identity.slot);
    $("phone-countdown").textContent = remaining || "GO";
  }
  if (
    ready &&
    mode === "motion" &&
    lastSample &&
    time - lastSample > 1800 &&
    !document.hidden
  ) {
    sensorProblem("Motion paused. Keep this page open, or switch to touch.");
  }
  if (
    socket.connected &&
    identity &&
    ready &&
    latest &&
    time - lastSend >= 30 &&
    !document.hidden
  ) {
    lastSend = time;
    const packet = pacer.sample(
      {
        x: shotStarted ? shotAim : latest.x,
        y: latest.y,
        pulse: lastPulse,
        ...pedals.read(time),
      },
      time,
      {
        latency: latency || 0,
        writable: socket.io.engine?.transport?.writable !== false,
      },
    );
    if (packet) {
      socket.emit("input", {
        ...packet,
        sampledAt: Date.now() + (sampleOffset ?? offset),
      });
      lastPulse = false;
    }
  }
}
requestAnimationFrame(frame);
setInterval(() => {
  if (!socket.connected || !identity) return;
  const began = performance.now();
  socket.timeout(2500).emit("ping-check", {}, (error, serverTime) => {
    if (error) {
      $("connection-detail").textContent = "Connection is slow";
      return;
    }
    latency = Math.round(performance.now() - began);
    if (Number.isFinite(serverTime))
      sampleOffset = serverTime + latency / 2 - Date.now();
    $("connection-detail").textContent =
      latency > 180
        ? "Connection is a little slow"
        : mode === "touch"
          ? "Touch controls · connected"
          : ready
            ? "Motion connected"
            : "Waiting for motion";
    status("Connected", true);
  });
}, 3000);
document.addEventListener("visibilitychange", () => {
  socket.emit("away", { away: document.hidden });
  if (document.hidden) {
    releasePedals();
    setReady(false);
    socket.emit("input", { x: 0, y: 0 });
    wakeKeeper.release();
  } else if (started) {
    keepAwake();
    holdPosture(true);
    if (mode === "motion") calibrate();
    else setReady(true);
  }
});
matchMedia("(orientation: landscape)").addEventListener("change", () => {
  if (!started) return;
  holdPosture(true);
  releasePedals();
  if (mode === "motion") calibrate();
  else render();
});
document.addEventListener("fullscreenchange", () => {
  if (started) holdPosture(true);
});
window.addEventListener("orientationchange", () => {
  if (started && mode === "motion") setTimeout(calibrate, 150);
});
window.addEventListener("blur", releasePedals);
function openPartyMenu() {
  releasePedals();
  for (const dialog of document.querySelectorAll("dialog[open]")) {
    if (dialog.id !== "settings") dialog.close();
  }
  syncSettings();
  $("remote-help-title").textContent =
    $("phone-title").innerText || "Your remote";
  $("remote-help-copy").textContent = $("phone-hint").textContent;
  const unavailable = GAME_REMOTE[state?.game]?.unavailable || [];
  $("remote-unavailable").textContent = unavailable.length
    ? `Not available in this version: ${unavailable.join("; ")}. Pause opens this menu. Recenter is here too.`
    : "Pause opens this menu. Recenter is here too.";
  if (!$("settings").open) $("settings").showModal();
}
$("tune").onclick = openPartyMenu;
installSafariFill({ window, document });
installPhonePageGuards({
  window,
  document,
  openPartyMenu,
  // A code typed after the guard was installed must survive Back and reload.
  returnUrl: () => {
    const query = new URLSearchParams();
    if (code) query.set("room", code);
    if (pairingScreen && !identity) query.set("screen", pairingScreen);
    return `/controller${query.size ? `?${query}` : ""}`;
  },
});
$("close-settings").onclick = () => $("settings").close();
$("sensitivity").oninput = () =>
  setSensitivity(Number($("sensitivity").value) / 100);
$("reset-sensitivity").onclick = () => {
  const name = isWheel() ? "racing" : "party";
  setSensitivity(MOTION_PROFILES[name].default);
};
$("switch-mode").onclick = () => {
  $("settings").close();
  if (mode === "motion") beginTouch();
  else startPlaying();
};
async function copyInvite(event) {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(location.href);
    button.textContent = "Link copied";
  } catch {
    button.textContent = "Use your browser’s Share menu";
  }
}
$("copy-invite").onclick = copyInvite;
$("gate-copy-invite").onclick = copyInvite;
$("leave").onclick = () => {
  releasePedals();
  removed = true;
  pendingDevice = null;
  gateGeneration++;
  gateTask = null;
  socket.emit("leave");
  remember(`chonks.player.${code}`, null);
  identity = null;
  started = false;
  generic?.stop();
  wakeKeeper.release();
  orientationControl.release();
  $("settings").close();
  $("play-view").hidden = true;
  $("join-view").hidden = false;
  message("Thanks for playing! Scan the big screen whenever you want back in.");
  $("enable").disabled = true;
  $("touch-mode").disabled = true;
  status("You’ve left the party");
};

$("classic-action").onclick = () => {
  if (state?.game === "golf") return;
  socket.emit("action", {
    action: "primary",
    sampledAt: Date.now() + (sampleOffset ?? offset),
  });
  buzz(12);
};
let shotSequence = Date.now();
function startShot(event) {
  if (
    state?.game !== "golf" ||
    faceMap?.A.action !== "shot" ||
    !faceMap?.A.enabled ||
    $("classic-action").disabled
  )
    return;
  event.preventDefault();
  shotStarted = performance.now();
  shotAim = latest?.x || 0;
  socket.emit("action", {
    action: "address",
    aim: shotAim,
    seq: ++shotSequence,
  });
  if (event.pointerId !== undefined)
    event.currentTarget.setPointerCapture(event.pointerId);
  syncRemoteFace();
}
function finishShot(event) {
  if (!shotStarted) return;
  event.preventDefault();
  const power = Math.min(
    1,
    Math.max(0.12, (performance.now() - shotStarted) / 1600),
  );
  shotStarted = 0;
  socket.emit("action", { action: "release", power, seq: shotSequence });
  buzz(18);
  render();
}
$("classic-action").onpointerdown = startShot;
$("classic-action").onpointerup = finishShot;
function cancelShot() {
  if (!shotStarted) return;
  socket.emit("action", { action: "cancel", seq: shotSequence });
  shotStarted = 0;
  syncRemoteFace();
}
$("classic-action").onpointercancel = cancelShot;
$("classic-action").addEventListener("lostpointercapture", cancelShot);
$("btn-a").addEventListener("lostpointercapture", cancelShot);
$("classic-action").onkeydown = (e) => {
  if ([" ", "Enter"].includes(e.key) && !e.repeat) startShot(e);
};
$("classic-action").onkeyup = (e) => {
  if ([" ", "Enter"].includes(e.key)) finishShot(e);
};
$("driver-left").onclick = () => socket.emit("action", { action: "left" });
$("driver-right").onclick = () => socket.emit("action", { action: "right" });
$("touch-steer").oninput = () => {
  latest = { x: Number($("touch-steer").value) / 100, y: 0 };
};
for (const event of ["pointerup", "pointercancel", "blur"])
  $("touch-steer").addEventListener(event, () => {
    $("touch-steer").value = "0";
    if (mode === "touch") latest = { x: 0, y: 0 };
  });
for (const id of ["gas", "brake", "boost"]) {
  const button = $(id);
  const press = (pointer) => {
    if (button.disabled) return;
    pedals.down(id, pointer, performance.now());
    button.classList.add("pressed");
    if (
      id === "gas" &&
      state?.game === "mario-kart" &&
      (!raceStatus || ["ready", "results", "paused"].includes(raceStatus.stage))
    )
      socket.emit("action", { action: "confirm" });
    buzz(10);
  };
  button.onpointerdown = (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    press(event.pointerId);
  };
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    button.addEventListener(event, (e) => {
      pedals.up(e.pointerId);
      button.classList.remove("pressed");
    });
  button.onkeydown = (e) => {
    if ([" ", "Enter"].includes(e.key) && !e.repeat) {
      e.preventDefault();
      press(id);
    }
  };
  button.onkeyup = (e) => {
    if ([" ", "Enter"].includes(e.key)) {
      e.preventDefault();
      pedals.up(id);
      button.classList.remove("pressed");
    }
  };
  button.oncontextmenu = (e) => e.preventDefault();
}
socket.on("feedback", (data) => {
  if (data.type === "play-status") {
    playStatus = data;
    render();
  }
  if (data.type === "race-status") {
    raceStatus = data;
    render();
  }
  if (data.type === "rumble") buzz(data.pattern);
  if (data.type === "slice") buzz(data.combo > 2 ? [12, 18, 22] : 18, "swoosh");
  if (data.type === "hit") buzz(12);
  if (data.type === "bomb") buzz([60, 40, 120], "thud");
});

for (const id of ["left-handed", "phone-haptics", "phone-sound"]) {
  try {
    $(id).checked =
      JSON.parse(localStorage.getItem("chonks." + id)) ??
      id === "phone-haptics";
  } catch {}
  $(id).onchange = () => {
    localStorage.setItem("chonks." + id, JSON.stringify($(id).checked));
    document.body.classList.toggle("left-handed", $("left-handed").checked);
  };
}
document.body.classList.toggle("left-handed", $("left-handed").checked);
try {
  $("profile-name").value = localStorage.getItem("chonks.nickname") || "";
} catch {}
$("profile-name").onchange = () =>
  localStorage.setItem(
    "chonks.nickname",
    $("profile-name").value.trim().slice(0, 20),
  );
socket.on("match.finish", (result) => {
  if (result.status !== "completed") return;
  const score = result.scores.find((s) => s.slot === identity?.slot);
  if (!score) return;
  const game = gameById(state.game),
    key = "chonks.best." + game.gameId;
  try {
    const old = Number(localStorage.getItem(key)),
      best =
        localStorage.getItem(key) === null
          ? score.score
          : game.scoring.direction === "lower"
            ? Math.min(old, score.score)
            : Math.max(old, score.score);
    localStorage.setItem(key, String(best));
    $("personal-best").textContent =
      `${game.title} best: ${best} ${game.scoring.unit}`;
  } catch {}
});

socket.on("sketch-turn", (data) => {
  if (sketchStatus?.turn !== data.turn) {
    $("guess-text").value = "";
    $("guess-note").textContent = "";
  }
  sketchStatus = data;
  render();
});
$("guess-form").onsubmit = (event) => {
  event.preventDefault();
  socket.emit("guess", { text: $("guess-text").value }, (answer) => {
    $("guess-note").textContent =
      answer.error ||
      (answer.correct
        ? "You got it! Keep the answer to yourself."
        : "Not quite. Try another guess.");
    if (answer.correct) buzz([25, 40, 25]);
  });
};

$("recover-connection").onclick = () => {
  removed = false;
  terminalReason = "";
  $("recover-connection").hidden = true;
  message("");
  socket.connect();
};
$("rotate-touch").onclick = beginTouch;
$("queue-leave").onclick = () => {
  $("waiting-view").hidden = true;
  leaveParty();
};
const leaveParty = $("leave").onclick;
holdButton($("leave"), leaveParty);
const recenterPhone = $("recenter").onclick;
holdButton(
  $("btn-1"),
  () => {
    if (!shellButton("1")) recenterPhone();
  },
  650,
);
holdButton($("recenter"), recenterPhone, 650);
// Every enabled role below uses the already-supported input protocol.
function runFaceAction(name) {
  const role = faceMap?.[name];
  if (!role?.enabled) return;
  if (pointerOn() && shellButton(name)) return;
  switch (role.action) {
    case "menu":
    case "help":
      openPartyMenu();
      break;
    case "slower":
      setSensitivity(motionSettings.get(isWheel() ? "racing" : "party") - 0.1);
      break;
    case "faster":
      setSensitivity(motionSettings.get(isWheel() ? "racing" : "party") + 0.1);
      break;
    case "primary":
      $("classic-action").click();
      break;
    case "pulse":
      $("pulse").click();
      break;
    case "cancel":
      cancelShot();
      break;
    case "left":
      $("driver-left").click();
      break;
    case "right":
      $("driver-right").click();
      break;
    case "guess":
      $("guess-form").requestSubmit();
      break;
  }
}
$("power").onclick = openPartyMenu;
for (const [id, name] of [
  ["btn-a", "A"],
  ["btn-b", "B"],
  ["btn-2", "2"],
  ["btn-minus", "minus"],
  ["btn-plus", "plus"],
  ["dp-left", "left"],
  ["dp-right", "right"],
  ["dp-up", "up"],
  ["dp-down", "down"],
])
  $(id).onclick = () => runFaceAction(name);
for (const name of [
  "onpointerdown",
  "onpointerup",
  "onpointercancel",
  "onkeydown",
  "onkeyup",
])
  $("btn-a")[name] = $("classic-action")[name];
const homeGesture = new HomeGesture();
let homeFrame = 0,
  homeActive = false,
  ignoreHomeClick = false;
function homeEffects(actions) {
  for (const action of actions) {
    if (action === "confirm") $("leave-confirmation").hidden = false;
    if (action === "dismiss") $("leave-confirmation").hidden = true;
    if (action === "menu" && !shellButton("home")) openPartyMenu();
    if (action === "leave") {
      leaveParty();
      $("leave-confirmation").hidden = true;
    }
  }
}
function homeTick(time) {
  homeEffects(homeGesture.advance(time));
  if (homeActive) homeFrame = requestAnimationFrame(homeTick);
}
function beginHome(event) {
  if (homeActive || event.repeat) return;
  event.preventDefault();
  homeActive = true;
  homeGesture.start(performance.now());
  if (event.pointerId !== undefined)
    $("btn-home").setPointerCapture(event.pointerId);
  homeFrame = requestAnimationFrame(homeTick);
}
function endHome(event) {
  if (!homeActive) return;
  event.preventDefault();
  homeActive = false;
  cancelAnimationFrame(homeFrame);
  ignoreHomeClick = true;
  homeEffects(homeGesture.end(performance.now()));
  setTimeout(() => {
    ignoreHomeClick = false;
  }, 0);
}
function cancelHome() {
  homeActive = false;
  cancelAnimationFrame(homeFrame);
  homeEffects(homeGesture.cancel());
}
$("btn-home").onpointerdown = beginHome;
$("btn-home").onpointerup = endHome;
for (const event of ["pointercancel", "lostpointercapture", "blur"])
  $("btn-home").addEventListener(event, cancelHome);
$("btn-home").onkeydown = (event) => {
  if (["Enter", " "].includes(event.key)) beginHome(event);
};
$("btn-home").onkeyup = (event) => {
  if (["Enter", " "].includes(event.key)) endHome(event);
};
$("btn-home").onclick = (event) => {
  event.preventDefault();
  if (
    !ignoreHomeClick &&
    !homeActive &&
    event.detail === 0 &&
    !shellButton("home")
  )
    openPartyMenu();
};
window.addEventListener("blur", cancelHome);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelHome();
});
paintSeatLamps($("seat-lamp"), SEATS, identity);
syncRemoteFace();
$("leave").textContent = "Hold to leave the party";
$("recenter").textContent = "Hold to recenter";
for (const id of ["remote-skin", "large-targets", "calm-phone"]) {
  try {
    const value = localStorage.getItem(`chonks.${id}`);
    if (id === "remote-skin") $(id).value = normalizeRemoteSkin(value);
    else $(id).checked = value === "true";
  } catch {}
  const apply = () => {
    if (id === "remote-skin") {
      document.body.dataset.skin = $(id).value;
      const style = getComputedStyle(document.body);
      document.querySelector('meta[name="theme-color"]').content =
        style.getPropertyValue("--bg").trim() ||
        style.getPropertyValue("--shell").trim() ||
        "#0a58d6";
    } else document.body.classList.toggle(id, $(id).checked);
    try {
      localStorage.setItem(
        `chonks.${id}`,
        id === "remote-skin" ? $(id).value : String($(id).checked),
      );
    } catch {}
  };
  $(id).onchange = apply;
  apply();
}
if (detectInAppBrowser(navigator.userAgent)) {
  $("browser-coaching").hidden = false;
}

mountPhoneAdmin(socket, () => state);

const votePanel = document.createElement("section");
votePanel.className = "guess-panel";
votePanel.hidden = true;
document.querySelector("#play-view").append(votePanel);
let voteKey = "";
socket.on("state", (s) => {
  const v = s.voting;
  votePanel.hidden = !v?.voting || s.phase !== "classic";
  if (votePanel.hidden) return;
  const key = JSON.stringify([
    s.roundId,
    v.voters,
    s.players.map((p) => p.slot),
  ]);
  if (key === voteKey) return;
  voteKey = key;
  votePanel.replaceChildren();
  const title = document.createElement("h2");
  title.textContent = v.voters.includes(identity?.slot)
    ? "Your vote is in!"
    : "Whose colour made you smile?";
  votePanel.append(title);
  if (v.voters.includes(identity?.slot)) return;
  for (const p of s.players.filter(
    (p) => s.active.includes(p.slot) && p.slot !== identity?.slot,
  )) {
    const b = document.createElement("button");
    b.className = "secondary-button";
    b.textContent = p.name;
    b.onclick = () => socket.emit("vote", { slot: p.slot });
    votePanel.append(b);
  }
});
