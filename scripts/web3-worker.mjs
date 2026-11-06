import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseEther, parseGwei } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "../integrations/shared/config.mjs";
import {
  createWorker,
  mockProvider,
  acquireWorkerLock,
} from "../integrations/shared/worker.mjs";
try {
  const verifier = process.argv.includes("verifier");
  const config = loadConfig(process.env, {
    role: verifier ? "verifier" : "worker",
  });
  if (config.PARTNERS === "off" || config.WEB3_ARKIV === "on")
    throw new Error(
      "Worker requires an enabled partner; live Arkiv adapter is not implemented. Enable ENS/Arc explicitly or use MOCK.",
    );
  await mkdir(config.WEB3_DATA_DIR, { recursive: true, mode: 0o700 });
  const release = await acquireWorkerLock(
      verifier
        ? path.join(config.WEB3_DATA_DIR, "verifier-lock")
        : config.WEB3_DATA_DIR,
    ),
    providers = {},
    extraClose = [];
  try {
    if (verifier && config.WEB3_KILL !== "1") {
      if (
        !process.argv.includes("--confirm-arc-testnet") ||
        config.MARKETS !== "on"
      )
        throw Error("Verifier requires explicit market activation");
      const { createArcTransactions } =
        await import("../integrations/arc/transactions.mjs");
      const { arcClient } = await import("../integrations/arc/provider.mjs");
      const { killed } = await import("../integrations/shared/outbox.mjs");
      const account = privateKeyToAccount(config.secrets.MARKET_VERIFIER_KEY);
      if (
        account.address.toLowerCase() !==
        config.MARKET_VERIFIER_ADDRESS.toLowerCase()
      )
        throw Error("Verifier key/address mismatch");
      const transaction = await createArcTransactions({
        role: "oracle",
        dir: path.join(config.WEB3_DATA_DIR, "market-verifier"),
        client: arcClient(config.ARC_RPC_URLS[0]),
        wallet: { account, signTransaction: (r) => account.signTransaction(r) },
        chainId: 5042002,
        owner: account.address,
        budgetWei: parseEther(config.MARKET_VERIFIER_MAX_GAS_USDC),
        maxTransactions: config.ARC_MAX_TRANSACTIONS,
        priorityFeeWei: 0n,
        maxFeePerGasWei: parseGwei(config.ARC_MAX_FEE_GWEI),
        minimumFeePerGasWei: parseGwei("20"),
        nativeBalanceFloorWei: parseEther("0.05"),
        maxPerRoom: config.WEB3_MAX_TX_PER_ROOM,
        maxPerHour: config.WEB3_MAX_TX_PER_HOUR,
        killed: () => killed(config.WEB3_DATA_DIR, config.WEB3_KILL),
      });
      extraClose.push(() => transaction.close());
      providers.verify = await (
        await import("../integrations/market/verifier-provider.mjs")
      ).createMarketVerifierProvider(config, { transaction });
    }
    if (!verifier && config.WEB3_KILL !== "1") {
      for (const partner of ["ens", "arc", "arkiv"])
        if (config[`WEB3_${partner.toUpperCase()}`] === "mock")
          providers[partner] =
            partner === "ens"
              ? await (
                  await import("../integrations/ens/mock.mjs")
                ).createMockEnsProvider(config.WEB3_DATA_DIR)
              : partner === "arc"
                ? (
                    await import("../integrations/arc/mock.mjs")
                  ).createMockArcProvider(config.WEB3_DATA_DIR)
                : mockProvider(config.WEB3_DATA_DIR);
      if (config.WEB3_ENS === "on") {
        if (!process.argv.includes("--confirm-ens-sepolia"))
          throw Error(
            "Live ENS worker requires --confirm-ens-sepolia and explicit caps.",
          );
        providers.ens = await (
          await import("../integrations/ens/provider.mjs")
        ).createLiveEnsProvider(config);
      }
      if (config.WEB3_ARC === "on") {
        if (!process.argv.includes("--confirm-arc-testnet"))
          throw Error(
            "Live Arc worker requires --confirm-arc-testnet, verified deployment pins and explicit budgets.",
          );
        providers.arc = await (
          await import("../integrations/arc/provider.mjs")
        ).createLiveArcProvider(config);
      }
      if (config.MARKETS === "on") {
        if (!providers.arc?.transactions)
          throw Error("Live markets require the Arc signer managers");
        const group = await (
          await import("../integrations/market/provider.mjs")
        ).createLiveMarketProviders(config, {
          transactions: {
            operator: providers.arc.transactions.relayer,
            reporterA: providers.arc.transactions.oracle,
          },
        });
        providers.market = group.market;
        providers.cheer = group.cheer;
        extraClose.push(() => group.close());
      }
      if (config.COMMERCE === "on") {
        if (!providers.arc?.transactions)
          throw Error("Live commerce requires the Arc signer managers");
        const { chain } = await (
          await import("../integrations/shared/live-ports.mjs")
        ).commercePorts(config, providers.arc.transactions.relayer);
        providers.commerce = (
          await import("../integrations/commerce/provider.mjs")
        ).createCommerceJobProvider({ chain, dir: config.WEB3_DATA_DIR });
      }
    }
  } catch (error) {
    for (const close of extraClose.reverse()) await close();
    for (const provider of Object.values(providers)) await provider.close?.();
    await release();
    throw error;
  }
  const worker = createWorker({
    dir: config.WEB3_DATA_DIR,
    providers,
    envKill: config.WEB3_KILL,
    heartbeatFile: verifier ? "heartbeat-verifier.json" : "heartbeat.json",
    jobsPerProviderPoll: 1,
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    await worker.close();
    for (const close of extraClose.reverse()) await close();
    for (const provider of Object.values(providers)) await provider.close?.();
    await release();
    if (process.env.DATABASE_URL)
      await (
        await import("../integrations/storage/runtime.mjs")
      )
        .storageFor(config.WEB3_DATA_DIR)
        ?.store.close();
  };
  const poll = () =>
    worker.poll().catch(() => {
      console.error("Worker I/O failed; jobs retained.");
    });
  const timer = setInterval(poll, 1000);
  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());
  console.log(
    config.WEB3_KILL === "1"
      ? "Worker is paused; no signing or broadcasts."
      : config.PARTNERS === "mock"
        ? "MOCK worker started; no network transactions."
        : "Testnet worker started with explicit partner activation and durable caps; use WEB3_KILL to stop sending.",
  );
  await poll();
} catch (error) {
  console.error(
    error.message.includes("worker")
      ? error.message
      : "Worker startup failed; check configuration and volume access.",
  );
  // Hosted storage owns a persistent PostgreSQL session. Release it on failed
  // startup so Render sees the failure instead of an idle, unhealthy process.
  if (process.env.DATABASE_URL)
    await (
      await import("../integrations/storage/runtime.mjs")
    )
      .storageFor(process.env.WEB3_DATA_DIR || ".local/web3")
      ?.store.close();
  process.exitCode = 1;
}
