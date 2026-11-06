/** Browser/phone gate for the opt-in foundation; no account or network-chain access. */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { browserFixture, until, sleep } from "./browser-fixture.mjs";
for (const mode of ["off", "mock"]) {
  const dir = await mkdtemp(path.join(tmpdir(), "chonks-web3-browser-"));
  const saved = {
    PARTNERS: process.env.PARTNERS,
    WEB3_DATA_DIR: process.env.WEB3_DATA_DIR,
  };
  process.env.PARTNERS = mode;
  process.env.WEB3_DATA_DIR = dir;
  let f;
  try {
    f = await browserFixture(`web3-${mode}`);
    const room = await f.createRoom(1);
    const context = await f.browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const phone = await context.newPage(),
      requests = [],
      errors = [];
    phone.on("request", (r) => requests.push(r.url()));
    phone.on("pageerror", (e) => errors.push(e.message));
    await phone.goto(`${f.base}/controller?room=${room.identity.code}`);
    await until(() => room.state.players.length === 2);
    if (mode === "mock")
      await until(
        () => room.state.web3.seats.some((s) => s.slot === 1 && s.addr),
        10000,
        "browser session binding",
      );
    await phone.locator("#touch-mode").click();
    await until(() => room.state.players.filter((p) => p.ready).length === 2);
    const hasKey = await phone.evaluate(
      () => !!localStorage.getItem("chonks.web3.key"),
    );
    assert.equal(hasKey, mode === "mock");
    assert.equal(
      requests.some((u) => u.includes("/web3/phone-signer.js")),
      mode === "mock",
    );
    const layouts = [];
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [844, 390],
    ]) {
      await phone.setViewportSize({ width, height });
      await sleep(150);
      const layout = await phone.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      }));
      assert.ok(
        layout.scrollWidth <= width + 1 && layout.scrollHeight <= height + 1,
      );
      layouts.push(layout);
      await phone.screenshot({
        path: path.join(f.output, `phone-${width}x${height}.png`),
      });
    }
    await room.page.screenshot({ path: path.join(f.output, "desktop.png") });
    assert.deepEqual(errors, []);
    assert.deepEqual(room.errors, []);
    if (mode === "mock") {
      const full = await f.createRoom(4);
      const queued = await context.newPage();
      await queued.goto(`${f.base}/controller?room=${full.identity.code}`);
      await queued.locator("#waiting-view").waitFor({ state: "visible" });
      full.phones[1].socket.emit("leave");
      await until(
        () => full.state.web3.seats.some((s) => s.slot === 1 && s.addr),
        10000,
        "promoted phone identity",
      );
      console.log(
        "PASS mock queue promotion: early challenge binds after seat assignment.",
      );
      await queued.close();
    }
    await writeFile(
      path.join(f.output, "web3-foundation.json"),
      JSON.stringify(
        {
          mode,
          checks: [
            "phone joins",
            "touch ready",
            "lazy signer isolation",
            "no viewport overflow",
            ...(mode === "mock" ? ["queued phone binds after promotion"] : []),
          ],
          layouts,
          errors,
          unverified: [
            "Physical motion permission, sensor calibration, multitouch",
            "Live networks and HTTPS staging",
          ],
        },
        null,
        2,
      ),
    );
    console.log(
      `PASS ${mode}: browser phone joins, touch ready, signer ${hasKey ? "bound" : "absent"}, three viewports. Evidence: ${f.output}`,
    );
    await context.close();
  } finally {
    await f?.close();
    await rm(dir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
