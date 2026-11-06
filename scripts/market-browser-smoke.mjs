// Disposable localhost acceptance. Does not load env files or touch public chains.
import express from "express";
import { chromium } from "playwright";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import marketsModule from "../server/market/index.cjs";
import { makeResult } from "../server/records.cjs";
import { gameById } from "../core/catalog.js";
import { verifyTypedData } from "viem";
import { fundingIntent } from "../integrations/market/intents.mjs";
import { identityData } from "../integrations/market/types.mjs";
const root = fileURLToPath(new URL("..", import.meta.url)),
  dir = await mkdtemp(path.join(os.tmpdir(), "chonks-market-browser-"));
const shots = path.join(os.tmpdir(), "chonks-market-ui");
await mkdir(shots, { recursive: true });
let time = Date.now();
const markets = marketsModule.createMarkets({
  config: {
    PARTNERS: "mock",
    MARKETS: "mock",
    WEB3_DATA_DIR: dir,
    MARKET_WINDOW_SECONDS: 30,
    MARKET_LIVENESS_SECONDS: 60,
  },
  now: () => time,
});
const players = [0, 1].map((slot) => ({
  slot,
  socket: `socket-${slot}`,
  token: `PRIVATE-TOKEN-${slot}`,
  ready: true,
  address: privateKeyToAccount(generatePrivateKey()).address,
  name: ["Mochi", "Pixel"][slot],
}));
const room = {
  code: "SECRET",
  game: "star-catch",
  phase: "lobby",
  setup: {},
  players,
};
const app = express();
app.use("/api/web3", markets.router);
app.get("/predict", (_, res) =>
  res.sendFile(path.join(root, "public/predict.html")),
);
app.use(express.static(path.join(root, "public")));
const server = await new Promise((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  await markets.choose(room, {});
  browser = await chromium.launch({ headless: true });
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 390, height: 844 } }),
    browser.newContext({ viewport: { width: 390, height: 844 } }),
  ]);
  const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
  const errors = [];
  for (const page of [a, b])
    page.on("pageerror", (error) => errors.push(error.message));
  for (const page of [a, b]) {
    await page.goto(`${origin}/predict`);
    await page.getByRole("button", { name: "Connect this phone" }).click();
    await page.getByRole("button", { name: "Connected ✓" }).waitFor();
  }
  await a.getByRole("button", { name: "Confirm prediction" }).click();
  await a.getByText("Prediction saved. Follow the match here.").waitFor();
  await b.locator(".outcome").nth(1).click();
  await b.getByRole("button", { name: "Confirm prediction" }).click();
  await b.getByText("Prediction saved. Follow the match here.").waitFor();
  await a.getByRole("button", { name: "Send a 0.05 cheer" }).click();
  await a
    .getByText("Cheer sent! Every human player shares it after verification.")
    .waitFor();
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 720 },
  ]) {
    await a.setViewportSize(viewport);
    await a.screenshot({
      path: path.join(
        shots,
        `predict-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
    assert.equal(
      await a.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `overflow ${viewport.width}`,
    );
  }
  const directory = await fetch(`${origin}/api/web3/matches`).then((r) =>
    r.text(),
  );
  assert.ok(!directory.includes("SECRET"));
  assert.ok(!directory.includes("PRIVATE-TOKEN"));
  assert.ok(!directory.includes(players[0].address.toLowerCase()));
  assert.equal((await fetch(`${origin}/api/web3/market/me`)).status, 401);
  time += 35000;
  await markets.started(room);
  Object.assign(room, {
    roundId: 1,
    active: [0, 1],
    match: { seed: 77 },
    replay: [],
    startedAt: time - 1000,
  });
  const record = makeResult(
    room,
    gameById("star-catch"),
    [
      { slot: 0, score: 0 },
      { slot: 1, score: 0 },
    ],
    time,
  );
  await markets.finish(room, record);
  time += 60001;
  await a
    .getByRole("button", { name: "Collect payout or refund" })
    .waitFor({ timeout: 10000 });
  await a.getByRole("button", { name: "Collect payout or refund" }).click();
  await a.getByText("Collected 0.05 play coins.").waitFor();
  // Explicit live-UI fixture: signatures are real; these API responses never send transactions.
  const liveContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    live = await liveContext.newPage();
  live.on("pageerror", (e) => errors.push(e.message));
  const fakeMarket = {
    marketId: `0x${"98".repeat(32)}`,
    matchRef: "public-fixture",
    title: "Star Catch",
    mode: "on",
    phase: "betting",
    asset: "Arc test USDC",
    humans: 2,
    pool: "100000",
    chainId: 5042002,
    chainMarketId: "7",
    contract: `0x${"13".repeat(20)}`,
    cheerContract: `0x${"14".repeat(20)}`,
    tokenAddress: "0x3600000000000000000000000000000000000000",
    closesAt: Math.floor(Date.now() / 1000) * 1000 + 60000,
    outcomes: [
      { index: 0, label: "Mochi", pool: "50000", mult: 2 },
      { index: 1, label: "Pixel", pool: "50000", mult: 2 },
    ],
  };
  let phone,
    quote,
    submitted = false,
    confirmed = false;
  const challenge = {
    nonce: `0x${"82".repeat(32)}`,
    expiresAt: Date.now() + 60000,
  };
  await live.route("**/api/web3/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/api/web3/")[1],
      body =
        route.request().method() === "POST"
          ? route.request().postDataJSON()
          : null;
    let data;
    if (name === "matches")
      data = { mode: "on", serverTime: Date.now(), matches: [fakeMarket] };
    else if (name === "market/challenge") data = challenge;
    else if (name === "market/session") {
      assert.equal(
        await verifyTypedData({
          ...identityData(challenge.nonce, challenge.expiresAt),
          address: body.address,
          signature: body.signature,
        }),
        true,
      );
      phone = body.address;
      data = {
        mode: "on",
        token: "fixture-session",
        address: phone,
        balance: "1000000",
        positions: [],
      };
    } else if (name === "market/quote") {
      quote = {
        quoteId: "fixture-quote",
        marketRef: fakeMarket.marketId,
        kind: body.kind,
        chainId: 5042002,
        chainMarketId: "7",
        contract: fakeMarket.contract,
        asset: fakeMarket.tokenAddress,
        symbol: "USDC",
        bettor: phone,
        outcome: body.outcome,
        amount: body.amount,
        minPayout: body.minPayout,
        salt: `0x${"81".repeat(32)}`,
        validAfter: "0",
        validBefore: String(fakeMarket.closesAt / 1000),
      };
      data = quote;
    } else if (name === "market/bet") {
      assert.equal(
        await verifyTypedData({
          ...fundingIntent(quote),
          address: phone,
          signature: body.signature,
        }),
        true,
      );
      submitted = true;
      data = { queued: true, jobId: "fixture-job" };
    } else if (name === "market/me")
      data = {
        mode: "on",
        balance: confirmed ? "950000" : "1000000",
        positions: submitted
          ? [
              {
                marketId: fakeMarket.marketId,
                phase: "betting",
                stakes: [confirmed ? "50000" : "0", "0"],
                pending: !confirmed,
                claimable: "0",
                actions: [
                  {
                    kind: "market.bet",
                    status: confirmed ? "done" : "queued",
                    explorer: confirmed
                      ? "https://explorer.testnet.arc.io/tx/fixture"
                      : null,
                  },
                ],
              },
            ]
          : [],
      };
    else throw Error(`Unexpected fixture request ${name}`);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await live.goto(`${origin}/predict`);
  await live.getByRole("button", { name: "Connect this phone" }).click();
  await live.getByRole("button", { name: "Connected ✓" }).waitFor();
  await live.getByRole("button", { name: "Confirm prediction" }).click();
  await live
    .getByText("Your request is queued. Waiting for Arc confirmation…")
    .waitFor();
  assert.equal(await live.locator("#balance").textContent(), "1.00");
  confirmed = true;
  await live
    .getByRole("link", { name: "View confirmed transaction" })
    .waitFor();
  assert.equal(await live.locator("#balance").textContent(), "0.95");
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 1280, height: 720 },
  ]) {
    await live.setViewportSize(viewport);
    await live.screenshot({
      path: path.join(shots, `predict-live-${viewport.width}.png`),
      fullPage: true,
    });
    assert.equal(
      await live.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      pass: true,
      checks: [
        "two signed spectator sessions",
        "both outcome predictions",
        "equal table cheer",
        "private directory",
        "authenticated personal data",
        "actual independent replay",
        "pull claim",
        "four viewport widths",
        "live UI bounded EIP3009 signature and honest queued/confirmed balance fixture",
      ],
      screenshots: shots,
    }),
  );
} finally {
  await browser?.close();
  await markets.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
