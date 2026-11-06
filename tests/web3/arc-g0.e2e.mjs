// Run against the separately built Studio diagnostic: bun run preview --host 127.0.0.1 --port 4318.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
const out = new URL("../../.local/web3-evidence/arc-g0/", import.meta.url);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = {
  at: new Date().toISOString(),
  scope: "Local exported G0 diagnostic; Chromium",
  samples: [],
};
try {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1280, 720],
  ]) {
    for (const scenario of [
      "live",
      "wrong-chain",
      "unavailable",
      "large-balance",
    ]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [],
        methods = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => {
        if (r.url().startsWith("https://rpc.testnet.arc.io")) {
          const body = r.postDataJSON();
          for (const q of Array.isArray(body) ? body : [body])
            methods.push(q.method);
        }
      });
      if (scenario !== "live")
        await page.route("https://rpc.testnet.arc.io/**", async (route) => {
          const request = route.request().postDataJSON();
          const reply = (q) => {
            if (scenario === "unavailable")
              return {
                jsonrpc: "2.0",
                id: q.id,
                error: { code: -32000, message: "temporarily unavailable" },
              };
            let result;
            if (q.method === "eth_chainId")
              result = scenario === "wrong-chain" ? "0x1" : "0x4cef52";
            else if (q.method === "eth_blockNumber") result = "0x43a0000";
            else if (q.method === "eth_call")
              result = q.params[0].data.startsWith("0x313ce567")
                ? "0x" + 6n.toString(16).padStart(64, "0")
                : "0x" + ((1n << 256n) - 1n).toString(16);
            else throw Error("Unexpected RPC " + q.method);
            return { jsonrpc: "2.0", id: q.id, result };
          };
          await route.fulfill({
            json: Array.isArray(request) ? request.map(reply) : reply(request),
          });
        });
      await page.goto("http://127.0.0.1:4318/", {
        waitUntil: "domcontentloaded",
      });
      await page
        .locator('[data-testid="status-banner"]:not([data-status="loading"])')
        .waitFor({ timeout: 45000 });
      const ready = scenario === "live" || scenario === "large-balance";
      assert.equal(
        await page.getByTestId("status-banner").getAttribute("data-status"),
        ready ? "ready" : "error",
      );
      const layout = await page.evaluate(() => {
        const w = innerWidth;
        const overflow = [...document.querySelectorAll("main *")]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return (
              r.width > 0 &&
              (r.left < -1 ||
                r.right > w + 1 ||
                (e.scrollWidth > e.clientWidth + 1 &&
                  getComputedStyle(e).display !== "inline" &&
                  e instanceof HTMLElement))
            );
          })
          .map((e) => ({
            tag: e.tagName,
            test: e.getAttribute("data-testid"),
            text: e.textContent.slice(0, 60),
            width: e.clientWidth,
            scroll: e.scrollWidth,
          }));
        const button = document.querySelector("button").getBoundingClientRect();
        return {
          overflow,
          buttonHeight: button.height,
          bodyScroll: document.documentElement.scrollWidth > w,
        };
      });
      assert.deepEqual(
        layout.overflow,
        [],
        `${width} ${scenario} overflow: ${JSON.stringify(layout.overflow)}`,
      );
      assert.equal(layout.bodyScroll, false);
      assert(layout.buttonHeight >= 44);
      assert.deepEqual(errors, []);
      assert(
        methods.every((m) =>
          ["eth_chainId", "eth_blockNumber", "eth_call"].includes(m),
        ),
      );
      const screenshot = `${width}-${scenario}.png`;
      await page.screenshot({
        path: new URL(screenshot, out).pathname,
        fullPage: true,
      });
      report.samples.push({
        width,
        height,
        scenario,
        layout,
        methods: [...new Set(methods)],
        status: await page.getByTestId("status-banner").innerText(),
        screenshot,
      });
      await page.close();
    }
  }
} finally {
  await browser.close();
  await fs.writeFile(
    new URL("report.json", out),
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  `PASS: ${report.samples.length} desktop/phone/scenario samples; no overflow, page errors or mutating RPC; screenshots ${out.pathname}`,
);
