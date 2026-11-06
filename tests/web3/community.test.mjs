import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createCommunity } from "../../server/web3/community.cjs";

async function fixture(t, extra = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "chonks-community-"));
  const accounts = [0, 1, 2].map(() =>
    privateKeyToAccount(generatePrivateKey()),
  );
  let time = 1_800_000_000_000;
  const room = {
    code: "CATS42",
    phase: "lobby",
    game: "star-catch",
    startedAt: time,
    roundId: 1,
    active: [0, 1],
    players: accounts.slice(0, 2).map((a, slot) => ({
      address: a.address,
      socket: `socket-${slot}`,
      name: `Player ${slot + 1}`,
    })),
  };
  const community = createCommunity({
    directory,
    rooms: () => [room],
    ensView: () => ({ party: { name: "cats.play.funcaster.eth" } }),
    now: () => time,
    ...extra,
  });
  const app = express();
  app.use("/api/web3", community.router);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await community.close();
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api/web3`;
  async function post(route, body) {
    const response = await fetch(base + route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  async function challenge(action, body = {}) {
    const result = await post("/community/challenge", { action, body });
    assert.equal(result.status, 200);
    return result.body;
  }
  async function submit(account, request, claimed = account.address) {
    return post("/community/action", {
      nonce: request.message.nonce,
      address: claimed,
      signature: await account.signTypedData(request),
    });
  }
  async function act(account, action, body = {}) {
    return submit(account, await challenge(action, body));
  }
  return {
    accounts,
    room,
    community,
    act,
    challenge,
    submit,
    advance: (ms) => {
      time += ms;
    },
    list: async () => (await fetch(base + "/community")).json(),
  };
}

test("signed challenge offer/take flow reveals its join URL only to the two peers", async (t) => {
  const f = await fixture(t),
    [owner, peer, outsider] = f.accounts;
  const offered = await f.act(owner, "offer");
  assert.equal(offered.status, 200);
  const id = offered.body.id;
  assert.equal(JSON.stringify(await f.list()).includes(f.room.code), false);
  assert.equal(
    (await f.act(owner, "offer")).status,
    400,
    "duplicate live offers are refused",
  );
  assert.match(
    (await f.act(owner, "take", { id })).body.error,
    /another player's/,
  );
  const accepted = await f.act(peer, "take", { id });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.join, "/controller?room=CATS42");
  assert.equal((await f.act(outsider, "take", { id })).status, 400);
  assert.equal((await f.act(outsider, "invite", { id })).status, 400);
  assert.equal((await f.act(owner, "invite", { id })).status, 200);
  assert.equal(JSON.stringify(await f.list()).includes(f.room.code), false);
});

test("Champion admission stays local until a matching real worker receipt; duplicate request does not enqueue twice", async (t) => {
  const jobs = [];
  let receipt;
  const f = await fixture(t, {
    championEnabled: true,
    championParent: "funcaster.eth",
    enqueue: async (job) => {
      jobs.push(job);
      return { ...job, id: "champion-job-1" };
    },
    readReceipt: async () => receipt,
  });
  const [owner] = f.accounts,
    proof = "c".repeat(64);
  await f.community.finish(f.room, {
    result: { hash: proof, verification: "verified", status: "completed" },
  });
  const saved = await f.act(owner, "handle", {
    handle: "my-chonk",
    backupConfirmed: true,
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.status, "pending");
  assert.equal(saved.body.name, undefined);
  assert.equal(jobs[0].payload.resultHash, proof);
  assert.equal(jobs[0].payload.recoveryAcknowledged, true);
  assert.equal(jobs[0].payload.address, owner.address.toLowerCase());
  assert.equal(JSON.stringify(jobs[0]).includes(f.room.code), false);
  await f.act(owner, "handle", { handle: "my-chonk", backupConfirmed: true });
  assert.equal(jobs.length, 1);
  assert.equal(
    (
      await f.act(owner, "handle", {
        handle: "different",
        backupConfirmed: true,
      })
    ).status,
    400,
  );
  receipt = {
    id: "champion-job-1",
    type: "ens.champion.claim",
    status: "done",
    tx: "0x" + "1".repeat(64),
    data: {
      ...jobs[0].payload,
      name: "my-chonk.players.funcaster.eth",
      registry: "0x" + "2".repeat(40),
      resolver: "0x" + "3".repeat(40),
      expiresAt: "1800000000",
      status: "ready",
      mode: "on",
      chainId: 11155111,
      chainVerified: false,
    },
  };
  const realReceipt = receipt;
  receipt = { ...realReceipt, mock: true };
  await f.community.acceptReceipt(receipt);
  assert.equal((await f.act(owner, "profile")).body.handle.status, "pending");
  receipt = {
    ...realReceipt,
    data: { ...realReceipt.data, name: "my-chonk.players.other.eth" },
  };
  assert.equal((await f.act(owner, "profile")).body.handle.status, "pending");
  receipt = realReceipt;
  assert.equal((await f.act(owner, "profile")).body.handle.status, "issued");
  assert.equal(
    (await f.act(owner, "profile")).body.handle.chainVerified,
    false,
  );
  assert.equal(
    (await f.act(owner, "profile")).body.handle.name,
    "my-chonk.players.funcaster.eth",
  );
});

test("community signatures bind the wallet and one-use request; expired offers and requests refuse access", async (t) => {
  const f = await fixture(t),
    [owner, peer] = f.accounts;
  const request = await f.challenge("offer");
  assert.equal((await f.submit(peer, request, owner.address)).status, 400);
  assert.equal(
    (await f.submit(owner, request)).status,
    400,
    "invalid submitted nonce is consumed",
  );
  const offered = await f.act(owner, "offer");
  assert.equal(offered.status, 200);
  const take = await f.challenge("take", { id: offered.body.id });
  f.advance(60_001);
  assert.equal((await f.submit(peer, take)).status, 400);
  f.advance(600_001);
  assert.match(
    (await f.act(peer, "take", { id: offered.body.id })).body.error,
    /expired/,
  );
  assert.equal((await f.list()).offers.length, 0);
  const profile = await f.challenge("profile");
  assert.equal((await f.submit(owner, profile)).status, 200);
  assert.equal((await f.submit(owner, profile)).status, 400);
});

test("local handle needs a completed verified result and explicit key-recovery acknowledgment", async (t) => {
  const f = await fixture(t),
    [owner, peer] = f.accounts;
  const save = (account, backupConfirmed) =>
    f.act(account, "handle", { handle: "my-chonk", backupConfirmed });
  assert.match((await save(owner, true)).body.error, /verified match/);
  await f.community.finish(f.room, {
    result: {
      hash: "a".repeat(64),
      verification: "verified",
      status: "abandoned",
    },
  });
  assert.match((await save(owner, true)).body.error, /verified match/);
  await f.community.finish(f.room, {
    result: {
      hash: "b".repeat(64),
      verification: "attested",
      status: "completed",
    },
  });
  assert.match((await save(owner, true)).body.error, /verified match/);
  await f.community.finish(f.room, {
    result: {
      hash: "c".repeat(64),
      verification: "verified",
      status: "completed",
    },
  });
  assert.match((await save(owner, false)).body.error, /Save this phone's key/);
  assert.match((await save(owner, "no")).body.error, /Save this phone's key/);
  const saved = await save(owner, true);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.status, "local");
  assert.match(saved.body.message, /not an ENS name/);
  assert.match((await save(peer, true)).body.error, /Taken/);
  assert.equal((await f.act(owner, "profile")).body.handle.handle, "my-chonk");
});
