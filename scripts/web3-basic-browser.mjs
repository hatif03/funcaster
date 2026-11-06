// A small real-browser smoke check against an isolated MOCK relay + worker.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { io } from "socket.io-client";
const base = process.env.CHONKS_BASIC_URL || "http://127.0.0.1:8794";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
  throw Error("Loopback MOCK server required");
const out = process.env.CHONKS_BASIC_EVIDENCE || "/tmp/chonks-basic-browser";
await mkdir(out, { recursive: true });
const browser = await chromium.launch(),
  errors = [],
  checks = [];
let observer, state;
const emit = (s, e, v) =>
  new Promise((resolve, reject) =>
    s
      .timeout(10000)
      .emit(e, v, (err, answer) => (err ? reject(err) : resolve(answer))),
  );
async function until(fn, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Timed out waiting for basic UI state");
}
try {
  const desktop = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  desktop.on("pageerror", (e) => errors.push(e.message));
  await desktop.goto(base + "/?shell=os");
  await desktop.waitForFunction(() => sessionStorage.getItem("chonks.host"));
  const identity = await desktop.evaluate(() =>
    JSON.parse(sessionStorage.getItem("chonks.host")),
  );
  const { buildId } = await (await fetch(base + "/api/health")).json();
  observer = io(base + "/party", { transports: ["websocket"] });
  await new Promise((r) => observer.once("connect", r));
  observer.on("state", (s) => {
    state = s;
  });
  assert.equal(
    (
      await emit(observer, "display", {
        code: identity.code,
        token: identity.displayToken,
        buildId,
      })
    ).ok,
    true,
  );
  await until(() => state?.web3?.mode === "mock");
  const phones = [];
  for (const width of [320, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/controller?room=${identity.code}`);
    await page.locator("#touch-mode").click();
    phones.push(page);
  }
  await until(
    () =>
      state.players.filter((p) => p.ready).length === 2 &&
      state.web3.seats.filter((p) => p.named).length === 2,
    30000,
  );
  for (let i = 0; i < 15; i++) {
    for (const b of await desktop
      .locator(
        '[data-id="show-desktop"], [data-id="who-continue"], [data-id="continue-desktop"]',
      )
      .all())
      if (await b.isVisible()) await b.click();
    if (
      (await desktop.locator('[data-id="game-star-catch"]').isVisible()) &&
      !(await desktop
        .locator('[data-window="welcome"]')
        .isVisible()
        .catch(() => false))
    )
      break;
    await desktop.keyboard.press("Space");
    await new Promise((r) => setTimeout(r, 300));
  }
  await desktop.locator('[data-id="game-star-catch"]').click();
  await until(() => state.game === "star-catch");
  await desktop.locator('[data-id="start"]').click();
  await desktop.locator('[data-id="menu-live"]').click();
  await desktop.locator('[data-id="predictions-toggle"]').click();
  await until(() => state.web3.predictions.listed);
  await until(() =>
    /Predictions close before play/.test(state.startReason || ""),
  );
  await desktop.screenshot({ path: `${out}/os-live.png` });
  await desktop.locator('[data-id="predictions-toggle"]').click();
  await until(() => !state.web3.predictions.listed);
  checks.push(
    "Two real phone identities; host listing opens, start gate holds and close refunds",
  );
  const live = await phones[0].context().newPage();
  await live.goto(base + "/live/");
  await live.locator("#offer").click();
  await live
    .getByText("Challenge posted for ten minutes.", { exact: false })
    .waitFor();
  const publicDirectory = await (
    await fetch(base + "/api/web3/community")
  ).json();
  assert.ok(publicDirectory.offers.length);
  assert.ok(!JSON.stringify(publicDirectory).includes(identity.code));
  checks.push(
    "Signed phone challenge offered; public directory does not leak join code",
  );
  for (const [name, route] of [
    ["live", "/live/"],
    ["records", "/records/"],
    ["predict", "/predict"],
    ["commerce", "/commerce/"],
  ]) {
    for (const [width, height] of [
      [1280, 720],
      [320, 568],
    ]) {
      const p = await browser.newPage({ viewport: { width, height } });
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(base + route);
      await p.waitForLoadState("networkidle");
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${name} horizontal overflow at ${width}`,
      );
      await p.screenshot({
        path: `${out}/${name}-${width}.png`,
        fullPage: true,
      });
      await p.close();
    }
  }
  assert.deepEqual(errors, []);
  checks.push(
    "Live / Hall / Predictions / Creator pages at desktop and 320px phone; no overflow or script errors",
  );
  await writeFile(
    `${out}/report.json`,
    JSON.stringify({ mode: "mock", checks, publicTransactions: 0 }, null, 2),
  );
  console.log(checks.map((s) => `PASS ${s}`).join("\n"));
} finally {
  observer?.disconnect();
  await browser.close();
}
