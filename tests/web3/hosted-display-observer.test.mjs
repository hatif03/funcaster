import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Server } from "socket.io";
import { createHostedDisplayObserver } from "../../scripts/hosted-display-observer.mjs";

async function fixture(t, options = {}) {
  const server = createServer(),
    io = new Server(server),
    events = [];
  const identity = { code: "CATS42", displayToken: "fixture-display-only" };
  let connection,
    named = 1,
    expired = false;
  io.of("/party").on("connection", (socket) => {
    connection = socket;
    socket.onAny((event, data) => events.push({ event, data }));
    socket.on("display", (data, ack) => {
      if (expired) return ack({ error: "Display invite expired." });
      assert.deepEqual(data, {
        code: identity.code,
        token: identity.displayToken,
        buildId: "fixture-build",
      });
      ack({ ok: true });
      socket.emit("state", { named });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const observer = createHostedDisplayObserver({
    base: `http://127.0.0.1:${server.address().port}`,
    identity,
    buildId: "fixture-build",
    reconnectDelay: 20,
    ...options,
  });
  t.after(async () => {
    observer.close();
    await new Promise((resolve) => io.close(resolve));
  });
  await observer.ready();
  return {
    observer,
    events,
    setNamed(value) {
      named = value;
    },
    expire() {
      expired = true;
    },
    async drop() {
      const disconnected = once(observer.socket, "disconnect");
      connection.conn.close();
      await disconnected;
    },
    closeByServer() {
      connection.disconnect(true);
    },
  };
}

test(
  "a dropped display discards pending state and reauthenticates read-only to receive both ready seats",
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t);
    assert.deepEqual(f.observer.getState(), { named: 1 });
    const oldId = f.observer.socket.id;
    await f.drop();
    assert.equal(f.observer.getState(), undefined);
    f.setNamed(2);
    await f.observer.ready();
    assert.notEqual(f.observer.socket.id, oldId);
    assert.deepEqual(f.observer.getState(), { named: 2 });
    assert.deepEqual(
      f.events.map((entry) => entry.event),
      ["display", "display"],
    );
    assert.deepEqual(f.events[1].data, f.events[0].data);
  },
);

test(
  "a stale ready snapshot cannot pass and is refreshed using display membership only",
  { timeout: 10000 },
  async (t) => {
    let clock = 100000;
    const f = await fixture(t, { now: () => clock });
    clock += 15001;
    assert.equal(f.observer.getState(), undefined);
    f.setNamed(2);
    f.observer.assertHealthy();
    await f.observer.ready();
    assert.deepEqual(f.observer.getState(), { named: 2 });
    assert.deepEqual(
      f.events.map((entry) => entry.event),
      ["display", "display"],
    );
  },
);

test(
  "an expired invite on reconnect stops without creating or joining another table",
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t);
    f.expire();
    await f.drop();
    await assert.rejects(
      f.observer.ready(),
      (error) => error.expiredTable === true,
    );
    assert.equal(f.observer.getState(), undefined);
    assert.equal(f.observer.socket.active, false);
    assert.deepEqual(
      f.events.map((entry) => entry.event),
      ["display", "display"],
    );
  },
);

test(
  "recovery has a bounded deadline instead of waiting on stale ENS status",
  { timeout: 10000 },
  async (t) => {
    let clock = 100000;
    const f = await fixture(t, { now: () => clock, reconnectDelay: 1000 });
    await f.drop();
    clock += 180001;
    assert.throws(
      () => f.observer.assertHealthy(),
      /could not reconnect within three minutes/,
    );
    assert.equal(f.observer.getState(), undefined);
    assert.equal(f.observer.socket.active, false);
    assert.deepEqual(
      f.events.map((entry) => entry.event),
      ["display"],
    );
  },
);

test(
  "explicit server closure stops rather than restoring host or phone authority",
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t);
    const disconnected = once(f.observer.socket, "disconnect");
    f.closeByServer();
    await disconnected;
    assert.throws(() => f.observer.assertHealthy(), /closed by the server/);
    assert.equal(f.observer.getState(), undefined);
    assert.equal(f.observer.socket.active, false);
  },
);
