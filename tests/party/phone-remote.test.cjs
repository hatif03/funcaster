const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const source = fs.readFileSync(
  path.join(root, "public/party/phone-page.js"),
  "utf8",
);
const helpers = import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

class Surface extends EventTarget {
  constructor() {
    super();
    this.options = new Map();
  }
  addEventListener(type, fn, options) {
    this.options.set(type, options);
    super.addEventListener(type, fn, options);
  }
}
function touch(document, { scroll = false, control = false, pad = false } = {}) {
  const event = new Event("touchmove", { cancelable: true });
  Object.defineProperty(event, "target", {
    value: {
      closest(selector) {
        if (selector === "[data-scroll]") return scroll;
        if (selector === "#game-pad") return pad;
        return control;
      },
    },
  });
  document.dispatchEvent(event);
  return event.defaultPrevented;
}
function page(state = { room: "ABCDEF" }) {
  const document = new Surface(),
    window = new Surface();
  let pushes = 0,
    menus = 0;
  window.history = {
    state,
    pushState(next, title, url) {
      this.url = url;
      this.state = next;
      pushes++;
    },
  };
  return {
    document,
    window,
    openPartyMenu() {
      menus++;
    },
    get pushes() {
      return pushes;
    },
    get menus() {
      return menus;
    },
  };
}

test("phone page guard blocks accidental gestures while sheets retain scrolling", async () => {
  const { installPhonePageGuards } = await helpers,
    fixture = page();
  const cleanup = installPhonePageGuards(fixture);
  assert.equal(fixture.document.options.get("touchmove").passive, false);
  assert.equal(touch(fixture.document), true);
  assert.equal(touch(fixture.document, { scroll: true }), false);
  assert.equal(touch(fixture.document, { scroll: true, control: true }), true);
  assert.equal(touch(fixture.document, { pad: true }), false);
  const pinch = new Event("gesturestart", { cancelable: true });
  fixture.document.dispatchEvent(pinch);
  assert.equal(pinch.defaultPrevented, true);
  const first = new Event("touchend", { cancelable: true });
  const second = new Event("touchend", { cancelable: true });
  fixture.document.dispatchEvent(first);
  fixture.document.dispatchEvent(second);
  assert.equal(first.defaultPrevented, false);
  assert.equal(second.defaultPrevented, true);
  const context = new Event("contextmenu", { cancelable: true });
  fixture.document.dispatchEvent(context);
  assert.equal(context.defaultPrevented, true);
  cleanup();
  assert.equal(touch(fixture.document), false);
});

test("Android Back opens the party sheet, preserves history state, and is reload-idempotent", async () => {
  const { installPhonePageGuards } = await helpers,
    fixture = page();
  fixture.returnUrl = () => "/controller?room=ABCDEF";
  const cleanup = installPhonePageGuards(fixture);
  assert.equal(fixture.pushes, 1);
  assert.equal(fixture.window.history.state.room, "ABCDEF");
  fixture.window.dispatchEvent(new Event("popstate"));
  assert.equal(fixture.menus, 1);
  assert.equal(fixture.window.history.url, "/controller?room=ABCDEF");
  assert.equal(fixture.pushes, 2);
  cleanup();
  const remove = installPhonePageGuards(fixture);
  assert.equal(
    fixture.pushes,
    2,
    "reloading an already guarded entry adds no duplicate",
  );
  remove();
  fixture.window.dispatchEvent(new Event("popstate"));
  assert.equal(fixture.menus, 1);
});

test("visual and sound feedback survive disabled or unavailable vibration", async () => {
  const { phoneFeedback } = await helpers;
  for (const haptics of [false, true]) {
    const seen = [];
    phoneFeedback(
      {
        visual: () => seen.push("visual"),
        haptics,
        vibrate() {
          throw new Error("API unavailable");
        },
        sound: true,
        playSound: () => seen.push("sound"),
      },
      [25, 40, 25],
    );
    assert.deepEqual(seen, ["visual", "sound"]);
  }
  const seen = [];
  phoneFeedback(
    {
      visual: () => seen.push("visual"),
      haptics: true,
      vibrate: (pattern) => seen.push(pattern),
      sound: false,
      playSound: () => seen.push("sound"),
    },
    12,
  );
  assert.deepEqual(seen, ["visual", 12]);
});

test("feedback waits for sticky user activation before vibration while visuals and sound stay independent", async () => {
  const { phoneFeedback } = await helpers;
  const seen = [],
    userActivation = { hasBeenActive: false };
  const effects = {
    visual: () => seen.push("visual"),
    haptics: true,
    userActivation,
    vibrate: (pattern) => seen.push(pattern),
    sound: true,
    playSound: () => seen.push("sound"),
  };
  phoneFeedback(effects, 12);
  assert.deepEqual(
    seen,
    ["visual", "sound"],
    "room registration before the first tap must not call the browser's blocked vibration API",
  );
  seen.length = 0;
  userActivation.hasBeenActive = true;
  phoneFeedback(effects, [25, 40, 25]);
  assert.deepEqual(seen, ["visual", [25, 40, 25], "sound"]);
});

test("in-app coaching covers the named browsers without mistaking native Safari or Chrome", async () => {
  const { detectInAppBrowser } = await helpers;
  for (const name of [
    "Instagram",
    "FBAN/FBIOS",
    "FBAV/99",
    "Line/1",
    "WhatsApp",
    "Telegram",
    "TikTok",
    "Snapchat",
    "Twitter",
    "MicroMessenger",
    "Messenger",
    "; wv)",
  ])
    assert.ok(detectInAppBrowser(`Mozilla/5.0 ${name}`), name);
  for (const ua of [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 Version/18.0 Mobile/15 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
  ])
    assert.equal(detectInAppBrowser(ua), null);
});

test("phone metadata launches a real room-code page and has exactly one browser theme", () => {
  const html = fs.readFileSync(
    path.join(root, "public/controller.html"),
    "utf8",
  );
  assert.equal((html.match(/name="theme-color"/g) || []).length, 1);
  const href = html.match(/rel="manifest" href="([^"]+)"/)[1];
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "public", href), "utf8"),
  );
  assert.equal(manifest.start_url, "/controller");
  assert.equal(manifest.orientation, "any");
  assert.ok(
    fs.existsSync(path.join(root, "public", `${manifest.start_url}.html`)),
  );
  assert.match(html, /id="code-form"[^>]+data-scroll/);
  assert.match(html, /id="settings"[^>]+data-scroll/);
  assert.match(
    html,
    /name="apple-mobile-web-app-status-bar-style"[\s\S]*?content="black-translucent"/,
  );
});

const remoteSource = fs.readFileSync(
  path.join(root, "public/party/remote.js"),
  "utf8",
);
const remote = import(
  `data:text/javascript;base64,${Buffer.from(remoteSource).toString("base64")}`
);

test("remote paint jobs retain known preferences and default to Luna", async () => {
  const { normalizeRemoteSkin, REMOTE_SKINS } = await remote;
  for (const skin of REMOTE_SKINS)
    assert.equal(normalizeRemoteSkin(skin), skin);
  assert.equal(normalizeRemoteSkin("bus"), "luna");
  assert.equal(normalizeRemoteSkin("local"), "classic");
  for (const value of [null, undefined, "", "unknown", "toString"])
    assert.equal(normalizeRemoteSkin(value), "luna");
  const html = fs.readFileSync(
    path.join(root, "public/controller.html"),
    "utf8",
  );
  assert.match(html, /<body[^>]+data-skin="luna"/);
  const choices = html.match(
    /<select id="remote-skin">([\s\S]+?)<\/select>/,
  )[1];
  assert.deepEqual(
    [...choices.matchAll(/value="([^"]+)"/g)].map((m) => m[1]),
    REMOTE_SKINS,
  );
});

test("seat lamps retain four shapes through join, queue and promotion", async () => {
  const { paintSeatLamps } = await remote;
  const seatSource = fs.readFileSync(path.join(root, "core/seats.js"), "utf8");
  const { SEATS } = await import(
    `data:text/javascript;base64,${Buffer.from(seatSource).toString("base64")}`
  );
  function node(slot) {
    return {
      dataset: { seat: String(slot) },
      flags: new Set(),
      attrs: {},
      props: {},
      get classList() {
        return {
          toggle: (name, on) =>
            on ? this.flags.add(name) : this.flags.delete(name),
        };
      },
      get style() {
        return { setProperty: (key, value) => (this.props[key] = value) };
      },
      setAttribute(key, value) {
        this.attrs[key] = value;
      },
    };
  }
  const element = node(),
    lamps = SEATS.map((_, slot) => node(slot));
  element.querySelectorAll = () => lamps;
  for (const identity of [
    null,
    { slot: 2 },
    { queued: true, position: 1 },
    { slot: 0 },
  ]) {
    paintSeatLamps(element, SEATS, identity);
    assert.deepEqual(
      lamps.map((lamp) => lamp.textContent),
      SEATS.map((seat) => seat.shape),
    );
    assert.deepEqual(
      lamps.map((lamp) => lamp.props["--seat-color"]),
      SEATS.map((seat) => seat.color),
    );
    assert.equal(
      lamps.filter((lamp) => lamp.flags.has("on")).length,
      identity && !identity.queued ? 1 : 0,
    );
    if (identity && !identity.queued) {
      assert.ok(lamps[identity.slot].flags.has("on"));
      assert.equal(
        element.attrs["aria-label"],
        `Player ${identity.slot + 1}: ${SEATS[identity.slot].name}`,
      );
    } else assert.ok(element.flags.has("seek"));
  }
});

test("remote scaffold preserves every statically queried phone control without duplicate IDs", () => {
  const html = fs.readFileSync(
    path.join(root, "public/controller.html"),
    "utf8",
  );
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  const phone = fs.readFileSync(
    path.join(root, "public/party/phone.js"),
    "utf8",
  );
  for (const [, id] of phone.matchAll(/\$\("([^"]+)"\)/g))
    assert.ok(ids.includes(id), `missing ${id}`);
  for (const id of [
    "stage",
    "remote",
    "screen",
    "dpad",
    "dp-up",
    "dp-down",
    "dp-left",
    "dp-right",
    "btn-a",
    "btn-b",
    "btn-minus",
    "btn-home",
    "btn-plus",
    "btn-1",
    "btn-2",
    "speaker",
  ])
    assert.ok(ids.includes(id), `missing face part ${id}`);
  assert.deepEqual(
    [...html.matchAll(/data-seat="(\d)"/g)].map((match) => +match[1]),
    [0, 1, 2, 3],
  );
});
