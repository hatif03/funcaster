import { buildId } from "./build-id.js";
import { GameRuntime } from "../sdk/lifecycle.js";
import { SnapshotBuffer } from "./snapshot-buffer.js";
import { encodeState, restoreState } from "./state.js";
/**
 * Client side of the relay protocol.
 *
 * Every sample carries a `slot` — the player index the server assigned to that
 * controller. Only slot 0 is used today, but games that read `slot` from the
 * start cost nothing now and don't need rewriting when a second phone appears.
 */
export class GameLink {
  constructor({ onOrientation, onCommand, onPresence } = {}) {
    // eslint-disable-next-line no-undef
    const params = new URLSearchParams(location.search);
    this.party =
      window.parent !== window &&
      /^[A-Z2-9]{6}$/.test(params.get("party") || "");
    this.replayTimers = [];
    window.addEventListener("pagehide", () => this.dispose(), { once: true });
    this.socket = io(this.party ? "/party" : "/", {
      transports: ["websocket", "polling"],
    });
    document.body.classList.add("arcade-game");
    document.body.dataset.game = location.pathname.split("/")[2];
    if (this.party && params.get("shell") === "os")
      document.body.dataset.shell = "os";
    const skin = document.createElement("link");
    skin.rel = "stylesheet";
    skin.href = "/games/shared/arcade-hud.css";
    document.head.append(skin);
    const keys = document.getElementById("keys"),
      status = document.getElementById("link");
    if (keys && status) {
      const rail = document.createElement("div");
      rail.className = "game-statusbar";
      keys.parentElement.append(rail);
      rail.append(keys, status);
    }
    const heading = document.querySelector("#panel h1");
    if (heading) heading.textContent = document.title.split(" — ")[0];
    if (this.party) {
      document.body.classList.add("party-game");
      const slug = location.pathname.split("/")[2];
      const intro = document.querySelector("#panel > p");
      if (intro && slug === "alien-attack")
        intro.textContent =
          "Tilt your phone to dodge. Tap Start / Fire to blast the invaders.";
      if (intro && slug === "shooting-range")
        intro.textContent = "Tilt to aim. Tap Start / Fire on your phone.";
      const panel = document.getElementById("panel");
      const label =
        {
          "fruit-ninja": "Tap Start slicing on your phone",
          golf: "Aim, then hold and release on your phone",
          "table-tennis": "Tap Serve / Swing on your phone",
          swordplay: "Tap Strike on your phone",
          kart: "Hold Accelerate on your phone",
          "island-flyover": "Tilt your phone to explore",
        }[slug] || "Tap Start / Fire on your phone";
      const refreshHint = () => {
        const cta = panel?.querySelector(".cta");
        if (cta && cta.textContent !== label) cta.textContent = label;
      };
      refreshHint();
      if (panel)
        new MutationObserver(refreshHint).observe(panel, {
          childList: true,
          subtree: true,
        });
      const grip = panel?.querySelector(".grip");
      if (grip)
        grip.textContent = "Hold comfortably. A little tilt is all it takes.";
      const keys = document.getElementById("keys");
      if (keys && slug === "fruit-ninja")
        keys.textContent =
          "Tilt to slice · Recenter on your phone · Game room above to switch games";
      if (keys && ["alien-attack", "shooting-range"].includes(slug))
        keys.textContent =
          "Tilt to aim · Tap Start / Fire on your phone · Game room above to switch games";
      if (keys && slug === "drawing")
        keys.textContent =
          "Tilt to draw · Tap Pen up / down on your phone · Choose colors on the big screen";
      if (keys && slug === "golf")
        keys.textContent =
          "Tilt to aim · hold and release on your phone · wait for your color";
      if (keys && slug === "table-tennis")
        keys.textContent =
          "Tilt to move your paddle · tap for a stronger return";
      if (keys && slug === "swordplay")
        keys.textContent =
          "Tilt to guard · tap to strike · keep your phone close";
      if (keys && slug === "kart")
        keys.textContent = "Tilt to steer · hold Accelerate · three Boosts";
      if (keys && slug === "island-flyover")
        keys.textContent =
          "Tilt to bank and climb · fly through the glowing rings";
    }
    if (this.party)
      document.addEventListener("click", (e) => {
        const home = e.target.closest('a[href="/"]');
        if (
          home &&
          location.pathname.split("/")[2] !== "mario-kart" &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.shiftKey &&
          !e.altKey
        ) {
          e.preventDefault();
          window.parent.postMessage({ type: "chonks:home" }, location.origin);
        }
      });
    this.gentleEffects = matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      this.gentleEffects ||=
        JSON.parse(localStorage.getItem("chonks.reduced-effects")) === true;
    } catch {}
    document.documentElement.classList.toggle(
      "gentle-effects",
      this.gentleEffects,
    );
    this.serverSimulation = params.has("shared");
    this.authority = !params.has("display") && !this.serverSimulation;
    this.paused = false;
    this.lastClock = performance.now();
    this.timeNow = this.lastClock;
    this.localSeats = (params.get("seats") || "")
      .split(",")
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n < 4);
    this.socket.on("pause", (p) => {
      this.paused = p.paused;
    });
    this.socket.on("snapshot", (s) => this.receiveState(s));
    this.socket.on("shared-events", (events) => {
      if (this.serverSimulation && this.onSharedEvent)
        for (const e of events) this.onSharedEvent(e);
    });
    this.socket.on("state", (s) => {
      this.paused = !!s.paused || !s.hostConnected || !!s.sharedWaiting;
      if (this.serverSimulation) {
        this.networkNote ||= Object.assign(document.createElement("div"), {
          className: "network-note",
        });
        if (!this.networkNote.isConnected)
          document.body.append(this.networkNote);
        this.networkNote.textContent =
          s.sharedWaiting ||
          (!s.hostConnected ? "Waiting for the main screen to reconnect…" : "");
        this.networkNote.hidden = !this.networkNote.textContent;
      }
    });
    this.controllers = 0;
    this.slots = [];
    this.rate = 0;

    this.socket.on("connect", async () => {
      if (!this.party) return this.socket.emit("register", "game");
      let saved;
      try {
        saved = JSON.parse(sessionStorage.getItem("chonks.host"));
      } catch {}
      this.socket.emit(
        params.has("display") ? "watch-game" : "screen",
        {
          buildId,
          code: params.get("party"),
          fresh: !this.registeredOnce,
          viewToken: params.has("play")
            ? sessionStorage.getItem("chonks.view." + params.get("party"))
            : undefined,
          resumeKey: sessionStorage.getItem(
            "chonks.screen." + params.get("party"),
          ),
          token: !params.has("display")
            ? saved?.token
            : sessionStorage.getItem("chonks.display." + params.get("party")),
          game: location.pathname.split("/")[2],
          roundId: Number(params.get("round")),
          view: Number(params.get("view") || 0),
        },
        (answer) => {
          if (answer?.error)
            window.parent.postMessage(
              { type: "chonks:error", message: answer.error },
              location.origin,
            );
          else {
            this.registeredOnce = true;
            this.setup = answer.setup;
            if (answer.authority === false) this.authority = false;
            this.previousGhost = answer.previousGhost;
            if (answer.snapshot) this.pendingState = answer.snapshot;
            window.parent.postMessage(
              { type: "chonks:loaded" },
              location.origin,
            );
          }
        },
      );
    });

    let samples = 0;
    let mark = performance.now();
    this.socket.on("orientation", (data) => {
      const now = performance.now();
      samples += 1;
      if (now - mark >= 1000) {
        this.rate = (samples * 1000) / (now - mark);
        samples = 0;
        mark = now;
      }
      this.runtime?.input(data.slot ?? 0, data.party || data);
      if (this.authority && !this.paused && onOrientation)
        onOrientation(data, data.slot ?? 0);
    });

    this.socket.on(
      "command",
      (cmd) =>
        this.authority &&
        !this.paused &&
        onCommand &&
        onCommand(cmd, cmd.slot ?? 0),
    );
    this.socket.on("presence", (p) => {
      this.controllers = p.controller;
      this.slots = p.slots || [];
      if (this.party)
        for (const [i, id] of ["p-tag", "a-tag"].entries()) {
          const el = document.getElementById(id);
          const index =
            this.serverSimulation &&
            this.localSeats[0] === 1 &&
            p.setup?.tennisMode !== "coop"
              ? 1 - i
              : i;
          if (el && p.slots?.[index]) {
            el.textContent = p.slots[index].name;
            el.style.color = p.slots[index].color;
          }
        }

      if (onPresence) onPresence(p);
    });

    // Latency probe: the phone echoes these back so we can measure a true
    // round trip. One-way timestamps would need synchronised clocks across two
    // devices, which we do not have.
    this.pingCallbacks = new Map();
    this.socket.on("pong-probe", ({ id }) => {
      const started = this.pingCallbacks.get(id);
      if (started === undefined) return;
      this.pingCallbacks.delete(id);
      if (this.onLatency) this.onLatency(performance.now() - started);
    });
  }

  advance(elapsed, update) {
    if (!this.authority || this.paused) return;
    if (!this.runtime) {
      this.simTime = this.timeNow - elapsed * 1000;
      this.runtime = new GameRuntime(
        {
          init: () => {},
          step: (dt) => {
            this.simTime += dt * 1000;
            this.logicStep(this.simTime, dt);
          },
          render: () => {},
          result: () => this.finalScores || [],
          dispose: () => {},
        },
        {
          game: location.pathname.split("/")[2],
          setup: this.setup || {},
          seats: [0, 1, 2, 3],
        },
      );
      this.runtime.start();
      window.addEventListener("pagehide", () => this.runtime.dispose(), {
        once: true,
      });
    }
    this.logicStep = update;
    this.runtime.pause(this.paused);
    this.runtime.advance(elapsed);
  }
  clock(timestamp) {
    if (!this.authority) {
      const sample = this.snapshotBuffer?.sample(timestamp),
        target = this.stateSource?.();
      if (sample && target) {
        restoreState(target, sample.state);
        this.afterState?.();
        this.timeNow = sample.clock;
        this.lastClock = timestamp;
        return this.timeNow;
      }
    }
    const delta = Math.max(0, Math.min(100, timestamp - this.lastClock));
    this.lastClock = timestamp;
    if (!this.paused) this.timeNow += delta;
    return this.timeNow;
  }
  bindReplay(
    game,
    methods = ["start", "setAspect", "setCursor", "update"],
    initial = [],
  ) {
    if (!this.party || !this.authority) return;
    let calls = [...initial],
      sequence = 0,
      queued = [],
      sending = false,
      failed = false,
      waiters = [],
      depth = 0,
      attempts = 0;
    const settle = () => {
      if (!calls.length && !queued.length && !sending) {
        waiters.splice(0).forEach((r) => r(!failed));
      }
    };
    const send = () => {
      if (sending || !queued.length || !this.socket.connected) return settle();
      sending = true;
      this.socket
        .timeout(3000)
        .emit("replay-chunk", queued[0], (error, ack) => {
          sending = false;
          if (error) {
            if (++attempts >= 4) {
              failed = true;
              queued.length = 0;
              calls.length = 0;
              settle();
              return;
            }
            setTimeout(send, 300);
            return;
          }
          attempts = 0;
          if (!ack?.ok) failed = true;
          queued.shift();
          send();
        });
    };
    const flush = () => {
      while (calls.length)
        queued.push({ sequence: sequence++, calls: calls.splice(0, 1000) });
      send();
    };
    for (const method of methods) {
      const original = game[method].bind(game);
      game[method] = (...args) => {
        // Enqueue before calling: a final step may synchronously call finish().
        if (!depth) calls.push(JSON.parse(JSON.stringify([method, ...args])));
        depth++;
        try {
          return original(...args);
        } finally {
          depth--;
        }
      };
    }
    this.flushReplay = () =>
      new Promise((resolve) => {
        const timeout = setTimeout(() => {
          failed = true;
          calls.length = 0;
          queued.length = 0;
          sending = false;
          settle();
        }, 15000);
        waiters.push((ok) => {
          clearTimeout(timeout);
          resolve(ok);
        });
        flush();
        settle();
      });
    const timer = setInterval(flush, 250);
    this.replayTimers.push(timer);
    this.socket.on("connect", () => setTimeout(send, 100));
    window.addEventListener("pagehide", () => clearInterval(timer), {
      once: true,
    });
  }
  bindState(getState, after = () => {}) {
    this.stateSource = getState;
    this.afterState = after;
    this.stateTimer = setInterval(() => {
      const state = getState();
      if (!state) return;
      if (this.pendingState) {
        const pending = this.pendingState;
        this.pendingState = null;
        this.receiveState(pending);
      }
      if (
        this.party &&
        this.authority &&
        !this.paused &&
        this.socket.io.engine?.transport?.writable !== false
      )
        this.socket.emit("snapshot", {
          clock: this.timeNow,
          state: encodeState(state),
        });
    }, 50);
    window.addEventListener("pagehide", () => clearInterval(this.stateTimer), {
      once: true,
    });
  }
  receiveState(packet) {
    if (this.authority) return;
    const target = this.stateSource?.();
    if (!target) {
      this.pendingState = packet;
      return;
    }
    this.snapshotBuffer ||= new SnapshotBuffer();
    this.snapshotBuffer.push(packet, performance.now());
    if (this.snapshotBuffer.frames.length === 1) {
      restoreState(target, packet.state);
      this.timeNow = packet.clock;
      this.lastClock = performance.now();
      this.afterState?.();
    }
    window.parent.postMessage({ type: "chonks:view-ready" }, location.origin);
  }
  report(scores) {
    if (this.party && this.authority && !this.finished)
      this.socket.emit("score", { scores });
  }

  async finish(scores) {
    if (!this.party || !this.authority || this.finished) return;
    this.finished = true;
    this.finalScores = scores;
    this.runtime?.finish();
    if (this.flushReplay) await this.flushReplay();
    this.socket.emit("match.finish", { scores }, (answer) => {
      if (answer?.error) this.finished = false;
    });
  }

  feedback(msg) {
    if (this.authority) this.socket.emit("feedback", msg);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.stateTimer);
    this.replayTimers.forEach(clearInterval);
    this.runtime?.dispose();
    this.pingCallbacks?.clear();
    this.networkNote?.remove();
    this.socket.removeAllListeners();
    this.socket.disconnect();
  }

  /** Fire a round-trip probe; resolves via onLatency. */
  probeLatency() {
    if (this.party) {
      const began = performance.now();
      this.socket.emit("ping-check", {}, () =>
        this.onLatency?.(performance.now() - began),
      );
      return;
    }
    const id = Math.floor(performance.now() * 1000) % 1e9;
    this.pingCallbacks.set(id, performance.now());
    this.socket.emit("ping-probe", { id });
    // Don't leak entries when a phone drops mid-probe.
    setTimeout(() => this.pingCallbacks.delete(id), 5000);
  }
}
