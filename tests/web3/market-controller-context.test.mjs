import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const express = require("express");
const { createMarkets } = require("../../server/market/index.cjs");
const {
  fixture: partyFixture,
  emit,
  FakePhone,
  wait,
} = require("../party/harness.cjs");
const address = (n) => "0x" + n.toString(16).padStart(40, "0");
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(
      Date.now() < deadline,
      "Expected market transition did not complete",
    );
    await wait(5);
  }
}

async function fixture(t, { party = false } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "market-context-"));
  const markets = createMarkets({
    config: { PARTNERS: "mock", MARKETS: "mock", WEB3_DATA_DIR: dir },
    now: () => 100000,
  });
  const store = await markets.ready;
  let f;
  if (party) {
    f = await partyFixture(t, {
      arcade: true,
      web3: {
        view: () => ({}),
        bind() {},
        release() {},
        tick: (room) => markets.observe(room),
        startReason: (room) => markets.startReason(room),
        finish: (room, record) => markets.finish(room, record),
        end: (room) => markets.end(room),
        joined(_socket, membership) {
          if (membership.player)
            membership.player.address = address(membership.player.slot + 1);
        },
      },
    });
  }
  t.after(async () => {
    await markets.close();
    await rm(dir, { recursive: true, force: true });
  });
  const room = {
    game: "star-catch",
    setup: { mode: "multiplayer" },
    phase: "lobby",
    players: [0, 1].map((slot) => ({
      slot,
      token: "phone-" + slot,
      address: address(slot + 1),
      socket: "socket-" + slot,
      ready: true,
      name: "Player " + slot,
      color: "blue",
    })),
  };
  return { markets, store, room, party: f };
}

test("actual controller disconnect/rejoin and ready reset preserve the same market", async (t) => {
  const { markets, store, party: f } = await fixture(t, { party: true });
  const host = await f.connect(),
    identity = await emit(host, "host");
  const phones = [
    new FakePhone(f, identity.code),
    new FakePhone(f, identity.code),
  ];
  for (const phone of phones) {
    await phone.join();
    phone.ready();
  }
  await wait(30);
  const room = f.party.rooms.get(identity.code);
  const chosen = await markets.choose(room, { windowSeconds: 60 });
  const original = store.snapshot(chosen.marketId),
    token = phones[0].identity.token;
  phones[0].disconnect();
  await wait(30);
  assert.equal(room.players[0].socket, null);
  assert.equal(markets.view(room).marketId, chosen.marketId);
  assert.equal(markets.view(room).listed, true);
  assert.equal(store.snapshot(chosen.marketId).phase, "betting");
  await phones[0].join();
  assert.equal(phones[0].identity.token, token);
  assert.equal(room.players[0].ready, false);
  await wait(30);
  assert.equal(markets.view(room).marketId, chosen.marketId);
  phones[0].ready();
  await wait(30);
  room.players[0].name = "A new display name";
  room.players[0].nickname = "A nickname";
  room.players[0].color = "orange";
  markets.observe(room);
  await wait(20);
  assert.equal(markets.view(room).marketId, chosen.marketId);
  assert.deepEqual(store.snapshot(chosen.marketId).seats, original.seats);

  // Leaving revokes the assigned token; a replacement is a different player.
  phones[0].socket.emit("leave");
  await until(() => store.snapshot(chosen.marketId).phase === "void");
  assert.equal(markets.view(room).listed, false);
  assert.equal(store.snapshot(chosen.marketId).phase, "void");
  const replacement = new FakePhone(f, identity.code);
  await replacement.join();
  replacement.ready();
  await wait(20);
  assert.notEqual(replacement.identity.token, token);
  assert.equal(markets.view(room).listed, false);
});

for (const [name, change] of [
  [
    "assigned token",
    (r) => {
      r.players[0].token = "replacement";
    },
  ],
  [
    "assigned address",
    (r) => {
      r.players[0].address = address(99);
    },
  ],
  [
    "assigned slot",
    (r) => {
      r.players[0].slot = 2;
    },
  ],
  [
    "removed assignment",
    (r) => {
      r.players[0] = null;
    },
  ],
  [
    "game",
    (r) => {
      r.game = "bubble-burst";
    },
  ],
  [
    "setup",
    (r) => {
      r.setup.mode = "versus";
    },
  ],
])
  test(`${name} change still voids the frozen market`, async (t) => {
    const { markets, store, room } = await fixture(t);
    const { marketId } = await markets.choose(room);
    change(room);
    markets.observe(room);
    await until(() => store.snapshot(marketId).phase === "void");
    assert.equal(markets.view(room).listed, false);
    assert.equal(store.snapshot(marketId).phase, "void");
  });

test("opening a market still requires connected ready human players", async (t) => {
  const { markets, room } = await fixture(t);
  room.players[0].ready = false;
  await assert.rejects(markets.choose(room), /connected and ready/);
  room.players[0].ready = true;
  room.players[0].socket = null;
  await assert.rejects(markets.choose(room), /connected and ready/);
  room.players[0].socket = "connected";
  room.players.push({
    slot: 2,
    token: "pending-third",
    address: address(3),
    socket: "third",
    ready: false,
  });
  await assert.rejects(markets.choose(room), /connected and ready/);
  room.players.pop();
  assert.equal((await markets.choose(room)).listed, true);
});

test("assignment changes while market creation awaits storage still invalidate its original roster", async (t) => {
  const { markets, store, room } = await fixture(t);
  const create = store.create;
  store.create = async (input) => {
    const market = await create(input);
    room.players[0].token = "changed-during-create";
    return market;
  };
  const { marketId } = await markets.choose(room);
  markets.observe(room);
  await until(() => store.snapshot(marketId).phase === "void");
  assert.equal(markets.view(room).listed, false);
  assert.equal(store.snapshot(marketId).phase, "void");
});

test("GET storage failures are sanitized 503, while authorization and POST validation stay non-retryable", async (t) => {
  const { markets, store } = await fixture(t),
    app = express();
  app.use("/api/web3", markets.router);
  // Exercise the authenticated read handler without creating or signing an
  // identity. The public mount above still executes its real auth middleware.
  const personalRoute = markets.router.stack.find(
    (layer) => layer.route?.path === "/market/me",
  ).route;
  app.get(
    "/fixture-authenticated-me",
    (req, res, next) => {
      req.spectator = { address: address(1) };
      next();
    },
    ...personalRoute.stack.map((layer) => layer.handle),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const failure = "postgres://private-database/RPC-secret";
  const originalList = store.list;
  store.list = async () => {
    throw Error(failure);
  };
  store.personal = async () => {
    throw Error(failure);
  };
  for (const route of ["/api/web3/matches", "/fixture-authenticated-me"]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "Prediction data temporarily unavailable",
    });
  }
  store.list = originalList;
  assert.equal((await fetch(base + "/api/web3/matches")).status, 200);
  const denied = await fetch(base + "/api/web3/market/me", {
    headers: { Authorization: "Bearer invalid" },
  });
  assert.equal(denied.status, 401);
  assert.deepEqual(await denied.json(), {
    error: "Connect this phone to continue",
  });
  const invalid = await fetch(base + "/api/web3/market/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), {
    error: "Phone identity could not be verified",
  });
});
