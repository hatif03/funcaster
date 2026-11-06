const test = require("node:test"),
  assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises"),
  path = require("node:path"),
  { tmpdir } = require("node:os");
const { generatePrivateKey, privateKeyToAccount } = require("viem/accounts");
const { fixture, emit, wait } = require("./harness.cjs");
const { loadConfig } = require("../../integrations/shared/config.mjs");
const { bindData } = require("../../integrations/shared/bind-types.mjs");
const { createWeb3 } = require("../../server/web3/index.cjs");
async function setup(t) {
  let time = 100000;
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-bind-"));
  const web3 = createWeb3({
    config: loadConfig({ PARTNERS: "mock", WEB3_DATA_DIR: dir }),
    now: () => time,
  });
  const f = await fixture(t, { web3 });
  t.after(async () => {
    await web3.close();
    await rm(dir, { recursive: true, force: true });
  });
  const host = await f.connect(),
    room = await emit(host, "host");
  async function join(token) {
    const socket = await f.connect();
    const challenge = new Promise((r) => socket.once("web3.challenge", r));
    const identity = await emit(socket, "join", { code: room.code, token });
    return { socket, identity, challenge: await challenge };
  }
  return { f, web3, room, join, advance: (n) => (time += n) };
}
async function response(
  p,
  room,
  account = privateKeyToAccount(generatePrivateKey()),
) {
  return {
    address: account.address,
    signature: await account.signTypedData(
      bindData(p.challenge, { room: room.code, slot: p.identity.slot }),
    ),
  };
}
test("a phone binds once; only short addresses are public and no key/token enters the state", async (t) => {
  const s = await setup(t),
    p = await s.join(),
    data = await response(p, s.room);
  assert.equal((await emit(p.socket, "web3.bind", data)).ok, true);
  const room = s.f.party.rooms.get(s.room.code);
  assert.equal(
    room.players[0].address.toLowerCase(),
    data.address.toLowerCase(),
  );
  const json = JSON.stringify(s.f.party.view(room));
  assert.ok(!json.includes(data.address));
  assert.ok(!json.includes(p.identity.token));
  assert.ok(!json.includes(data.signature));
  assert.ok((await emit(p.socket, "web3.bind", data)).error);
});
test("wrong signature, wrong seat, unknown fields and per-seat rate limit are rejected", async (t) => {
  const s = await setup(t),
    a = await s.join(),
    b = await s.join(),
    data = await response(a, s.room);
  assert.ok((await emit(b.socket, "web3.bind", data)).error);
  assert.ok(
    (
      await emit(a.socket, "web3.bind", {
        ...data,
        address: privateKeyToAccount(generatePrivateKey()).address,
      })
    ).error,
  );
  assert.ok(
    (await emit(a.socket, "web3.bind", { ...data, admin: true })).error,
  );
  assert.equal((await emit(a.socket, "web3.bind", data)).ok, true);
  assert.match((await emit(a.socket, "web3.bind", data)).error, /Too many/);
});
test("expired nonce and a rotated seat token cannot reuse a prior signature", async (t) => {
  const s = await setup(t),
    a = await s.join(),
    data = await response(a, s.room);
  s.advance(60001);
  assert.match((await emit(a.socket, "web3.bind", data)).error, /expired/);
  a.socket.emit("leave");
  await wait(20);
  const b = await s.join();
  assert.equal(b.identity.slot, a.identity.slot);
  assert.ok((await emit(b.socket, "web3.bind", data)).error);
  assert.equal(
    (await emit(b.socket, "web3.bind", await response(b, s.room))).ok,
    true,
  );
});
test("a stolen response for another room cannot bind and reconnect cannot change a bound identity", async (t) => {
  const s = await setup(t),
    p = await s.join(),
    account = privateKeyToAccount(generatePrivateKey());
  assert.ok(
    (
      await emit(
        p.socket,
        "web3.bind",
        await response(p, { code: "AAAAAA" }, account),
      )
    ).error,
  );
  assert.equal(
    (await emit(p.socket, "web3.bind", await response(p, s.room, account))).ok,
    true,
  );
  const resumed = await s.join(p.identity.token);
  s.advance(60001);
  // Refresh a challenge after the budget window without rotating the seat token.
  const again = await s.join(p.identity.token);
  assert.match(
    (await emit(again.socket, "web3.bind", await response(again, s.room)))
      .error,
    /already has an identity/,
  );
  assert.equal(
    (
      await emit(
        again.socket,
        "web3.bind",
        await response(again, s.room, account),
      )
    ).ok,
    true,
  );
});
