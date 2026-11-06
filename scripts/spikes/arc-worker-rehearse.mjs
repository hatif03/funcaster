// All mutations are guarded loopback Anvil (31337). Public RPC is read-only.
// No .env file or project role key is loaded. Ephemeral fixture keys stay in RAM.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  toHex,
  parseTransaction,
  decodeFunctionData,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { assertLocalFork } from "./local-fork-guard.mjs";
import { createArcChain, POT_ABI } from "../../integrations/arc/chain.mjs";
import { createArcTransactions } from "../../integrations/arc/transactions.mjs";
import { createDripBudget } from "../../integrations/arc/drip-budget.mjs";
import { createArcLifecycle } from "../../integrations/arc/lifecycle.mjs";
import { createArcJobProvider } from "../../integrations/arc/provider.mjs";
import { preflightArc } from "../../integrations/arc/preflight.mjs";
import { runArcWorkerScenario } from "./arc-worker-scenario.mjs";
import {
  exactFinalization,
  recoverExactOnce,
} from "../../integrations/arc/owner-recovery.mjs";
import { finishRetainedClaims } from "../web3-arc-recover-finalize.mjs";
import { readJson, atomicJson } from "../../integrations/shared/outbox.mjs";
import {
  reviewedCreation,
  deploymentLimits,
  deployOnce,
} from "../../integrations/arc/deployment.mjs";

const sourceConfig = JSON.parse(
  await fs.readFile("docs/web3/spikes/arc-readonly-input.json", "utf8"),
);
const artifactBytes = await fs.readFile(
    "integrations/arc/onchain/contracts/out/ConditionalPot.sol/ConditionalPot.json",
  ),
  artifact = JSON.parse(artifactBytes);
const source = createPublicClient({
  transport: http(sourceConfig.rpcUrls[0], { timeout: 20000, retryCount: 1 }),
});
assert.equal(await source.getChainId(), 5042002);
const sourceBlock = await source.getBlockNumber();
const listener = net.createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const port = listener.address().port;
await new Promise((r) => listener.close(r));
const url = `http://127.0.0.1:${port}`;
const child = spawn(
  ".tools/arc-foundry/anvil",
  [
    "--network",
    "arc",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--chain-id",
    "31337",
    "--fork-url",
    sourceConfig.rpcUrls[0],
    "--fork-block-number",
    String(sourceBlock),
    "--silent",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let simulatorErrors = "";
child.stderr.on("data", (chunk) => {
  simulatorErrors = (simulatorErrors + chunk.toString()).slice(-8192);
});
const chainDef = {
  id: 31337,
  name: "Local Arc worker acceptance",
  nativeCurrency: { name: "Test USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [url] } },
};
const raw = createPublicClient({
  chain: chainDef,
  cacheTime: 0,
  transport: http(url, { timeout: 20000, retryCount: 0 }),
});
const guard = async () =>
  assertLocalFork(
    url,
    await raw.getChainId(),
    await raw.request({ method: "web3_clientVersion" }),
  );
const mutate = async (method, params) => {
  await guard();
  return raw.request({ method, params });
};
const wallet = (account) =>
  createWalletClient({
    account,
    chain: chainDef,
    transport: http(url, { timeout: 20000, retryCount: 0 }),
  });
const fresh = () => privateKeyToAccount(generatePrivateKey());
const relayer = fresh(),
  oracle = fresh(),
  deployer = fresh(),
  accounts = { usdc: [fresh(), fresh()], eurc: [fresh(), fresh()] };
const dir = await fs.mkdtemp(path.join(tmpdir(), "chonks-a4-fork-"));
let clock = Date.now(),
  active,
  success = false;
const now = () => Math.max(Date.now(), clock);
const report = {
  at: new Date().toISOString(),
  scope: "LOCAL ARC FORK ONLY; no public broadcasts or role keys",
  sourceBlock: String(sourceBlock),
  artifactSha256: createHash("sha256").update(artifactBytes).digest("hex"),
  checks: [],
};
const record = (id, detail) => {
  report.checks.push({ id, status: "PASS-LOCAL", ...detail });
  console.log(`PASS-LOCAL ${id}`);
};
async function waitReceipt({ hash }) {
  for (let n = 0; n < 120; n++) {
    try {
      return await raw.getTransactionReceipt({ hash });
    } catch (e) {
      if (e.name !== "TransactionReceiptNotFoundError") throw e;
      await delay(250);
    }
  }
  throw Error("Local receipt unresolved; no resend");
}
// Inject only a loopback transport guard and bounded receipt polling. All actual
// signing/admission/reconciliation logic is the production transaction port.
let delayedRefundHash,
  delayedRefundReads = 0,
  unavailableFinalizeHash,
  finalizationAdmissions = 0;
const client = {
  ...raw,
  async getBlock(input) {
    const block = await raw.getBlock(input);
    if (input?.blockTag === "latest")
      clock = Math.max(clock, Number(block.timestamp) * 1000);
    return block;
  },
  async sendRawTransaction(input) {
    await guard();
    const tx = parseTransaction(input.serializedTransaction);
    let method;
    try {
      method = decodeFunctionData({ abi: POT_ABI, data: tx.data }).functionName;
    } catch {
      /* token or creation */
    }
    if (method === "finalize" && ++finalizationAdmissions === 2) {
      unavailableFinalizeHash = keccak256(input.serializedTransaction);
      throw Object.assign(
        Error("Injected transport loss before local finalization send"),
        { code: "UNAVAILABLE" },
      );
    }
    const hash = await raw.sendRawTransaction(input);
    // Reproduce public RPC receipt visibility lag after a mined recovery refund.
    // Only readback is withheld; the transaction is never sent a second time.
    if (!delayedRefundHash) {
      try {
        const tx = parseTransaction(input.serializedTransaction);
        if (
          tx.to &&
          decodeFunctionData({ abi: POT_ABI, data: tx.data }).functionName ===
            "refund"
        )
          delayedRefundHash = hash;
      } catch {
        /* Token calls and creation are not refund candidates. */
      }
    }
    return hash;
  },
  async getTransaction(input) {
    const tx = await raw.getTransaction(input);
    if (input.hash === delayedRefundHash && delayedRefundReads < 2) {
      delayedRefundReads++;
      return { ...tx, blockHash: null };
    }
    return tx;
  },
  waitForTransactionReceipt: waitReceipt,
};
try {
  let ready = false;
  for (let n = 0; n < 120; n++) {
    if (child.exitCode !== null) throw Error("Local Anvil exited");
    try {
      await guard();
      ready = true;
      break;
    } catch {
      await delay(250);
    }
  }
  assert(ready, "Local Anvil startup timeout");
  for (const a of [deployer, relayer, oracle])
    await mutate("anvil_setBalance", [a.address, toHex(100n * 10n ** 18n)]);
  await guard();
  const pin = JSON.parse(
    await fs.readFile("integrations/arc/studio/A4-DEPLOYMENT.json", "utf8"),
  );
  const deployOptions = {
    dir,
    client,
    owner: deployer.address,
    data: reviewedCreation(artifact, sourceConfig.assets, pin),
    limits: deploymentLimits(pin),
    chainId: 31337,
    localGuard: guard,
    now,
    signTransaction: async (request) => {
      await guard();
      return deployer.signTransaction(request);
    },
  };
  const creation = await deployOnce(deployOptions);
  const resumedCreation = await deployOnce({
    ...deployOptions,
    signTransaction: () => {
      throw Error("Deployment rerun must not sign");
    },
  });
  assert.equal(resumedCreation.hash, creation.hash);
  assert.equal(resumedCreation.reconciled, true);
  const deployed = await waitReceipt({ hash: creation.hash });
  assert.equal(deployed.status, "success");
  record("bounded owner deployment and no-send rerun", {
    tx: creation.hash,
    costWei: creation.costWei,
    ceilingUSDC: "0.1",
    detail:
      "Production deployment runner; exact Studio payload, zero priority, durable no-resend journal",
  });
  const contract = deployed.contractAddress,
    tokenAbi = parseAbi([
      "function masterMinter() view returns (address)",
      "function configureMinter(address,uint256) returns (bool)",
      "function mint(address,uint256) returns (bool)",
      "function blacklister() view returns (address)",
      "function blacklist(address)",
      "function unBlacklist(address)",
    ]);
  const eurc = sourceConfig.assets.find((a) => a.symbol === "EURC").address;
  const master = await raw.readContract({
    address: eurc,
    abi: tokenAbi,
    functionName: "masterMinter",
  });
  await mutate("anvil_impersonateAccount", [master]);
  await mutate("anvil_setBalance", [master, toHex(100n * 10n ** 18n)]);
  for (const [account, functionName, args] of [
    [master, "configureMinter", [deployer.address, 1_000_000_000n]],
    [deployer, "mint", [relayer.address, 10_000_000n]],
  ]) {
    await guard();
    assert.equal(
      (
        await waitReceipt({
          hash: await wallet(account).writeContract({
            address: eurc,
            abi: tokenAbi,
            functionName,
            args,
            maxFeePerGas: 40_000_000_000n,
            maxPriorityFeePerGas: 0n,
          }),
        })
      ).status,
      "success",
    );
  }
  const deployment = {
    contract,
    runtimeCodeHash: keccak256(await raw.getCode({ address: contract })),
    blockNumber: Number(deployed.blockNumber),
    assets: sourceConfig.assets,
    chainId: 31337,
    explorer: "http://127.0.0.1",
  };
  report.deployment = deployment;
  const chain = createArcChain({ client, deployment, now, localGuard: guard });
  const common = {
    budgetWei: 2n * 10n ** 18n,
    maxTransactions: 160,
    maxPerRoom: 100,
    maxPerHour: 160,
    priorityFeeWei: 0n,
    maxFeePerGasWei: 100_000_000_000n,
    minimumFeePerGasWei: 20_000_000_000n,
    nativeBalanceFloorWei: 10n ** 18n,
  };
  const drip = Object.fromEntries(
    ["usdc", "eurc"].map((a) => [
      a,
      {
        perDevice: 60000n,
        perIpHour: 120000n,
        perRoom: 120000n,
        total: 120000n,
        bankroll: 60000n,
        floor: 50000n,
      },
    ]),
  );
  report.preflight = await preflightArc({
    chain,
    relayer: relayer.address,
    oracle: oracle.address,
    limits: { roles: { relayer: common, oracle: common }, drip },
  });
  record("deployment and asset preflight", {
    detail:
      "Actual reviewed bytecode and both token domains; unsigned create simulation",
  });
  async function restartProvider() {
    if (active) await active.close();
    const ports = {};
    for (const [role, account] of [
      ["relayer", relayer],
      ["oracle", oracle],
    ])
      ports[role] = await createArcTransactions({
        dir,
        role,
        chainId: 31337,
        client,
        wallet: {
          account,
          async signTransaction(tx) {
            await guard();
            return account.signTransaction(tx);
          },
        },
        owner: account.address,
        ...common,
      });
    const budget = await createDripBudget({ dir, limits: drip });
    const lifecycle = await createArcLifecycle({
      dir,
      chain,
      relayer: relayer.address,
      oracle: oracle.address,
      transactions: ports,
      dripBudget: budget,
      dripLimits: drip,
      now,
    });
    active = {
      ...createArcJobProvider({ lifecycle, now, intervalMs: 0 }),
      chain,
      async close() {
        await lifecycle.close();
        await budget.close();
        for (const p of Object.values(ports)) await p.close();
      },
    };
    return active;
  }
  const advanceTo = async (seconds) => {
    const latest = await raw.getBlock({ blockTag: "latest" });
    if (latest.timestamp < seconds) {
      await mutate("evm_setNextBlockTimestamp", [Number(seconds)]);
      await mutate("evm_mine", []);
    }
    clock =
      Number((await raw.getBlock({ blockTag: "latest" })).timestamp) * 1000;
  };
  async function blockSeat(asset, seat, blocked) {
    const issuer = await raw.readContract({
      address: asset.address,
      abi: tokenAbi,
      functionName: "blacklister",
    });
    await mutate("anvil_impersonateAccount", [issuer]);
    await mutate("anvil_setBalance", [issuer, toHex(100n * 10n ** 18n)]);
    await guard();
    assert.equal(
      (
        await waitReceipt({
          hash: await wallet(issuer).writeContract({
            address: asset.address,
            abi: tokenAbi,
            functionName: blocked ? "blacklist" : "unBlacklist",
            args: [seat],
            maxFeePerGas: 40_000_000_000n,
            maxPriorityFeePerGas: 0n,
          }),
        })
      ).status,
      "success",
    );
  }
  const scenario = {
    dir,
    chain,
    oracle: oracle.address,
    accounts,
    sign: async (a, data) => {
      await guard();
      return a.signTypedData({
        ...data,
        domain: { ...data.domain, chainId: 31337 },
      });
    },
    advanceTo,
    restartProvider,
    now,
    record,
    waitRetry: (ms) => advanceTo(BigInt(Math.ceil((now() + ms) / 1000))),
    outcomeTimeoutMs: 5000,
    crashCreate: true,
    beforeCooperative: ({ asset, seats }) =>
      blockSeat(asset, seats[0].address, true),
    async afterCooperative({ asset, seats, intent }) {
      const proof = await chain.snapshot(intent.potId);
      assert.deepEqual(proof.claimables, [1400n, 0n]);
      record(`${asset.symbol.toLowerCase()} blocked recipient isolation`, {
        potId: intent.potId,
        detail:
          "Worker left blocked seat claimable and paid the other seat; unblocking permits recovery",
      });
      await blockSeat(asset, seats[0].address, false);
    },
  };
  await assert.rejects(
    runArcWorkerScenario({
      ...scenario,
      initialProvider: await restartProvider(),
    }),
    (e) =>
      e.code === "ACCEPTANCE_RECOVERY_PENDING" && e.step === "arc.pot.finalize",
  );
  assert(unavailableFinalizeHash);
  assert.equal(
    finalizationAdmissions,
    2,
    "Worker must never automatically resend the uncertain finalization",
  );
  await active.close();
  active = undefined;
  const journalFile = path.join(dir, "arc-relayer-transactions/journal.json");
  const retained = await readJson(journalFile);
  assert.equal(retained.entries.length, 48);
  const admission = retained.entries.at(-1);
  assert.equal(admission.hash, unavailableFinalizeHash);
  const retainedPots = await readJson(
    path.join(dir, "arc-lifecycle/journal.json"),
  );
  const pot = Object.values(retainedPots.pots).find((p) =>
    admission.id.includes(p.potId),
  );
  const candidate = exactFinalization({
    entry: admission,
    owner: relayer.address,
    contract,
    potId: pot.potId,
    places: pot.places,
    expectedHash: unavailableFinalizeHash,
    spentWei: retained.entries
      .slice(0, -1)
      .reduce((v, e) => v + BigInt(e.costWei), 0n),
    chainId: 31337,
  });
  let ownerDispatches = 0;
  const recoveryClient = {
    ...raw,
    sendRawTransaction: async (input) => {
      await guard();
      ownerDispatches++;
      return raw.sendRawTransaction(input);
    },
  };
  const ownerOptions = {
    candidate,
    clients: [raw, recoveryClient],
    localGuard: guard,
    now,
    markerFile: path.join(dir, "owner-finalize-recovery.json"),
    wallet: {
      account: relayer,
      signTransaction: async (tx) => {
        await guard();
        return relayer.signTransaction(tx);
      },
    },
    ready: async () =>
      assert.equal((await chain.snapshot(pot.potId)).state, "Proposed"),
  };
  const recovered = await recoverExactOnce(ownerOptions);
  assert.equal(recovered.hash, admission.hash);
  Object.assign(admission, {
    status: "success",
    costWei: recovered.costWei,
    blockNumber: recovered.blockNumber,
  });
  await atomicJson(journalFile, retained);
  const final = await finishRetainedClaims({
    dir,
    provider: await restartProvider(),
    potId: pot.potId,
    wallNow: now,
    wait: scenario.waitRetry,
  });
  record("eurc finalize", {
    potId: pot.potId,
    state: final.state,
    blockNumber: final.blockNumber,
    blockHash: final.blockHash,
    claimables: final.claimables.map(String),
  });
  await active.close();
  active = undefined;
  await recoverExactOnce({
    ...ownerOptions,
    wallet: {
      account: relayer,
      signTransaction: () => {
        throw Error("Recovered hash must never be re-signed");
      },
    },
  });
  assert.equal(ownerDispatches, 1);
  record("owner exact-hash finalization recovery", {
    hash: admission.hash,
    detail:
      "Transport loss after admission reproduced; normal worker sends nothing; explicit owner runner reconstructs the identical hash once and its rerun is read-only",
  });
  record("journal-confirmed remaining claims", {
    detail:
      "Only the final EURC claims resume; 50 relayer and 4 oracle admissions, with canonical success journals and paid claims",
  });
  assert.equal(delayedRefundReads, 2);
  record("delayed recovery receipt and claims", {
    detail:
      "Two temporary noncanonical transaction readbacks after a mined refund; bounded outcome polling finishes claims without another refund send",
  });
  const transactionCounts = async () =>
    Promise.all(
      ["relayer", "oracle"].map(
        async (role) =>
          JSON.parse(
            await fs.readFile(
              path.join(dir, `arc-${role}-transactions/journal.json`),
              "utf8",
            ),
          ).entries.length,
      ),
    );
  const beforeResume = await transactionCounts();
  await runArcWorkerScenario({
    ...scenario,
    crashCreate: false,
    beforeCooperative: undefined,
    afterCooperative: undefined,
    record: () => {},
  });
  assert.deepEqual(await transactionCounts(), beforeResume);
  record("complete scenario rerun", {
    detail:
      "Stored intents, signature payloads and results replay without another transaction",
  });
  const rows = [];
  for (const role of ["relayer", "oracle"]) {
    const journal = JSON.parse(
      await fs.readFile(
        path.join(dir, `arc-${role}-transactions/journal.json`),
        "utf8",
      ),
    );
    for (const row of journal.entries) {
      assert.equal(row.status, "success");
      const tx = await raw.getTransaction({ hash: row.hash });
      assert.equal(tx.maxPriorityFeePerGas, 0n);
      assert(tx.maxFeePerGas >= 20_000_000_000n);
      assert.equal(tx.value, 0n);
      rows.push({
        role,
        hash: row.hash,
        blockNumber: row.blockNumber,
        costWei: row.costWei,
      });
    }
  }
  assert.equal(
    await raw.readContract({
      address: sourceConfig.assets[0].address,
      abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
      functionName: "balanceOf",
      args: [contract],
    }),
    0n,
  );
  assert.equal(
    await raw.readContract({
      address: eurc,
      abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
      functionName: "balanceOf",
      args: [contract],
    }),
    0n,
  );
  report.transactions = rows;
  record("all pot funds conserved and claimed", {
    transactions: rows.length,
    gasPriority: "0",
    feeFloorGwei: "20",
    contractBalances: { USDC: "0", EURC: "0" },
  });
  success = true;
} catch (error) {
  report.failure = {
    name: error.name,
    code: error.code || null,
    message: error.shortMessage || error.message,
    causes: [],
    source: error.stack
      ?.split("\n")
      .filter((line) => line.trim().startsWith("at "))
      .slice(0, 6),
  };
  for (let e = error.cause, n = 0; e && n < 8; e = e.cause, n++)
    report.failure.causes.push({ name: e.name, code: e.code ?? null });
  if (simulatorErrors)
    await fs.writeFile(path.join(dir, "anvil-stderr.txt"), simulatorErrors, {
      mode: 0o600,
    });
  report.privateJournal = dir;
  console.error(
    "A4 local fork stopped; inspect its report and retained private journal. No automatic resend.",
  );
  process.exitCode = 1;
} finally {
  await active?.close();
  if (child.exitCode === null) {
    const stopped = once(child, "exit");
    child.kill("SIGTERM");
    await stopped;
  }
  await fs.writeFile(
    "docs/web3/spikes/g1-arc-worker-rehearsal.json",
    JSON.stringify(
      report,
      (_, v) => (typeof v === "bigint" ? String(v) : v),
      2,
    ) + "\n",
  );
  if (success) await fs.rm(dir, { recursive: true, force: true });
}
