// Local-only creator demo acceptance. Never connects a worker or chain signer.
import express from "express";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  { createCommerce } = require("../server/commerce/index.cjs");
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "chonks-commerce-browser-"),
);
const liveFixture = process.argv.includes("--live-fixture"),
  cleanup = [];
const fixture = liveFixture
  ? (await import("../tests/web3/fixtures/commerce-chain.mjs")).fixture({
      after: (fn) => cleanup.push(fn),
    })
  : null;
const { router, service } = await createCommerce(
  fixture?.options || {
    directory,
    mode: "mock",
    platformAddress: "0x3333333333333333333333333333333333333333",
    firstPartyGames: [
      { id: "star-catcher", title: "Star Catch", bundleHash: "a".repeat(64) },
    ],
  },
);
const workerTimer = fixture
  ? setInterval(
      () =>
        void fixture
          .pump()
          .then(() => service.poll())
          .catch(() => {}),
      200,
    )
  : null;
const app = express();
app.use("/api/commerce", router);
app.use(express.static("public"));
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const browser = await chromium.launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const out = path.resolve(
  liveFixture
    ? ".local/commerce-browser-live-fixture"
    : ".local/commerce-browser",
);
fs.mkdirSync(out, { recursive: true });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/commerce/`);
  await page
    .getByText(
      liveFixture ? "Arc testnet · test USDC" : "MOCK · local simulation",
      { exact: true },
    )
    .waitFor();
  await page
    .getByRole("button", { name: "Publish a game", exact: true })
    .click();
  await page.getByRole("button", { name: "Publish with frozen split" }).click();
  await page
    .getByRole("heading", { name: "Star Catch", exact: true })
    .waitFor();
  const versionId = await page.evaluate(
    async () =>
      (await (await fetch("/api/commerce/catalog")).json()).versions[0].id,
  );
  await page.goto(
    `http://127.0.0.1:${server.address().port}/commerce/?commerceVersion=${versionId}&commerceRoom=ROOM01`,
  );
  await page.getByRole("button", { name: "Play free demo" }).click();
  await page.getByRole("link", { name: "Return to your controller" }).waitFor();
  await page
    .getByRole("button", {
      name: liveFixture ? "Get room pass" : "Simulate room pass",
    })
    .click();
  await page.locator(".split-receipt").waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Return to your controller" })
      .getAttribute("href"),
    "/controller?room=ROOM01",
  );
  await page.screenshot({
    path: path.join(out, "phone-shelf.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "My earnings", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#balance").textContent === "1",
  );
  await page.getByRole("button", { name: "Claim my earnings" }).click();
  await page.waitForFunction(
    () => document.querySelector("#balance").textContent === "0",
  );
  assert.equal(
    await page
      .locator("#activity")
      .textContent()
      .then((value) => value.includes("NaN")),
    false,
  );
  assert.equal(
    await page.getByRole("button", { name: "Claim my earnings" }).isDisabled(),
    true,
  );
  await page.screenshot({
    path: path.join(out, "phone-earnings.png"),
    fullPage: true,
  });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page
      .getByRole("button", { name: "Publish a game", exact: true })
      .click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `overflow ${viewport.width}`,
    );
    await page.screenshot({
      path: path.join(out, `publish-${viewport.width}.png`),
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS commerce browser (${liveFixture ? "live HTTP with isolated chain fixture; no public acceptance" : "MOCK"}): publish → free demo → room pass → split earnings → independent claim; 320/390/844/1280px without horizontal overflow.`,
  );
} finally {
  if (workerTimer) clearInterval(workerTimer);
  await browser.close();
  await new Promise((r) => server.close(r));
  await service.close?.();
  for (const fn of cleanup) await fn();
  fs.rmSync(directory, { recursive: true, force: true });
}
