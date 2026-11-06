// OWNER-EXECUTED PUBLIC ACCEPTANCE ONLY. No deployment, faucet or service toggle.
// Explicit consent is required before loading keys or making any chain request.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "../integrations/shared/config.mjs";
import {
  atomicJson,
  readJson,
  digest,
} from "../integrations/shared/outbox.mjs";
import { acquireWorkerLock } from "../integrations/shared/worker.mjs";
import {
  createLiveArcProvider,
  arcClient,
} from "../integrations/arc/provider.mjs";
import { verifyArcDeployment } from "./web3-arc-pin.mjs";
import { requireArc, same } from "../integrations/arc/jobs.mjs";
import { runArcWorkerScenario } from "./spikes/arc-worker-scenario.mjs";
import { arcFailure, withArcPhase } from "../integrations/arc/diagnostics.mjs";

export function acceptanceArgs(args) {
  requireArc(
    (args.length === 3 &&
      args[0] === "--check" &&
      args[1] === "--deployment" &&
      args[2]) ||
      (args.length === 4 &&
        args[0] === "--apply" &&
        args[1] === "--confirm-arc-a4" &&
        args[2] === "--deployment" &&
        args[3]),
    "INVALID_CONFIG",
    "Owner command: node --env-file=.env.worker scripts/web3-arc-acceptance.mjs --apply --confirm-arc-a4 --deployment .local/arc-public-deployment.json",
  );
  return args[0] === "--check" ? args[2] : args[3];
}
// Check mode opens and closes the real provider, including its retained journals,
// but never creates/polls an outbox worker, signs or executes a scenario step.
export async function runAcceptanceScenario({ checkOnly, ...options }) {
  if (checkOnly) {
    if (!options.initialProvider) await options.restartProvider();
    options.record("retained fixture and worker startup", {
      scope: "READS ONLY; no jobs polled, signed or broadcast",
    });
    return false;
  }
  await withArcPhase("worker-scenario", () => runArcWorkerScenario(options));
  return true;
}
// Shared fixed limits for the original run and its scoped owner recovery.
export function acceptanceConfig({
  env,
  dir,
  source,
  deployment,
  relayer,
  oracle,
}) {
  return loadConfig(
    {
      ...env,
      PARTNERS: "on",
      WEB3_ENS: "off",
      WEB3_ARC: "on",
      WEB3_ARKIV: "off",
      MARKETS: "off",
      STREAMERS: "off",
      FEATURE_CREATOR: "off",
      WEB3_DATA_DIR: dir,
      PLAY_MONEY: "1",
      ARC_CHAIN_ID: "5042002",
      ARC_ALLOW_MAINNET: "0",
      ARC_MEMO: "off",
      ARC_ORACLE: "relay",
      WEB3_ASSETS: "usdc,eurc",
      ARC_RPC_URLS: source.rpcUrls.join(","),
      LEDGER_RPC_SECONDARY: source.rpcUrls[1],
      ARC_USDC: source.assets[0].address,
      ARC_EURC: source.assets[1].address,
      ARC_POT_ADDRESS: deployment.contract,
      ARC_POT_CODE_HASH: deployment.runtimeCodeHash,
      ARC_POT_DEPLOY_BLOCK: String(deployment.blockNumber),
      ARC_RELAYER_ADDRESS: relayer,
      ARC_ORACLE_ADDRESS: oracle,
      // Fixed maximums for this synthetic acceptance run, never production defaults.
      ARC_RELAYER_MAX_GAS_USDC: "0.5",
      ARC_ORACLE_MAX_GAS_USDC: "0.05",
      ARC_MAX_TRANSACTIONS: "64",
      WEB3_MAX_TX_PER_ROOM: "32",
      WEB3_MAX_TX_PER_HOUR: "64",
      ARC_MAX_FEE_GWEI: "100",
      ARC_MIN_RELAYER_BALANCE: "0.05",
      ARC_DRIP_MAX_PER_DEVICE: "0.06",
      ARC_DRIP_MAX_PER_IP_HOUR: "0.12",
      ARC_DRIP_MAX_PER_ROOM: "0.12",
      ARC_DRIP_MAX_TOTAL_USDC: "0.12",
      ARC_DRIP_MAX_TOTAL_EURC: "0.12",
      ARC_DRIP_BANKROLL_USDC: "0.06",
      ARC_DRIP_BANKROLL_EURC: "0.06",
    },
    { role: "worker" },
  );
}
export async function main(args = process.argv.slice(2), env = process.env) {
  const deploymentFile = acceptanceArgs(args); // before env/key/RPC access
  const checkOnly = args[0] === "--check";
  const deployment = JSON.parse(await fs.readFile(deploymentFile, "utf8"));
  requireArc(
    deployment.chainId === 5042002 && deployment.creationTx,
    "INVALID_CONFIG",
    "Verified Arc testnet deployment pin required",
  );
  const source = JSON.parse(
    await fs.readFile("docs/web3/spikes/arc-readonly-input.json", "utf8"),
  );
  const bytes = await fs.readFile(
    "integrations/arc/onchain/contracts/out/ConditionalPot.sol/ConditionalPot.json",
  );
  requireArc(
    deployment.artifactSha256 ===
      createHash("sha256").update(bytes).digest("hex"),
    "INVALID_CONFIG",
    "Reviewed local artifact changed after deployment verification",
  );
  for (const url of source.rpcUrls) {
    const checked = await verifyArcDeployment({
      client: arcClient(url),
      address: deployment.contract,
      txHash: deployment.creationTx,
      artifact: JSON.parse(bytes),
      assets: source.assets,
    });
    requireArc(
      same(checked.runtimeCodeHash, deployment.runtimeCodeHash) &&
        checked.blockNumber === deployment.blockNumber,
      "INVALID_PROOF",
      "Deployment pin no longer agrees with chain",
    );
  }
  const relayer = privateKeyToAccount(env.ARC_RELAYER_KEY),
    oracle = privateKeyToAccount(env.ARC_ORACLE_KEY);
  const dir = path.resolve(".local/arc-a4-acceptance"),
    reportFile = checkOnly
      ? "docs/web3/spikes/g1-arc-worker-startup.json"
      : "docs/web3/spikes/g1-arc-worker-public.json";
  const config = acceptanceConfig({
    env,
    dir,
    source,
    deployment,
    relayer: relayer.address,
    oracle: oracle.address,
  });
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const release = await acquireWorkerLock(dir);
  let active,
    writes = Promise.resolve();
  const report = {
    at: new Date().toISOString(),
    scope: checkOnly
      ? "READ-ONLY STARTUP CHECK; no signing, broadcasting or worker polling"
      : "PUBLIC ARC TESTNET; synthetic worker acceptance, not gameplay or Ledger acceptance",
    deployment: {
      contract: deployment.contract,
      creationTx: deployment.creationTx,
    },
    checks: [],
    complete: false,
    ceilings: {
      gasUSDC: "0.55",
      drippedUSDC: "0.12",
      drippedEURC: "0.12",
      transactionsPerRole: 64,
    },
  };
  const record = (id, detail) => {
    report.checks.push({
      id,
      status: checkOnly ? "PASS-READ-ONLY" : "PASS-PUBLIC-SCRIPT",
      ...detail,
    });
    console.log(`PASS ${id}`);
    const snapshot = JSON.stringify(report, null, 2) + "\n";
    writes = writes.then(() => fs.writeFile(reportFile, snapshot));
  };
  try {
    const keyFile = path.join(dir, "fixture-seats.json"),
      identity = digest(
        JSON.stringify({
          contract: deployment.contract,
          relayer: relayer.address,
          oracle: oracle.address,
        }),
      );
    let saved = await readJson(keyFile);
    if (!saved) {
      requireArc(
        !checkOnly,
        "INVALID_CONFIG",
        "Read-only startup requires existing fixture accounts; run the owner command to create them",
      );
      saved = {
        identity,
        seats: Object.fromEntries(
          ["usdc", "eurc"].map((a) => [
            a,
            [generatePrivateKey(), generatePrivateKey()],
          ]),
        ),
      };
      await atomicJson(keyFile, saved);
    }
    requireArc(
      saved.identity === identity,
      "CONFLICT",
      "Acceptance folder belongs to other roles or deployment; do not reset its journals",
    );
    const accounts = await withArcPhase("fixture-accounts", () =>
      Object.fromEntries(
        Object.entries(saved.seats).map(([asset, keys]) => [
          asset,
          keys.map((key) => privateKeyToAccount(key)),
        ]),
      ),
    );
    async function restartProvider() {
      await active?.close();
      active = await createLiveArcProvider(config);
      return active;
    }
    await restartProvider();
    const { chain, preflight } = active;
    report.preflight = preflight;
    const completed = await runAcceptanceScenario({
      checkOnly,
      initialProvider: active,
      dir,
      chain,
      oracle: oracle.address,
      accounts,
      sign: (a, data) => a.signTypedData(data),
      now: Date.now,
      restartProvider,
      record,
      advanceTo: async (time) => {
        while (
          (await chain.client.getBlock({ blockTag: "latest" })).timestamp < time
        )
          await delay(5000);
      },
    });
    if (!completed) {
      report.startupReady = true;
      return report;
    }
    report.transactions = [];
    for (const role of ["relayer", "oracle"]) {
      const journal = await readJson(
        path.join(dir, `arc-${role}-transactions/journal.json`),
      );
      for (const e of journal.entries)
        report.transactions.push({
          role,
          hash: e.hash,
          blockNumber: e.blockNumber,
          status: e.status,
          costWei: e.costWei,
        });
    }
    report.complete = true;
    console.log(
      "PASS: public scripted A4 flows completed. Keep journals; request independent receipt readback before closing the gate.",
    );
  } catch (error) {
    report.failure = arcFailure(error);
    throw error;
  } finally {
    await active?.close();
    await release();
    await writes;
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
  }
  return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href)
  main().catch((error) => {
    const failure = arcFailure(error);
    console.error(
      `A4 public acceptance stopped (${[failure.code, failure.phase, failure.step].filter(Boolean).join(", ")}). No automatic resend. Keep .local/arc-a4-acceptance and inspect its journals; never share fixture keys or env files.`,
    );
    console.error(JSON.stringify(failure));
    process.exitCode = 1;
  });
