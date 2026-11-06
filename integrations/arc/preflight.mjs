import { randomBytes } from "node:crypto";
import { termsHash, normalizeTerms } from "./signatures.mjs";
import { requireArc, same, json } from "./jobs.mjs";
import { withArcPhase } from "./diagnostics.mjs";
export async function preflightArc({ chain, relayer, oracle, limits }) {
  const deploymentProof = await withArcPhase("preflight-deployment", () =>
    chain.deployment(),
  );
  const { block, call } = deploymentProof;
  requireArc(
    BigInt(chain.deploymentConfig.blockNumber) <= block.number,
    "INVALID_CONFIG",
    "Deployment block is in the future",
  );
  const assets = [];
  for (const asset of chain.deploymentConfig.assets) {
    const proof = await withArcPhase(
      `preflight-${asset.symbol.toLowerCase()}`,
      () =>
        chain.tokenSnapshot(asset.address, [relayer, oracle], deploymentProof),
    );
    requireArc(
      proof.accounts.every((a) => !a.blocked),
      "PREFLIGHT_FAILED",
      "Worker signer blocked by token",
    );
    assets.push({
      symbol: asset.symbol,
      address: asset.address,
      domain: proof.asset,
      blockNumber: proof.blockNumber,
      blockHash: proof.blockHash,
    });
  }
  for (const [role, address] of [
    ["relayer", relayer],
    ["oracle", oracle],
  ])
    requireArc(
      (await withArcPhase("preflight-balances", () =>
        chain.client.getBalance({ address }),
      )) > limits.roles[role].nativeBalanceFloorWei,
      "PREFLIGHT_FAILED",
      "Worker gas balance below floor; faucet funding is required",
    );
  requireArc(
    (await withArcPhase("preflight-constants", () =>
      call("MIN_RETAINED_BALANCE"),
    )) === 50000n &&
      (await withArcPhase("preflight-constants", () =>
        call("MIN_CHALLENGE_WINDOW"),
      )) === 60n,
    "PREFLIGHT_FAILED",
    "Contract constants differ from reviewed artifact",
  );
  const potId = `0x${randomBytes(32).toString("hex")}`;
  const terms = normalizeTerms({
    asset: chain.deploymentConfig.assets[0].address,
    stake: "1",
    seats: [relayer, oracle],
    rule: 0,
    oracle,
    fundDeadline: block.timestamp + 180n,
    settleDeadline: block.timestamp + 900n,
    minPlaySeconds: 60,
    challengeWindow: 120,
    metadataHash: `0x${"00".repeat(32)}`,
  });
  requireArc(
    same(
      await withArcPhase("preflight-terms", () =>
        call("hashTerms", [potId, terms]),
      ),
      termsHash(potId, terms),
    ),
    "PREFLIGHT_FAILED",
    "Contract terms encoding differs from worker",
  );
  await withArcPhase("preflight-simulation", () =>
    chain.simulateCreate(potId, terms, relayer),
  );
  const gas = await withArcPhase("preflight-gas", () =>
    chain.client.estimateContractGas(
      chain.call("create", [potId, terms], relayer),
    ),
  );
  const fee =
    block.baseFeePerGas * 2n > 20_000_000_000n
      ? block.baseFeePerGas * 2n
      : 20_000_000_000n;
  requireArc(
    fee <= limits.roles.relayer.maxFeePerGasWei &&
      ((gas * 12n + 9n) / 10n) * fee <= limits.roles.relayer.budgetWei,
    "PREFLIGHT_FAILED",
    "Dry create exceeds explicit gas budget",
  );
  await withArcPhase("preflight-canonical", () => chain.finish(block));
  return json({
    ok: true,
    scope: "READS AND UNSIGNED SIMULATION ONLY",
    deployment: chain.deploymentConfig,
    blockNumber: block.number,
    blockHash: block.hash,
    assets,
    gas,
    fee,
    chainVerified: false,
  });
}
