// Integration smoke for the actual compiled console through the relay's router.
// Build with no VITE_CHONKS_POT_ADDRESS: this test must never find a deployment.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import express from "express";
import { createRequire } from "node:module";
import { chromium } from "playwright";
const require = createRequire(import.meta.url);
const { createRouter } = require("../../server/web3/router.cjs");
const { potRouter } = createRouter({
  config: { PARTNERS: "mock" },
  root: process.cwd(),
});
const app = express();
app.use("/pot", potRouter);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}/pot/`;
const browser = await chromium.launch({ headless: true });
const cases = [];
try {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1280, 720],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [],
      external = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).hostname !== "127.0.0.1") {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    for (const [query, id] of [
      [`?pot=0x${"33".repeat(32)}`, "pot-unconfigured"],
      ["?view=create", "create-unconfigured"],
      ["?view=about", "about-page"],
    ]) {
      const response = await page.goto(base + query);
      assert.equal(response.status(), 200);
      await page.getByTestId(id).waitFor();
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      cases.push({ width, height, id, status: "PASS" });
    }
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
await fs.writeFile(
  "docs/web3/spikes/g1-arc-pot-dist.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      scope:
        "Actual unconfigured production dist served through relay router, Chromium, external requests forbidden",
      cases,
    },
    null,
    2,
  ) + "\n",
);
console.log(`PASS ${cases.length} compiled-console route/browser cases`);
