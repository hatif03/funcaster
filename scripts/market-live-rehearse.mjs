// Basic acceptance against fresh localhost Anvil contracts. Never loads env keys.
import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseEther,
  toHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  createMarketChain,
  marketNonce,
} from "../integrations/market/chain.mjs";
import { createMarketLifecycle } from "../integrations/market/lifecycle.mjs";
import { createArcTransactions } from "../integrations/arc/transactions.mjs";
import { assertLocalFork } from "./spikes/local-fork-guard.mjs";
import { makeResult } from "../server/records.cjs";
import { gameById } from "../core/catalog.js";
import express from "express";
import marketServer from "../server/market/index.cjs";
import { createCheerChain } from "../integrations/market/cheer-chain.mjs";
import { createLiveMarketProviders } from "../integrations/market/provider.mjs";
import { createMarketVerifierProvider } from "../integrations/market/verifier-provider.mjs";
import {
  createOutbox,
  readJobReceipt,
  listJobs,
} from "../integrations/shared/outbox.mjs";
import { createWorker } from "../integrations/shared/worker.mjs";
import { identityData } from "../integrations/market/types.mjs";
import { fundingIntent } from "../integrations/market/intents.mjs";
const dir = await mkdtemp(path.join(os.tmpdir(), "chonks-market-live-"));
const listener = net.createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const port = listener.address().port;
await new Promise((r) => listener.close(r));
const url = `http://127.0.0.1:${port}`,
  child = spawn(
    ".tools/arc-foundry/anvil",
    [
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--chain-id",
      "31337",
      "--silent",
    ],
    { stdio: "ignore" },
  );
const definition = {
  id: 31337,
  name: "Local Funcaster market tests",
  nativeCurrency: { name: "Test", symbol: "TEST", decimals: 18 },
  rpcUrls: { default: { http: [url] } },
};
const raw = createPublicClient({
  chain: definition,
  cacheTime: 0,
  transport: http(url, { retryCount: 0 }),
});
const guard = async () =>
  assertLocalFork(
    url,
    await raw.getChainId(),
    await raw.request({ method: "web3_clientVersion" }),
  );
const fresh = () => {
  const key = generatePrivateKey();
  return { key, account: privateKeyToAccount(key) };
};
const actors = Array.from({ length: 7 }, fresh);
let lifecycle,
  ports = {},
  clock = Date.now(),
  marketChain;
let httpServer, marketHttp, queue, worker, verifierWorker, liveProviders;
const wallet = (account) =>
  createWalletClient({
    account,
    chain: definition,
    transport: http(url, { retryCount: 0 }),
  });
async function write(request) {
  await guard();
  const hash = await wallet(actors[0].account).writeContract(request);
  await raw.waitForTransactionReceipt({ hash });
}
async function advance(seconds) {
  await guard();
  await raw.request({ method: "evm_increaseTime", params: [seconds] });
  await raw.request({ method: "evm_mine", params: [] });
  clock = Number((await raw.getBlock()).timestamp) * 1000;
}
const checks = [];
try {
  for (let n = 0; ; n++) {
    try {
      await guard();
      break;
    } catch (error) {
      if (n > 40) throw error;
      await delay(100);
    }
  }
  for (const actor of actors)
    await raw.request({
      method: "anvil_setBalance",
      params: [actor.account.address, toHex(parseEther("50"))],
    });
  const artifact = async (name) =>
    JSON.parse(
      await readFile(
        `integrations/market/onchain/contracts/out/${name}.sol/${name}.json`,
        "utf8",
      ),
    );
  const tokenArtifact = await artifact("MockEIP3009Token"),
    marketArtifact = await artifact("ChonksMatchMarkets");
  async function deploy(artifact, args, account = actors[0].account) {
    await guard();
    const hash = await wallet(account).deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object,
      args,
    });
    return (await raw.waitForTransactionReceipt({ hash })).contractAddress;
  }
  const token = await deploy(tokenArtifact, ["USDC", "USDC"]),
    contract = await deploy(marketArtifact, [[token]]);
  for (const actor of actors.slice(3))
    await write({
      address: token,
      abi: tokenArtifact.abi,
      functionName: "mint",
      args: [actor.account.address, 1_000_000n],
    });
  // The Studio token mock has no pause/version views. Supply ONLY those three
  // local fixture views; all signatures, balances, contracts and receipts are EVM.
  const client = {
    ...raw,
    async readContract(request) {
      if (request.address.toLowerCase() === token.toLowerCase()) {
        if (request.functionName === "version") return "2";
        if (["paused", "isBlacklisted"].includes(request.functionName))
          return false;
      }
      return raw.readContract(request);
    },
  };
  const roles = {
    operator: actors[0].account.address,
    reporterA: actors[1].account.address,
    verifierB: actors[2].account.address,
  };
  const deployment = {
    chainId: 31337,
    contract,
    codeHash: keccak256(await raw.getCode({ address: contract })),
    assets: [{ symbol: "USDC", address: token }],
    explorer: "http://127.0.0.1",
  };
  marketChain = createMarketChain({
    client,
    deployment,
    now: () => Math.max(Date.now(), clock),
    localGuard: guard,
  });
  await marketChain.deployment();
  checks.push("fresh runtime/token/domain preflight");
  for (const [i, role] of ["operator", "reporterA", "verifierB"].entries()) {
    const account = actors[i].account;
    ports[role] = await createArcTransactions({
      role: "relayer",
      dir: path.join(dir, role),
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
      budgetWei: 2n * 10n ** 18n,
      maxTransactions: 80,
      maxPerRoom: 50,
      maxPerHour: 100,
      priorityFeeWei: 0n,
      maxFeePerGasWei: 100_000_000_000n,
      minimumFeePerGasWei: 20_000_000_000n,
      nativeBalanceFloorWei: 10n ** 18n,
    });
  }
  lifecycle = await createMarketLifecycle({
    dir,
    chain: marketChain,
    transactions: ports,
    roles,
    verifierKey: actors[2].key,
  });
  const game = gameById("star-catch"),
    room = {
      code: "LOCALX",
      roundId: 1,
      active: [0, 1],
      match: { seed: 77 },
      replay: [],
      game: "star-catch",
      startedAt: clock - 1000,
    };
  const record = makeResult(
    room,
    game,
    [
      { slot: 0, score: 0 },
      { slot: 1, score: 0 },
    ],
    clock,
  );
  let serial = 0;
  const run = (type, payload, id = `local:${++serial}`) =>
    lifecycle.execute({ type, idempotencyKey: id, payload });
  async function create(ref) {
    const block = await raw.getBlock();
    const params = {
      token,
      operator: roles.operator,
      outcomeCount: 2,
      closeTime: block.timestamp + 60n,
      resolveDeadline: block.timestamp + 300n,
      liveness: 60,
      feeBps: 0,
      minBet: 50_000n,
      perUserCap: 1_000_000n,
      poolCap: 25_000_000n,
      reporterA: roles.reporterA,
      verifierB: roles.verifierB,
      excluded: [actors[5].account.address, actors[6].account.address],
    };
    const result = await run("market.create", {
      marketRef: ref,
      params,
      context: {
        gameId: game.gameId,
        bundleHash: record.result.bundleHash,
        slots: [0, 1],
      },
    });
    return { ref, id: result.data.marketId, params };
  }
  async function bet(m, actor, outcome) {
    const bettor = actor.account.address,
      salt = keccak256(toHex(`${m.ref}:${bettor}:${outcome}`)),
      amount = 50_000n,
      minPayout = 0n,
      nonce = marketNonce({
        chainId: 31337,
        contract,
        marketId: m.id,
        outcome,
        amount,
        minPayout,
        bettor,
        salt,
      });
    const message = {
      from: bettor,
      to: contract,
      value: amount,
      validAfter: 0n,
      validBefore: m.params.closeTime,
      nonce,
    };
    const types = {
      ReceiveWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };
    const signature = await actor.account.signTypedData({
      domain: {
        name: "USDC",
        version: "2",
        chainId: 31337,
        verifyingContract: token,
      },
      types,
      primaryType: "ReceiveWithAuthorization",
      message,
    });
    return run("market.bet", {
      marketRef: m.ref,
      bettor,
      outcome,
      amount: String(amount),
      minPayout: "0",
      validAfter: "0",
      validBefore: String(m.params.closeTime),
      salt,
      signature,
    });
  }
  const m = await create(`0x${"01".repeat(32)}`);
  await bet(m, actors[3], 0);
  await bet(m, actors[4], 1);
  checks.push("actual EIP3009 intent-bound bets");
  await advance(66);
  await run("market.started", {
    marketRef: m.ref,
    matchId: record.result.matchId,
  });
  await run("market.report", { marketRef: m.ref, layer: "A", record });
  await run("market.report", { marketRef: m.ref, layer: "B", record });
  checks.push("distinct reporters and separate-process replay");
  await advance(61);
  await run("market.finalize", { marketRef: m.ref });
  await run("market.claim", {
    marketRef: m.ref,
    bettor: actors[3].account.address,
  });
  await run("market.claim", {
    marketRef: m.ref,
    bettor: actors[4].account.address,
  });
  assert.equal(Number((await marketChain.snapshot(m.id)).status), 1);
  checks.push("verified tie settlement and pull payouts");
  const refund = await create(`0x${"02".repeat(32)}`);
  await bet(refund, actors[3], 0);
  await advance(66);
  await lifecycle.recover();
  assert.equal(Number((await marketChain.snapshot(refund.id)).status), 2);
  assert.equal(
    await marketChain.claimable(refund.id, actors[3].account.address),
    0n,
  );
  checks.push("one-sided void and automatic pull refund recovery");
  await lifecycle.close();
  lifecycle = await createMarketLifecycle({
    dir,
    chain: marketChain,
    transactions: ports,
    roles,
    verifierKey: actors[2].key,
  });
  const before = await raw.getTransactionCount({ address: roles.operator });
  await lifecycle.recover();
  assert.equal(
    await raw.getTransactionCount({ address: roles.operator }),
    before,
  );
  checks.push("durable restart without duplicate transaction");
  await lifecycle.close();
  lifecycle = null;
  const splitArtifact = await artifact("SplitPayout"),
    split = await deploy(splitArtifact, [[token]], actors[6].account);
  const cheerChain = createCheerChain({
    client,
    deployment: {
      ...deployment,
      contract: split,
      codeHash: keccak256(await raw.getCode({ address: split })),
    },
    now: () => Math.max(Date.now(), clock),
    localGuard: guard,
  });
  const liveConfig = {
    PARTNERS: "on",
    WEB3_ARC: "on",
    MARKETS: "on",
    WEB3_DATA_DIR: dir,
    WEB3_KILL: "0",
    ARC_USDC: token,
    ARC_EXPLORER_URL: "http://127.0.0.1",
    MARKET_OPERATOR_ADDRESS: roles.operator,
    MARKET_REPORTER_A_ADDRESS: roles.reporterA,
    MARKET_VERIFIER_ADDRESS: roles.verifierB,
    MARKET_WINDOW_SECONDS: 30,
    MARKET_LIVENESS_SECONDS: 60,
    MARKET_RESOLVE_DEADLINE_SECONDS: 240,
  };
  const chains = { market: marketChain, cheer: cheerChain };
  liveProviders = await createLiveMarketProviders(liveConfig, {
    transactions: ports,
    chains,
    now: () => clock,
  });
  const verifier = await createMarketVerifierProvider(
    { ...liveConfig, secrets: { MARKET_VERIFIER_KEY: actors[2].key } },
    { transaction: ports.verifierB, chains },
  );
  for (const provider of [
    liveProviders.market,
    liveProviders.cheer,
    verifier,
  ]) {
    const execute = provider.execute;
    provider.execute = async (job) => {
      try {
        return await execute(job);
      } catch (error) {
        console.error(
          "LOCAL REHEARSAL",
          job.type,
          (error.shortMessage || error.message).split("\n")[0],
        );
        throw error;
      }
    };
  }
  queue = createOutbox(dir, { now: () => clock });
  worker = createWorker({
    dir,
    providers: { market: liveProviders.market, cheer: liveProviders.cheer },
    now: () => clock,
  });
  verifierWorker = createWorker({
    dir,
    providers: { verify: verifier },
    now: () => clock,
    heartbeatFile: "verifier-heartbeat.json",
  });
  marketHttp = marketServer.createMarkets({
    config: liveConfig,
    now: () => clock,
    outbox: queue,
    readReceipt: (id) => readJobReceipt(dir, id),
    liveChains: chains,
  });
  const liveRoom = {
    code: "LOCALQ",
    game: "star-catch",
    phase: "lobby",
    setup: {},
    roundId: 1,
    players: [5, 6].map((i, slot) => ({
      slot,
      address: actors[i].account.address,
      token: `private-${i}`,
      socket: `socket-${i}`,
      ready: true,
      name: `Human ${slot + 1}`,
    })),
  };
  await marketHttp.choose(liveRoom, {});
  const app = express();
  app.use("/api/web3", marketHttp.router);
  httpServer = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  const origin = `http://127.0.0.1:${httpServer.address().port}/api/web3`;
  async function api(endpoint, body, session) {
    const response = await fetch(`${origin}/${endpoint}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const value = await response.json();
    assert.equal(response.status, 200, `${endpoint}: ${value.error}`);
    return value;
  }
  async function drain() {
    await queue.flush();
    await worker.poll();
    await verifierWorker.poll();
    const jobs = await listJobs(dir);
    if (jobs.length)
      throw Error(
        `Queued jobs remain: ${jobs.map((i) => i.job.type + ":" + i.job.attempts).join(",")}`,
      );
  }
  await drain();
  await advance(4);
  const listing = (await api("matches")).matches[0];
  assert.equal(listing.mode, "on");
  assert.equal(listing.phase, "betting");
  async function connect(actor) {
    const challenge = await api("market/challenge", {}),
      signature = await actor.account.signTypedData(
        identityData(challenge.nonce, challenge.expiresAt),
      );
    return (
      await api("market/session", {
        ...challenge,
        address: actor.account.address,
        signature,
      })
    ).token;
  }
  const sessionA = await connect(actors[3]),
    sessionB = await connect(actors[4]);
  async function queuedBet(actor, session, kind, outcome) {
    const quote = await api(
        "market/quote",
        {
          marketId: listing.marketId,
          kind,
          outcome,
          amount: "50000",
          minPayout: "0",
        },
        session,
      ),
      signature = await actor.account.signTypedData(
        fundingIntent(quote, { allowLocal: true, now: clock }),
      ),
      accepted = await api(
        "market/bet",
        { intent: { quoteId: quote.quoteId }, signature },
        session,
      );
    assert.equal(accepted.queued, true);
    return accepted.jobId;
  }
  await queuedBet(actors[3], sessionA, "prediction", 0);
  await queuedBet(actors[4], sessionB, "prediction", 1);
  await queuedBet(actors[3], sessionA, "cheer", 0);
  await drain();
  await advance(4);
  const personal = await api("market/me", null, sessionA);
  assert.equal(personal.mode, "on");
  assert.equal(
    personal.positions.find((p) => p.marketId === listing.marketId).stakes[0],
    "50000",
  );
  checks.push(
    "live HTTP quote → signed queue → actual EVM prediction and cheer",
  );
  await advance(40);
  await api("matches");
  assert.equal(marketHttp.startReason(liveRoom), null);
  await marketHttp.started(liveRoom);
  await drain();
  Object.assign(liveRoom, {
    active: [0, 1],
    match: { seed: 77 },
    replay: [],
    startedAt: clock - 1000,
  });
  const queuedRecord = makeResult(
    liveRoom,
    game,
    [
      { slot: 0, score: 0 },
      { slot: 1, score: 0 },
    ],
    clock,
  );
  await marketHttp.finish(liveRoom, queuedRecord);
  await drain();
  checks.push("queued A reports + isolated verifier B provider");
  await advance(61);
  await worker.poll();
  await advance(4);
  const paid = await api("market/me", null, sessionA);
  assert.equal(
    paid.positions.find((p) => p.marketId === listing.marketId).phase,
    "final",
  );
  assert.equal(
    await cheerChain.claimable(listing.marketId, actors[5].account.address),
    0n,
  );
  assert.equal(
    await raw.readContract({
      address: token,
      abi: tokenArtifact.abi,
      functionName: "balanceOf",
      args: [actors[5].account.address],
    }),
    1025000n,
  );
  checks.push("live market settlement and equal human cheers paid by recovery");
  console.log(
    JSON.stringify({
      scope: "LOCAL ANVIL + TEST TOKEN ONLY",
      pass: true,
      checks,
    }),
  );
} finally {
  await marketHttp?.close();
  await worker?.close();
  await verifierWorker?.close();
  await liveProviders?.close();
  await queue?.close();
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  await lifecycle?.close();
  for (const port of Object.values(ports)) await port.close();
  child.kill("SIGTERM");
  await rm(dir, { recursive: true, force: true });
}
