import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./util/store.js";
import { createStorage, preferences } from "./storage.js";
import { BRAND, title } from "./brand.js";
test("selector subscriptions skip unrelated and shallow-equal changes; unsubscribe works", () => {
  const s = createStore({ room: { code: "ABCD" }, volume: 70 });
  const seen = [];
  const off = s.subscribe(
    (x) => x.room,
    (x) => seen.push(x),
  );
  s.set({ volume: 20 });
  s.set({ room: { code: "ABCD" } });
  s.set({ room: { code: "EFGH" } });
  off();
  s.set({ room: { code: "IJKL" } });
  assert.deepEqual(seen, [{ code: "EFGH" }]);
  assert.equal(s.get().volume, 20);
});
test("Funcaster settings keep legacy keys and migrate only new preferences", () => {
  const data = new Map([
    ["chonks.party-volume", "42"],
    ["chonks.reduced-effects", "true"],
    ["chonks.nickname", "Mrow"],
  ]);
  const api = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
  const s = createStorage(api);
  assert.equal(preferences(s).volume, 42);
  assert.equal(data.get("chonks.volume"), "42");
  assert.equal(data.get("chonks.party-volume"), "42");
  assert.equal(s.read("nickname"), "Mrow");
  s.write("setup.mario-kart", { laps: 3 });
  assert.deepEqual(s.read("setup.mario-kart"), { laps: 3 });
  s.write("openwii.sensitivity.v2", 1.2);
  assert.equal(s.read("openwii.sensitivity.v2"), 1.2);
  assert.throws(() => s.write("host", { token: "secret" }));
  assert.throws(() => s.write("player.ABCD", { token: "secret" }));
});
test("storage survives blocked APIs and brand identifiers stay unchanged", () => {
  const s = createStorage({
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
    removeItem() {
      throw Error();
    },
  });
  s.write("skin", "luna");
  assert.equal(s.read("skin"), "luna");
  s.write("skin", null);
  assert.equal(s.read("skin"), null);
  assert.equal(BRAND.name, "Funcaster");
  assert.equal(title("Settings"), "Settings — Funcaster");
});
