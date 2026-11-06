/** Full live flow, own server and browser: node tests/os/shell.e2e.mjs. */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import {
  browserFixture,
  until,
  sleep,
  writeReport,
} from "./browser-fixture.mjs";
const f = await browserFixture("shell"),
  report = {
    at: new Date().toISOString(),
    buildId: f.health.buildId,
    checks: [],
    phoneLayouts: [],
    errors: [],
    unverified: [
      "Real iPhone/Android motion permission, sensor rates and physical multitouch",
    ],
  };
const mark = (name, details = true) => {
  report.checks.push({ name, details });
  console.log(`PASS ${name}`);
};
try {
  const room = await f.createRoom(2),
    page = room.page;
  mark("Boot and two fake phones reach the live desktop");
  await room.openGame("mario-kart");
  const original = room.state.setup.laps || 1;
  await page.locator('[data-id="gp-tab-rules"]').click();
  await page.locator('[data-id="gp-mario-kart-laps-3"]').click();
  await until(() => room.state.setup.laps === 3, 3000, "debounced full setup");
  assert.equal(room.state.game, "mario-kart");
  await page.locator("#gp-cancel").click();
  await until(
    () => room.state.setup.laps === original,
    3000,
    "Cancel snapshot restoration",
  );
  mark("Properties changes one option and Cancel restores the opening setup");

  await room.startGame("shooting-range");
  const gameFrame = page
    .frames()
    .find((frame) => /\/games\/shooting-range\//.test(frame.url()));
  assert.ok(gameFrame);
  assert.equal(room.state.phase, "classic");
  assert.equal(
    page.frames().filter((frame) => /\/games\//.test(frame.url())).length,
    2,
  );
  mark("Two independent game frames register for the current round");
  await page.evaluate(() =>
    window.postMessage({ type: "chonks:home" }, location.origin),
  );
  await sleep(150);
  assert.equal(room.state.paused, false);
  mark(
    "A same-origin message from the parent instead of a game frame is ignored",
  );
  await gameFrame.locator("body").click({ position: { x: 10, y: 100 } });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Resume", exact: true })
    .waitFor({ state: "visible" });
  await until(() => room.state.paused, 3000, "pause state");
  assert.equal(room.state.phase, "classic");
  await page.screenshot({ path: resolve(f.output, "pause-menu.png") });
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await until(() => !room.state.paused);
  mark(
    "The game-owned Escape shortcut posts Home, opens Pause and Resume keeps the same round",
  );
  await gameFrame.locator("body").click({ position: { x: 10, y: 100 } });
  await page.keyboard.press("F10");
  await page.locator(".os-start-menu").waitFor({ state: "visible" });
  const beforeNav = await page.evaluate(
    () => document.activeElement?.dataset.id,
  );
  await page.keyboard.press("ArrowDown");
  const afterNav = await page.evaluate(
    () => document.activeElement?.dataset.id,
  );
  assert.notEqual(
    afterNav,
    beforeNav,
    "F10 menu receives D-pad/keyboard navigation above the live game",
  );
  await page.keyboard.press("Escape");
  await page.locator(".os-start-menu").waitFor({ state: "hidden" });
  mark(
    "F10 inside an owned iframe opens the shell menu, navigation moves focus and Escape closes it",
  );
  await room.command("lobby");
  await until(() => room.state.phase === "lobby");

  const phoneContext = await f.browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await phoneContext.newPage();
  phone.setDefaultTimeout(15000);
  await phone.goto(`${f.base}/controller?room=${room.identity.code}`);
  await phone.locator("#touch-mode").click();
  await until(
    () => room.state.players.filter((p) => p.ready && p.connected).length === 3,
    15000,
    "actual phone touch fallback ready",
  );
  await room.startGame("star-catch");
  assert.equal(
    await page
      .locator(".os-balloons")
      .evaluate((element) => element.childElementCount),
    0,
    "Queued join balloons are cleared for gameplay",
  );
  mark(
    "A browser phone joins using touch fallback and starts a server-rendered game without queued balloons",
  );
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
  ]) {
    await phone.setViewportSize({ width, height });
    await sleep(200);
    const layout = await phone.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      controls: [...document.querySelectorAll("#remote button")]
        .filter(
          (element) =>
            element.checkVisibility() &&
            element.getBoundingClientRect().width > 0,
        )
        .map((element) => {
          const r = element.getBoundingClientRect();
          return {
            id: element.id,
            label:
              element.getAttribute("aria-label") || element.textContent.trim(),
            caption: element.dataset.caption,
            disabled: element.disabled,
            rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          };
        }),
    }));
    assert.ok(
      layout.scrollWidth <= width + 1 && layout.scrollHeight <= height + 1,
      `phone outer overflow at ${width}x${height}`,
    );
    assert.ok(
      layout.controls.every((control) => control.label),
      "Every shown remote control has an accessible label",
    );
    const primary = layout.controls.find((control) => control.id === "btn-a");
    assert.ok(
      primary?.disabled && !primary.caption,
      "Motion-only Star Catch leaves A visibly idle",
    );
    assert.ok(
      layout.controls
        .filter((control) => !control.disabled && control.caption !== undefined)
        .every((control) => control.caption),
      "Every enabled mapped game control has a caption",
    );
    report.phoneLayouts.push(layout);
    await phone.screenshot({
      path: resolve(f.output, `phone-${width}x${height}.png`),
    });
  }
  mark(
    "Phone page stays locked without outer overflow at three portrait/landscape sizes, with labelled controls",
  );
  await until(() => room.state.phase === "playing", 15000, "arena countdown");
  assert.equal(
    await page
      .locator(".os-balloons")
      .evaluate((element) => element.childElementCount),
    0,
    "Active gameplay has no noncritical toast over the canvas",
  );
  await page.screenshot({ path: resolve(f.output, "arena-playing.png") });
  mark("Practice and countdown lead into a live arena round");
  console.log("WAIT natural arena round completion (up to 60 seconds)");
  await until(() => room.state.phase === "results", 70000, "natural results");
  await page.locator('[data-window="results"]').waitFor({ state: "visible" });
  await until(
    () => room.state.resultsHeld === true,
    5000,
    "focused results hold",
  );
  await sleep(13000);
  assert.equal(room.state.phase, "results");
  assert.equal(await page.locator(".os-result-rankings li").count(), 3);
  await page.screenshot({ path: resolve(f.output, "results-held.png") });
  mark(
    "A complete server round opens three rankings and stays focused beyond the legacy 12-second return",
  );
  const download = page.waitForEvent("download");
  await page.locator('[data-id="results-save"]').click();
  const file = await download;
  const path = resolve(f.output, "match-record.json");
  await file.saveAs(path);
  const record = JSON.parse(await readFile(path, "utf8"));
  assert.ok(record.result?.matchId || record.matchId || record.id);
  mark("Save record downloads the real completed round JSON");
  await page.locator('[data-id="results-options"]').click();
  await page
    .locator('[data-window="game-properties"]')
    .waitFor({ state: "visible" });
  assert.equal(room.state.game, "star-catch");
  await room.command("lobby");
  await page.locator("#gp-cancel").click();
  mark(
    "Change options returns to the same game's Properties and the party can return to desktop",
  );
  report.expectedAudioProbes = [...room.expectedAudioProbes];
  report.consoleWarnings = [...new Set(room.consoleWarnings)];
  report.errors.push(...room.errors);
  assert.deepEqual(room.errors, []);
  await phoneContext.close();
} catch (error) {
  report.errors.push(error.stack || error.message);
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeReport(f.output, report);
  await f.close();
}
