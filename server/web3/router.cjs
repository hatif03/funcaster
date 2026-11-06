"use strict";
const express = require("express"),
  path = require("node:path"),
  fs = require("node:fs");
const { hash } = require("../records.cjs");
function createRouter({
  config,
  health,
  getResult,
  getPot,
  getEnsReads,
  getArcReads,
  now = Date.now,
  root = path.resolve(__dirname, "../.."),
}) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    });
    next();
  });
  router.use(express.json({ limit: "16kb" }));
  let activeReads = 0,
    starts = [];
  async function ensRead(req, res, method, input) {
    if (config.WEB3_ENS !== "on" || !getEnsReads)
      return res.status(503).json({
        error: "Table names are not available here. Use the party code.",
      });
    const name = input.name;
    if (
      typeof name !== "string" ||
      name.length > 253 ||
      !/^[a-z0-9.-]+$/i.test(name) ||
      (method === "history" &&
        (!/^0x[\da-f]{64}$/i.test(input.registrationTx || "") ||
          (input.cursor !== undefined && !/^\d{1,20}$/.test(input.cursor))))
    )
      return res
        .status(400)
        .json({ error: "Enter a valid table name and history reference." });
    starts = starts.filter((t) => now() - t < 60000);
    if (activeReads >= 4 || starts.length >= 30)
      return res
        .status(429)
        .json({ error: "Table lookup is busy. Try again shortly." });
    activeReads++;
    starts.push(now());
    try {
      const reads = await getEnsReads();
      const result = await reads[method](method === "join" ? name : input);
      res.json({
        ...result,
        ...(method === "history" ? { explorer: config.ENS_EXPLORER_URL } : {}),
      });
    } catch (error) {
      const invalid = [
        "INVALID_NAME",
        "INVALID_HISTORY",
        "INVALID_RECORD",
        "UNAVAILABLE_NAME",
        "EXPIRED",
        "OWNER_MISMATCH",
      ].includes(error.code);
      res.status(invalid ? 400 : 503).json({
        error:
          method === "join"
            ? "This table name could not be checked. Scan the QR or use its party code."
            : "Chain history is unavailable. Local records are still below.",
      });
    } finally {
      activeReads--;
    }
  }
  router.get("/ens/join", (req, res) =>
    ensRead(req, res, "join", { name: req.query.name }),
  );
  router.get("/ens/history", (req, res) =>
    ensRead(req, res, "history", {
      name: req.query.name,
      registrationTx: req.query.tx,
      cursor: req.query.cursor,
    }),
  );
  router.get("/health", (_req, res) =>
    res.json({
      mode: config.PARTNERS,
      tableNames: config.WEB3_ENS === "on",
      playMoney: true,
      version: require("../../package.json").version,
      ...health(),
    }),
  );
  router.get("/result/:hash", (req, res) => {
    if (!/^[\da-f]{64}$/.test(req.params.hash))
      return res.status(400).json({ error: "Invalid result hash." });
    const result = getResult(req.params.hash);
    if (!result)
      return res
        .status(404)
        .json({ error: "Result not found in this console." });
    const { hash: expected, ...core } = result;
    if (hash(core) !== expected)
      return res
        .status(503)
        .json({ error: "Stored result failed its hash check." });
    res.json({
      result,
      verified: result.verification === "verified",
      verificationScope: "game-replay",
      chainVerified: false,
      places: result.scores.map((s) => ({ slot: s.slot, rank: s.rank })),
    });
  });
  let activePotReads = 0,
    potStarts = [];
  router.get("/pot/:potId", async (req, res) => {
    if (!/^0x[\da-fA-F]{64}$/.test(req.params.potId))
      return res.status(400).json({ error: "Invalid pot ID." });
    if (config.PARTNERS !== "mock") {
      if (config.WEB3_ARC !== "on" || !getArcReads)
        return res
          .status(503)
          .json({ error: "Play-money pots are not available here." });
      potStarts = potStarts.filter((at) => now() - at < 60000);
      if (activePotReads >= 4 || potStarts.length >= 30)
        return res
          .status(429)
          .json({ error: "Pot lookup is busy. Try again shortly." });
      activePotReads++;
      potStarts.push(now());
      try {
        const reader = await getArcReads(),
          value = await reader.snapshot(req.params.potId, {
            allowMissing: true,
          });
        if (value.state === "None")
          return res
            .status(404)
            .json({ error: "Pot not found on this deployment." });
        const pot = JSON.parse(
          JSON.stringify(value, (_, v) =>
            typeof v === "bigint" ? String(v) : v,
          ),
        );
        return res.json({ mode: "on", playMoney: true, pot });
      } catch {
        return res.status(503).json({
          error: "Pot chain state could not be checked. Try again shortly.",
        });
      } finally {
        activePotReads--;
      }
    }
    const pot = getPot(req.params.potId);
    if (!pot) return res.status(404).json({ error: "MOCK pot not found." });
    res.json({ mode: "mock", playMoney: true, pot });
  });
  router.use((error, _req, res, next) => {
    if (error?.type === "entity.too.large")
      return res.status(413).json({ error: "Request body exceeds 16 KB." });
    if (error?.type === "entity.parse.failed")
      return res.status(400).json({ error: "Invalid JSON." });
    next(error);
  });
  const potRouter = express.Router(),
    dist = path.join(root, "integrations/arc/pot-console/dist");
  // Startup only. Never manufacture a Studio-built console or a deployment.
  if (fs.existsSync(path.join(dist, "index.html")))
    potRouter.use(express.static(dist, { dotfiles: "deny" }));
  else
    potRouter.use((_req, res) =>
      res.status(503).type("text").send("Pot console is not built yet."),
    );
  return { router, potRouter };
}
module.exports = { createRouter };
