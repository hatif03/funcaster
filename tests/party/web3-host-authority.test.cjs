const test = require("node:test"),
  assert = require("node:assert/strict");
const { fixture, emit, FakePhone, wait } = require("./harness.cjs");
async function setup(t, authorizeHost) {
  let revoke;
  const web3 = {
    view: () => ({}),
    bind() {},
    tick() {},
    finish() {},
    startReason() {},
    joined() {},
    release() {},
    end() {},
    authorizeHost,
    setHostRevoker(fn) {
      revoke = fn;
    },
  };
  const f = await fixture(t, { arcade: true, web3 });
  const host = await f.connect(),
    identity = await emit(host, "host"),
    p = new FakePhone(f, identity.code);
  await p.join();
  p.ready();
  await f.advance(20);
  await emit(host, "host.assign", { slot: 0 });
  const room = f.party.rooms.get(identity.code);
  return { ...f, host, p, room, revoke: () => revoke(room, room.players[0]) };
}
test("delegated commands are checked; TV and PIN staff controls bypass chain reads", async (t) => {
  let calls = 0;
  const f = await setup(t, async () => {
    calls++;
    return {
      allowed: false,
      message: "The chain says no: this phone's host role was revoked.",
    };
  });
  const answer = await emit(f.p.socket, "host.cmd", {
    seq: 1,
    cmd: "select",
    args: { game: "bubble-burst" },
  });
  assert.match(answer.error, /chain says no/);
  assert.equal(f.room.game, "star-catch");
  f.host.emit("select", { game: "bubble-burst" });
  await wait(20);
  assert.equal(f.room.game, "bubble-burst");
  assert.equal(calls, 1);
  await emit(f.host, "arcade.configure", { mode: "party", pin: "123456" });
  assert.equal(
    (await emit(f.p.socket, "staff.unlock", { pin: "123456" })).ok,
    true,
  );
  assert.equal(
    (
      await emit(f.p.socket, "host.cmd", {
        seq: 2,
        cmd: "select",
        args: { game: "star-catch" },
      })
    ).ok,
    true,
  );
  assert.equal(calls, 1);
});
test("a delayed permission answer cannot execute after TV revocation", async (t) => {
  let resolve;
  const f = await setup(
    t,
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = emit(f.p.socket, "host.cmd", {
    seq: 1,
    cmd: "select",
    args: { game: "bubble-burst" },
  });
  while (!resolve) await wait(5);
  await emit(f.host, "host.assign", { slot: null });
  resolve({ allowed: true });
  assert.match((await pending).error, /changed/);
  assert.equal(f.room.game, "star-catch");
});
test("retained host assignment cannot issue commands while unready or disconnected", async (t) => {
  let calls = 0;
  const f = await setup(t, async () => {
    calls++;
    return { allowed: true };
  });
  const player = f.room.players[0],
    socket = player.socket;
  for (const state of [
    { ready: false, socket },
    { ready: true, socket: null },
  ]) {
    Object.assign(player, state);
    const answer = await emit(f.p.socket, "host.cmd", {
      seq: 1,
      cmd: "select",
      args: { game: "bubble-burst" },
    });
    assert.ok(answer.error);
    assert.equal(f.room.game, "star-catch");
    assert.equal(calls, 0);
    assert.equal(f.room.arcade.hostToken, player.token);
  }
  Object.assign(player, { ready: true, socket });
});
test("concurrent duplicates cannot execute a host command twice and live revocation closes the admin sheet", async (t) => {
  let resolve,
    calls = 0;
  const f = await setup(t, () => {
    calls++;
    return new Promise((r) => {
      resolve = r;
    });
  });
  const data = { seq: 1, cmd: "select", args: { game: "bubble-burst" } };
  const first = emit(f.p.socket, "host.cmd", data);
  while (!resolve) await wait(5);
  assert.match(
    (await emit(f.p.socket, "host.cmd", data)).error,
    /still being checked/,
  );
  resolve({ allowed: true });
  assert.equal((await first).ok, true);
  assert.equal((await emit(f.p.socket, "host.cmd", data)).ok, true);
  assert.equal(calls, 1);
  const state = new Promise((r) => f.p.socket.once("admin.state", r));
  f.revoke();
  assert.equal((await state).host, false);
  assert.equal(f.room.arcade.hostToken, null);
  await f.advance(10000);
  assert.notEqual(f.room.arcade.pending?.token, f.p.identity.token);
});
