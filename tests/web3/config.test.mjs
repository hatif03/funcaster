import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONFIG_SPEC, loadConfig } from "../../integrations/shared/config.mjs";
import { preflight, runPreflight } from "../../scripts/web3-preflight.mjs";
const key = "0x" + "a".repeat(64),
  addr = "0x" + "1".repeat(40);
test("off defaults and explicitly gated features", () => {
  const c = loadConfig({});
  assert.equal(c.PARTNERS, "off");
  assert.equal(c.WEB3_ARC, "off");
  assert.equal(c.MARKETS, "off");
  assert.equal(loadConfig({ PARTNERS: "mock" }).WEB3_ENS, "mock");
  assert.equal(loadConfig({ PARTNERS: "mock" }).WEB3_ARKIV, "off");
  assert.equal(loadConfig({ PARTNERS: "mock" }).COMMERCE, "off");
  assert.throws(
    () =>
      preflight({
        PARTNERS: "on",
        WEB3_ENS: "off",
        WEB3_ARC: "off",
        COMMERCE: "on",
      }),
    /ROUTER_ADDRESS/,
  );
  assert.throws(() => loadConfig({ WEB3_ARC: "mock" }), /PARTNERS/);
});
test("names-only template covers every specified variable", () => {
  const text = readFileSync(
    new URL("../../.env.example", import.meta.url),
    "utf8",
  );
  const names = text.split("\n").filter((l) => l && !l.startsWith("#"));
  assert.ok(names.every((l) => /^[A-Z0-9_]+=$/.test(l)));
  assert.deepEqual(
    names.map((l) => l.slice(0, -1)).sort(),
    Object.keys(CONFIG_SPEC).sort(),
  );
});
test("bad config fails without echoing input values", () => {
  for (const env of [
    { PARTNERS: "bad" },
    { PLAY_MONEY: "0" },
    { ARC_CHAIN_ID: "1" },
    { ARC_CHAIN_ID: "5042" },
    { ARC_CHALLENGE_WINDOW_SECONDS: "59" },
    { ENS_CHAIN: "mainnet" },
    { ARC_RPC_URLS: "http://remote.test" },
    { ARC_RPC_URLS: "https://user:secret@example.com" },
  ])
    assert.throws(() => loadConfig(env));
  assert.equal(
    loadConfig({ ARC_CHAIN_ID: "5042", ARC_ALLOW_MAINNET: "1" }).ARC_CHAIN_ID,
    5042,
  );
  assert.throws(
    () =>
      preflight(
        { ARC_CHAIN_ID: "5042", ARC_ALLOW_MAINNET: "1" },
        { mock: true },
      ),
    /testnets/,
  );
});
test("per-partner on rejects bypasses and any global real/mock mixture", () => {
  for (const name of [
    "WEB3_FAKE_POT",
    "WEB3_SKIP_VERIFY",
    "WEB3_DEMO",
    "SKIP_VERIFY",
    "WEB3_BYPASS",
  ])
    assert.throws(() => loadConfig({ PARTNERS: "on", [name]: "1" }), /bypass/);
  assert.throws(() => loadConfig({ PARTNERS: "on", WEB3_ARC: "mock" }), /mix/);
  assert.throws(
    () => loadConfig({ PARTNERS: "mock", WEB3_ENS: "on", WEB3_FAKE_ENS: "1" }),
    /bypass/,
  );
});
test("secrets cannot cross process boundaries or serialize", () => {
  for (const name of [
    "ARC_RELAYER_KEY",
    "MARKET_VERIFIER_KEY",
    "TWITCH_CLIENT_SECRET",
    "ARC_STUDIO_TOKEN",
  ])
    assert.throws(() => loadConfig({ [name]: key }));
  assert.throws(
    () => loadConfig({ MARKET_VERIFIER_KEY: key }, { role: "worker" }),
    /verifier/,
  );
  const c = loadConfig({ ARC_RELAYER_KEY: key }, { role: "worker" });
  assert.equal(c.secrets.ARC_RELAYER_KEY, key);
  assert.ok(!JSON.stringify(c).includes(key));
  assert.throws(
    () =>
      loadConfig(
        { ARC_RELAYER_KEY: "secret-not-to-print" },
        { role: "worker" },
      ),
    (e) => !e.message.includes("secret-not-to-print"),
  );
});
test("creator and streamer validation activates only with feature", () => {
  assert.doesNotThrow(() =>
    loadConfig({ ROUTER_ADDRESS: "invalid", STREAM_EVENT_DEDUPE_HOURS: "bad" }),
  );
  assert.throws(
    () => loadConfig({ PARTNERS: "mock", FEATURE_CREATOR: "on" }),
    /ROUTER_ADDRESS/,
  );
  assert.throws(
    () =>
      loadConfig({
        PARTNERS: "mock",
        FEATURE_CREATOR: "on",
        ROUTER_ADDRESS: addr,
        PASS_PRESETS_USD: "1",
        ROUTER_FEE_STANDARD_BPS: "2000",
      }),
    /CAP/,
  );
  assert.throws(
    () =>
      loadConfig({
        PARTNERS: "mock",
        STREAMERS: "mock",
        STREAM_LINK_TTL_SECONDS: "121",
      }),
    /TTL/,
  );
  assert.throws(
    () =>
      loadConfig({
        PARTNERS: "mock",
        STREAMERS: "on",
        STREAM_PLATFORMS: "youtube",
        PUBLIC_ORIGIN: "https://example.com",
        STREAM_TRIGGER_CAP_PER_MIN: "5",
        STREAM_TRIGGER_COOLDOWN_S: "1",
      }),
    /YOUTUBE_QUOTA/,
  );
});
test("mock preflight performs no network and real mode cannot give a false pass", () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    throw Error("network forbidden");
  };
  try {
    assert.equal(preflight({}, { mock: true }).ok, true);
    assert.equal(
      preflight({
        PARTNERS: "on",
        WEB3_ENS: "off",
        WEB3_ARC: "off",
        WEB3_ARKIV: "off",
      }).ok,
      true,
    );
    assert.equal(
      preflight(
        {
          PARTNERS: "mock",
          WEB3_ARC: "on",
          ARC_POT_ADDRESS: addr,
          LEDGER_RPC_SECONDARY: "https://example.com",
        },
        { mock: true },
      ).ok,
      false,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("main preflight runs Arc's keyless check only in explicit live mode", async () => {
  let calls = 0;
  const env = {
    PARTNERS: "on",
    WEB3_ENS: "off",
    WEB3_ARC: "on",
    WEB3_ARKIV: "off",
    ARC_POT_ADDRESS: addr,
    LEDGER_RPC_SECONDARY: "https://example.com",
  };
  const arcCheck = async () => {
    calls++;
    return { report: { ok: true, scope: "unit fixture" } };
  };
  assert.equal((await runPreflight(env, { mock: true, arcCheck })).ok, false);
  assert.equal(calls, 0);
  assert.equal((await runPreflight(env, { arcCheck })).ok, true);
  assert.equal(calls, 1);
  assert.equal(
    (
      await runPreflight(
        {
          ...env,
          WEB3_ARKIV: "on",
          ARKIV_RPC_URL: "https://example.com",
          ARKIV_WS_URL: "wss://example.com",
          ARKIV_TRUSTED_CREATORS: addr,
        },
        { arcCheck },
      )
    ).ok,
    false,
  );
});
