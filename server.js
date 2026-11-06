"use strict";

/**
 * Funcaster — LAN relay server.
 *
 * Serves the clients and pipes messages between them:
 *   /                     → game launcher
 *   /controller           → phone controller (the "remote", shared by all games)
 *   /games/<slug>/        → a game's PC client
 *
 * The party namespace owns room state and server-simulated online rounds;
 * the legacy namespace retains its orientation relay for standalone games.
 */

const { exec } = require("child_process");
const express = require("express");
const compression = require("compression");
const BUILD_ID = require("./server/build.cjs").buildId(__dirname);
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const QRCode = require("qrcode");
const { Server } = require("socket.io");
const { attachParty } = require("./server/party.cjs");
const { ensureCert, localAddresses } = require("./scripts/gen-cert");

const PORT = Number(process.env.PORT) || 8443;
const FORCE_HTTP = process.env.HTTP === "1";
const GAMES_DIR = path.join(__dirname, "games");

const app = express();
app.set("trust proxy", "loopback");
app.disable("x-powered-by");
app.use(compression());
// Partners off does not import or instantiate the integration module.
const web3 =
  process.env.PARTNERS && process.env.PARTNERS !== "off"
    ? require("./server/web3/index.cjs").createWeb3()
    : null;
if (web3) {
  app.use("/api/web3", web3.router);
  app.use("/pot", web3.potRouter);
  app.use("/api/records", web3.recordsRouter);
  app.use("/api/commerce", web3.commerceRouter);
  process.once("exit", () => web3.close());
  let stoppingWeb3 = false;
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, async () => {
      if (stoppingWeb3) return;
      stoppingWeb3 = true;
      await web3.close();
      process.exit(0);
    });
}

app.use((_req, res, next) => {
  res.set("Referrer-Policy", "same-origin");
  res.set("X-Content-Type-Options", "nosniff");
  next();
});
app.get(["/build.js", "/core/build-id.js"], (_req, res) =>
  res
    .set("Cache-Control", "no-cache")
    .type("js")
    .send(`export const buildId=${JSON.stringify(BUILD_ID)};`),
);
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    buildId: BUILD_ID,
    version: require("./package.json").version,
  }),
);
app.get("/api/ready", async (_req,res)=> {
  try {
    const db=require("./integrations/storage/runtime.mjs").storageFor(process.env.WEB3_DATA_DIR || ".local/web3");
    if(process.env.RENDER && !db) return res.status(503).json({ok:false});
    if(db) await db.store.health();
    res.json({ok:true,storage:db?"postgres":"local",buildId:BUILD_ID});
  } catch {res.status(503).json({ok:false});}
});
// Source packs and extracted game artwork are never part of the public subset.
app.use(require("./server/public-assets.cjs").blockPrivateAssets);
app.get("/vendor/three/three.module.js", (_req, res) =>
  res.sendFile(
    require("path").join(
      __dirname,
      "node_modules/three/build/three.module.min.js",
    ),
  ),
);
app.get("/vendor/three/three.core.js", (_req, res) =>
  res.sendFile(
    require("path").join(
      __dirname,
      "node_modules/three/build/three.core.min.js",
    ),
  ),
);

app.use(
  "/community",
  require("./server/creator-gallery.cjs").creatorGallery(
    process.env.CREATOR_STORE ||
      path.join(__dirname, ".local", "creator-registry"),
  ),
);

// no-cache (NOT no-store): browsers must revalidate every file against its
// ETag on each load, so a plain reload after a git pull always runs current
// code — while unchanged files still come back as cheap 304s. Heuristic
// freshness on module scripts otherwise happily serves a stale game.js.
const NO_CACHE = { setHeaders: (res) => res.set("Cache-Control", "no-cache") };
require("./server/shell-routes.cjs").attachShellRoutes(app, __dirname);
app.use(
  express.static(path.join(__dirname, "public"), {
    extensions: ["html"],
    ...NO_CACHE,
  }),
);
app.use(
  "/games",
  express.static(GAMES_DIR, { extensions: ["html"], ...NO_CACHE }),
);
// The shared motion engine, imported directly by games as ES modules.
app.use("/sdk", express.static(path.join(__dirname, "sdk"), NO_CACHE));
app.use("/core", express.static(path.join(__dirname, "core"), NO_CACHE));
// Three.js straight from node_modules — no build step, no bundler.
app.use(
  "/vendor/three",
  express.static(path.join(__dirname, "node_modules", "three", "build")),
);
app.use(
  "/vendor/three-examples",
  express.static(
    path.join(__dirname, "node_modules", "three", "examples", "jsm"),
  ),
);
app.use("/assets", express.static(path.join(__dirname, "assets"), NO_CACHE));
// Optional audio overrides. Gitignored: nothing copyrighted ships by default.
app.use(
  "/audio",
  express.static(path.join(__dirname, "audio"), { fallthrough: true }),
);

/**
 * Discover games from disk rather than a hardcoded list: a game is any folder
 * under games/ with an index.html. Dropping in a new folder is the whole
 * install step.
 *
 * game.json may set `hidden: true` to keep a game off the menu (still
 * reachable by URL) and `order` (lower first) to pin its menu position;
 * unordered games follow alphabetically.
 */
function listGames() {
  let entries;
  try {
    entries = fs.readdirSync(GAMES_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter(
      (e) =>
        e.isDirectory() &&
        fs.existsSync(path.join(GAMES_DIR, e.name, "index.html")),
    )
    .map((e) => {
      const meta = { title: e.name, tagline: "", emoji: "🎮" };
      try {
        Object.assign(
          meta,
          JSON.parse(
            fs.readFileSync(path.join(GAMES_DIR, e.name, "game.json"), "utf8"),
          ),
        );
      } catch {
        /* game.json is optional */
      }
      return { slug: e.name, url: `/games/${e.name}/`, ...meta };
    })
    .filter((g) => !g.hidden)
    .sort(
      (a, b) =>
        (a.order ?? 99) - (b.order ?? 99) || a.title.localeCompare(b.title),
    );
}

app.get("/api/games", (_req, res) => res.json(listGames()));

/**
 * A fresh id per server run. Clients tie their saved calibration to it, so
 * calibration happens once when you `npm start` and is then inherited by every
 * page for the life of that run — restart the server and you calibrate again.
 */
const BOOT_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
app.get("/api/session", (_req, res) => res.json({ bootId: BOOT_ID }));

const tls = FORCE_HTTP ? null : ensureCert();
const server = tls ? https.createServer(tls, app) : http.createServer(app);
const scheme = tls ? "https" : "http";

const addresses = localAddresses();
if (process.env.LAN_IP && !addresses.includes(process.env.LAN_IP))
  throw Error(
    "LAN_IP must be one of this computer’s active IPv4 addresses: " +
      addresses.join(", "),
  );
const lanIp = process.env.LAN_IP || addresses[0] || "localhost";
const controllerUrl = `${scheme}://${lanIp}:${PORT}/classic-controller`;

function inviteOrigin(req) {
  const local = ["localhost", "127.0.0.1", "::1"].includes(req.hostname);
  const raw =
    process.env.PUBLIC_ORIGIN ||
    (local
      ? `${scheme}://${lanIp}:${PORT}`
      : `${req.protocol}://${req.get("host")}`);
  const origin = new URL(raw);
  if (
    !["https:", "http:"].includes(origin.protocol) ||
    origin.host.length > 260
  )
    throw new Error("Invalid public origin");
  return origin.origin;
}

// The PC client fetches this to render a scannable join code.
app.get("/api/pairing", async (req, res) => {
  try {
    const url = `${inviteOrigin(req)}/classic-controller`;
    const qr = await QRCode.toDataURL(url, {
      margin: 1,
      width: 320,
      color: { dark: "#0b0e14", light: "#ffffff" },
    });
    res.json({ url, qr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const io = new Server(server, {
  // Orientation samples are tiny and constant; skip the polling handshake.
  transports: ["websocket", "polling"],
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 300000,
  cors: { origin: true },
  allowRequest: (req, done) => {
    const origin = req.headers.origin;
    if (!origin) return done(null, true);
    try {
      done(
        null,
        new URL(origin).host === req.headers.host ||
          origin === process.env.PUBLIC_ORIGIN,
      );
    } catch {
      done(null, false);
    }
  },
});

const { createEventStore } = require("./server/event-store.cjs");
const eventStore = createEventStore(
  process.env.EVENT_STORE || path.join(__dirname, ".local", "event-stats.json"),
);
process.once("exit", () => eventStore.close());
web3?.namespace?.(io);
const party = attachParty(io, {
  web3,
  buildId: BUILD_ID,
  persist: (event) => eventStore.record(event),
  eventStats: () => eventStore.snapshot(),
  remoteViews: process.env.CHONKS_REMOTE_VIEWS === "1",
});
app.get("/api/party/pairing/:code", async (req, res) => {
  if (!party.rooms.has(req.params.code))
    return res.status(404).json({ error: "Party not found" });
  try {
    const origin = inviteOrigin(req);
    const screen = String(req.query.screen || "");
    const remote = party.rooms.get(req.params.code).remote;
    if (screen && (!remote?.enabled || !remote.records.has(screen)))
      return res.status(400).json({ error: "Pairing screen unavailable" });
    const url = `${origin}/controller?room=${req.params.code}${screen ? "&screen=" + encodeURIComponent(screen) : ""}`;
    const qr = await QRCode.toDataURL(url, {
      margin: 2,
      width: 400,
      errorCorrectionLevel: "M",
      color: { dark: "#241e3b", light: "#ffffff" },
    });
    res.json({
      url,
      qr,
      trusted:
        origin.startsWith("https://") &&
        !/^https:\/\/(localhost|127\.|192\.168\.|10\.)/.test(origin),
    });
  } catch {
    res.status(400).json({ error: "The invite address is unavailable." });
  }
});

/** socket.id → 'game' | 'controller' */
const roles = new Map();

function countOf(role) {
  let n = 0;
  for (const r of roles.values()) if (r === role) n += 1;
  return n;
}

/**
 * Player slots. Only slot 0 is used today, but tagging every packet with its
 * slot from the start means adding a second phone later is a feature, not a
 * protocol migration.
 */
const MAX_PLAYERS = 4;
const slots = new Array(MAX_PLAYERS).fill(null); // index → socket.id

function assignSlot(socketId) {
  const free = slots.indexOf(null);
  if (free === -1) return -1;
  slots[free] = socketId;
  return free;
}

function releaseSlot(socketId) {
  const i = slots.indexOf(socketId);
  if (i !== -1) slots[i] = null;
}

const slotOf = (socketId) => slots.indexOf(socketId);

function broadcastPresence() {
  io.emit("presence", {
    game: countOf("game"),
    controller: countOf("controller"),
    slots: slots.map((id, i) => ({ slot: i, occupied: id !== null })),
  });
}

io.on("connection", (socket) => {
  socket.on("register", (role) => {
    if (role !== "game" && role !== "controller") return;
    roles.set(socket.id, role);
    socket.join(role);

    if (role === "controller") {
      const slot = assignSlot(socket.id);
      if (slot === -1) {
        socket.emit("slot-denied", {
          reason: "all player slots full",
          max: MAX_PLAYERS,
        });
        console.log(
          `[io] controller rejected — ${MAX_PLAYERS} slots full (${socket.id})`,
        );
        return;
      }
      socket.emit("slot", { slot });
      console.log(
        `[io] controller connected as player ${slot + 1} (${socket.id})`,
      );
    } else {
      console.log(`[io] game connected (${socket.id})`);
    }
    broadcastPresence();
  });

  // Latency probe. Echoed straight back so the game can measure a true round
  // trip — a one-way timestamp would need synchronised clocks across devices.
  socket.on("ping-probe", (data) =>
    socket.to("controller").emit("ping-probe", data),
  );
  socket.on("pong-probe", (data) => socket.to("game").emit("pong-probe", data));

  // Phone → PC.
  //
  // NOT volatile. Socket.IO discards volatile packets whenever the transport
  // reports itself unwritable, which on the long-polling transport is most of
  // the time — so a connection that falls back to polling (easy to trigger with
  // a self-signed cert) drops effectively the entire orientation stream while
  // ordinary emits still get through. That failure is invisible: the phone
  // connects, commands work, and the blade simply never moves. The payload is
  // ~100 bytes at 60Hz; the rate cap on the sender is the real backpressure.
  socket.on("orientation", (data) => {
    socket.to("game").emit("orientation", { ...data, slot: slotOf(socket.id) });
  });

  socket.on("motion", (data) => {
    socket.to("game").emit("motion", { ...data, slot: slotOf(socket.id) });
  });

  // Phone → PC control actions: calibrate, start, pause, sensitivity nudges.
  socket.on("command", (data) => {
    socket.to("game").emit("command", { ...data, slot: slotOf(socket.id) });
  });

  // PC → phone feedback: hits (haptics), score, game state.
  //
  // A message with a `slot` goes to that one phone only — e.g. a multiplayer
  // slice should buzz the hand that swung it, not every hand in the lobby.
  // Anything without a slot broadcasts to every controller, unchanged from
  // before slots existed — every existing single-player game's feedback
  // calls omit it, so this is purely additive.
  socket.on("feedback", (data) => {
    if (typeof data.slot === "number" && slots[data.slot]) {
      io.to(slots[data.slot]).emit("feedback", data);
    } else {
      socket.to("controller").emit("feedback", data);
    }
  });

  socket.on("disconnect", () => {
    const role = roles.get(socket.id);
    roles.delete(socket.id);
    releaseSlot(socket.id);
    if (role) console.log(`[io] ${role} disconnected (${socket.id})`);
    broadcastPresence();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const line = "─".repeat(52);
  console.log(`\n${line}`);
  console.log("  🕹  Funcaster — your phone is the controller");
  console.log(line);
  console.log(`  Launcher      ${scheme}://localhost:${PORT}/`);
  console.log("  Party remote  Scan the QR on the launcher");
  console.log(`  Classic remote  ${controllerUrl}`);
  const games = listGames();
  console.log(`\n  ${games.length} game${games.length === 1 ? "" : "s"}:`);
  for (const g of games) console.log(`    ${g.emoji}  ${g.title}  →  ${g.url}`);
  if (!tls) {
    console.log("\n  ⚠  Running plain HTTP. Phone sensors will NOT work off");
    console.log(
      "     localhost — browsers gate the IMU behind a secure context.",
    );
  } else {
    console.log("\n  ⚠  Self-signed cert: the phone will show a warning once.");
    console.log("     Tap Advanced → Proceed. Sensors need HTTPS to unlock.");
  }

  // One command, whole console: npm start also opens the TV browser — its
  // own Chrome profile so the autoplay flag genuinely applies (handing the
  // URL to an already-running Chrome silently drops process flags).
  // HTTP dev mode and NO_OPEN=1 skip this.
  if (tls && !process.env.NO_OPEN) {
    require("./scripts/open-browser.cjs").openBrowser(
      `https://localhost:${PORT}/`,
    );
    console.log("\n  📺 Opening the console. Skip with NO_OPEN=1 npm start.");
  }
  if (addresses.length > 1)
    console.log(
      `  LAN adapters: ${addresses.join(", ")}. Set LAN_IP to choose one.`,
    );
  console.log(`${line}\n`);
});
