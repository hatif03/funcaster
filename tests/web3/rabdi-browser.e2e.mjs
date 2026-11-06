// Real-browser SDK/CORS probe, separate from the unfinished product Hall.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { chromium } from "playwright";
const root = new URL("../../", import.meta.url);
const built = await build({
  entryPoints: [
    new URL("scripts/spikes/rabdi/browser-reader.mjs", root).pathname,
  ],
  bundle: true,
  minify: true,
  platform: "browser",
  format: "iife",
  write: false,
  target: "es2022",
});
const bundle = built.outputFiles[0].contents;
const server = http.createServer((req, res) => {
  if (req.url === "/reader.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle);
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><meta name="viewport" content="width=device-width"><title>K0 public read probe</title><script src="/reader.js"></script><main>Rabdi anonymous read probe</main>',
    );
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const report = {
  at: new Date().toISOString(),
  scope:
    "Local-origin real Chromium anonymous Rabdi read; no signing; not the final Hall",
  bundle: { bytes: bundle.byteLength, gzipBytes: gzipSync(bundle).byteLength },
  samples: [],
};
try {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 1280, height: 720 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [],
      methods = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.url().includes("rpc.rabdi.")) {
        const q = r.postDataJSON();
        for (const item of Array.isArray(q) ? q : [q])
          methods.push(item.method);
      }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const observed = await page.evaluate(() => window.readPublic());
    assert(observed.count > 0, "Funded synthetic rows should be visible");
    assert.deepEqual(errors, []);
    assert(methods.every((m) => ["eth_chainId", "arkiv_query"].includes(m)));
    report.samples.push({
      viewport,
      ...observed,
      methods,
      status: "PASS-READ",
    });
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
await fs.writeFile(
  new URL("docs/web3/spikes/rabdi-browser.json", root),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
