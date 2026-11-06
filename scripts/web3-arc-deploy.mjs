// Default is keyless preflight. Only the owner runs the exact --apply command.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import { formatEther } from "viem";
import { loadConfig } from "../integrations/shared/config.mjs";
import {
  atomicJson,
  readJson,
  killed,
} from "../integrations/shared/outbox.mjs";
import { acquireWorkerLock } from "../integrations/shared/worker.mjs";
import { arcClient } from "../integrations/arc/provider.mjs";
import { verifyAsset } from "../integrations/arc/assets.mjs";
import { requireArc, same, json } from "../integrations/arc/jobs.mjs";
import {
  reviewedCreation,
  deploymentLimits,
  preflightDeployment,
  deployOnce,
} from "../integrations/arc/deployment.mjs";
import { main as pinDeployment } from "./web3-arc-pin.mjs";

export function deployArgs(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === "--check"))
    return "check";
  requireArc(
    args.length === 2 &&
      args[0] === "--apply" &&
      args[1] === "--confirm-arc-a4-deploy",
    "INVALID_CONFIG",
    "Use --check, or owner-only --apply --confirm-arc-a4-deploy",
  );
  return "apply";
}
export async function main(args = process.argv.slice(2), env = process.env) {
  const mode = deployArgs(args); // Before env, key, file or network access.
  const read = async (name) => JSON.parse(await fs.readFile(name, "utf8"));
  const source = await read("docs/web3/spikes/arc-readonly-input.json"),
    pin = await read("integrations/arc/studio/A4-DEPLOYMENT.json"),
    artifact = await read(
      "integrations/arc/onchain/contracts/out/ConditionalPot.sol/ConditionalPot.json",
    ),
    data = reviewedCreation(artifact, source.assets, pin),
    limits = deploymentLimits(pin),
    dir = path.resolve(".local/arc-a4-deploy"),
    prior = await readJson(path.join(dir, "arc-deployment/journal.json"));
  requireArc(
    source.chainId === pin.chainId &&
      source.rpcUrls.length >= 2 &&
      new Set(source.rpcUrls.map((url) => new URL(url).hostname)).size >= 2,
    "INVALID_CONFIG",
    "Two distinct public Arc testnet hosts are required",
  );
  const clients = source.rpcUrls.map(arcClient),
    reports = [];
  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    for (const asset of source.assets)
      await verifyAsset(client, { ...asset, chainId: pin.chainId });
    const proof = prior
      ? null
      : await preflightDeployment({
          client,
          owner: source.relayer,
          data,
          limits,
        });
    reports.push(
      json({
        host: new URL(source.rpcUrls[i]).host,
        ...(proof || { existingJournal: true, creationTx: prior.hash }),
      }),
    );
  }
  if (!prior)
    requireArc(
      reports.every(
        (p) =>
          p.nonce === reports[0].nonce && same(p.address, reports[0].address),
      ),
      "INVALID_PROOF",
      "Arc hosts disagree on the deployer nonce",
    );
  const report = {
    at: new Date().toISOString(),
    scope: "KEYLESS PREPARATION; no public signing or sending",
    creationHash: pin.creationHash,
    creationBytes: pin.creationBytes,
    deployer: source.relayer,
    ceilingUSDC: pin.maximumGasUSDC,
    priorityFeeGwei: "0",
    hosts: reports,
  };
  await atomicJson("docs/web3/spikes/g1-arc-deploy-preflight.json", report);
  if (mode === "check") {
    console.log(
      prior
        ? "Existing deployment journal found. Inspect/reconcile that hash; this check did not sign or send."
        : `PASS: both hosts simulate the exact reviewed creation. Primary admitted ceiling ${formatEther(BigInt(reports[0].cost))} test USDC, within 0.1. No signing or sends.`,
    );
    return report;
  }
  const config = loadConfig(env, { role: "worker" }),
    account = privateKeyToAccount(config.secrets.ARC_RELAYER_KEY);
  requireArc(
    same(account.address, source.relayer),
    "INVALID_CONFIG",
    "Deployment key differs from the configured relayer",
  );
  await fs.mkdir(config.WEB3_DATA_DIR, { recursive: true, mode: 0o700 });
  const release = await acquireWorkerLock(config.WEB3_DATA_DIR);
  try {
    const result = await deployOnce({
      client: clients[0],
      owner: account.address,
      data,
      limits,
      dir,
      signTransaction: (request) => account.signTransaction(request),
      killed: () => killed(config.WEB3_DATA_DIR, config.WEB3_KILL),
    });
    const deployment = await pinDeployment([
      "--address",
      result.address,
      "--tx",
      result.hash,
      "--output",
      ".local/arc-public-deployment.json",
    ]);
    const publicReport = {
      ...report,
      at: new Date().toISOString(),
      scope:
        "OWNER-RUN PUBLIC ARC TESTNET DEPLOYMENT; no gameplay or Ledger acceptance claim",
      result,
      deployment,
    };
    await atomicJson(
      "docs/web3/spikes/g1-arc-deployment-public.json",
      publicReport,
    );
    console.log(
      `PASS: ConditionalPot ${result.address}; creation ${result.hash}. Both RPC hosts verified; deployment pin saved. Service env files unchanged.`,
    );
    return publicReport;
  } finally {
    await release();
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href)
  main().catch((error) => {
    const code =
      typeof error.code === "string" && /^[A-Z_]+$/.test(error.code)
        ? error.code
        : "UNAVAILABLE";
    console.error(
      `Deployment stopped (${code}). No automatic resend. Keep .local/arc-a4-deploy and inspect its journal; never share keys or env files.`,
    );
    process.exitCode = 1;
  });
