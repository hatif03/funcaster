import assert from "node:assert/strict";
import test from "node:test";
import {
  createOrientationControl,
  installSafariFill,
  iphoneBrowser,
  orientationFallback,
  safariBarsOpen,
} from "../../public/party/phone-capabilities.js";

function root() {
  const classes = new Set();
  return {
    classes,
    classList: {
      toggle(name, on) {
        if (on) classes.add(name);
        else classes.delete(name);
      },
      remove(...names) {
        for (const name of names) classes.delete(name);
      },
    },
  };
}

test("the controller stays landscape when a phone is held upright", () => {
  assert.equal(orientationFallback("landscape", true), "lock-landscape");
  assert.equal(orientationFallback("landscape", false), "");
});

test("the lobby stays portrait when a phone is held sideways", () => {
  assert.equal(orientationFallback("portrait", false), "lock-portrait");
  assert.equal(orientationFallback("portrait", true), "");
  assert.equal(orientationFallback(null, true), "");
});

test("iOS, where the lock is refused, turns the page", async () => {
  const page = root();
  const control = createOrientationControl(
    {
      lock: () => Promise.reject(new Error("not supported")),
      unlock() {},
    },
    { root: page, portrait: () => true },
  );
  control.set("landscape");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(page.classes.has("lock-landscape"), true);
  control.release();
  assert.equal(page.classes.has("lock-landscape"), false);
});

test("an iPhone in Safari still has browser bars when the page is shorter than the screen", () => {
  assert.equal(
    iphoneBrowser(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    ),
    true,
  );
  assert.equal(iphoneBrowser("Mozilla/5.0 (Linux; Android 14) Chrome/130.0"), false);
  assert.equal(
    iphoneBrowser("Mozilla/5.0 (iPhone)", { standalone: true }),
    false,
  );
  assert.equal(
    safariBarsOpen({ viewportHeight: 700, screenWidth: 390, screenHeight: 844 }),
    true,
  );
  assert.equal(
    safariBarsOpen({ viewportHeight: 830, screenWidth: 390, screenHeight: 844 }),
    false,
  );
  assert.equal(
    safariBarsOpen({ viewportHeight: 300, screenWidth: 390, screenHeight: 844 }),
    true,
  );
});

test("a tap scrolls Safari's bars away and a full viewport locks the page", () => {
  const classes = new Set();
  const root = {
    classList: {
      toggle(name, on) {
        if (on) classes.add(name);
        else classes.delete(name);
      },
      contains: (name) => classes.has(name),
      remove: (name) => classes.delete(name),
    },
  };
  const listeners = new Map();
  const on = (type, fn) => {
    listeners.set(type, fn);
  };
  const window = {
    navigator: {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      maxTouchPoints: 5,
    },
    innerHeight: 700,
    scrollY: 0,
    screen: { width: 390, height: 844 },
    visualViewport: { height: 700, offsetTop: 0, addEventListener: on },
    matchMedia: () => ({ matches: false }),
    addEventListener: on,
    scrollTo(_x, y) {
      window.scrollY = y;
    },
  };
  const document = { documentElement: root, addEventListener: on };
  installSafariFill({ window, document });
  assert.equal(classes.has("ios-bars"), true);
  listeners.get("touchstart")();
  assert.equal(window.scrollY, 64);
  window.visualViewport.height = 840;
  listeners.get("resize")();
  assert.equal(classes.has("ios-bars"), false);
  assert.equal(window.scrollY, 0);
});

test("a lock the browser accepts does not also turn the page", async () => {
  const page = root();
  const control = createOrientationControl(
    { lock: () => Promise.resolve(), unlock() {} },
    { root: page, portrait: () => true },
  );
  control.set("landscape");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(page.classes.has("lock-landscape"), false);
});
