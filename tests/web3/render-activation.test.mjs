import test from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import {
  activationArgs,
  parseRoleEnv,
  validateActivation,
  validateService,
  activate,
  CEILINGS,
  SERVICES,
  ORIGIN,
} from "../../scripts/render-activate.mjs";
const key = (n) => "0x" + String(n).padStart(2, "0").repeat(32);
const address = (n) => privateKeyToAccount(key(n)).address;
const commit = "a".repeat(40);
const asText = (env) =>
  Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n";
function fixture() {
  const pins = Object.fromEntries(
    ["ChonksMatchMarkets", "SplitPayout", "RevenueRouter"].map((name, n) => [
      name,
      {
        chainId: 5042002,
        address: address(n + 5),
        runtimeHash: "0x" + String(n + 1).repeat(64),
        blockNumber: n + 10,
      },
    ]),
  );
  const publicConfig = {};
  for (const [name, prefix] of [
    ["ChonksMatchMarkets", "MARKET_POT"],
    ["SplitPayout", "MARKET_SPLIT"],
    ["RevenueRouter", "ROUTER"],
  ]) {
    publicConfig[prefix + "_ADDRESS"] = pins[name].address;
    publicConfig[prefix + "_CODE_HASH"] = pins[name].runtimeHash;
    publicConfig[prefix + "_DEPLOY_BLOCK"] = pins[name].blockNumber;
  }
  Object.assign(publicConfig, {
    MARKET_OPERATOR_ADDRESS: address(2),
    MARKET_REPORTER_A_ADDRESS: address(3),
    MARKET_VERIFIER_ADDRESS: address(4),
    ROUTER_OPERATOR_ADDRESS: address(2),
    ROUTER_PLATFORM_ADDRESS: address(2),
  });
  const pot = {
    chainId: 5042002,
    contract: address(8),
    runtimeCodeHash: "0x" + "9".repeat(64),
    blockNumber: 9,
    assets: [
      { symbol: "USDC", address: "0x3600000000000000000000000000000000000000" },
    ],
  };
  const common = {
    ...CEILINGS,
    ...publicConfig,
    DATABASE_URL: "postgresql://fixture:fixture@dpg-fixture/fixture",
    DATABASE_NAMESPACE: "funcaster-live",
    WEB3_DATA_DIR: "/var/data/web3",
    EVENT_STORE: "/var/data/events.json",
    HTTP: "1",
    NO_OPEN: "1",
    CHONKS_SHELL: "os",
    PARTNERS: "on",
    WEB3_ENS: "on",
    WEB3_ARC: "on",
    WEB3_ARKIV: "off",
    MARKETS: "on",
    COMMERCE: "on",
    FEATURE_CREATOR: "on",
    FEATURE_CHEERS: "on",
    STREAMERS: "off",
    WEB3_KILL: "1",
    PLAY_MONEY: "1",
    WEB3_ASSETS: "usdc",
    PUBLIC_ORIGIN: ORIGIN,
    ENS_CHAIN: "sepolia",
    ENS_PARENT: "funcaster.eth",
    ENS_APP_URL: ORIGIN,
    ENS_WARM_POOL: 0,
    ENS_REGISTRAR_ADDRESS: address(1),
    ENS_RPC_URLS:
      "https://ethereum-sepolia-rpc.publicnode.com,https://sepolia.drpc.org",
    ARC_CHAIN_ID: 5042002,
    ARC_ALLOW_MAINNET: "0",
    ARC_RPC_URLS: "https://rpc.testnet.arc.io,https://rpc.testnet.arc.network",
    LEDGER_RPC_SECONDARY: "https://rpc.testnet.arc.network",
    ARC_POT_ADDRESS: pot.contract,
    ARC_POT_CODE_HASH: pot.runtimeCodeHash,
    ARC_POT_DEPLOY_BLOCK: pot.blockNumber,
    ARC_RELAYER_ADDRESS: address(2),
    ARC_ORACLE_ADDRESS: address(3),
    ARC_DRIP_MAX_TOTAL_EURC: "0.00",
    ARC_DRIP_BANKROLL_EURC: "0.00",
    ARC_MIN_RELAYER_BALANCE: "0.50",
    ARC_STAKE_PRESETS: "0.50,1.00",
    PASS_PRESETS_USD: "1.00",
  };
  const texts = {
    relay: asText(common),
    worker: asText({
      ...common,
      ENS_REGISTRAR_KEY: key(1),
      ARC_RELAYER_KEY: key(2),
      ARC_ORACLE_KEY: key(3),
    }),
    verifier: asText({ ...common, MARKET_VERIFIER_KEY: key(4) }),
  };
  const services = structuredClone(SERVICES);
  services.relay.url = ORIGIN;
  return { texts, services, pins, publicConfig, pot, commit };
}
function remote(role) {
  return {
    ...SERVICES[role],
    type: role === "relay" ? "web_service" : "background_worker",
    repo: "https://github.com/hatif03/web3-multiplayer-games",
    branch: "codex/render-live",
    autoDeploy: "no",
    autoDeployTrigger: "off",
    suspended: "not_suspended",
    serviceDetails: {
      numInstances: 1,
      disk: { mountPath: "/var/data" },
      url: role === "relay" ? ORIGIN : undefined,
      envSpecificDetails: {
        buildCommand: "node scripts/render-build.mjs",
        startCommand: `node --env-file=/etc/secrets/funcaster.env scripts/render-start.mjs ${role} --confirm-arc-testnet --confirm-ens-sepolia`,
      },
    },
  };
}
const remoteEnv = (role) => [
  { envVar: { key: "NODE_VERSION", value: "22" } },
  { envVar: { key: "FUNCASTER_ROLE", value: role } },
];
test("activation defaults to check and requires both exact owner flags", () => {
  assert.deepEqual(activationArgs([]), { apply: false });
  assert.deepEqual(activationArgs(["--check"]), { apply: false });
  assert.deepEqual(activationArgs(["--apply", "--confirm-funcaster-testnet"]), {
    apply: true,
  });
  for (const args of [
    ["--apply"],
    ["--confirm-funcaster-testnet"],
    ["--apply", "--confirm-funcaster-testnet", "--skip"],
    ["--check", "--check"],
  ])
    assert.throws(() => activationArgs(args));
});
test("role configuration binds pins, caps and testnets while leaving local kill enabled", () => {
  const input = fixture(),
    plan = validateActivation(input);
  assert.match(input.texts.worker, /WEB3_KILL=1/);
  assert.match(plan.roles.worker.content, /WEB3_KILL=0/);
  assert.equal(plan.roles.relay.config.secrets.ARC_RELAYER_KEY, undefined);
  for (const [find, replace, expected] of [
    ["ARC_RELAYER_MAX_GAS_USDC=2", "ARC_RELAYER_MAX_GAS_USDC=3", /CAP_/],
    ["WEB3_KILL=1", "WEB3_KILL=0", /LOCAL_ENV_MUST_REMAIN_PAUSED/],
    [
      "PUBLIC_ORIGIN=" + ORIGIN,
      "PUBLIC_ORIGIN=https://other.example",
      /ORIGIN_MISMATCH/,
    ],
    ["WEB3_ASSETS=usdc", "WEB3_ASSETS=usdc,eurc", /USDC_ONLY/],
  ])
    assert.throws(
      () => parseRoleEnv(input.texts.relay.replace(find, replace), "relay"),
      expected,
    );
  assert.throws(
    () =>
      parseRoleEnv(input.texts.relay + `ARC_RELAYER_KEY=${key(2)}\n`, "relay"),
    /UNEXPECTED_ENV_KEY/,
  );
  assert.throws(
    () =>
      parseRoleEnv(input.texts.worker + "NODE_OPTIONS=--inspect\n", "worker"),
    /UNEXPECTED_ENV_KEY/,
  );
  assert.throws(
    () => parseRoleEnv(input.texts.worker + "WEB3_KILL=0\n", "worker"),
    /DUPLICATE/,
  );
  const wrongPin = fixture();
  wrongPin.pins.RevenueRouter.address = address(10);
  assert.throws(() => validateActivation(wrongPin), /CONTRACT_PIN_MISMATCH/);
  const mismatch = fixture();
  mismatch.texts.verifier = mismatch.texts.verifier.replace(
    "MARKET_MAX_POOL=5",
    "MARKET_MAX_POOL=4",
  );
  assert.throws(() => validateActivation(mismatch), /PUBLIC_CONFIG_MISMATCH/);
});
test("remote identity and original start command must match before activation", () => {
  validateService(remote("worker"), "worker", remoteEnv("worker"));
  const changed = remote("worker");
  changed.serviceDetails.envSpecificDetails.startCommand += " --skip";
  assert.throws(
    () => validateService(changed, "worker", remoteEnv("worker")),
    /START_COMMAND_MISMATCH/,
  );
  assert.throws(
    () =>
      validateService(remote("relay"), "relay", [
        ...remoteEnv("relay"),
        { envVar: { key: "WEB3_KILL", value: "0" } },
      ]),
    /UNEXPECTED_REMOTE_ENV/,
  );
});
function apiFixture({ losePost = false, createOnLostPost = true } = {}) {
  const calls = [],
    states = Object.fromEntries(
      Object.keys(SERVICES).map((role) => [
        role,
        { content: "WEB3_KILL=1\n", deploys: [] },
      ]),
    );
  let lost = false;
  const request = async (url, options = {}) => {
    const role = Object.keys(SERVICES).find((r) =>
      url.startsWith("/services/" + SERVICES[r].id),
    );
    assert.ok(role);
    const part = url.slice(("/services/" + SERVICES[role].id).length),
      state = states[role],
      method = options.method || "GET";
    calls.push({ role, part, method });
    if (!part) return remote(role);
    if (part.startsWith("/env-vars")) return remoteEnv(role);
    if (part === "/secret-files/funcaster.env") {
      if (method === "PUT") state.content = options.body.content;
      return { name: "funcaster.env", content: state.content };
    }
    if (part === "/deploys" && method === "POST") {
      const deployment = {
        id: "dep-" + role,
        commit: { id: options.body.commitId },
        status: "live",
      };
      if (!losePost || lost || createOnLostPost)
        state.deploys.unshift(deployment);
      if (losePost && !lost) {
        lost = true;
        throw Error("RENDER_RESPONSE_UNCERTAIN_KEEP_JOURNAL");
      }
      return deployment;
    }
    if (part.startsWith("/deploys?"))
      return state.deploys.map((deploy) => ({ deploy }));
    if (part.startsWith("/deploys/"))
      return state.deploys.find((d) => part.endsWith(d.id));
    assert.fail("Unexpected API call");
  };
  return { request, calls, states };
}
test("activation updates only named secret files, deploys in role order and resumes without duplicate writes", async () => {
  const plan = validateActivation(fixture()),
    api = apiFixture();
  let saved;
  const save = async (state) => {
    saved = structuredClone(state);
  };
  await activate(plan, { ...api, save, log() {} });
  assert.deepEqual(
    api.calls.filter((x) => x.method === "POST").map((x) => x.role),
    ["worker", "verifier", "relay"],
  );
  assert.equal(api.calls.filter((x) => x.method === "PUT").length, 3);
  assert.ok(!JSON.stringify(saved).includes(key(1)));
  const writes = api.calls.filter((x) => x.method !== "GET").length;
  await activate(plan, { ...api, journal: saved, save, log() {} });
  assert.equal(api.calls.filter((x) => x.method !== "GET").length, writes);
});
test("lost deploy responses reconcile exact IDs; unobserved deployment intent never resends", async () => {
  for (const createOnLostPost of [true, false]) {
    const plan = validateActivation(fixture()),
      api = apiFixture({ losePost: true, createOnLostPost });
    let saved;
    const save = async (state) => {
      saved = structuredClone(state);
    };
    await assert.rejects(
      activate(plan, { ...api, save, log() {} }),
      /RESPONSE_UNCERTAIN/,
    );
    assert.equal(saved.roles.worker.deployIntent, true);
    if (createOnLostPost)
      await activate(plan, { ...api, journal: saved, save, log() {} });
    else
      await assert.rejects(
        activate(plan, { ...api, journal: saved, save, log() {} }),
        /DEPLOY_RECOVERY_PENDING/,
      );
    assert.equal(
      api.calls.filter((x) => x.role === "worker" && x.method === "POST")
        .length,
      1,
    );
  }
});
