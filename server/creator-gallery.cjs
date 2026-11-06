"use strict";
const express = require("express"),
  { CreatorRegistry } = require("./creator-registry.cjs");
const fs = require("node:fs"),
  path = require("node:path");
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function creatorGallery(directory) {
  const router = express.Router(),
    cache = new Map();
  const store = () =>
    fs.existsSync(path.join(directory, "registry.json"))
      ? new CreatorRegistry(directory)
      : null;
  const shell = (title, body) =>
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)} · Funcaster</title><style>*{box-sizing:border-box}body{margin:0;background:#101b30;color:#fff2d7;font:18px/1.6 system-ui}header,main{padding:24px;max-width:1100px;margin:auto}a{color:#f7c600;text-underline-offset:4px;display:inline-block;min-height:48px;padding-block:10px}h1{font-size:clamp(30px,6vw,48px);line-height:1.15}h1,h2,p{overflow-wrap:anywhere}article{padding:20px;border:1px solid #45526b;border-radius:16px;margin:16px 0;background:#19283f}h1{margin:12px 0}small{color:#b9c7df}iframe{display:block;width:100%;height:78vh;border:0;background:#162132}</style><header><a href="/">Funcaster</a><h1>${escape(title)}</h1></header>${body}</html>`;
  router.use((_q, r, next) => {
    r.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'; form-action 'none'",
    });
    next();
  });
  router.get("/", (_q, r) => {
    try {
      const entries = store()?.catalog() || [];
      r.type("html").send(
        shell(
          "Community games",
          `<main><p>Reviewed creator games. Keyboard and pointer controls; games run in an isolated player.</p>${entries.length ? entries.map((g) => `<article><h2>${escape(g.title)}</h2><p>${escape(g.gameId)} · ${escape(g.version)}</p><a href="/community/play/${g.id}">Play game →</a><p><small>Casual results · ${escape(g.bundleHash.slice(0, 12))}</small></p></article>`).join("") : "<p>No games have been published yet.</p>"}</main>`,
        ),
      );
    } catch {
      r.status(503).send("Community catalog is temporarily unavailable.");
    }
  });
  router.get("/catalog", (_q, r) => {
    try {
      r.json({ schemaVersion: 1, games: store()?.catalog() || [] });
    } catch {
      r.status(503).json({ error: "Catalog unavailable" });
    }
  });
  router.get("/play/:id", (q, r) => {
    try {
      const g = store()
        ?.catalog()
        .find((g) => g.id === q.params.id);
      if (!g) return r.sendStatus(404);
      r.type("html").send(
        shell(
          g.title,
          `<main><p><a href="/community/">Back to community games</a> · ${escape(g.version)}</p><iframe title="${escape(g.title)}" sandbox="allow-scripts" src="/community/bundles/${g.id}/index.html"></iframe></main>`,
        ),
      );
    } catch {
      r.sendStatus(503);
    }
  });
  router.get("/bundles/:id/*", (q, r) => {
    try {
      const s = store(),
        g = s?.catalog().find((g) => g.id === q.params.id);
      if (!g) return r.sendStatus(404);
      let files = cache.get(g.id);
      if (!files) {
        const b = s.bundle(g.id);
        files = new Map(
          b.files.map((f) => [f.path, Buffer.from(f.data, "base64")]),
        );
        cache.set(g.id, files);
        while (cache.size > 3) cache.delete(cache.keys().next().value);
      }
      const name = q.params[0],
        data = files.get(name);
      if (!data) return r.sendStatus(404);
      // The source path is scoped to one immutable bundle. No sockets, room API,
      // parent access, service workers, nested frames, forms or top navigation.
      const origin = new URL(q.protocol + "://" + q.get("host")).origin,
        base = origin + "/community/bundles/" + g.id + "/";
      r.set({
        "Content-Security-Policy": `default-src 'none'; script-src 'unsafe-inline' ${base}; style-src 'unsafe-inline' ${base}; img-src data: blob: ${base}; font-src ${base}; media-src blob: ${base}; connect-src ${base}; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts`,
        "Access-Control-Allow-Origin": "*",
      });
      r.type(path.extname(name) || "application/octet-stream").send(data);
    } catch {
      r.status(503).send("This game failed its integrity check.");
    }
  });
  return router;
}
module.exports = { creatorGallery };
