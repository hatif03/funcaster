// Deterministic relay harness: the production party module runs with a fixed clock,
// crypto entropy and manually advanced interval; no changes to game code.
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const { createRequire } = require("node:module");
const crypto = require("node:crypto");
const filename = path.resolve(__dirname, "../../server/party.cjs");
const nativeRequire = createRequire(filename);
function scriptedRoom({
  web3 = null,
  source = fs.readFileSync(filename, "utf8"),
} = {}) {
  let time = 100000,
    tick,
    sequence = 0,
    connection;
  const events = [],
    sockets = new Map(),
    snapshots = [];
  const ns = {
    sockets,
    on: (name, fn) => {
      if (name === "connection") connection = fn;
    },
    to(target) {
      return {
        excluded: null,
        except(id) {
          this.excluded = id;
          return this;
        },
        emit(name, payload) {
          events.push(name);
          for (const s of sockets.values())
            if (
              s.id !== this.excluded &&
              (s.id === target || s.rooms.has(target))
            )
              s.out.push({ name, payload });
        },
      };
    },
  };
  const io = { of: () => ns };
  const module = { exports: {} };
  const req = (name) =>
    name === "node:crypto"
      ? {
          ...crypto,
          randomInt: (max) => (max === 32 ? 0 : 123456),
          randomBytes: (n) => Buffer.alloc(n, ++sequence),
        }
      : nativeRequire(name);
  const factory = vm.runInThisContext(
    `(function(require,module,exports,__dirname,setInterval,clearInterval){${source}\n})`,
    { filename },
  );
  factory(
    req,
    module,
    module.exports,
    path.dirname(filename),
    (fn) => {
      tick = fn;
      return { unref() {} };
    },
    () => {},
  );
  const party = module.exports.attachParty(io, {
    now: () => time,
    buildId: "PARITY-BUILD",
    web3,
  });
  function connect() {
    const handlers = new Map();
    const s = {
      id: `socket-${sockets.size}`,
      data: {},
      out: [],
      rooms: new Set(),
      request: {
        headers: {},
        socket: { remoteAddress: "127.0.0.1" },
        connection: { remoteAddress: "127.0.0.1" },
      },
      handshake: { address: "127.0.0.1" },
      on(name, fn) {
        handlers.set(name, fn);
      },
      use() {},
      join(code) {
        this.rooms.add(code);
      },
      leave(code) {
        this.rooms.delete(code);
      },
      emit(name, payload) {
        events.push(name);
        this.out.push({ name, payload });
      },
      disconnect() {
        handlers.get("disconnect")?.();
        sockets.delete(this.id);
      },
      send(name, data = {}) {
        let result;
        handlers.get(name)?.(data, (r) => (result = r));
        return result;
      },
      handlers,
    };
    sockets.set(s.id, s);
    connection(s);
    return s;
  }
  const host = connect(),
    identity = host.send("host", { buildId: "PARITY-BUILD" }),
    room = party.rooms.get(identity.code);
  const capture = () =>
    snapshots.push(JSON.parse(JSON.stringify(party.view(room))));
  const advance = (ms) => {
    time += ms;
    tick();
  };
  capture();
  const phones = Array.from({ length: 4 }, () => {
    const s = connect();
    s.identity = s.send("join", {
      code: identity.code,
      buildId: "PARITY-BUILD",
    });
    return s;
  });
  capture();
  for (const s of phones) s.send("ready", { ready: true, mode: "touch" });
  advance(1);
  capture();
  advance(6001);
  capture();
  advance(3001);
  capture();
  for (let i = 0; i < 10; i++) {
    for (const [j, s] of phones.entries())
      s.send("input", { x: j / 4, y: -j / 4, seq: i + 1, pulse: false });
    advance(100);
  }
  advance(60001);
  capture();
  return {
    snapshots,
    eventNames: [...new Set(events)].sort(),
    result: JSON.parse(JSON.stringify(room.result)),
    room,
    party,
    host,
    phones,
    advance,
    connect,
    now: () => time,
  };
}
module.exports = { scriptedRoom };
