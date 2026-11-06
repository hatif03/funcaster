import test from "node:test";
import assert from "node:assert/strict";
import { MOTION_PROFILES, MotionSettings } from "./motion-settings.js";

function storage(values = {}) {
  const data = new Map(Object.entries(values));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

test("existing high aiming preferences cannot override the gentler racing default", () => {
  const saved = storage({ "chonks.sensitivity": "2.4" });
  const preferences = new MotionSettings(saved);
  assert.equal(preferences.get("party"), 2.4);
  assert.equal(preferences.get("racing"), 1);
});
test("racing and aiming settings persist independently across refresh, game switches and reset", () => {
  const saved = storage({ "chonks.sensitivity": "1.8" });
  let preferences = new MotionSettings(saved);
  preferences.set("racing", 0.8);
  preferences.set("party", 2.1);
  preferences = new MotionSettings(saved);
  assert.equal(preferences.get("racing"), 0.8);
  assert.equal(preferences.get("party"), 2.1);
  preferences.set("racing", MOTION_PROFILES.racing.default);
  preferences = new MotionSettings(saved);
  assert.equal(preferences.get("racing"), 1);
  assert.equal(preferences.get("party"), 2.1);
});
test("invalid saved sensitivity falls back safely; valid values stay inside the racing range", () => {
  for (const value of ["", "0", "-1", "NaN", "Infinity", "broken", null]) {
    const preferences = new MotionSettings(
      storage({ "chonks.racingSensitivity": value }),
    );
    assert.equal(preferences.get("racing"), 1);
  }
  const preferences = new MotionSettings(
    storage({ "chonks.racingSensitivity": "2.4" }),
  );
  assert.equal(preferences.get("racing"), 1.3);
  assert.equal(preferences.set("racing", 0.2), 0.7);
  assert.equal(preferences.set("racing", NaN), 0.7);
  assert.equal(preferences.set("racing", Infinity), 0.7);
});
test("controllers work when phone preference storage is absent or blocked", () => {
  for (const saved of [
    undefined,
    {
      getItem() { throw Error("blocked"); },
      setItem() { throw Error("blocked"); },
    },
  ]) {
    const preferences = new MotionSettings(saved);
    assert.equal(preferences.get("racing"), 1);
    assert.equal(preferences.get("party"), 1.25);
    assert.equal(preferences.set("racing", 0.9), 0.9);
    assert.equal(preferences.get("party"), 1.25);
  }
});
