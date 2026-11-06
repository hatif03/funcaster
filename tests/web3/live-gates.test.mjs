import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createWeb3 } from "../../server/web3/index.cjs";
import { loadConfig } from "../../integrations/shared/config.mjs";

test("host-selected creator version gates bound seats and expired demo; normal free games remain unchanged", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-live-gates-"));
  let time = Date.now();
  const config = loadConfig({
    PARTNERS: "mock",
    COMMERCE: "mock",
    MARKETS: "mock",
    WEB3_DATA_DIR: dir,
  });
  const web3 = createWeb3({ config, now: () => time });
  const app = express();
  app.use("/commerce", web3.commerceRouter);
  const server = await new Promise((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await web3.close();
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/commerce`;
  const creator = privateKeyToAccount(generatePrivateKey()),
    player = privateKeyToAccount(generatePrivateKey());
  async function post(endpoint, body) {
    const r = await fetch(base + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const answer = await r.json();
    assert.ok(r.ok, JSON.stringify(answer));
    return answer;
  }
  async function execute(actor, action, payload) {
    const c = await post("/challenge", {
      action,
      payload,
      address: actor.address,
    });
    return post("/execute", {
      nonce: c.nonce,
      signature: await actor.signTypedData(c.typedData),
    });
  }
  const version = await execute(creator, "register", {
    gameId: "star-catch",
    version: "1.0.0",
    creator: creator.address,
    price: "1000000",
    collaborators: [{ address: creator.address, bps: 10000 }],
    referralBps: 1000,
  });
  const room = {
    code: "ABCDEF",
    phase: "lobby",
    game: "star-catch",
    setup: { mode: "versus" },
    players: [
      {
        slot: 0,
        address: player.address,
        ready: true,
        socket: "phone",
        token: "private-seat",
      },
    ],
    active: [0],
  };
  assert.equal(web3.startReason(room), null);
  assert.equal((await web3.commerce(room, { versionId: version.id })).ok, true);
  assert.match(web3.startReason(room), /needs a free demo/);
  await execute(player, "demo", { versionId: version.id, roomCode: room.code });
  assert.equal(web3.startReason(room), null);
  room.phase = "playing";
  time += 120001;
  assert.match(web3.stopReason(room), /demo ended/);
  room.phase = "lobby";
  await execute(player, "pay", {
    versionId: version.id,
    roomCode: room.code,
    paymentId: "basic-pass-1",
  });
  assert.equal(web3.startReason(room), null);
  room.players[0].address = creator.address;
  assert.equal(
    web3.startReason(room),
    null,
    "One payer unlocks this room for the other bound players",
  );
  room.code = "UVWXYZ";
  assert.match(
    web3.startReason(room),
    /needs a free demo/,
    "A room pass cannot unlock a different room",
  );
  room.code = "ABCDEF";
  assert.equal(web3.startReason(room), null);
  time += 86400001;
  assert.match(web3.startReason(room), /needs a free demo/);
  room.phase = "playing";
  assert.match(
    web3.stopReason(room),
    /demo ended/,
    "Expired access closes the active-round gate",
  );
  room.phase = "lobby";
  await web3.commerce(room, { versionId: null });
  assert.equal(web3.startReason(room), null);
});
