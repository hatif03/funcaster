// Keyless: pins only a direct deployment of the exact reviewed Studio artifact.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { encodeDeployData, keccak256 } from "viem";
import { arcClient } from "../integrations/arc/provider.mjs";
import { createArcChain } from "../integrations/arc/chain.mjs";
import { requireArc, same, hex32 } from "../integrations/arc/jobs.mjs";
import { atomicJson } from "../integrations/shared/outbox.mjs";
export async function verifyArcDeployment({
  client,
  address,
  txHash,
  artifact,
  assets,
}) {
  requireArc(
    (await client.getChainId()) === 5042002 &&
      /^0x[\da-f]{40}$/i.test(address) &&
      hex32(txHash),
    "INVALID_CONFIG",
    "Public Arc testnet deployment reference required",
  );
  const receipt = await client.getTransactionReceipt({ hash: txHash }),
    tx = await client.getTransaction({ hash: txHash });
  requireArc(
    receipt.status === "success" &&
      same(receipt.transactionHash, txHash) &&
      same(tx.hash, txHash) &&
      same(receipt.contractAddress, address) &&
      tx.to === null &&
      tx.chainId === 5042002 &&
      tx.value === 0n &&
      same(
        tx.input,
        encodeDeployData({
          abi: artifact.abi,
          bytecode: artifact.bytecode.object,
          args: [assets.map((a) => a.address)],
        }),
      ),
    "INVALID_PROOF",
    "Deployment is not the exact reviewed creation bytecode and asset list",
  );
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  requireArc(
    same(receipt.blockHash, block.hash) && same(tx.blockHash, block.hash),
    "INVALID_PROOF",
    "Deployment receipt is not canonical",
  );
  const code = await client.getCode({ address });
  requireArc(code && code !== "0x", "INVALID_PROOF", "Deployment has no code");
  const deployment = {
    chainId: 5042002,
    contract: address,
    runtimeCodeHash: keccak256(code),
    blockNumber: Number(receipt.blockNumber),
    assets,
    explorer: "https://explorer.testnet.arc.io",
  };
  await createArcChain({ client, deployment }).deployment();
  return {
    ...deployment,
    creationTx: txHash,
    deployer: tx.from,
    chainVerified: false,
  };
}
export async function main(args = process.argv.slice(2)) {
  requireArc(
    args.length === 6 &&
      args[0] === "--address" &&
      args[2] === "--tx" &&
      args[4] === "--output",
    "INVALID_CONFIG",
    "Usage: web3-arc-pin.mjs --address ADDRESS --tx HASH --output FILE",
  );
  const config = JSON.parse(
    await readFile("docs/web3/spikes/arc-readonly-input.json", "utf8"),
  );
  const bytes = await readFile(
      "integrations/arc/onchain/contracts/out/ConditionalPot.sol/ConditionalPot.json",
    ),
    artifact = JSON.parse(bytes);
  const reports = [];
  for (const url of config.rpcUrls)
    reports.push(
      await verifyArcDeployment({
        client: arcClient(url),
        address: args[1],
        txHash: args[3],
        artifact,
        assets: config.assets,
      }),
    );
  requireArc(
    reports.length >= 2 &&
      reports.every(
        (r) =>
          same(r.runtimeCodeHash, reports[0].runtimeCodeHash) &&
          r.blockNumber === reports[0].blockNumber,
      ),
    "INVALID_PROOF",
    "RPC hosts disagree on deployment",
  );
  const report = {
    ...reports[0],
    artifactSha256: createHash("sha256").update(bytes).digest("hex"),
    checkedAt: new Date().toISOString(),
    scope: "TWO-HOST DEPLOYMENT READBACK; not a Ledger badge",
  };
  await atomicJson(args[5], report);
  console.log(
    "PASS: exact reviewed public deployment checked on both Arc RPC hosts; public pin file written.",
  );
  return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href)
  main().catch(() => {
    console.error(
      "FAIL: public deployment was not pinned; inspect address, creation transaction and compiler settings. No signing or sends occurred.",
    );
    process.exitCode = 1;
  });
