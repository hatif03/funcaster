// Public configuration is separate from process-specific secrets. Never log env values.
import path from "node:path";
const choice = (values, fallback) => ({ type: "choice", values, fallback });
const number = (fallback, min = 1, max = Number.MAX_SAFE_INTEGER) => ({
  type: "number",
  fallback,
  min,
  max,
});
const decimal = (fallback) => ({ type: "decimal", fallback });
const string = (fallback = "") => ({ type: "string", fallback });
const url = (fallback = "") => ({ type: "url", fallback });
const urls = (fallback = "") => ({ type: "urls", fallback });
const address = () => ({ type: "address", fallback: "" });
const modes = (fallback = "off") => choice(["off", "mock", "on"], fallback);
const flag = (fallback = "off") => choice(["off", "on"], fallback);
const secret = (role, type = "key") => ({ type, fallback: "", role });
const creator = (spec) => ({ ...spec, gate: "creator" });
const streamer = (spec) => ({ ...spec, gate: "streamer" });
export const CONFIG_SPEC = Object.freeze({
  PARTNERS: modes(),
  WEB3_BIND_TTL_SECONDS: number(60),
  WEB3_NAME_COOLDOWN_MS: number(3000, 3000),
  WEB3_BIND_MAX_PER_MINUTE: number(3, 1, 3),
  WEB3_ENS: modes("inherit"),
  WEB3_ENS_CHAMPION: flag(),
  WEB3_ARC: modes("inherit"),
  // Owner scope: Arc + ENS only. Keep legacy names readable for old journals,
  // but PARTNERS must never silently activate an archived integration.
  WEB3_ARKIV: modes(),
  WEB3_DATA_DIR: string(".local/web3"),
  PUBLIC_ORIGIN: url(),
  PLAY_MONEY: choice(["1"], "1"),
  ENS_CHAIN: choice(["sepolia"], "sepolia"),
  ENS_PARENT: string(),
  ENS_REGISTRAR_ADDRESS: address(),
  ENS_RPC_URLS: urls(),
  ENS_EXPLORER_URL: url("https://sepolia.etherscan.io"),
  ENS_APP_URL: url(),
  ENS_ENFORCE: choice(["soft", "strict"], "soft"),
  ENS_PARTY_TTL_HOURS: number(4),
  ENS_WARM_POOL: number(3, 0),
  ENS_MAX_TOTAL_GAS_ETH: decimal(""),
  ENS_MAX_TRANSACTIONS: number(""),
  ENS_MAX_FEE_GWEI: decimal(""),
  ENS_PRIORITY_FEE_GWEI: decimal(""),
  ARC_CHAIN_ID: number(5042002),
  ARC_ALLOW_MAINNET: choice(["0", "1"], "0"),
  ARC_RPC_URLS: urls(
    "https://rpc.testnet.arc.io,https://rpc.testnet.arc.network",
  ),
  ARC_EXPLORER_URL: url("https://explorer.testnet.arc.io"),
  ARC_USDC: {
    ...address(),
    fallback: "0x3600000000000000000000000000000000000000",
  },
  ARC_POT_ADDRESS: address(),
  ARC_POT_CODE_HASH: { type: "hex32", fallback: "" },
  ARC_POT_DEPLOY_BLOCK: number("", 0),
  ARC_POT_ASSETS: { type: "assets", fallback: "" },
  ARC_EURC: address(),
  ARC_RELAYER_ADDRESS: address(),
  ARC_ORACLE_ADDRESS: address(),
  ARC_RELAYER_MAX_GAS_USDC: decimal(""),
  ARC_ORACLE_MAX_GAS_USDC: decimal(""),
  ARC_MAX_TRANSACTIONS: number(""),
  ARC_MAX_FEE_GWEI: decimal(""),
  ARC_DRIP_MAX_PER_DEVICE: decimal(""),
  ARC_DRIP_MAX_TOTAL_USDC: decimal(""),
  ARC_DRIP_MAX_TOTAL_EURC: decimal(""),
  ARC_DRIP_BANKROLL_USDC: decimal(""),
  ARC_DRIP_BANKROLL_EURC: decimal(""),
  ARC_STAKE_PRESETS: { type: "decimals", fallback: "0.50,1.00,2.00" },
  ARC_FUND_DEADLINE_SECONDS: number(180),
  ARC_SETTLE_DEADLINE_SECONDS: number(900),
  ARC_CHALLENGE_WINDOW_SECONDS: number(120, 60),
  ARC_ORACLE: choice(["relay", "chainlink"], "relay"),
  ARKIV_RPC_URL: url(),
  ARKIV_WS_URL: { type: "ws", fallback: "" },
  ARKIV_PROJECT: string("chonks_mumbai_2026"),
  ARKIV_TRUSTED_CREATORS: { type: "addresses", fallback: "" },
  ARKIV_LEASE_LIVE_S: number(90),
  ARKIV_RENEW_LIVE_S: number(30),
  ARKIV_PROFILE_DRIP_GLM: decimal(""),
  SWARM_API_URL: url("https://api.gateway.ethswarm.org"),
  SWARM_BATCH_ID: { type: "hex32", fallback: "" },
  SWARM_KEEP_HOURS: number(1),
  SWARM_UPLOAD_WAIT_S: number(60),
  ...Object.fromEntries(
    [
      "CHALLENGES",
      "CHEERS",
      "AUTOPILOT",
      "SEASON",
      "FOLLOWS",
      "SHELF",
      "AGENTS",
      "SWARM_HALL",
      "PRIVATE_REPLAYS",
    ].map((n) => [`FEATURE_${n}`, flag()]),
  ),
  MARKETS: modes(),
  COMMERCE: modes(),
  MARKET_ASSET: choice(["usdc", "play"], "usdc"),
  MARKET_WINDOW_SECONDS: number(60, 30, 120),
  MARKET_GUARD_SECONDS: number(5),
  MARKET_LIVENESS_SECONDS: number(90, 60, 120),
  MARKET_RESOLVE_DEADLINE_SECONDS: number(1800),
  MARKET_QUORUM: number(2, 2, 3),
  MARKET_MIN_BET: decimal("0.05"),
  MARKET_MAX_PER_ADDRESS: decimal("1.00"),
  MARKET_MAX_POOL: decimal("25"),
  MARKET_BONUS: decimal("0"),
  MARKET_BANKROLL: decimal("1.00"),
  MARKET_REFILL_BELOW: decimal("0.10"),
  MARKET_LISTED_DEFAULT: choice(["kiosk", "none", "all"], "kiosk"),
  MARKET_POT_ADDRESS: address(),
  MARKET_POT_CODE_HASH: { type: "hex32", fallback: "" },
  MARKET_POT_DEPLOY_BLOCK: number("", 0),
  MARKET_SPLIT_ADDRESS: address(),
  MARKET_SPLIT_CODE_HASH: { type: "hex32", fallback: "" },
  MARKET_SPLIT_DEPLOY_BLOCK: number("", 0),
  MARKET_OPERATOR_ADDRESS: address(),
  MARKET_REPORTER_A_ADDRESS: address(),
  MARKET_VERIFIER_ADDRESS: address(),
  MARKET_VERIFIER_MAX_GAS_USDC: decimal(""),
  WEB3_ASSETS: { type: "assets", fallback: "usdc,eurc" },
  ARC_MEMO: flag("on"),
  LEDGER_RPC_SECONDARY: url(),
  LEDGER_CONFIRMATIONS_SEPOLIA: number(3),
  LEDGER_CHECKPOINT_MINUTES: number(10),
  STATS_RULESET: string("stats-ruleset-v1.json"),
  STATS_SEASON_SALT: string(),
  STAKES_MIN_LEVEL: choice(["L1", "L2"], "L1"),
  STATION_MODE: flag(),
  INTEGRITY_ACT: choice(["0", "1"], "0"),
  LOG_LEVEL: choice(["debug", "info", "warn", "error"], "info"),
  ENS_REGISTRAR_KEY: secret("worker"),
  ARC_RELAYER_KEY: secret("worker"),
  ARC_ORACLE_KEY: secret("worker"),
  ARKIV_CONSOLE_KEY: secret("worker"),
  WEB3_KILL: choice(["0", "1"], "0"),
  // Unmeasured spend limits remain unset. A real worker must explicitly configure them.
  WEB3_MAX_TX_PER_ROOM: number(""),
  WEB3_MAX_TX_PER_HOUR: number(""),
  ARC_DRIP_MAX_PER_ROOM: decimal(""),
  ARC_DRIP_MAX_PER_IP_HOUR: decimal(""),
  ARC_MIN_RELAYER_BALANCE: decimal(""),
  MARKET_OPERATOR_KEY: secret("worker"),
  MARKET_REPORTER_A_KEY: secret("worker"),
  MARKET_PERMIT_KEY: secret("worker"),
  MARKET_VERIFIER_KEY: secret("verifier"),
  MARKET_VERIFIER_TOKEN: secret("verifier", "secret"),
  CHECKPOINT_SIGNER_KEY: secret("worker"),
  ARC_RELAYER_KEY_2: secret("worker"),
  FEATURE_CREATOR: flag(),
  ROUTER_ADDRESS: creator(address()),
  ROUTER_CODE_HASH: creator({ type: "hex32", fallback: "" }),
  ROUTER_DEPLOY_BLOCK: creator(number("", 0)),
  ROUTER_OPERATOR_ADDRESS: creator(address()),
  ROUTER_PLATFORM_ADDRESS: creator(address()),
  CREATOR_POOL_ADDRESS: creator(address()),
  BOUNTY_ESCROW_ADDRESS: creator(address()),
  ROUTER_FEE_FREE_BAND_USD: creator(decimal("1000")),
  ROUTER_FEE_CREATOR_BROUGHT_BPS: creator(number(500, 0, 10000)),
  ROUTER_FEE_STANDARD_BPS: creator(number(1000, 0, 10000)),
  ROUTER_FEE_CAP_BPS: creator(number(1500, 0, 10000)),
  ROUTER_REFERRAL_MIN_BPS: creator(number(500, 0, 10000)),
  ROUTER_REFERRAL_MAX_BPS: creator(number(2000, 0, 10000)),
  PASS_PRESETS_USD: creator({ type: "decimals", fallback: "" }),
  STREAMERS: modes(),
  STREAM_PLATFORMS: streamer({ type: "platforms", fallback: "twitch" }),
  STREAM_EVENT_DEDUPE_HOURS: streamer(number(24)),
  STREAM_LINK_TTL_SECONDS: streamer(number(120, 1, 120)),
  STREAM_TRIGGER_CAP_PER_MIN: streamer(number("")),
  STREAM_TRIGGER_COOLDOWN_S: streamer(number("", 0)),
  STREAM_KILL_COMMAND: streamer(string("!arcade off")),
  YOUTUBE_QUOTA_DAILY_UNITS: streamer(number("")),
  GATEWAY_SOCKET: streamer(string()),
  TWITCH_CLIENT_ID: secret("gateway", "secret"),
  TWITCH_CLIENT_SECRET: secret("gateway", "secret"),
  TWITCH_EVENTSUB_SECRET: secret("gateway", "secret"),
  KICK_CLIENT_ID: secret("gateway", "secret"),
  KICK_CLIENT_SECRET: secret("gateway", "secret"),
  GOOGLE_CLIENT_ID: secret("gateway", "secret"),
  GOOGLE_CLIENT_SECRET: secret("gateway", "secret"),
  GATEWAY_TOKEN_KEY: secret("gateway", "hex32"),
});
export class ConfigError extends Error {
  constructor(name, reason) {
    super(`${name}: ${reason}`);
    this.name = "ConfigError";
  }
}
const fail = (name, reason) => {
  throw new ConfigError(name, reason);
};
function parse(name, value, spec) {
  if (value === "" && spec.fallback === "")
    return spec.type.endsWith("s") && !["ws", "address"].includes(spec.type)
      ? []
      : "";
  switch (spec.type) {
    case "choice":
      if (!spec.values.includes(value))
        fail(name, `expected ${spec.values.join(", ")}`);
      return value;
    case "number": {
      const n = Number(value);
      if (
        !/^\d+$/.test(String(value)) ||
        !Number.isSafeInteger(n) ||
        n < spec.min ||
        n > spec.max
      )
        fail(name, `expected an integer from ${spec.min} to ${spec.max}`);
      return n;
    }
    case "decimal":
      if (!/^\d+(\.\d{1,18})?$/.test(String(value)))
        fail(name, "expected a non-negative decimal");
      return String(value);
    case "decimals":
      return String(value)
        .split(",")
        .map((v) => parse(name, v.trim(), decimal("0")));
    case "address":
      if (!/^0x[\da-fA-F]{40}$/.test(value))
        fail(name, "expected an EVM address");
      return value;
    case "key":
      if (!/^0x[\da-fA-F]{64}$/.test(value))
        fail(
          name,
          "expected a private key in its dedicated process environment",
        );
      return value;
    case "hex32":
      if (!/^(0x)?[\da-fA-F]{64}$/.test(value))
        fail(name, "expected 32 bytes of hex");
      return value;
    case "addresses":
      return String(value)
        .split(",")
        .map((v) => parse(name, v.trim(), address()));
    case "urls":
      return String(value)
        .split(",")
        .map((v) => parse(name, v.trim(), url()));
    case "url":
    case "ws": {
      let u;
      try {
        u = new URL(value);
      } catch {
        fail(name, "expected an absolute URL");
      }
      const allowed = spec.type === "ws" ? ["wss:"] : ["https:"];
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
      if (
        !allowed.includes(u.protocol) &&
        !(local && ["http:", "ws:"].includes(u.protocol))
      )
        fail(name, "HTTPS/WSS required except on loopback");
      if (u.username || u.password || u.hash)
        fail(name, "credentials and URL fragments are not allowed");
      return u.href.replace(/\/$/, "");
    }
    case "assets":
    case "platforms": {
      const values = String(value)
        .split(",")
        .map((v) => v.trim());
      const allowed =
        spec.type === "assets"
          ? ["usdc", "eurc"]
          : ["twitch", "kick", "youtube"];
      if (
        values.some((v) => !allowed.includes(v)) ||
        new Set(values).size !== values.length
      )
        fail(name, `expected unique entries from ${allowed.join(", ")}`);
      return values;
    }
    default:
      if (
        typeof value !== "string" ||
        value.includes("\0") ||
        value.length > 8192
      )
        fail(name, "invalid text");
      return value;
  }
}
export function loadConfig(
  env = process.env,
  { role = "relay", cwd = process.cwd() } = {},
) {
  if (!["relay", "worker", "gateway", "verifier"].includes(role))
    throw new Error("Unknown process role");
  const source = (name) =>
    env[name] === undefined || env[name] === ""
      ? CONFIG_SPEC[name].fallback
      : env[name];
  const partners = parse("PARTNERS", source("PARTNERS"), CONFIG_SPEC.PARTNERS);
  const creatorOn = env.FEATURE_CREATOR === "on" || env.COMMERCE === "on",
    streamOn = env.STREAMERS && env.STREAMERS !== "off";
  const config = {},
    secrets = {};
  if (env.ARC_STUDIO_TOKEN)
    fail(
      "ARC_STUDIO_TOKEN",
      "developer CLI only; remove from service environment",
    );
  for (const [name, spec] of Object.entries(CONFIG_SPEC)) {
    if (spec.role) {
      if (env[name] && spec.role !== role)
        fail(name, `belongs only in the ${spec.role} environment`);
      if (spec.role === role && env[name])
        secrets[name] = parse(name, env[name], spec);
      continue;
    }
    if (
      (spec.gate === "creator" && !creatorOn) ||
      (spec.gate === "streamer" && !streamOn)
    )
      continue;
    let value = source(name);
    if (value === "inherit") value = partners;
    config[name] = parse(name, value, spec);
  }
  const real = [
    "PARTNERS",
    "WEB3_ENS",
    "WEB3_ARC",
    "WEB3_ARKIV",
    "MARKETS",
    "COMMERCE",
    "STREAMERS",
  ].some((k) => config[k] === "on");
  if (
    partners === "off" &&
    [
      "WEB3_ENS",
      "WEB3_ARC",
      "WEB3_ARKIV",
      "MARKETS",
      "COMMERCE",
      "STREAMERS",
    ].some((k) => config[k] !== "off")
  )
    fail("PARTNERS", "off cannot enable another partner or feature");
  if (
    partners === "on" &&
    [
      "WEB3_ENS",
      "WEB3_ARC",
      "WEB3_ARKIV",
      "MARKETS",
      "COMMERCE",
      "STREAMERS",
    ].some((k) => config[k] === "mock")
  )
    fail("PARTNERS", "on cannot mix real and mock providers");
  if (real)
    for (const [name, value] of Object.entries(env))
      if (
        /^(WEB3_FAKE_|WEB3_.*(?:BYPASS|SKIP|DEMO)|SKIP_VERIFY$)/.test(name) &&
        value &&
        !["0", "off", "false"].includes(value)
      )
        fail(name, "bypass flags are forbidden in real mode");
  if (
    config.ARC_CHAIN_ID !== 5042002 &&
    !(config.ARC_CHAIN_ID === 5042 && config.ARC_ALLOW_MAINNET === "1")
  )
    fail(
      "ARC_CHAIN_ID",
      "only Arc testnet is allowed; mainnet requires an explicit override",
    );
  const required = (name) => {
    if (
      config[name] === undefined ||
      config[name] === "" ||
      (Array.isArray(config[name]) && !config[name].length)
    )
      fail(name, "required for the enabled feature");
  };
  if (config.WEB3_ENS === "on")
    ["ENS_PARENT", "ENS_RPC_URLS", "ENS_APP_URL"].forEach(required);
  if (config.WEB3_ARC === "on")
    ["ARC_RPC_URLS", "ARC_POT_ADDRESS", "LEDGER_RPC_SECONDARY"].forEach(
      required,
    );
  if (config.WEB3_ARKIV === "on")
    ["ARKIV_RPC_URL", "ARKIV_WS_URL", "ARKIV_TRUSTED_CREATORS"].forEach(
      required,
    );
  if (config.ARKIV_RENEW_LIVE_S >= config.ARKIV_LEASE_LIVE_S)
    fail("ARKIV_RENEW_LIVE_S", "must be shorter than the live lease");
  if (creatorOn) {
    required("ROUTER_ADDRESS");
    required("PASS_PRESETS_USD");
    if (
      config.ROUTER_FEE_STANDARD_BPS > config.ROUTER_FEE_CAP_BPS ||
      config.ROUTER_FEE_CREATOR_BROUGHT_BPS > config.ROUTER_FEE_CAP_BPS
    )
      fail("ROUTER_FEE_CAP_BPS", "must cover configured fee rates");
    if (config.ROUTER_REFERRAL_MIN_BPS > config.ROUTER_REFERRAL_MAX_BPS)
      fail("ROUTER_REFERRAL_MIN_BPS", "cannot exceed the maximum");
  }
  if (config.STREAMERS === "on") {
    [
      "PUBLIC_ORIGIN",
      "STREAM_TRIGGER_CAP_PER_MIN",
      "STREAM_TRIGGER_COOLDOWN_S",
    ].forEach(required);
    if (config.STREAM_PLATFORMS.includes("youtube"))
      required("YOUTUBE_QUOTA_DAILY_UNITS");
  }
  if (role === "worker" && real) {
    ["WEB3_MAX_TX_PER_ROOM", "WEB3_MAX_TX_PER_HOUR"].forEach(required);
    for (const [partner, key] of [
      ["ENS", "ENS_REGISTRAR_KEY"],
      ["ARC", "ARC_RELAYER_KEY"],
      ["ARKIV", "ARKIV_CONSOLE_KEY"],
    ])
      if (config[`WEB3_${partner}`] === "on" && !secrets[key])
        fail(key, "required in the worker environment");
    if (config.WEB3_ARC === "on")
      [
        "ARC_DRIP_MAX_PER_ROOM",
        "ARC_DRIP_MAX_PER_IP_HOUR",
        "ARC_MIN_RELAYER_BALANCE",
      ].forEach(required);
  }
  config.WEB3_DATA_DIR = path.resolve(cwd, config.WEB3_DATA_DIR);
  if (streamOn && !config.GATEWAY_SOCKET)
    config.GATEWAY_SOCKET = path.join(config.WEB3_DATA_DIR, "gateway.sock");
  // Secrets never appear in spreads or JSON.stringify(config).
  Object.defineProperty(config, "secrets", {
    value: Object.freeze(secrets),
    enumerable: false,
  });
  return Object.freeze(config);
}
