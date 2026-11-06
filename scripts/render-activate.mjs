// Owner-operated activation only. --check makes no network calls or writes.
// API: https://api-docs.render.com/reference/add-or-update-secret-file
// API: https://api-docs.render.com/reference/create-deploy
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import { CONFIG_SPEC, loadConfig } from "../integrations/shared/config.mjs";
import { arcDeployment, arcLimits } from "../integrations/arc/config.mjs";
import { ensLimits } from "../integrations/ens/provider.mjs";

export const ORIGIN = "https://funcaster.onrender.com";
export const SERVICES = Object.freeze({
  worker: { id: "srv-dbn3llbrjlhs73diklfg", name: "funcaster-worker" },
  verifier: { id: "srv-dbn3lm3ncjis73e2frsg", name: "funcaster-verifier" },
  relay: { id: "srv-dbn3labbc2fs73ebli4g", name: "funcaster" },
});
export const CEILINGS = Object.freeze({
  ARC_RELAYER_MAX_GAS_USDC: 2,
  ARC_ORACLE_MAX_GAS_USDC: 0.5,
  MARKET_VERIFIER_MAX_GAS_USDC: 0.4,
  ENS_MAX_TOTAL_GAS_ETH: 0.05,
  ARC_MAX_TRANSACTIONS: 200,
  ENS_MAX_TRANSACTIONS: 120,
  WEB3_MAX_TX_PER_ROOM: 60,
  WEB3_MAX_TX_PER_HOUR: 180,
  ARC_MAX_FEE_GWEI: 100,
  ENS_MAX_FEE_GWEI: 30,
  ENS_PRIORITY_FEE_GWEI: 1,
  ARC_DRIP_MAX_PER_DEVICE: 1.1,
  ARC_DRIP_MAX_TOTAL_USDC: 10,
  ARC_DRIP_MAX_PER_ROOM: 4.4,
  ARC_DRIP_MAX_PER_IP_HOUR: 10,
  ARC_DRIP_BANKROLL_USDC: 1.1,
  MARKET_BANKROLL: 1.1,
  MARKET_MAX_PER_ADDRESS: 1,
  MARKET_MAX_POOL: 5,
});
const INFRA = {
  DATABASE_NAMESPACE: "funcaster-live",
  WEB3_DATA_DIR: "/var/data/web3",
  EVENT_STORE: "/var/data/events.json",
  HTTP: "1",
  NO_OPEN: "1",
  CHONKS_SHELL: "os",
};
const roleKeys = {
  relay: [],
  worker: ["ENS_REGISTRAR_KEY", "ARC_RELAYER_KEY", "ARC_ORACLE_KEY"],
  verifier: ["MARKET_VERIFIER_KEY"],
};
const sha = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code) => {
  throw Error(code);
};
const need = (ok, code) => {
  if (!ok) fail(code);
};
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export function activationArgs(args) {
  need(new Set(args).size === args.length, "INVALID_ARGUMENTS");
  if (!args.length || (args.length === 1 && args[0] === "--check"))
    return { apply: false };
  need(
    args.length === 2 &&
      args.includes("--apply") &&
      args.includes("--confirm-funcaster-testnet"),
    "EXPLICIT_ACTIVATION_REQUIRED",
  );
  return { apply: true };
}

export function parseRoleEnv(text, role) {
  need(
    typeof text === "string" && text.length < 100000 && !text.includes("\0"),
    "INVALID_ENV_FILE",
  );
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=([^\r\n]*)$/.exec(line);
    need(match && !seen.has(match[1]), "INVALID_OR_DUPLICATE_ENV_KEY");
    seen.add(match[1]);
  }
  const env = parseEnv(text);
  need(Object.keys(env).length === seen.size, "INVALID_ENV_FILE");
  for (const key of seen) {
    const spec = CONFIG_SPEC[key];
    need(
      key === "DATABASE_URL" ||
        Object.hasOwn(INFRA, key) ||
        (spec && (!spec.role || roleKeys[role].includes(key))),
      "UNEXPECTED_ENV_KEY",
    );
  }
  for (const [key, value] of Object.entries(INFRA))
    need(env[key] === value, `INVALID_${key}`);
  let database;
  try {
    database = new URL(env.DATABASE_URL);
  } catch {
    fail("INVALID_DATABASE_URL");
  }
  need(
    ["postgres:", "postgresql:"].includes(database.protocol) &&
      /^dpg-[a-z0-9-]+$/.test(database.hostname) &&
      !!database.password,
    "INVALID_DATABASE_URL",
  );
  const config = loadConfig(env, { role });
  for (const key of [
    "PARTNERS",
    "WEB3_ENS",
    "WEB3_ARC",
    "MARKETS",
    "COMMERCE",
    "FEATURE_CREATOR",
    "FEATURE_CHEERS",
  ])
    need(config[key] === "on", `INVALID_${key}`);
  for (const key of [
    "WEB3_ARKIV",
    "STREAMERS",
    "FEATURE_SWARM_HALL",
    "FEATURE_PRIVATE_REPLAYS",
  ])
    need(config[key] === "off", `INVALID_${key}`);
  need(config.WEB3_KILL === "1", "LOCAL_ENV_MUST_REMAIN_PAUSED");
  need(
    config.PUBLIC_ORIGIN === ORIGIN && config.ENS_APP_URL === ORIGIN,
    "ORIGIN_MISMATCH",
  );
  need(
    config.ENS_CHAIN === "sepolia" &&
      config.ENS_PARENT === "funcaster.eth" &&
      config.ENS_WARM_POOL === 0,
    "ENS_SCOPE_MISMATCH",
  );
  need(
    config.ARC_CHAIN_ID === 5042002 &&
      config.ARC_ALLOW_MAINNET === "0" &&
      config.PLAY_MONEY === "1",
    "TESTNET_ONLY",
  );
  need(
    config.WEB3_ASSETS.join() === "usdc" &&
      Number(config.ARC_DRIP_MAX_TOTAL_EURC) === 0 &&
      Number(config.ARC_DRIP_BANKROLL_EURC) === 0,
    "USDC_ONLY",
  );
  need(
    config.ARC_RPC_URLS.join() ===
      "https://rpc.testnet.arc.io,https://rpc.testnet.arc.network",
    "ARC_RPC_MISMATCH",
  );
  need(
    config.ENS_RPC_URLS.length >= 2 &&
      config.ENS_RPC_URLS.every((url) => new URL(url).protocol === "https:"),
    "ENS_RPC_REQUIRED",
  );
  for (const [key, max] of Object.entries(CEILINGS))
    need(Number(config[key]) > 0 && Number(config[key]) <= max, `CAP_${key}`);
  need(
    Number(config.ARC_MIN_RELAYER_BALANCE) >= 0.5,
    "RETAINED_BALANCE_TOO_LOW",
  );
  need(
    config.PASS_PRESETS_USD.every((x) => Number(x) > 0 && Number(x) <= 1),
    "PASS_CAP",
  );
  need(
    config.ARC_STAKE_PRESETS.every((x) => [0.5, 1].includes(Number(x))),
    "STAKE_CAP",
  );
  arcDeployment(config);
  arcLimits(config);
  ensLimits(config);
  for (const key of roleKeys[role]) {
    const addressKey = key.replace(/_KEY$/, "_ADDRESS");
    need(
      env[key] &&
        same(privateKeyToAccount(env[key]).address, config[addressKey]),
      "SIGNER_ADDRESS_MISMATCH",
    );
  }
  return {
    env,
    config,
    content: text.replace(/^WEB3_KILL=.*$/m, "WEB3_KILL=0"),
  };
}

export function validateActivation({
  services,
  texts,
  pins,
  publicConfig,
  pot,
  commit,
}) {
  need(/^[a-f0-9]{40}$/.test(commit), "INVALID_COMMIT");
  const roles = {};
  for (const role of Object.keys(SERVICES)) {
    need(
      services[role]?.id === SERVICES[role].id &&
        services[role]?.name === SERVICES[role].name,
      "SERVICE_IDENTITY_MISMATCH",
    );
    roles[role] = parseRoleEnv(texts[role], role);
  }
  const baseline = roles.relay;
  for (const role of ["worker", "verifier"]) {
    need(
      JSON.stringify(roles[role].config) === JSON.stringify(baseline.config),
      "PUBLIC_CONFIG_MISMATCH",
    );
    need(
      roles[role].env.DATABASE_URL === baseline.env.DATABASE_URL,
      "DATABASE_MISMATCH",
    );
  }
  const c = baseline.config;
  need(
    services.relay.url === ORIGIN &&
      pot.chainId === 5042002 &&
      same(c.ARC_POT_ADDRESS, pot.contract) &&
      same(c.ARC_POT_CODE_HASH, pot.runtimeCodeHash) &&
      c.ARC_POT_DEPLOY_BLOCK === Number(pot.blockNumber),
    "POT_PIN_MISMATCH",
  );
  need(
    same(c.ARC_USDC, "0x3600000000000000000000000000000000000000"),
    "USDC_PIN_MISMATCH",
  );
  const contractAssets = arcDeployment(c).assets;
  need(
    Array.isArray(pot.assets) &&
      pot.assets.length === contractAssets.length &&
      pot.assets.every(
        (asset, index) =>
          same(asset.symbol, contractAssets[index].symbol) &&
          same(asset.address, contractAssets[index].address),
      ),
    "POT_ASSET_PIN_MISMATCH",
  );
  for (const [name, prefix] of [
    ["ChonksMatchMarkets", "MARKET_POT"],
    ["SplitPayout", "MARKET_SPLIT"],
    ["RevenueRouter", "ROUTER"],
  ]) {
    const pin = pins[name];
    need(
      pin?.chainId === 5042002 &&
        same(c[prefix + "_ADDRESS"], pin.address) &&
        same(c[prefix + "_CODE_HASH"], pin.runtimeHash) &&
        c[prefix + "_DEPLOY_BLOCK"] === Number(pin.blockNumber),
      "CONTRACT_PIN_MISMATCH",
    );
  }
  for (const [key, value] of Object.entries(publicConfig))
    need(
      Object.hasOwn(CONFIG_SPEC, key) && same(c[key], value),
      "PUBLIC_PIN_CONFIG_MISMATCH",
    );
  need(
    same(c.MARKET_OPERATOR_ADDRESS, c.ARC_RELAYER_ADDRESS) &&
      same(c.ROUTER_OPERATOR_ADDRESS, c.ARC_RELAYER_ADDRESS) &&
      same(c.MARKET_REPORTER_A_ADDRESS, c.ARC_ORACLE_ADDRESS) &&
      !same(c.MARKET_VERIFIER_ADDRESS, c.ARC_ORACLE_ADDRESS) &&
      !same(c.MARKET_VERIFIER_ADDRESS, c.ARC_RELAYER_ADDRESS),
    "ROLE_ADDRESS_MISMATCH",
  );
  const fingerprint = sha(
    JSON.stringify({
      services: SERVICES,
      texts,
      pins,
      publicConfig,
      pot,
      commit,
    }),
  );
  return { roles, commit, fingerprint };
}

export function validateService(service, role, envRows) {
  const expected = SERVICES[role],
    details = service.serviceDetails;
  need(
    service.id === expected.id &&
      service.name === expected.name &&
      service.type === (role === "relay" ? "web_service" : "background_worker"),
    "REMOTE_SERVICE_MISMATCH",
  );
  need(
    service.repo === "https://github.com/hatif03/web3-multiplayer-games" &&
      service.branch === "codex/render-live" &&
      service.autoDeploy === "no" &&
      (!service.autoDeployTrigger || service.autoDeployTrigger === "off"),
    "REMOTE_SOURCE_MISMATCH",
  );
  need(
    service.suspended === "not_suspended" &&
      details?.numInstances === 1 &&
      details.disk?.mountPath === "/var/data",
    "REMOTE_RUNTIME_MISMATCH",
  );
  need(
    details.envSpecificDetails?.buildCommand ===
      "node scripts/render-build.mjs" &&
      details.envSpecificDetails?.startCommand ===
        `node --env-file=/etc/secrets/funcaster.env scripts/render-start.mjs ${role} --confirm-arc-testnet --confirm-ens-sepolia`,
    "START_COMMAND_MISMATCH",
  );
  if (role === "relay") need(details.url === ORIGIN, "REMOTE_ORIGIN_MISMATCH");
  const env = Object.fromEntries(
    envRows.map((row) => {
      const e = row.envVar || row;
      return [e.key, e.value];
    }),
  );
  need(
    env.NODE_VERSION === "22" &&
      env.FUNCASTER_ROLE === role &&
      Object.keys(env).length === 2,
    "UNEXPECTED_REMOTE_ENV",
  );
}

const deploys = (rows) => rows.map((row) => row.deploy || row);
const active = new Set([
  "created",
  "queued",
  "build_in_progress",
  "update_in_progress",
  "pre_deploy_in_progress",
]);
const broken = new Set([
  "build_failed",
  "update_failed",
  "pre_deploy_failed",
  "canceled",
  "deactivated",
]);

// request/save are injected for no-network tests. This helper never signs a chain transaction.
export async function activate(
  plan,
  {
    request,
    journal,
    save,
    wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    now = Date.now,
    log = console.log,
  },
) {
  need(
    !journal || journal.fingerprint === plan.fingerprint,
    "ACTIVATION_INPUTS_CHANGED",
  );
  const state = journal || {
    schema: 1,
    fingerprint: plan.fingerprint,
    commit: plan.commit,
    roles: {},
  };
  for (const role of Object.keys(SERVICES)) {
    const id = SERVICES[role].id;
    validateService(
      await request(`/services/${id}`),
      role,
      await request(`/services/${id}/env-vars?limit=100`),
    );
  }
  await save(state);
  for (const role of Object.keys(SERVICES)) {
    const id = SERVICES[role].id,
      base = `/services/${id}`,
      content = plan.roles[role].content;
    let step = state.roles[role];
    if (!step) {
      const before = deploys(await request(base + "/deploys?limit=20"));
      need(
        !before.some((d) => active.has(d.status)),
        "EXISTING_DEPLOY_IN_PROGRESS",
      );
      step = state.roles[role] = {
        before: before.map((d) => d.id),
        contentHash: sha(content),
        startedAt: now(),
        uploadIntent: true,
      };
      await save(state);
    }
    need(step.contentHash === sha(content), "SECRET_FILE_CHANGED");
    if (!step.uploaded) {
      // PUT is idempotent. Compare first, including recovery from a lost response.
      const previous = await request(base + "/secret-files/funcaster.env");
      if ((previous.secretFile || previous).content !== content)
        await request(base + "/secret-files/funcaster.env", {
          method: "PUT",
          body: { content },
        });
      const checked = await request(base + "/secret-files/funcaster.env");
      need(
        (checked.secretFile || checked).content === content,
        "SECRET_UPLOAD_NOT_CONFIRMED",
      );
      step.uploaded = true;
      await save(state);
    } else {
      const current = await request(base + "/secret-files/funcaster.env");
      need(
        (current.secretFile || current).content === content,
        "REMOTE_SECRET_CHANGED_KEEP_JOURNAL",
      );
    }
    if (!step.deployId) {
      const candidates = deploys(
        await request(base + "/deploys?limit=20"),
      ).filter((d) => !step.before.includes(d.id));
      need(
        candidates.length <= 1 &&
          candidates.every((d) => d.commit?.id === plan.commit),
        "DEPLOY_RECONCILIATION_REQUIRED",
      );
      if (candidates.length === 1) step.deployId = candidates[0].id;
      else {
        need(!step.deployIntent, "DEPLOY_RECOVERY_PENDING");
        step.deployIntent = true;
        await save(state);
        const response = await request(base + "/deploys", {
          method: "POST",
          body: { commitId: plan.commit, clearCache: "do_not_clear" },
        });
        const deployment = response.deploy || response;
        need(/^dep-[a-z0-9]+$/.test(deployment.id), "DEPLOY_RECOVERY_PENDING");
        step.deployId = deployment.id;
      }
      await save(state);
    }
    const deadline = now() + 20 * 60 * 1000;
    for (;;) {
      const deployment = await request(base + "/deploys/" + step.deployId);
      need(deployment.commit?.id === plan.commit, "DEPLOY_COMMIT_MISMATCH");
      step.status = deployment.status;
      await save(state);
      if (step.status === "live") break;
      need(!broken.has(step.status), "DEPLOY_FAILED_KEEP_JOURNAL");
      need(
        active.has(step.status) && now() < deadline,
        "DEPLOY_PENDING_RESUME_SAME_COMMAND",
      );
      log(`WAIT ${role} ${step.deployId} ${step.status}`);
      await wait(10000);
    }
    log(`PASS ${role} ${step.deployId} live`);
  }
  return state;
}

async function privateRead(file) {
  const stat = await fs.lstat(file);
  need(
    stat.isFile() && (stat.mode & 0o777) === 0o600,
    "PRIVATE_FILE_MODE_REQUIRED",
  );
  return fs.readFile(file, "utf8");
}
async function saveJournal(file, state) {
  const temp = file + "." + randomUUID();
  const handle = await fs.open(temp, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(state, null, 2));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temp, file);
  const directory = await fs.open(path.dirname(file), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
async function activationLock(file) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await fs.open(file, "wx", 0o600);
      await handle.writeFile(String(process.pid));
      await handle.close();
      return () => fs.unlink(file);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const pid = Number(await privateRead(file));
      need(
        Number.isSafeInteger(pid) && pid > 0,
        "ACTIVATION_LOCK_REVIEW_REQUIRED",
      );
      try {
        process.kill(pid, 0);
      } catch (e) {
        if (e.code === "ESRCH") {
          await fs.unlink(file);
          continue;
        }
      }
      fail("ACTIVATION_ALREADY_RUNNING");
    }
  }
  fail("ACTIVATION_LOCK_REVIEW_REQUIRED");
}

export async function main(
  args = process.argv.slice(2),
  { cwd = process.cwd(), log = console.log } = {},
) {
  const options = activationArgs(args),
    dir = path.join(cwd, ".local/render");
  const json = async (file) =>
    JSON.parse(await fs.readFile(path.join(cwd, file), "utf8"));
  const git = (...argv) =>
    execFileSync("git", argv, { cwd, encoding: "utf8" }).trim();
  need(git("branch", "--show-current") === "codex/render-live", "WRONG_BRANCH");
  const texts = {};
  for (const role of Object.keys(SERVICES))
    texts[role] = await privateRead(path.join(dir, role + ".live.env"));
  const input = {
    services: await json(".local/render/services.json"),
    texts,
    pins: await json(".local/funcaster-deployment/public-pins.json"),
    publicConfig: await json(".local/funcaster-deployment/public-config.json"),
    pot: await json(".local/arc-public-deployment.json"),
    commit: git("rev-parse", "HEAD"),
  };
  for (const [name, file] of [
    [
      "ChonksMatchMarkets",
      "integrations/market/onchain/contracts/ChonksMatchMarkets.sol",
    ],
    ["SplitPayout", "integrations/market/onchain/contracts/SplitPayout.sol"],
    [
      "RevenueRouter",
      "integrations/commerce/studio/contracts/RevenueRouter.sol",
    ],
  ])
    need(
      sha(await fs.readFile(path.join(cwd, file))) ===
        input.pins[name]?.sourceSha256,
      "REVIEWED_SOURCE_CHANGED",
    );
  const plan = validateActivation(input);
  log(
    `PASS local configuration, role keys, pins and caps; ${ORIGIN}; commit ${plan.commit}`,
  );
  if (!options.apply) {
    log("CHECK ONLY: no network, uploads, activation or journal changes.");
    return plan.fingerprint;
  }
  need(
    git("rev-parse", "origin/codex/render-live") === plan.commit &&
      !git("status", "--porcelain", "--untracked-files=no"),
    "PUSH_REVIEWED_COMMIT_FIRST",
  );
  const cli = await fs.readFile(
    path.join(os.homedir(), ".render/cli.yaml"),
    "utf8",
  );
  const token = /^\s*key:\s*["']?([^\s"']+)/m.exec(cli)?.[1];
  need(token, "RENDER_LOGIN_REQUIRED");
  const request = async (url, { method = "GET", body } = {}) => {
    let response;
    try {
      response = await fetch("https://api.render.com/v1" + url, {
        method,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      fail("RENDER_RESPONSE_UNCERTAIN_KEEP_JOURNAL");
    }
    need(response.ok, `RENDER_HTTP_${response.status}_KEEP_JOURNAL`);
    try {
      return await response.json();
    } catch {
      fail("RENDER_RESPONSE_UNCERTAIN_KEEP_JOURNAL");
    }
  };
  const release = await activationLock(path.join(dir, "activation.lock"));
  try {
    const file = path.join(dir, "activation.json");
    let journal;
    try {
      journal = JSON.parse(await privateRead(file));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await activate(plan, {
      request,
      journal,
      save: (state) => saveJournal(file, state),
      log,
    });
    log(
      "PASS all three services live. Local env files remain paused; keep activation.json and all signer journals.",
    );
  } finally {
    await release();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    // Never print an API body, env value, token, key, database URL or stack.
    const code = /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "ACTIVATION_STOPPED";
    console.error(
      `${code}. Keep the activation journal and inspect configuration locally.`,
    );
    process.exitCode = 1;
  });
