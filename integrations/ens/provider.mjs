// Owner-operated live adapter. Importing this file does not load credentials,
// start a worker or send a transaction.
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseGwei,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadProtocol, createReadClient } from "./runtime.mjs";
import { preflightEns, readDeploymentDocument } from "./preflight.mjs";
import { createEnsTransactions } from "./transactions.mjs";
import { createEnsLifecycle } from "./lifecycle.mjs";
import { createEnsJobProvider } from "./jobs.mjs";
import { createChampionAdapter } from "./champion.mjs";
import { stableEnsAdmission } from "./admission.mjs";
import { ensRpcTransport } from "./rpc.mjs";
import { requireEns } from "./errors.mjs";
import { killed, readJson, listJobs } from "../shared/outbox.mjs";

export function ensLimits(config) {
  for (const key of [
    "ENS_MAX_TOTAL_GAS_ETH",
    "ENS_MAX_TRANSACTIONS",
    "ENS_MAX_FEE_GWEI",
    "ENS_PRIORITY_FEE_GWEI",
    "WEB3_MAX_TX_PER_ROOM",
    "WEB3_MAX_TX_PER_HOUR",
  ])
    requireEns(
      config[key] !== "" && config[key] !== undefined,
      "INVALID_CONFIG",
      `${key} is required for live ENS sending`,
    );
  const limits = {
    budgetWei: parseEther(String(config.ENS_MAX_TOTAL_GAS_ETH)),
    maxTransactions: config.ENS_MAX_TRANSACTIONS,
    priorityFeeWei: parseGwei(String(config.ENS_PRIORITY_FEE_GWEI)),
    maxFeePerGasWei: parseGwei(String(config.ENS_MAX_FEE_GWEI)),
    maxPerRoom: config.WEB3_MAX_TX_PER_ROOM,
    maxPerHour: config.WEB3_MAX_TX_PER_HOUR,
  };
  requireEns(
    limits.budgetWei > 0n &&
      limits.priorityFeeWei > 0n &&
      limits.maxFeePerGasWei >= limits.priorityFeeWei &&
      [limits.maxTransactions, limits.maxPerRoom, limits.maxPerHour].every(
        (n) => Number.isSafeInteger(n) && n > 0,
      ),
    "INVALID_CONFIG",
    "ENS limits must be positive and the priority fee must fit its ceiling",
  );
  return limits;
}
export async function createLiveEnsProvider(config) {
  requireEns(
    config.PARTNERS === "on" && config.WEB3_ENS === "on",
    "INVALID_CONFIG",
    "Live ENS requires explicit on mode",
  );
  const limits = ensLimits(config),
    account = privateKeyToAccount(config.secrets.ENS_REGISTRAR_KEY);
  requireEns(
    account.address.toLowerCase() ===
      config.ENS_REGISTRAR_ADDRESS.toLowerCase(),
    "WRONG_SIGNER",
    "Registrar key and public address differ",
  );
  const protocol = await loadProtocol(),
    url = config.ENS_RPC_URLS[0];
  const report = await preflightEns({
    config,
    protocol,
    client: createReadClient(protocol, url),
    html: await readDeploymentDocument(),
  });
  requireEns(
    report.ok,
    "PREFLIGHT_FAILED",
    "ENS deployment or namespace preflight failed",
  );
  const client = createPublicClient({
    chain: protocol.chain,
    cacheTime: 0,
    transport: ensRpcTransport(url),
  });
  const wallet = createWalletClient({
    account,
    chain: protocol.chain,
    transport: http(url, { retryCount: 0, timeout: 10000 }),
  });
  const transactions = await createEnsTransactions({
    dir: config.WEB3_DATA_DIR,
    client,
    wallet,
    chainId: protocol.chainId,
    owner: account.address,
    ...limits,
    killed: () => killed(config.WEB3_DATA_DIR, config.WEB3_KILL),
  });
  let lifecycle, champion;
  const transact = stableEnsAdmission(transactions);
  try {
    lifecycle = await createEnsLifecycle({
      dir: path.join(config.WEB3_DATA_DIR, "ens-namespaces", config.ENS_PARENT),
      client,
      protocol,
      owner: account.address,
      config,
      transact,
    });
    if (config.WEB3_ENS_CHAMPION === "on") {
      champion = await createChampionAdapter({
        dir: path.join(
          config.WEB3_DATA_DIR,
          "ens-namespaces",
          config.ENS_PARENT,
        ),
        client,
        protocol,
        config,
        transact,
        verifyEligibility: async ({ address, resultHash }) => {
          const community = await readJson(
            path.join(config.WEB3_DATA_DIR, "community.json"),
          );
          const record = await readJson(
            path.join(
              config.WEB3_DATA_DIR,
              "records",
              "rounds",
              `${resultHash}.json`,
            ),
          );
          const addresses =
            community?.earned?.[resultHash]?.addresses ||
            Object.entries(community?.eligible || {})
              .filter(([, hash]) => hash === resultHash)
              .map(([owner]) => owner);
          if (
            !addresses.some(
              (owner) => owner.toLowerCase() === address.toLowerCase(),
            )
          )
            return null;
          return { result: record?.result, addresses };
        },
      });
      const ready = await champion.preflight();
      requireEns(
        ready.ready,
        ready.code || "CHAMPION_NOT_READY",
        ready.message || "Champion namespace is not ready",
      );
    }
    const provider = createEnsJobProvider({
      lifecycle,
      champion,
      transactions,
      explorer: config.ENS_EXPLORER_URL,
      queuedJobs: () => listJobs(config.WEB3_DATA_DIR),
    });
    let nextRefill = 0;
    return {
      ...provider,
      async idle() {
        if (Date.now() < nextRefill) return;
        nextRefill = Date.now() + 30000;
        await lifecycle.refill();
      },
      async close() {
        await champion?.close();
        await lifecycle.close();
        await transactions.close();
      },
    };
  } catch (error) {
    await champion?.close();
    await lifecycle?.close();
    await transactions.close();
    throw error;
  }
}
