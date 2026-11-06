import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAudioBus, soundPath } from "./audio.js";
import {
  createSpritePlayer,
  BubbleBudget,
  mascotPlacement,
  MASCOT_ANIMATIONS,
  mascotWinner,
  mountMascot,
} from "./mascot.js";

function clock() {
  let time = 0,
    key = 0;
  const tasks = new Map();
  return {
    now: () => time,
    setTimer(fn, ms) {
      const id = ++key;
      tasks.set(id, { fn, at: time + ms });
      return id;
    },
    clearTimer(id) {
      tasks.delete(id);
    },
    async advance(ms) {
      const end = time + ms;
      while (true) {
        const next = [...tasks.entries()]
          .filter(([, t]) => t.at <= end)
          .sort(([, a], [, b]) => a.at - b.at)[0];
        if (!next) break;
        tasks.delete(next[0]);
        time = next[1].at;
        next[1].fn();
        for (let i = 0; i < 8; i++) await Promise.resolve();
      }
      time = end;
    },
    size: () => tasks.size,
  };
}
const animation = (file, durations = [50, 60]) => ({
  file,
  frames: durations.length,
  frameDurationsMs: durations,
});
const skin = {
  frame: [240, 240],
  anims: {
    idle: animation("idle", [100, 100]),
    check: animation("check", [60, 120, 80]),
    cool: animation("cool"),
    music: animation("music"),
    read: animation("read"),
  },
};
skin.anims.check.emptyFrames = [1];

test("mascot uses the source per-frame durations, holds empty frames, and lazily loads only requested sheets", async () => {
  const time = clock(),
    frames = [],
    loaded = [];
  const player = createSpritePlayer({
    skin,
    ...time,
    load: async (file) => loaded.push(file),
    render: (frame) => frames.push([time.now(), frame.name, frame.index]),
  });
  assert.deepEqual(loaded, []);
  await player.play("check");
  assert.deepEqual(loaded, ["check"]);
  assert.deepEqual(frames, [[0, "check", 0]]);
  await time.advance(179);
  assert.deepEqual(
    frames,
    [[0, "check", 0]],
    "blank frame keeps the last image for its own 120ms",
  );
  await time.advance(1);
  assert.deepEqual(frames.at(-1), [180, "check", 2]);
  await time.advance(80);
  assert.deepEqual(frames.at(-1), [260, "idle", 0]);
  assert.deepEqual(loaded, ["check", "idle"]);
  await player.play("check");
  assert.deepEqual(
    loaded,
    ["check", "idle"],
    "a repeated animation reuses its loaded sheet",
  );
  player.destroy();
  assert.equal(time.size(), 0);
});

test("mascot queue stays at two and Gentle effects holds one frame before static idle", async () => {
  const time = clock(),
    names = [];
  const player = createSpritePlayer({
    skin,
    ...time,
    render: (frame) => names.push(frame.name),
  });
  await player.play("check");
  await player.play("cool", { queue: true });
  await player.play("music", { queue: true });
  await player.play("read", { queue: true });
  assert.equal(player.queueSize(), 2);
  await time.advance(260);
  assert.equal(player.current(), "music");
  await time.advance(110);
  assert.equal(player.current(), "read");
  assert.equal(names.includes("cool"), false);
  player.setReduced(true);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  const before = names.length;
  await time.advance(1499);
  assert.equal(names.length, before);
  await time.advance(1);
  assert.equal(player.current(), "idle");
  const idleCount = names.length;
  await time.advance(5000);
  assert.equal(names.length, idleCount);
  player.setVisible(false);
  assert.equal(time.size(), 0);
  player.destroy();
});

test("in-flight sprite loads cannot render after hiding or teardown", async () => {
  let finish;
  const frames = [];
  const player = createSpritePlayer({
    skin,
    load: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    render: (frame) => frames.push(frame),
  });
  const playing = player.play("check");
  await Promise.resolve();
  player.setVisible(false);
  finish(true);
  assert.equal(await playing, false);
  assert.deepEqual(frames, []);
  player.destroy();
});

test("helper bubbles enforce cooldown/session limits and placement stays clear of the active window", () => {
  const budget = new BubbleBudget();
  assert.equal(budget.allow(0), true);
  assert.equal(budget.allow(59999), false);
  assert.equal(budget.allow(60000), true);
  assert.equal(budget.allow(120000), true);
  assert.equal(budget.allow(999999), false);
  assert.equal(
    budget.allow(1000000, true),
    true,
    "answers to direct actions remain available",
  );
  const work = { x: 0, y: 0, w: 1280, h: 678 };
  assert.equal(mascotPlacement(work, null).x, 1088);
  const left = mascotPlacement(work, { x: 1000, y: 400, w: 280, h: 278 });
  assert.equal(left.x, 12);
  assert.equal(left.hidden, false);
  assert.equal(mascotPlacement(work, work).hidden, true);
  for (const size of [
    { x: 10, y: 10, w: 300, h: 220 },
    { x: 20, y: 10, w: 2200, h: 1200 },
  ]) {
    const result = mascotPlacement(size, size, 2, true);
    assert.ok(result.x >= size.x && result.x + result.w <= size.x + size.w);
    assert.ok(result.y >= size.y && result.y + result.h <= size.y + size.h);
  }
});

test("all 25 approved helper animations are available with measured variable timing", () => {
  const descriptor = JSON.parse(
    readFileSync(
      new URL("../../../assets/os/mascot/clippit.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    Object.keys(descriptor.anims).sort(),
    [...MASCOT_ANIMATIONS].sort(),
  );
  for (const anim of Object.values(descriptor.anims)) {
    assert.equal(anim.frameDurationsMs.length, anim.frames);
    assert.ok(anim.frameDurationsMs.every((ms) => ms >= 60 && ms <= 2110));
  }
});

function audioFixture({ ogg = true } = {}) {
  const events = new Map(),
    contexts = [],
    fetched = [],
    nodes = [];
  const document = {
    createElement: () => ({ canPlayType: () => (ogg ? "probably" : "") }),
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
  };
  const node = (kind) => {
    const result = {
      kind,
      gain: {
        value: 0,
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      frequency: {},
      connect(next) {
        this.target = next;
        return next;
      },
      disconnect() {},
      start() {
        this.started = true;
      },
      stop() {
        this.stopped = true;
      },
    };
    nodes.push(result);
    return result;
  };
  class AudioContext {
    constructor() {
      this.state = "suspended";
      this.destination = {};
      this.currentTime = 1;
      this.decoded = 0;
      contexts.push(this);
    }
    async resume() {
      this.state = "running";
    }
    createGain() {
      return node("gain");
    }
    createBufferSource() {
      return node("source");
    }
    createOscillator() {
      return node("oscillator");
    }
    async decodeAudioData() {
      this.decoded++;
      return {};
    }
    async close() {
      this.state = "closed";
    }
  }
  const fetch = async (url) => {
    fetched.push(url);
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
  };
  const sound = {
    ogg: "sounds/click.ogg",
    mp3: "sounds/click.mp3",
    gainDb: 12,
  };
  const theme = {
    manifest: {
      sounds: {
        click: sound,
        open: sound,
        startup: sound,
        error: sound,
        joined: sound,
        countdown: { synth: "countdown" },
        win: { synth: "win" },
      },
    },
  };
  return {
    document,
    AudioContext,
    fetch,
    theme,
    events,
    contexts,
    fetched,
    nodes,
  };
}

test("shell sound creates one context on a gesture, caches file aliases, and sends every cue through master volume", async () => {
  const env = audioFixture(),
    bus = createAudioBus({ ...env, volume: 70 });
  assert.equal(env.contexts.length, 0);
  assert.equal(await bus.cue("click"), false);
  env.events.get("pointerdown")();
  await bus.unlock();
  assert.equal(env.contexts.length, 1);
  assert.equal(env.nodes[0].gain.value, 0.7);
  await Promise.all([bus.cue("click"), bus.cue("open")]);
  assert.equal(env.contexts[0].decoded, 1);
  assert.deepEqual(env.fetched, ["/assets/os/sounds/click.ogg"]);
  assert.ok(
    env.nodes
      .filter((n) => n.kind === "source")
      .every((n) => n.target === env.nodes[0]),
  );
  bus.setVolume(25);
  assert.equal(env.nodes[0].gain.value, 0.25);
  bus.setVolume(0);
  assert.equal(await bus.cue("click"), false);
  bus.setVolume(999);
  assert.equal(bus.getVolume(), 100);
  bus.destroy();
  assert.equal(env.events.size, 0);
  assert.equal(env.contexts[0].state, "closed");
});

test("Gentle effects suppresses startup/animation sound, keeps errors, and synths share the same mixer", async () => {
  const env = audioFixture({ ogg: false }),
    bus = createAudioBus({ ...env, gentle: true });
  await bus.unlock();
  assert.equal(await bus.cue("startup"), false);
  assert.equal(await bus.cue("joined"), false);
  assert.equal(await bus.cue("click", { animation: true }), false);
  assert.equal(await bus.cue("error", { animation: true }), true);
  assert.deepEqual(env.fetched, ["/assets/os/sounds/click.mp3"]);
  assert.equal(await bus.cue("countdown"), true);
  const synthGain = env.nodes.filter((n) => n.kind === "gain").at(-1);
  assert.equal(synthGain.target, env.nodes[0]);
  bus.setGentle(false);
  assert.equal(await bus.cue("win"), true);
  assert.equal(
    soundPath({ ogg: "../source/secret.ogg" }, () => "probably"),
    null,
  );
  assert.equal(soundPath({ synth: "countdown" }), null);
  bus.destroy();
});

test("a timed music reaction lasts two seconds after its sheet is ready, even across a long source frame", async () => {
  const time = clock(),
    frames = [];
  let complete;
  const player = createSpritePlayer({
    skin: {
      ...skin,
      anims: { ...skin.anims, music: animation("music", [2110, 100]) },
    },
    ...time,
    load: (file) =>
      file === "music"
        ? new Promise((resolve) => {
            complete = resolve;
          })
        : Promise.resolve(),
    render: (frame) => frames.push([time.now(), frame.name, frame.index]),
  });
  const pending = player.play("music", { duration: 2000 });
  await Promise.resolve();
  await time.advance(500);
  complete(true);
  await pending;
  assert.deepEqual(frames, [[500, "music", 0]]);
  await time.advance(1999);
  assert.equal(player.current(), "music");
  await time.advance(1);
  assert.equal(player.current(), "idle");
  player.destroy();
});

test("mascot winner copy follows the server rank without inventing solo, tied or abandoned winners", () => {
  const players = [
    { slot: 0, name: "Blue" },
    { slot: 2, name: "Green" },
  ];
  const scores = [
    { slot: 2, rank: 1, score: 10 },
    { slot: 0, rank: 2, score: 5 },
  ];
  const room = { players, result: { scores } };
  assert.equal(mascotWinner(room), "Green");
  assert.equal(
    mascotWinner({ ...room, result: { scores, status: "no-contest" } }),
    null,
  );
  assert.equal(
    mascotWinner({ ...room, result: { scores: scores.slice(0, 1) } }),
    null,
  );
  assert.equal(
    mascotWinner({
      ...room,
      result: { scores: scores.map((score) => ({ ...score, rank: 1 })) },
    }),
    null,
  );
  assert.equal(
    mascotWinner({
      ...room,
      result: { scores: [{ ...scores[0], outcome: "forfeit" }, scores[1]] },
    }),
    null,
  );
  assert.equal(mascotWinner({ result: { scores } }), null);
  assert.equal(mascotWinner(null), null);
});

function mascotSurface(t) {
  class Element extends EventTarget {
    constructor() {
      super();
      this.children = [];
      this.dataset = {};
      this.hidden = false;
      this.style = {
        setProperty(name, value) {
          this[name] = value;
        },
      };
    }
    append(...children) {
      this.children.push(...children);
    }
    setAttribute(name, value) {
      this[name] = value;
    }
    remove() {
      this.removed = true;
    }
  }
  const document = new EventTarget();
  document.hidden = false;
  document.documentElement = new Element();
  document.createElement = () => new Element();
  const previousDocument = globalThis.document;
  globalThis.document = document;
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const loaded = [];
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    matchMedia() {
      return Object.assign(new EventTarget(), { matches: false });
    },
    Image: class {
      set src(value) {
        loaded.push(value);
        queueMicrotask(() => this.onload());
      }
    },
  };
  const theme = { asset: () => "/skin.json", url: (value) => `/${value}` };
  let current = { room: { phase: "lobby", players: [] } },
    windows = [],
    subscriber;
  const store = {
    get: () => current,
    subscribe(selector, fn) {
      subscriber = fn;
      return () => {
        subscriber = null;
      };
    },
  };
  return {
    root: new Element(),
    document,
    window,
    theme,
    store,
    loaded,
    wm: { list: () => windows },
    setWindows(value) {
      windows = value;
    },
    update(value) {
      current = value;
      subscriber?.(current);
    },
  };
}
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

test("mascot media is deferred until visible activity and stale loading never keeps it over a game", async (t) => {
  const env = mascotSurface(t);
  let fetches = 0;
  const mascot = mountMascot(env.root, {
    ...env,
    settings: { gentle: true },
    fetch: async () => {
      fetches++;
      return {
        ok: true,
        json: async () => ({
          ...skin,
          anims: { ...skin.anims, airplane: animation("airplane") },
        }),
      };
    },
  });
  t.after(() => mascot.destroy());
  await settle();
  assert.equal(
    fetches,
    0,
    "initial shell does not fetch the 47MB helper pack or its idle sheet",
  );
  assert.deepEqual(env.loaded, []);
  env.update({ room: { phase: "classic", players: [] } });
  mascot.event("boot");
  await settle();
  assert.equal(fetches, 0, "hidden helper does not fetch a sheet");
  env.setWindows([{ id: "loading", state: "normal" }]);
  mascot.event("loading");
  assert.equal(await mascot.ready, true);
  await settle();
  assert.equal(fetches, 1);
  assert.equal(mascot.el.hidden, false);
  assert.deepEqual(env.loaded, ["/airplane"]);
  env.setWindows([]);
  mascot.position();
  assert.equal(
    mascot.el.hidden,
    true,
    "closing Loading hides it even if the loaded callback was lost",
  );
  env.update({ room: { phase: "lobby", players: [] } });
  await settle();
  assert.equal(mascot.el.hidden, false);
  assert.equal(mascot.el.children[0].style.backgroundImage, 'url("/idle")');
  assert.equal(fetches, 1);
  mascot.updateSettings({ mascot: false });
  assert.equal(mascot.el.hidden, true);
});

test("mascot uses room transitions for join, disconnect, errors and a unique result once", async (t) => {
  const env = mascotSurface(t);
  const mascot = mountMascot(env.root, {
    ...env,
    settings: { gentle: true },
    fetch: async () => ({
      ok: true,
      json: async () => ({
        ...skin,
        anims: { ...skin.anims, weird: animation("weird") },
      }),
    }),
  });
  t.after(() => mascot.destroy());
  mascot.event("activity");
  await mascot.ready;
  env.update({
    room: {
      code: "ABC",
      phase: "lobby",
      players: [{ slot: 0, name: "Blue", connected: true }],
    },
  });
  await settle();
  assert.equal(mascot.el.children[1].children[0].textContent, "Blue joined");
  env.update({
    room: {
      code: "ABC",
      phase: "lobby",
      players: [{ slot: 0, name: "Blue", connected: false }],
    },
  });
  await settle();
  assert.ok(env.loaded.includes("/weird"));
  assert.equal(
    mascot.el.children[1].children[0].textContent,
    "Blue joined",
    "unsolicited disconnect obeys the bubble cooldown",
  );
  env.update({
    error: "Connection interrupted",
    room: { phase: "lobby", players: [] },
  });
  await settle();
  const result = {
    scores: [
      { slot: 1, rank: 1 },
      { slot: 0, rank: 2 },
    ],
  };
  env.update({
    room: {
      phase: "results",
      code: "ABC",
      roundId: 1,
      result,
      players: [{ slot: 1, name: "Green", connected: true }],
    },
  });
  await settle();
  const count = env.loaded.filter((file) => file === "/cool").length;
  mascot.event("results");
  await settle();
  assert.equal(count, 1);
  assert.equal(env.loaded.filter((file) => file === "/cool").length, count);
});

test("retained phone movement follows the desktop at 4Hz and phone buttons wake Chonk without cutting wakeup short", async (t) => {
  const env = mascotSurface(t),
    time = clock();
  t.mock.method(globalThis.performance, "now", time.now);
  t.mock.method(globalThis, "setTimeout", time.setTimer);
  t.mock.method(globalThis, "clearTimeout", time.clearTimer);
  let overDesktop = true;
  env.document.elementFromPoint = () => ({ closest: () => overDesktop });
  const anims = Object.fromEntries(
    ["wakeup", "watch left", "watch right", "tired", "sleep"].map((name) => [
      name,
      animation(name),
    ]),
  );
  const mascot = mountMascot(env.root, {
    ...env,
    settings: { gentle: true },
    fetch: async () => ({
      ok: true,
      json: async () => ({ ...skin, anims: { ...skin.anims, ...anims } }),
    }),
  });
  t.after(() => mascot.destroy());
  mascot.pointer({ slot: 0, x: 120, y: 200 });
  await mascot.ready;
  await settle();
  const frame = () => mascot.el.children[0].style.backgroundImage;
  assert.equal(frame(), 'url("/watch left")');
  await time.advance(100);
  mascot.pointer({ slot: 0, x: 1000, y: 200 });
  await settle();
  assert.equal(
    frame(),
    'url("/watch left")',
    "rendered movement is rate limited independently of sensor rate",
  );
  await time.advance(150);
  mascot.pointer({ slot: 0, x: 1000, y: 200 });
  await settle();
  assert.equal(frame(), 'url("/watch right")');
  await time.advance(250);
  overDesktop = false;
  mascot.pointer({ slot: 0, x: 120, y: 200 });
  await settle();
  assert.equal(
    frame(),
    'url("/watch right")',
    "windows and taskbar activity wake but do not steer desktop eyes",
  );
  mascot.event("attract");
  await settle();
  mascot.pointer();
  await settle();
  assert.equal(
    frame(),
    'url("/wakeup")',
    "phone shell buttons count as input although .click() is not pointerdown",
  );
  overDesktop = true;
  mascot.pointer({ slot: 0, x: 120, y: 200 });
  await settle();
  assert.equal(frame(), 'url("/wakeup")');
  await time.advance(1500);
  mascot.pointer({ slot: 0, x: 120, y: 200 });
  await settle();
  assert.equal(frame(), 'url("/watch left")');
});

test("mascot idle polling stops during games, loading, hidden tabs and kiosk attract while loading sheets still work", async (t) => {
  const env = mascotSurface(t),
    intervals = new Map();
  let id = 0;
  t.mock.method(globalThis, "setInterval", (fn) => {
    intervals.set(++id, fn);
    return id;
  });
  t.mock.method(globalThis, "clearInterval", (key) => intervals.delete(key));
  const mascot = mountMascot(env.root, {
    ...env,
    settings: { gentle: true },
    fetch: async () => ({
      ok: true,
      json: async () => ({
        ...skin,
        anims: {
          ...skin.anims,
          airplane: animation("airplane"),
          tired: animation("tired"),
          sleep: animation("sleep"),
        },
      }),
    }),
  });
  t.after(() => mascot.destroy());
  assert.equal(intervals.size, 1);
  for (const phase of ["classic", "practice", "countdown", "playing"]) {
    env.update({ room: { phase, players: [] } });
    assert.equal(intervals.size, 0);
  }
  env.setWindows([{ id: "loading", state: "normal" }]);
  mascot.event("loading");
  await mascot.ready;
  await settle();
  assert.equal(mascot.el.hidden, false);
  assert.equal(mascot.el.children[0].style.backgroundImage, 'url("/airplane")');
  assert.equal(
    intervals.size,
    0,
    "the loading animation does not need desktop idle polling",
  );
  env.setWindows([]);
  mascot.event("loaded");
  assert.equal(mascot.el.hidden, true);
  assert.equal(intervals.size, 0);
  env.update({ room: { phase: "results", players: [] } });
  assert.equal(intervals.size, 1);
  mascot.position();
  assert.equal(intervals.size, 1);
  env.document.hidden = true;
  env.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(intervals.size, 0);
  env.document.hidden = false;
  env.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(intervals.size, 1);
  env.update({ room: { phase: "lobby", operatingMode: "kiosk", players: [] } });
  assert.equal(intervals.size, 0);
  assert.equal(mascot.el.hidden, true);
  mascot.event("attract");
  assert.equal(
    mascot.el.hidden,
    false,
    "attract is a shell lifecycle event, not a relay room.attract field",
  );
  assert.equal(intervals.size, 0);
  mascot.pointer();
  assert.equal(
    mascot.el.hidden,
    true,
    "kiosk hides the helper again when a phone wakes the shell",
  );
  assert.equal(intervals.size, 0);
  env.update({ room: { phase: "lobby", players: [] } });
  assert.equal(intervals.size, 1);
  mascot.updateSettings({ mascot: false });
  assert.equal(intervals.size, 0);
});
