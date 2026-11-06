import test from "node:test";
import assert from "node:assert/strict";
import { keccak256 } from "viem";
import {
  marketNonce,
  createMarketChain,
} from "../../integrations/market/chain.mjs";
import { createMarketLifecycle } from "../../integrations/market/lifecycle.mjs";
const address = (n) => `0x${n.toString(16).padStart(40, "0")}`;
test("live EIP3009 nonce binds outcome, amount, minimum, bettor, chain and contract", () => {
  const input = {
    contract: address(1),
    marketId: 1n,
    outcome: 0,
    amount: 50000n,
    minPayout: 50000n,
    bettor: address(2),
    salt: `0x${"ab".repeat(32)}`,
  };
  const expected = marketNonce(input);
  for (const changed of [
    { marketId: 2n },
    { outcome: 1 },
    { amount: 100000n },
    { minPayout: 51000n },
    { bettor: address(3) },
    { contract: address(4) },
    { chainId: 1 },
  ])
    assert.notEqual(marketNonce({ ...input, ...changed }), expected);
});
test("live reader fails closed on chain, bytecode and stale-block mismatches", async () => {
  let chainId = 1,
    stamp = 1000,
    code = "0x6000";
  const deployment = {
    chainId: 5042002,
    contract: address(1),
    codeHash: keccak256("0x6001"),
    assets: [{ symbol: "USDC", address: address(2) }],
  };
  const client = {
    getChainId: async () => chainId,
    getBlock: async () => ({
      number: 1n,
      timestamp: BigInt(stamp),
      hash: `0x${"ab".repeat(32)}`,
    }),
    getCode: async () => code,
  };
  const chain = createMarketChain({ client, deployment, now: () => 1000000 });
  await assert.rejects(chain.deployment(), /chain changed/);
  chainId = 5042002;
  await assert.rejects(chain.deployment(), /bytecode/);
  stamp = 900;
  await assert.rejects(chain.deployment(), /stale/);
});
test("live lifecycle refuses shared operator and reporting identities before opening journals", async () => {
  await assert.rejects(
    createMarketLifecycle({
      roles: {
        operator: address(1),
        reporterA: address(1),
        verifierB: address(2),
      },
    }),
    /distinct/,
  );
});
