// Run against an isolated PARTNERS=mock relay + mock worker. Never uses keys/env files.
// CHONKS_ARC_E2E_URL=http://127.0.0.1:8794 node tests/web3/arc-phone.e2e.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { io } from "socket.io-client";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.CHONKS_ARC_E2E_URL || "http://127.0.0.1:8794";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
  throw Error("Loopback MOCK server required");
const output =
  process.env.CHONKS_ARC_EVIDENCE || "/tmp/chonks-a56-browser-evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true }),
  errors = [],
  screens = [];
let observer, state;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await wait(100);
  }
  throw Error(
    `Timed out; phase=${state?.phase}; stakes=${state?.web3?.stakes?.status}; notice=${state?.web3?.stakes?.notice}`,
  );
}
const emit = (socket, event, data) =>
  new Promise((resolve, reject) =>
    socket
      .timeout(10000)
      .emit(event, data, (error, answer) =>
        error ? reject(error) : resolve(answer),
      ),
  );
async function screen(page, name) {
  await page.screenshot({ path: `${output}/${name}.png` });
  screens.push(name);
}
try {
  const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/?shell=os`);
  await page.waitForFunction(() => sessionStorage.getItem("chonks.host"));
  const identity = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("chonks.host")),
  );
  const health = await (await fetch(`${base}/api/health`)).json();
  observer = io(`${base}/party`, { transports: ["websocket"] });
  await new Promise((r) => observer.once("connect", r));
  observer.on("state", (v) => (state = v));
  assert.ok(
    (
      await emit(observer, "display", {
        code: identity.code,
        token: identity.displayToken,
        buildId: health.buildId,
      })
    ).ok,
  );
  await until(() => state?.web3?.mode === "mock");
  const phones = [];
  for (const width of [320, 390]) {
    const c = await browser.newContext({
        viewport: { width, height: width === 320 ? 568 : 844 },
        isMobile: true,
        hasTouch: true,
      }),
      p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${base}/controller?room=${identity.code}`);
    await p.locator("#touch-mode").click({ timeout: 20000 });
    phones.push(p);
  }
  await until(
    () =>
      state.players.filter((p) => p.ready).length === 2 &&
      state.web3.seats.filter((p) => p.named).length === 2,
    30000,
  );
  for (let i = 0; i < 15; i++) {
    for (const b of await page
      .locator(
        '[data-id="show-desktop"], [data-id="who-continue"], [data-id="continue-desktop"]',
      )
      .all())
      if (await b.isVisible()) await b.click();
    if (
      (await page.locator('[data-id="game-star-catch"]').isVisible()) &&
      !(await page
        .locator('[data-window="welcome"]')
        .isVisible()
        .catch(() => false))
    )
      break;
    await page.keyboard.press("Space");
    await wait(300);
  }
  await page.locator('[data-id="game-star-catch"]').click();
  await page.locator('[data-id="gp-tab-rules"]').click();
  await screen(page, "desktop-stakes");
  await page.locator('[data-id="gp-stakes"]').click();
  for (let i = 0; i < phones.length; i++) {
    const p = phones[i];
    await p.locator("#terms[open]").waitFor({ timeout: 30000 });
    assert.match(await p.locator("#terms").innerText(), /0.50 play-USDC/);
    const overflow = await p.locator("#terms").evaluate((el) => ({
      width: el.scrollWidth,
      client: el.clientWidth,
      rect: el.getBoundingClientRect().toJSON(),
      vw: innerWidth,
      vh: innerHeight,
    }));
    assert.ok(overflow.width <= overflow.client + 1);
    assert.ok(overflow.rect.right <= overflow.vw);
    assert.ok(overflow.rect.bottom <= overflow.vh);
    await screen(p, `phone-${i}-terms`);
    if (i === 0) {
      await p.evaluate(async () => {
        if (document.fullscreenElement) await document.exitFullscreen();
      });
      await p.setViewportSize({ width: 844, height: 390 });
      await screen(p, "phone-landscape-terms");
      const box = await p.locator("#terms").evaluate((el) => ({
        rect: el.getBoundingClientRect().toJSON(),
        width: el.scrollWidth,
        client: el.clientWidth,
      }));
      assert.ok(box.width <= box.client + 1 && box.rect.bottom <= 390);
      await p.setViewportSize({ width: 320, height: 568 });
    }
    await p.locator("#terms-accept").click();
  }
  await until(() => state.web3.stakes.status === "locked", 30000);
  console.log("PASS real phone signatures, both funded, start unlocked");
  await screen(page, "desktop-locked");
  await page.locator("#gp-start").click();
  await until(() => state.web3.stakes.status === "playing", 15000);
  await until(() => state.phase === "results", 120000);
  assert.equal(state.result.verification, "verified");
  for (const p of phones)
    await p
      .locator("#settle-dispute")
      .waitFor({ state: "visible", timeout: 10000 });
  await screen(phones[0], "phone-result");
  await until(
    () =>
      state.web3.stakes.status === "settled" &&
      state.web3.stakes.claimsComplete,
    30000,
  );
  await screen(page, "desktop-paid");
  await screen(phones[0], "phone-paid");
  assert.equal(state.web3.stakes.mock, true);
  assert.equal(state.web3.stakes.explorer, null);
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        mode: "MOCK",
        checks: [
          "phone consent at 320/390px",
          "confirmed funding start gate",
          "real game verified result",
          "five-second agreement",
          "cooperative settlement and both claims",
        ],
        screens,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS actual game → five-second agreement → settlement and both claims",
  );
} catch (error) {
  await writeFile(
    `${output}/failure.json`,
    JSON.stringify(
      {
        message: error.message,
        errors,
        state: { phase: state?.phase, stakes: state?.web3?.stakes },
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  observer?.disconnect();
  await browser.close();
}
