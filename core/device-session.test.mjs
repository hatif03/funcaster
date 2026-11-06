import test from "node:test";
import assert from "node:assert/strict";
import { deviceStore } from "./device-session.js";
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) || null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};
test("phone identity survives a new tab; host credentials do not", () => {
  const a = storage(),
    b = storage(),
    local = storage();
  deviceStore(a, local).remember("chonks.player.ABCDEF", { token: "phone" });
  deviceStore(a, local).remember("chonks.host", { token: "owner" });
  assert.equal(
    deviceStore(b, local).recalled("chonks.player.ABCDEF").token,
    "phone",
  );
  assert.equal(deviceStore(b, local).recalled("chonks.host"), null);
});
test("player records expire and migrate tab storage without exposing owner keys", () => {
  const session = storage(),
    local = storage();
  let clock = 100;
  session.setItem("chonks.player.ABCDEF", JSON.stringify({ token: "old" }));
  const s = deviceStore(session, local, () => clock);
  assert.equal(s.recalled("chonks.player.ABCDEF").token, "old");
  assert.equal(session.getItem("chonks.player.ABCDEF"), null);
  clock += 4 * 3600000 + 1;
  assert.equal(
    deviceStore(storage(), local, () => clock).recalled("chonks.player.ABCDEF"),
    null,
  );
});

test("expiry applies in the originating tab, including when storage is disabled", () => {
  for (const local of [
    storage(),
    {
      setItem() {
        throw Error("disabled");
      },
      getItem() {
        throw Error("disabled");
      },
    },
  ]) {
    let time = 0;
    const s = deviceStore(storage(), local, () => time);
    s.remember("chonks.player.ABCDEF", { token: "phone" });
    assert.equal(s.recalled("chonks.player.ABCDEF").token, "phone");
    time = 14400001;
    assert.equal(s.recalled("chonks.player.ABCDEF"), null);
  }
});
