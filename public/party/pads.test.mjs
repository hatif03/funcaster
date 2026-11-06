import test from "node:test";
import assert from "node:assert/strict";
import {
  GYRO_GAMES,
  axisTargets,
  axesFromCorners,
  padSpec,
  toolAim,
  paperAim,
  paperAimFromCorners,
  mountPad,
} from "./pads.js";

test("held directions become a stick", () => {
  assert.deepEqual(axisTargets(new Set()), { x: 0, y: 0 });
  assert.deepEqual(axisTargets(new Set(["left"])), { x: -1, y: 0 });
  assert.deepEqual(axisTargets(new Set(["right", "up"])), { x: 1, y: -1 });
  assert.deepEqual(axisTargets(new Set(["left", "right"])), { x: 0, y: 0 });
});

test("every game has a landscape pad", () => {
  for (const game of [
    "mario-kart",
    "kart",
    "neon-drift",
    "alien-attack",
    "star-catch",
    "island-flyover",
    "golf",
    "table-tennis",
    "bubble-burst",
    "drawing",
    "shooting-range",
    "fruit-ninja",
    "swordplay",
  ]) {
    const spec = padSpec(game);
    assert.ok(spec, game);
    assert.equal(
      GYRO_GAMES.has(game),
      ["fruit-ninja", "swordplay"].includes(game),
    );
  }
  assert.equal(padSpec("table-tennis").cells[0].stick, "xy");
  assert.equal(padSpec("table-tennis").cells[1].tap, "primary");
  assert.equal(padSpec("bubble-burst").cells[0].stick, "xy");
  assert.equal(padSpec("alien-attack").cells[0].stick, "xy");
  assert.equal(padSpec("shooting-range").cells[0].stick, "xy");
  assert.deepEqual(
    padSpec("island-flyover").cells.map((item) => item.stick),
    ["x", "y"],
  );
  assert.equal(
    padSpec("shooting-range").cells.some((item) => item.tap === "motion"),
    false,
  );
  assert.equal(padSpec("mario-kart").item, true);
  assert.equal(padSpec("kart").item, false);
  assert.equal(padSpec("mario-kart", { setup: true }).key, "mario-setup");
  assert.equal(padSpec("drawing", { guessing: true, drawing: false }), null);
  assert.equal(
    padSpec("fruit-ninja", { motion: false }).cells.at(-1).tap,
    "motion",
  );
});

test("a stick follows the on-screen landscape box, even when the page is turned", () => {
  const right = axesFromCorners(
    { x: 10, y: 20 },
    { x: 210, y: 20 },
    { x: 10, y: 120 },
    210,
    70,
    "xy",
  );
  assert.ok(right.x > 0.9);
  assert.equal(right.y, 0);
  const up = axesFromCorners(
    { x: 10, y: 20 },
    { x: 210, y: 20 },
    { x: 10, y: 120 },
    110,
    20,
    "xy",
  );
  assert.equal(up.x, 0);
  assert.ok(up.y < -0.9);
  // The landscape fallback turns the page 90 degrees: the box's right edge
  // points down the portrait screen, and its top edge points to the right.
  const turnedRight = axesFromCorners(
    { x: 100, y: 0 },
    { x: 100, y: 200 },
    { x: 0, y: 0 },
    50,
    200,
    "xy",
  );
  assert.ok(turnedRight.x > 0.9);
  assert.equal(turnedRight.y, 0);
  const turnedUp = axesFromCorners(
    { x: 100, y: 0 },
    { x: 100, y: 200 },
    { x: 0, y: 0 },
    100,
    100,
    "xy",
  );
  assert.equal(turnedUp.x, 0);
  assert.ok(turnedUp.y < -0.9);
  const bankOnly = axesFromCorners(
    { x: 100, y: 0 },
    { x: 100, y: 200 },
    { x: 0, y: 0 },
    100,
    100,
    "x",
  );
  assert.equal(bankOnly.x, 0);
  assert.equal(bankOnly.y, 0);
});

test("drawing tools land on the toolbar, and the paper stays off it", () => {
  const red = toolAim("color", 1);
  assert.ok(red.x < -0.8);
  const paper = paperAim(0, 0);
  assert.ok(paper.x > red.x);
});

test("drawing keeps the full paper coordinates through either CSS rotation", () => {
  for (const [origin, across, down] of [
    [
      { x: 10, y: 20 },
      { x: 210, y: 20 },
      { x: 10, y: 120 },
    ],
    [
      { x: 100, y: 0 },
      { x: 100, y: 200 },
      { x: 0, y: 0 },
    ],
    [
      { x: 0, y: 200 },
      { x: 0, y: 0 },
      { x: 100, y: 200 },
    ],
  ]) {
    for (const [x, y] of [
      [0, 0],
      [1, 1],
      [0.5, 0.5],
      [0.25, 0.75],
    ]) {
      const clientX =
        origin.x + x * (across.x - origin.x) + y * (down.x - origin.x);
      const clientY =
        origin.y + x * (across.y - origin.y) + y * (down.y - origin.y);
      assert.deepEqual(
        paperAimFromCorners(origin, across, down, clientX, clientY),
        paperAim(x, y),
      );
    }
  }
});

function surface(t) {
  class Element extends EventTarget {
    children = [];
    dataset = {};
    style = {};
    classes = new Set();
    offsetWidth = 200;
    offsetHeight = 100;
    capture = null;
    classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      contains: (name) => this.classes.has(name),
      toggle: (name, on) =>
        on ? this.classes.add(name) : this.classes.delete(name),
    };
    set className(value) {
      this.classes = new Set(value.split(/\s+/));
    }
    get className() {
      return [...this.classes].join(" ");
    }
    append(...nodes) {
      this.children.push(...nodes);
    }
    replaceChildren() {
      this.children = [];
    }
    setAttribute() {}
    getBoundingClientRect() {
      return this.rect || { left: 0, top: 0, right: 200, bottom: 100 };
    }
    setPointerCapture(id) {
      this.capture = id;
    }
    releasePointerCapture(id) {
      if (this.capture === id) this.capture = null;
    }
  }
  const previous = ["document", "window"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  const window = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: window,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => new Element() },
  });
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return { root: new Element(), window };
}

function pointer(node, type, pointerId, clientX = 100, clientY = 50) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId, clientX, clientY });
  node.dispatchEvent(event);
}

function setCorners(node) {
  const markers = node.children.filter((child) =>
    child.classList.contains("stick-axis"),
  );
  [
    { left: 100, top: 0 },
    { left: 100, top: 200 },
    { left: 0, top: 0 },
  ].forEach((rect, i) => {
    markers[i].rect = rect;
  });
}

test("interrupting a held direction releases capture and accepts a fresh press", (t) => {
  const { root, window } = surface(t),
    holds = new Set();
  let release;
  release = mountPad(root, padSpec("star-catch"), {
    onHold: (name, down) => (down ? holds.add(name) : holds.delete(name)),
    onTap: () => release(),
  });
  const left = root.children.find((node) => node.dataset.hold === "left");
  const pause = root.children.find((node) => node.dataset.tap === "pause");
  pointer(left, "pointerdown", 1);
  assert.deepEqual([...holds], ["left"]);
  pointer(pause, "pointerdown", 2);
  assert.equal(holds.size, 0);
  assert.equal(left.capture, null);
  assert.equal(pause.capture, null);
  pointer(left, "pointerdown", 3);
  pointer(window, "pointerup", 1);
  assert.equal(
    holds.has("left"),
    true,
    "an old pointer cannot release the new press",
  );
  pointer(window, "pointerup", 3);
  assert.equal(holds.size, 0);
  release();
});

test("interrupting a stick recenters it and ignores the old pointer", (t) => {
  const { root } = surface(t),
    reports = [];
  const release = mountPad(root, padSpec("alien-attack"), {
    onStick: (point) => reports.push(point),
    onTap() {},
  });
  const stick = root.children.find((node) => node.classList.contains("stick"));
  setCorners(stick);
  pointer(stick, "pointerdown", 1, 50, 200);
  assert.deepEqual(reports.at(-1), { x: 1, y: 0 });
  release();
  assert.deepEqual(reports.at(-1), { x: 0, y: 0 });
  const count = reports.length;
  pointer(stick, "pointermove", 1, 50, 0);
  assert.equal(reports.length, count);
  pointer(stick, "pointerdown", 2, 50, 0);
  assert.deepEqual(reports.at(-1), { x: -1, y: 0 });
  release();
});

test("drawing uses turned paper corners and stops on interruption or lost capture", (t) => {
  const { root } = surface(t),
    reports = [];
  const release = mountPad(root, padSpec("drawing"), {
    onDraw: (...args) => reports.push(args),
    onTool() {},
    onTap() {},
  });
  const paper = root.children.find((node) => node.classList.contains("paper"));
  setCorners(paper);
  pointer(paper, "pointerdown", 1, 25, 50);
  assert.deepEqual(reports.at(-1), [paperAim(0.25, 0.75), true, 1]);
  release();
  assert.deepEqual(reports.at(-1), [null, false, 1]);
  assert.equal(paper.capture, null);
  const count = reports.length;
  pointer(paper, "pointermove", 1, 0, 200);
  assert.equal(reports.length, count);
  paper.classList.add("locked");
  pointer(paper, "pointerdown", 2);
  assert.equal(reports.length, count, "paused paper cannot begin a stroke");
  paper.classList.remove("locked");
  pointer(paper, "pointerdown", 3);
  pointer(paper, "lostpointercapture", 3);
  assert.deepEqual(reports.at(-1), [null, false, 3]);
  release();
});
