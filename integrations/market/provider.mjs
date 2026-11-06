import { privateKeyToAccount } from "viem/accounts";
import { arcClient } from "../arc/provider.mjs";
import { createMarketChain } from "./chain.mjs";
import { createCheerChain } from "./cheer-chain.mjs";
import { createMarketLifecycle, createMarketProvider } from "./lifecycle.mjs";
import { createCheerLifecycle } from "./cheer-lifecycle.mjs";
import { killed } from "../shared/outbox.mjs";
import { cachedMarketClient } from "./read-cache.mjs";
export function marketRoles(config) {
  const roles = {
    operator: config.MARKET_OPERATOR_ADDRESS,
    reporterA: config.MARKET_REPORTER_A_ADDRESS,
    verifierB: config.MARKET_VERIFIER_ADDRESS,
  };
  if (
    Object.values(roles).some((a) => !/^0x[\da-f]{40}$/i.test(a)) ||
    new Set(Object.values(roles).map((a) => a.toLowerCase())).size !== 3
  )
    throw Error("Three distinct public market role addresses are required");
  return roles;
}
export async function createLiveMarketChains(
  config,
  { makeClient = arcClient, now = Date.now } = {},
) {
  if (
    config.PARTNERS !== "on" ||
    config.MARKETS !== "on" ||
    config.WEB3_ARC !== "on"
  )
    throw Error("Live predictions require explicit Arc activation");
  marketRoles(config);
  const common = {
    chainId: 5042002,
    assets: [{ symbol: "USDC", address: config.ARC_USDC }],
    explorer: config.ARC_EXPLORER_URL,
  };
  let last;
  for (const url of config.ARC_RPC_URLS) {
    try {
      const client = cachedMarketClient(makeClient(url), { now }),
        market = createMarketChain({
          client,
          now,
          deployment: {
            ...common,
            contract: config.MARKET_POT_ADDRESS,
            codeHash: config.MARKET_POT_CODE_HASH,
          },
        }),
        cheer = createCheerChain({
          client,
          now,
          deployment: {
            ...common,
            contract: config.MARKET_SPLIT_ADDRESS,
            codeHash: config.MARKET_SPLIT_CODE_HASH,
          },
        });
      await market.deployment();
      await cheer.deployment();
      return { market, cheer };
    } catch (error) {
      last = error;
      if (/changed|mismatch|pins|required|Explicit/.test(error.message))
        throw error;
    }
  }
  throw last || Error("No market RPC passed preflight");
}
export async function createLiveMarketProviders(
  config,
  { transactions, chains, now = Date.now } = {},
) {
  const roles = marketRoles(config);
  if (
    ["operator", "reporterA"].some(
      (role) =>
        !transactions?.[role]?.transact || !transactions[role]?.receipts,
    )
  )
    throw Error("Shared budgeted market transaction managers are required");
  transactions = {
    ...transactions,
    verifierB: {
      transact() {
        throw Error("Verifier B runs in its isolated service");
      },
      receipts: async () => [],
    },
  };
  chains ||= await createLiveMarketChains(config, { now });
  const stop = () => killed(config.WEB3_DATA_DIR, config.WEB3_KILL);
  let market, cheer;
  try {
    market = await createMarketLifecycle({
      dir: config.WEB3_DATA_DIR,
      chain: chains.market,
      transactions,
      roles,
      killed: stop,
    });
    cheer = await createCheerLifecycle({
      dir: config.WEB3_DATA_DIR,
      chain: chains.cheer,
      transactions,
      roles,
      killed: stop,
    });
    return {
      market: createMarketProvider({ lifecycle: market, now }),
      cheer: createMarketProvider({ lifecycle: cheer, now }),
      async close() {
        await market.close();
        await cheer.close();
      },
    };
  } catch (error) {
    await market?.close();
    await cheer?.close();
    throw error;
  }
}
