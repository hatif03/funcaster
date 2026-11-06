import test from "node:test";
import assert from "node:assert/strict";
import { readArcLogs, createArcChain } from "../../integrations/arc/chain.mjs";
import { preflightArc } from "../../integrations/arc/preflight.mjs";
import { arcDeployment, arcLimits } from "../../integrations/arc/config.mjs";
import { loadConfig } from "../../integrations/shared/config.mjs";
import { hashDomain, keccak256 } from "viem";
import { termsHash } from "../../integrations/arc/signatures.mjs";
import {
  createLiveArcProvider,
  preflightArcEndpoints,
} from "../../integrations/arc/provider.mjs";
const address = (n) => `0x${n.toString(16).padStart(40, "0")}`;
const env = {
  ARC_POT_ADDRESS: address(1),
  ARC_POT_CODE_HASH: keccak256("0x6000"),
  ARC_POT_DEPLOY_BLOCK: "1",
  ARC_EURC: address(2),
  ARC_RELAYER_ADDRESS: address(3),
  ARC_ORACLE_ADDRESS: address(4),
  ARC_MAX_TRANSACTIONS: "100",
  ARC_MAX_FEE_GWEI: "100",
  ARC_RELAYER_MAX_GAS_USDC: "1",
  ARC_ORACLE_MAX_GAS_USDC: "1",
  ARC_MIN_RELAYER_BALANCE: "0.1",
  WEB3_MAX_TX_PER_ROOM: "50",
  WEB3_MAX_TX_PER_HOUR: "100",
  ARC_DRIP_MAX_PER_DEVICE: "1",
  ARC_DRIP_MAX_PER_IP_HOUR: "2",
  ARC_DRIP_MAX_PER_ROOM: "4",
  ARC_DRIP_MAX_TOTAL_USDC: "10",
  ARC_DRIP_MAX_TOTAL_EURC: "10",
  ARC_DRIP_BANKROLL_USDC: "0.55",
  ARC_DRIP_BANKROLL_EURC: "0.55",
};
test("live provider never implicitly activates in mock mode or silently ignores an unimplemented Memo setting", async () => {
  await assert.rejects(
    createLiveArcProvider({ PARTNERS: "mock", WEB3_ARC: "mock" }),
    /explicit on/,
  );
  await assert.rejects(
    createLiveArcProvider({
      PARTNERS: "on",
      WEB3_ARC: "on",
      ARC_ORACLE: "relay",
      ARC_MEMO: "on",
    }),
    /ARC_MEMO=off/,
  );
});
test("live deployment and limits require exact pins, separate roles and bounded six-decimal budgets", () => {
  const c = loadConfig(env);
  assert.equal(arcDeployment(c).chainId, 5042002);
  assert.equal(arcLimits(c).roles.relayer.priorityFeeWei, 0n);
  for (const patch of [
    { ARC_POT_CODE_HASH: "" },
    { ARC_ORACLE_ADDRESS: env.ARC_RELAYER_ADDRESS },
    { ARC_POT_ADDRESS: address(0) },
    { ARC_CHAIN_ID: "5042", ARC_ALLOW_MAINNET: "1" },
  ])
    assert.throws(() => arcDeployment(loadConfig({ ...env, ...patch })));
  for (const patch of [
    { ARC_MAX_FEE_GWEI: "19" },
    { ARC_DRIP_MAX_TOTAL_USDC: "0" },
    { ARC_MIN_RELAYER_BALANCE: "0.01" },
    { ARC_DRIP_BANKROLL_EURC: "0.1234567" },
    { ARC_MAX_TRANSACTIONS: "" },
  ])
    assert.throws(() => arcLimits(loadConfig({ ...env, ...patch })));
});
test("USDC-only runtime still verifies the full deployed asset allowlist", () => {
  const config = loadConfig({
    ...env,
    WEB3_ASSETS: "usdc",
    ARC_POT_ASSETS: "usdc,eurc",
    ARC_DRIP_BANKROLL_EURC: "0",
    ARC_DRIP_MAX_TOTAL_EURC: "0",
  });
  assert.deepEqual(
    arcDeployment(config).assets.map((asset) => asset.symbol),
    ["USDC", "EURC"],
  );
  assert.deepEqual(Object.keys(arcLimits(config).drip), ["usdc"]);
  assert.throws(() =>
    arcDeployment(
      loadConfig({ ...env, WEB3_ASSETS: "usdc,eurc", ARC_POT_ASSETS: "usdc" }),
    ),
  );
});
test("logs use inclusive 9,999-block chunks and retry -32014 with smaller bounded requests", async () => {
  const calls = [];
  let failed = false;
  const client = {
    async getLogs(q) {
      calls.push([q.fromBlock, q.toBlock]);
      if (!failed) {
        failed = true;
        throw { cause: { code: -32014 } };
      }
      return [
        {
          address: address(1),
          blockNumber: q.fromBlock,
          logIndex: 0,
          removed: false,
        },
      ];
    },
  };
  const rows = await readArcLogs(
    client,
    { address: address(1), fromBlock: 0n, toBlock: 25000n },
    { wait: async () => {} },
  );
  assert.deepEqual(calls.slice(0, 2), [
    [0n, 9998n],
    [0n, 4999n],
  ]);
  assert(calls.every(([a, b]) => b - a + 1n <= 9999n));
  assert.equal(calls.at(-1)[1], 25000n);
  assert.equal(rows.length, 4);
  await assert.rejects(
    readArcLogs(
      {
        getLogs: async () => {
          throw { code: -32014 };
        },
      },
      { address: address(1), fromBlock: 0n, toBlock: 0n },
      { wait: async () => {} },
    ),
  );
});
test("log reader rejects foreign emitters, removed logs and out-of-range responses", async () => {
  for (const row of [
    { address: address(2), blockNumber: 1n },
    { address: address(1), blockNumber: 1n, removed: true },
    { address: address(1), blockNumber: 3n },
  ])
    await assert.rejects(
      readArcLogs(
        { getLogs: async () => [row] },
        { address: address(1), fromBlock: 1n, toBlock: 2n },
      ),
    );
});
test("keyless preflight checks both asset domains, code pin, constants, balances and unsigned create", async (t) => {
  const config = loadConfig(env),
    deployment = arcDeployment(config),
    block = {
      number: 10n,
      timestamp: 1000n,
      hash: `0x${"ab".repeat(32)}`,
      baseFeePerGas: 10_000_000_000n,
    };
  const types = {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
  };
  let paused = false,
    simulation = 0,
    deploymentReads = 0;
  const client = {
    getChainId: async () => 5042002,
    getBlock: async () => block,
    getCode: async ({ address: target }) => {
      if (target.toLowerCase() === deployment.contract.toLowerCase())
        deploymentReads++;
      return "0x6000";
    },
    getBalance: async () => 2n * 10n ** 18n,
    estimateContractGas: async () => 100000n,
    simulateContract: async () => {
      simulation++;
    },
    readContract: async (r) => {
      assert.equal(r.blockNumber, 10n);
      const asset = deployment.assets.find(
        (a) => a.address.toLowerCase() === r.address.toLowerCase(),
      );
      const values = {
        allowedAssets: deployment.assets.map((a) => a.address),
        eip712Domain: [
          "0x0f",
          "ChonksPot",
          "1",
          5042002n,
          deployment.contract,
          `0x${"00".repeat(32)}`,
          [],
        ],
        name: asset?.symbol,
        version: "2",
        decimals: 6,
        paused,
        balanceOf: 1000000n,
        isBlacklisted: false,
        MIN_RETAINED_BALANCE: 50000n,
        MIN_CHALLENGE_WINDOW: 60n,
      };
      if (r.functionName === "hashTerms") return termsHash(...r.args);
      if (r.functionName === "DOMAIN_SEPARATOR")
        return hashDomain({
          domain: {
            name: asset.symbol,
            version: "2",
            chainId: 5042002,
            verifyingContract: asset.address,
          },
          types,
        });
      return values[r.functionName];
    },
  };
  const chain = createArcChain({ client, deployment, now: () => 1000000 });
  assert.equal(
    (
      await preflightArc({
        chain,
        relayer: config.ARC_RELAYER_ADDRESS,
        oracle: config.ARC_ORACLE_ADDRESS,
        limits: arcLimits(config),
      })
    ).ok,
    true,
  );
  assert.equal(simulation, 1);
  assert.equal(
    deploymentReads,
    1,
    "both token proofs share one verified pot snapshot",
  );
  await assert.rejects(
    chain.tokenSnapshot(deployment.assets[0].address, [], { block }),
    /Unknown deployment snapshot/,
  );
  paused = true;
  await assert.rejects(
    preflightArc({
      chain,
      relayer: config.ARC_RELAYER_ADDRESS,
      oracle: config.ARC_ORACLE_ADDRESS,
      limits: arcLimits(config),
    }),
  );
  assert.equal(simulation, 1);
  paused = false;
  block.timestamp = BigInt(Math.floor(Date.now() / 1000));
  const endpoints = {
    ...config,
    ARC_RPC_URLS: ["https://one.example", "https://two.example"],
  };
  await t.test(
    "exhausted rate-limit reads may fall back to the other independently verified host",
    async () => {
      const result = await preflightArcEndpoints(endpoints, {
        makeClient: (url) =>
          url === endpoints.ARC_RPC_URLS[0]
            ? {
                getChainId: async () => {
                  throw { code: -32005 };
                },
              }
            : client,
      });
      assert.deepEqual(
        result.report.attempts.map((a) => a.ok),
        [false, true],
      );
      assert.equal(result.report.attempts[1].host, "two.example");
    },
  );
  await t.test(
    "wrong-network and mismatched-code proofs cannot be hidden by host fallback",
    async () => {
      for (const patch of [
        { getChainId: async () => 5042 },
        { getCode: async () => "0x6001" },
      ]) {
        let tried = 0;
        await assert.rejects(
          preflightArcEndpoints(endpoints, {
            makeClient: () => {
              tried++;
              return { ...client, ...patch };
            },
          }),
        );
        assert.equal(tried, 1);
      }
    },
  );
});
