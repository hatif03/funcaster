/** Isolated end-to-end server/browser. Never attaches to a user's browser or server. */
import { chromium } from "playwright";
import { io } from "socket.io-client";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const { FakePhone, emit } = createRequire(import.meta.url)(
  "../party/harness.cjs",
);
export const repo = fileURLToPath(new URL("../../", import.meta.url));
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function until(predicate, timeout = 15000, label = "condition") {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await predicate();
    if (result) return result;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
export async function browserFixture(name) {
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const temp = await mkdtemp(resolve(tmpdir(), "chonks-os-e2e-")),
    output = resolve(
      process.env.OS_EVIDENCE_DIR || resolve(repo, ".local/os-evidence"),
      `${name}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    );
  await mkdir(output, { recursive: true });
  const child = spawn(process.execPath, ["server.js"], {
    cwd: repo,
    env: {
      ...process.env,
      HTTP: "1",
      PORT: String(port),
      NO_OPEN: "1",
      CHONKS_SHELL: "os",
      EVENT_STORE: resolve(temp, "events.json"),
      CREATOR_STORE: resolve(temp, "creator"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (data) => {
    log += data;
  });
  child.stderr.on("data", (data) => {
    log += data;
  });
  const base = `http://127.0.0.1:${port}`;
  let browser;
  const sockets = [],
    contexts = [];
  async function close() {
    sockets.forEach((socket) => socket.disconnect());
    for (const context of contexts) await context.close().catch(() => {});
    await browser?.close().catch(() => {});
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((r) => child.once("exit", r)),
      sleep(2000),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
    await writeFile(resolve(output, "server.log"), log);
    await rm(temp, { recursive: true, force: true });
  }
  try {
    const health = await until(
      async () => {
        try {
          const response = await fetch(`${base}/api/health`);
          return response.ok && response.json();
        } catch {
          return false;
        }
      },
      20000,
      "private server",
    );
    browser = await chromium.launch({
      headless: process.env.HEADED !== "1",
      channel: process.env.OS_BROWSER_CHANNEL || "chromium",
      args: [
        "--autoplay-policy=no-user-gesture-required",
        ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
      ],
    });
    async function connect() {
      const socket = io(`${base}/party`, {
        forceNew: true,
        transports: ["websocket"],
        reconnection: false,
      });
      sockets.push(socket);
      await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      const original = socket.emit.bind(socket);
      socket.emit = (event, data, ...args) =>
        original(
          event,
          event === "join" ? { ...data, buildId: health.buildId } : data,
          ...args,
        );
      return socket;
    }
    async function createRoom(count = 1, { dpr = 1 } = {}) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: dpr,
      });
      contexts.push(context);
      context.setDefaultTimeout(15000);
      context.setDefaultNavigationTimeout(30000);
      const page = await context.newPage(),
        errors = [],
        expectedAudioProbes = new Set(),
        consoleWarnings = [];
      const optionalAudio = (url) => {
        try {
          const parsed = new URL(url);
          return (
            parsed.origin === base &&
            /^\/(?:assets\/)?audio\/[^/]+\.(mp3|wav|ogg)$/.test(parsed.pathname)
          );
        } catch {
          return false;
        }
      };
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        const url = message.location().url || "";
        if (message.type() === "error") {
          if (/status of 404/.test(message.text()) && optionalAudio(url))
            expectedAudioProbes.add(url);
          else errors.push(`console: ${message.text()} ${url}`);
        } else if (message.type() === "warning")
          consoleWarnings.push(message.text());
      });
      page.on("response", (response) => {
        if (response.status() === 404 && optionalAudio(response.url()))
          expectedAudioProbes.add(response.url());
        else if (response.status() >= 400)
          errors.push(`HTTP ${response.status()}: ${response.url()}`);
      });
      await page.addInitScript(() => {
        window.__osMessages = [];
        window.addEventListener("message", (event) => {
          if (
            event.origin === location.origin &&
            ["chonks:loaded", "chonks:error"].includes(event.data?.type)
          )
            window.__osMessages.push({
              type: event.data.type,
              message: event.data.message,
            });
        });
      });
      await page.goto(`${base}/?shell=os`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !!sessionStorage.getItem("chonks.host"));
      const identity = await page.evaluate(() =>
        JSON.parse(sessionStorage.getItem("chonks.host")),
      );
      const observer = await connect();
      let state = null;
      observer.on("state", (next) => {
        state = next;
      });
      const joined = await emit(observer, "display", {
        code: identity.code,
        token: identity.displayToken,
        buildId: health.buildId,
      });
      if (joined.error) throw Error(joined.error);
      const phones = [];
      for (let i = 0; i < count; i++) {
        const phone = new FakePhone({ connect }, identity.code);
        const joined = await phone.join();
        if (joined.error) throw Error(joined.error);
        phone.ready();
        phones.push(phone);
      }
      await until(
        () =>
          state?.players.filter((p) => p.connected && p.ready).length === count,
        10000,
        "ready fake phones",
      );
      // Both the D2 welcome and D8 who's-playing screen expose a desktop action.
      for (let i = 0; i < 12; i++) {
        const button = page.locator(
          '[data-id="show-desktop"], [data-id="who-continue"], [data-id="continue-desktop"]',
        );
        if (await button.count()) {
          for (const item of await button.all())
            if (await item.isVisible()) await item.click();
        }
        if (
          (await page.locator('[data-id="game-mario-kart"]').isVisible()) &&
          !(await page
            .locator('[data-window="welcome"]')
            .isVisible()
            .catch(() => false))
        )
          break;
        await sleep(300);
      }
      await until(
        () => state?.hostSeat === 0,
        10000,
        "designated fake host phone",
      );
      let seq = 0;
      async function command(cmd, args = {}) {
        const payload = {
          seq: ++seq,
          cmd,
          args: ["lobby", "remove", "next-player"].includes(cmd)
            ? { ...args, confirmed: true }
            : args,
        };
        let answer = await emit(phones[0].socket, "host.cmd", payload);
        if (answer?.error === "Give it a moment.") {
          await sleep(1100);
          answer = await emit(phones[0].socket, "host.cmd", payload);
        }
        if (answer?.error) throw Error(answer.error);
        return answer;
      }
      async function openGame(id) {
        if (state.phase !== "lobby") {
          await command("lobby");
          await until(() => state?.phase === "lobby");
          await page
            .locator('[data-window="game-window"]')
            .waitFor({ state: "detached", timeout: 10000 });
        }
        const target = page.locator(`[data-id="game-${id}"]`);
        for (let i = 0; i < 8 && !(await target.isVisible()); i++) {
          const next = page.locator('[data-id="next-games"]');
          if ((await next.isVisible()) && (await next.isEnabled()))
            await next.click();
          else await page.locator('[data-id="previous-games"]').click();
        }
        await target.click();
        await page
          .locator('[data-window="game-properties"]')
          .waitFor({ state: "visible" });
        await until(() => state?.game === id);
        return state;
      }
      async function startGame(id, { maxViews = false } = {}) {
        await openGame(id);
        if (maxViews && id === "fruit-ninja") {
          await page.locator('[data-id="gp-tab-rules"]').click();
          await page.locator('[data-id="gp-fruit-ninja-variant-race"]').click();
          await until(() => state?.setup.variant === "race");
        }
        await page.evaluate(() => {
          window.__osMessages = [];
        });
        await page.locator("#gp-start").click();
        await page
          .locator('[data-window="game-window"]')
          .waitFor({ state: "visible", timeout: 20000 });
        if (state.phase === "classic") {
          await page.waitForFunction(
            () =>
              document.querySelectorAll("[data-game-frame]").length > 0 &&
              window.__osMessages.filter(
                (event) => event.type === "chonks:loaded",
              ).length >= document.querySelectorAll("[data-game-frame]").length,
            null,
            { timeout: 30000 },
          );
          for (const phone of phones)
            phone.socket.emit("action", {
              action: id === "mario-kart" ? "confirm" : "primary",
            });
        }
        await sleep(300);
        return state;
      }
      return {
        context,
        page,
        phones,
        identity,
        observer,
        errors,
        expectedAudioProbes,
        consoleWarnings,
        get state() {
          return state;
        },
        command,
        openGame,
        startGame,
      };
    }
    return { browser, base, output, health, createRoom, close };
  } catch (error) {
    await close();
    throw error;
  }
}
export async function writeReport(output, report) {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(`Evidence: ${output}`);
}
