// Compatibility-probe QA, separate from the future product Hall acceptance.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { chromium } from "playwright";
import { stringToHex } from "viem";
const root = new URL("../../", import.meta.url),
  at = (p) => new URL(p, root);
const built = await build({
  entryPoints: [at("scripts/spikes/rabdi/hall-browser.mjs").pathname],
  bundle: true,
  minify: true,
  platform: "browser",
  format: "iife",
  write: false,
  target: "es2022",
});
const bundle = built.outputFiles[0].contents,
  html = await fs.readFile(at("scripts/spikes/rabdi/hall.html"));
assert(
  gzipSync(bundle).length <= 120000,
  "Provisional G0 probe bundle ceiling: 120 KB gzip",
);
const worker = await build({
  entryPoints: [at("scripts/spikes/rabdi/cross-owner.mjs").pathname],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  target: "node22",
  packages: "bundle",
});
const foundation = await build({
  entryPoints: [at("scripts/web3-worker.mjs").pathname],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  target: "node22",
});
const server = http.createServer((req, res) => {
  if (req.url.split("?")[0] === "/hall.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle);
  } else if (req.url.startsWith("/?") || req.url === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end(html);
  } else {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
const owner = "0xE581E56c592Ab9D6d3D234168EE9a89032273c00";
const rows = Array.from({ length: 30 }, (_, i) => ({
  $creator: owner,
  $creationFlags: { readonly: true },
  project: { value: "chonks_g0" },
  game: { value: "synthetic" },
  ordinal: { value: i },
  score: { value: i },
  winner: { value: owner },
  payload: {
    value: stringToHex(
      JSON.stringify({ synthetic: true, ordinal: i, score: i, winner: owner }),
    ),
  },
}));
rows.push({
  ...rows[0],
  $creator: "0x" + "22".repeat(20),
  score: { value: 2147483647 },
});
rows.push({ ...rows[0], payload: { value: stringToHex("{}") } });
const report = {
  at: new Date().toISOString(),
  scope: "G0 compatibility Hall; real Chromium synthetic-state UI tests",
  bundles: {
    hallBytes: bundle.length,
    hallGzipBytes: gzipSync(bundle).length,
    compatibilityWorkerBytes: worker.outputFiles[0].contents.length,
    foundationWorkerBytes: foundation.outputFiles[0].contents.length,
  },
  budgetNote:
    "The plan sets 120 KB for the phone signer, but no numeric Hall budget. Hall size is measured here; product Hall will be measured again.",
  samples: [],
};
try {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    const page = await browser.newPage({ viewport }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.click("#refresh");
    await page
      .locator("#status")
      .filter({ hasText: "No completed test run" })
      .waitFor();
    for (const state of [
      { rows, stale: false },
      { rows, stale: true },
      { rows: [], stale: false },
    ]) {
      await page.evaluate((state) => window.g0Hall.render(state), state);
      assert.equal(
        await page.locator("#trusted").textContent(),
        String(state.rows.length ? 30 : 0),
      );
      assert.equal(
        await page.locator("#unverified").textContent(),
        String(state.rows.length ? 1 : 0),
      );
      assert.equal(
        await page.locator("#invalid").textContent(),
        String(state.rows.length ? 1 : 0),
      );
      assert.equal(
        await page.locator("#scores li").count(),
        state.rows.length ? 20 : 0,
      );
      const geometry = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        button: document.querySelector("button").getBoundingClientRect().height,
      }));
      assert.equal(geometry.overflow, false);
      assert(geometry.button >= 44);
    }
    await page.evaluate((rows) => window.g0Hall.render({ rows }), rows);
    await page.screenshot({
      path: at(`docs/web3/spikes/g0-hall-${viewport.width}.png`).pathname,
      fullPage: false,
    });
    // Deliberate RPC outage: a readable error replaces the progress message and keeps scores.
    await page.route("**/rpc.rabdi.**", (route) => route.abort());
    await page.evaluate(() => history.replaceState(null, "", "/?run=g0_1"));
    await page.click("#refresh");
    await page
      .locator("#status")
      .filter({ hasText: "Public network unavailable" })
      .waitFor();
    assert.equal(await page.locator("#scores li").count(), 20);
    assert.deepEqual(errors, []);
    report.samples.push({
      viewport,
      status: "PASS",
      states: [
        "missing run",
        "trusted/forged/malformed",
        "stale cache",
        "empty",
        "network error",
      ],
      horizontalOverflow: false,
    });
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
await fs.writeFile(
  at("docs/web3/spikes/g0-hall-browser.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
