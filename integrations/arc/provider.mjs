// Explicitly activated by the worker CLI. Importing never loads env credentials
// or sends transactions. Public RPC URLs never appear in errors/receipts.
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createArcChain } from "./chain.mjs";
import { arcDeployment, arcLimits } from "./config.mjs";
import { preflightArc } from "./preflight.mjs";
import { createArcTransactions } from "./transactions.mjs";
import { createDripBudget } from "./drip-budget.mjs";
import { createArcLifecycle } from "./lifecycle.mjs";
import { requireArc, same } from "./jobs.mjs";
import { killed } from "../shared/outbox.mjs";
import { withArcPhase } from "./diagnostics.mjs";
import { retryArcReads, arcReadOutage } from "./rpc.mjs";
import { ARC_READ_METHODS } from "./rpc.mjs";
import { setTimeout as delay } from "node:timers/promises";

const hostReadQueues = new Map();
export function paceArcReads(
  request,
  {
    state = { tail: Promise.resolve(), nextAt: 0 },
    wait = delay,
    now = Date.now,
  } = {},
) {
  return async (args, options) => {
    if (!ARC_READ_METHODS.has(args.method)) return request(args, options);
    const turn = state.tail.then(async () => {
      const remaining = state.nextAt - now();
      if (remaining > 0)
        await wait(remaining, undefined, { signal: options?.signal });
      state.nextAt = now() + 150;
    });
    state.tail = turn.catch(() => {});
    await turn;
    return request(args, options);
  };
}

export function arcClient(url, { fetchFn, wait } = {}) {
  const u = new URL(url);
  requireArc(
    u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash,
    "INVALID_CONFIG",
    "Arc public RPC must use credential-free HTTPS",
  );
  if (!hostReadQueues.has(u.host))
    hostReadQueues.set(u.host, { tail: Promise.resolve(), nextAt: 0 });
  return createPublicClient({
    cacheTime: 0,
    transport: (options) => {
      const transport = http(url, { timeout: 10000, retryCount: 0, fetchFn })(
        options,
      );
      return {
        ...transport,
        // Pace every read attempt across clients for this host. Writes bypass
        // the queue and retain retryCount: 0; no results are cached here.
        request: retryArcReads(
          paceArcReads(transport.request, {
            state: hostReadQueues.get(u.host),
            wait,
          }),
          { wait },
        ),
      };
    },
  });
}
export async function preflightArcEndpoints(
  config,
  { makeClient = arcClient } = {},
) {
  const deployment = arcDeployment(config),
    limits = arcLimits(config),
    attempts = [];
  let selected;
  for (const url of config.ARC_RPC_URLS) {
    try {
      const client = makeClient(url),
        chain = createArcChain({ client, deployment });
      const report = await preflightArc({
        chain,
        relayer: config.ARC_RELAYER_ADDRESS,
        oracle: config.ARC_ORACLE_ADDRESS,
        limits,
      });
      attempts.push({
        host: new URL(url).host,
        ok: true,
        blockNumber: report.blockNumber,
      });
      selected ||= { client, chain, report };
    } catch (error) {
      attempts.push({
        host: new URL(url).host,
        ok: false,
        code: error.code || "RPC_UNAVAILABLE",
      });
      // A response proving a different network/code/domain must never be hidden
      // by a second host. Only transport/service outages (including exhausted
      // read-only rate-limit retries) permit trying the other configured host.
      if (!arcReadOutage(error).transient) throw error;
    }
  }
  requireArc(
    selected,
    "PREFLIGHT_FAILED",
    "No Arc RPC passed deployment and funding preflight",
  );
  return { ...selected, limits, report: { ...selected.report, attempts } };
}

export function createArcJobProvider({
  lifecycle,
  now = Date.now,
  intervalMs = 5000,
}) {
  let nextRecovery = 0;
  return {
    independentJobs: true,
    lookup: async () => null,
    execute: (job) => lifecycle.execute(job),
    async idle() {
      if (now() < nextRecovery) return;
      nextRecovery = now() + intervalMs;
      await lifecycle.recover();
    },
  };
}
export async function createLiveArcProvider(config) {
  requireArc(
    config.PARTNERS === "on" && config.WEB3_ARC === "on",
    "INVALID_CONFIG",
    "Live Arc requires explicit on mode",
  );
  requireArc(
    config.ARC_ORACLE === "relay",
    "INVALID_CONFIG",
    "Only the proposal-only relay oracle is implemented",
  );
  requireArc(
    config.ARC_MEMO === "off",
    "INVALID_CONFIG",
    "A4 uses plain transactions; set ARC_MEMO=off until the separate N3/L2 Memo integration is complete",
  );
  const accounts = {};
  for (const role of ["relayer", "oracle"]) {
    const name = `ARC_${role.toUpperCase()}`;
    requireArc(
      config.secrets?.[`${name}_KEY`],
      "INVALID_CONFIG",
      "Both worker-only Arc role keys are required",
    );
    accounts[role] = privateKeyToAccount(config.secrets[`${name}_KEY`]);
    requireArc(
      same(accounts[role].address, config[`${name}_ADDRESS`]),
      "INVALID_CONFIG",
      "Arc role key and public address differ",
    );
  }
  const { client, chain, limits, report } = await withArcPhase(
    "provider-preflight",
    () => preflightArcEndpoints(config),
  );
  const transactions = {},
    close = [];
  const stopped = () => killed(config.WEB3_DATA_DIR, config.WEB3_KILL);
  try {
    for (const role of ["relayer", "oracle"]) {
      transactions[role] = await withArcPhase(`provider-${role}-journal`, () =>
        createArcTransactions({
          role,
          dir: config.WEB3_DATA_DIR,
          client,
          wallet: {
            account: accounts[role],
            signTransaction: (tx) => accounts[role].signTransaction(tx),
          },
          chainId: 5042002,
          owner: accounts[role].address,
          ...limits.roles[role],
          killed: stopped,
        }),
      );
      close.push(() => transactions[role].close());
    }
    const dripBudget = await withArcPhase("provider-drip-budget", () =>
      createDripBudget({
        dir: config.WEB3_DATA_DIR,
        limits: limits.drip,
      }),
    );
    close.push(() => dripBudget.close());
    const lifecycle = await withArcPhase("provider-lifecycle", () =>
      createArcLifecycle({
        dir: config.WEB3_DATA_DIR,
        chain,
        relayer: accounts.relayer.address,
        oracle: accounts.oracle.address,
        transactions,
        dripBudget,
        dripLimits: limits.drip,
        killed: stopped,
      }),
    );
    close.push(() => lifecycle.close());
    let closed = false;
    return {
      ...createArcJobProvider({ lifecycle }),
      chain,
      client,
      transactions,
      preflight: report,
      async close() {
        if (closed) return;
        closed = true;
        for (const fn of [...close].reverse()) await fn();
      },
    };
  } catch (error) {
    for (const fn of [...close].reverse()) await fn();
    throw error;
  }
}
