// UI acceptance with explicit RPC response fixtures; no public signing/network.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { browserFixture, sleep } from "./browser-fixture.mjs";
const dir = await mkdtemp(path.join(tmpdir(), "chonks-ens-ui-"));
process.env.PARTNERS = "mock";
process.env.WEB3_DATA_DIR = dir;
let f;
try {
  f = await browserFixture("g1-ens");
  const room = await f.createRoom(1),
    page = room.page;
  const tx = `0x${"12".repeat(32)}`,
    hash = "a".repeat(64),
    name = "table-with-a-readable-long-name.play.funcaster.eth";
  await page.route("**/api/web3/ens/history?**", (route) =>
    route.fulfill({
      json: {
        rows: [{ resultHash: hash, tx, blockNumber: "12075000", logIndex: 1 }],
        nextCursor: null,
        independentlyVerified: false,
        explorer: "https://sepolia.etherscan.io",
      },
    }),
  );
  await page.evaluate(
    async ({ state, name, tx }) => {
      const [
        { createWindowManager },
        { windowManifest },
        { loadTheme },
        { createStorage },
      ] = await Promise.all([
        import("/os/wm.js"),
        import("/os/windows/manifest.js"),
        import("/os/theme.js"),
        import("/os/storage.js"),
      ]);
      const root = document.createElement("div");
      root.id = "ens-qa";
      root.style.cssText =
        "position:fixed;inset:0;z-index:9999;background:#275d9c";
      document.body.append(root);
      const theme = await loadTheme();
      state.web3 = {
        mode: "on",
        party: { name, status: "ready", registrationTx: tx },
        host: {
          message:
            "Host power is server-checked right now. The name service could not be reached.",
        },
        seats: state.players.map((p) => ({
          slot: p.slot,
          named: true,
          name: `player-with-a-long-name.${name}`,
          status: "ready",
        })),
      };
      state.operatingMode = "party";
      state.hostSeat = 0;
      const snapshot = {
        room: state,
        connection: "connected",
        displays: [],
        identity: { code: state.code },
        pairing: { url: `${location.origin}/controller?room=${state.code}` },
      };
      const context = {
        store: { get: () => snapshot },
        storage: createStorage(),
        getSession: () => ({}),
        openWindow: () => {},
        demo: false,
      };
      const area = () => ({ x: 0, y: 0, w: innerWidth, h: innerHeight, ui: 1 });
      window.__ensQA = createWindowManager({
        root,
        manifest: windowManifest(theme),
        context,
        getWorkArea: area,
        getViewport: area,
      });
    },
    { state: room.state, name, tx },
  );
  const layouts = [];
  for (const [width, height] of [
    [1280, 720],
    [800, 600],
  ]) {
    await page.setViewportSize({ width, height });
    for (const id of ["players", "invite", "records"]) {
      await page.evaluate((id) => window.__ensQA.open(id), id);
      if (id === "records") {
        await page.locator('#ens-qa [data-id="chain-history"]').click();
        await page
          .locator("#ens-qa")
          .getByText(
            "Read from ENS logs. Independent receipt verification is pending.",
          )
          .waitFor();
      }
      const box = await page
        .locator(`#ens-qa [data-window="${id}"]`)
        .evaluate((el) => ({
          w: el.clientWidth,
          scroll: el.scrollWidth,
          text: el.textContent,
        }));
      assert.ok(
        box.scroll <= box.w + 1,
        `${id} overflow at ${width}: ${JSON.stringify(box)}`,
      );
      layouts.push({ id, width, height, w: box.w, scroll: box.scroll });
      await page.screenshot({
        path: path.join(f.output, `${id}-${width}.png`),
      });
    }
  }
  await page.evaluate(() => window.__ensQA.destroy());
  const context = await f.browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await context.newPage(),
    errors = [];
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.route("**/api/web3/health", (route) =>
    route.fulfill({ json: { mode: "on", tableNames: true } }),
  );
  await phone.route("**/api/web3/ens/join?**", (route) =>
    route.fulfill({ status: 503, json: { error: "RPC unavailable" } }),
  );
  await phone.goto(`${f.base}/controller`);
  await phone.getByLabel("Party code or table name").waitFor();
  await phone.locator("#code-input").fill(name);
  await phone.locator("#code-form button").click();
  await phone
    .getByText(
      "We couldn’t check that table. Scan the QR or enter its party code.",
    )
    .waitFor();
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
  ]) {
    await phone.setViewportSize({ width, height });
    await sleep(100);
    assert.ok(
      await phone.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await phone.screenshot({
      path: path.join(f.output, `name-join-${width}.png`),
    });
  }
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.locator("#code-input").fill(room.identity.code);
  await phone.locator("#code-form button").click();
  await phone.locator("#touch-mode").waitFor();
  await phone.locator("#touch-mode").click();
  // Mount the production admin sheet in an isolated controller document so
  // live fixture socket updates cannot overwrite its simulated authority.
  await phone.route("**/party/phone.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "" }),
  );
  await phone.goto(`${f.base}/controller?qa=admin`);
  await phone.evaluate(async (state) => {
    document.querySelector(".admin-dialog")?.remove();
    const { mountPhoneAdmin } = await import("/party/phone-admin.js");
    window.__ensAdmin = new Map();
    const socket = {
      on: (name, fn) => window.__ensAdmin.set(name, fn),
      timeout() {
        return this;
      },
      emit() {},
    };
    state.web3 = {
      host: { message: "Host power is server-checked right now." },
    };
    mountPhoneAdmin(socket, () => state);
    window.__ensAdmin.get("admin.state")({ host: true, staff: false });
  }, room.state);
  await phone.evaluate(() => document.getElementById("settings").showModal());
  await phone.locator("#phone-admin-open").click();
  await phone.locator(".admin-dialog[open]").waitFor();
  await phone.screenshot({
    path: path.join(f.output, "host-fallback-phone.png"),
  });
  await phone.evaluate(() =>
    window.__ensAdmin.get("admin.state")({ host: false, staff: false }),
  );
  assert.equal(await phone.locator(".admin-dialog[open]").count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(room.errors, []);
  await writeFile(
    path.join(f.output, "g1-ens-browser.json"),
    JSON.stringify(
      {
        scope: "Real Chromium / simulated RPC and authority responses",
        layouts,
        checks: [
          "long seat names",
          "authority fallback text",
          "table name in Invite",
          "history from RPC response with explicit unverified label",
          "phone lookup failure and code fallback",
          "three phone viewports",
          "revocation closes admin dialog",
        ],
        unverified: [
          "public chain execution",
          "physical sensors",
          "HTTPS staging",
        ],
      },
      null,
      2,
    ),
  );
  console.log(`PASS G1 ENS browser UI: ${f.output}`);
  await context.close();
} finally {
  await f?.close();
  await rm(dir, { recursive: true, force: true });
}
