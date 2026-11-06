// Three new reviewed contracts only. Existing ConditionalPot is never redeployed.
// --check is keyless. The owner alone executes --apply.
import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  keccak256,
  parseEther,
  parseGwei,
  encodeDeployData,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcClient } from "../integrations/arc/provider.mjs";
import {
  deployOnce,
  preflightDeployment,
  readDeploymentProof,
} from "../integrations/arc/deployment.mjs";
import { createArcTransactions } from "../integrations/arc/transactions.mjs";
import { atomicJson, readJson } from "../integrations/shared/outbox.mjs";
import { prepareCommerceDeployment } from "../integrations/commerce/deployment.mjs";

const RELAYER = "0x81DdeD7eE7753791cEaF24Ab6Cb1694d1F39A008";
const ORACLE = "0x7DcF0D60291cDBBD31f4DC3ef831afb1B41a8F21";
const VERIFIER = "0xDB84fa3d22373e1F863C014f43B05Eb1F3Df4E86";
const USDC = "0x3600000000000000000000000000000000000000";
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const requireValue = (ok, code) => {
  if (!ok) throw Object.assign(Error(code), { code });
};
export function deploymentMode(args) {
  if (args.length === 0 || JSON.stringify(args) === '["--check"]') return false;
  requireValue(
    JSON.stringify(args) === '["--apply","--confirm-funcaster-testnet"]',
    "INVALID_ARGUMENTS",
  );
  return true;
}
export function matchRuntime(code, template, references = {}) {
  if (typeof code !== "string" || code.length !== template.length) return false;
  const mask = (value) => {
    let chars = value.slice(2).toLowerCase().split("");
    for (const group of Object.values(references))
      for (const { start, length } of group)
        chars.fill("0", start * 2, (start + length) * 2);
    return chars.join("");
  };
  return mask(code) === mask(template);
}
async function preparations() {
  const manifest = JSON.parse(
    await fs.readFile(
      new URL(
        "../integrations/market/onchain/deployment-artifacts.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  requireValue(manifest.chainId === 5042002, "WRONG_CHAIN");
  const list = [];
  for (const [name, a] of Object.entries(manifest.contracts)) {
    requireValue(
      ["ChonksMatchMarkets", "SplitPayout"].includes(name),
      "UNREVIEWED_CONTRACT",
    );
    const source = await fs.readFile(
      new URL(
        `../integrations/market/onchain/contracts/${name}.sol`,
        import.meta.url,
      ),
    );
    requireValue(
      createHash("sha256").update(source).digest("hex") === a.sourceSha256,
      "SOURCE_DRIFT",
    );
    const data = encodeDeployData({
      abi: a.abi,
      bytecode: a.bytecode,
      args: a.args,
    });
    requireValue(same(keccak256(data), a.creationHash), "CREATION_DRIFT");
    list.push({
      name,
      data,
      template: a.runtimeBytecode,
      references: {},
      sourceSha256: a.sourceSha256,
    });
  }
  const router = prepareCommerceDeployment({
    operator: RELAYER,
    platform: RELAYER,
  });
  list.push({
    name: "RevenueRouter",
    data: router.data,
    template: router.expectedRuntimeTemplate,
    references: router.immutableReferences,
    sourceSha256: router.sourceSha256,
  });
  return list;
}
async function pin(client, deployment, item) {
  requireValue((await client.getChainId()) === 5042002, "WRONG_CHAIN");
  const { receipt, tx, block } = await readDeploymentProof(
    client,
    deployment.hash,
  );
  requireValue(
    receipt.status === "success" &&
      same(receipt.contractAddress, deployment.address) &&
      same(receipt.blockHash, block.hash) &&
      same(tx.blockHash, block.hash) &&
      tx.chainId === 5042002 &&
      tx.to === null &&
      tx.value === 0n &&
      same(tx.from, RELAYER) &&
      same(tx.input, item.data),
    "DEPLOYMENT_PROOF_MISMATCH",
  );
  const code = await client.getCode({ address: deployment.address });
  requireValue(
    matchRuntime(code, item.template, item.references),
    "RUNTIME_MISMATCH",
  );
  return {
    chainId: 5042002,
    address: deployment.address,
    runtimeHash: keccak256(code),
    blockNumber: Number(receipt.blockNumber),
    creationTx: deployment.hash,
    sourceSha256: item.sourceSha256,
  };
}
export async function main(args = process.argv.slice(2)) {
  const apply = deploymentMode(args),
    items = await preparations();
  const clients = [
    "https://rpc.testnet.arc.network",
    "https://rpc.testnet.arc.io",
  ].map(arcClient);
  const dir = path.resolve(".local/funcaster-deployment"),
    pins = (await readJson(path.join(dir, "public-pins.json"))) || {};
  const limits = {
    minimumFee: parseGwei("20"),
    maximumFee: parseGwei("100"),
    maximumCost: parseEther("0.15"),
    retained: parseEther("0.05"),
  };
  let account;
  if (apply) {
    account = privateKeyToAccount(process.env.ARC_RELAYER_KEY);
    requireValue(same(account.address, RELAYER), "WRONG_SIGNER");
  }
  for (const item of items) {
    const itemDir = path.join(dir, item.name),
      prior = await readJson(path.join(itemDir, "arc-deployment/journal.json"));
    if (!apply) {
      if (prior) {
        for (const client of clients)
          await pin(client, { address: prior.address, hash: prior.hash }, item);
        console.log(`PASS ${item.name}: existing deployment verified`);
      } else {
        const proof = await preflightDeployment({
          client: clients[0],
          owner: RELAYER,
          data: item.data,
          limits,
        });
        console.log(
          `PASS ${item.name}: unsigned gas admission ${proof.cost} / ${limits.maximumCost} wei`,
        );
      }
      continue;
    }
    const deployed = await deployOnce({
      client: clients[0],
      owner: RELAYER,
      data: item.data,
      limits,
      dir: itemDir,
      signTransaction: (request) => account.signTransaction(request),
    });
    const proof = [];
    for (const client of clients) proof.push(await pin(client, deployed, item));
    requireValue(
      JSON.stringify(proof[0]) === JSON.stringify(proof[1]),
      "RPC_DISAGREEMENT",
    );
    pins[item.name] = proof[0];
    await atomicJson(path.join(dir, "public-pins.json"), pins);
    console.log(`PASS ${item.name} ${proof[0].address} ${proof[0].creationTx}`);
  }
  if (!apply) {
    console.log(
      "CHECK ONLY: no signing or broadcasts. Three creations capped at 0.45 test USDC gas; verifier funding at 0.5 USDC plus 0.03 USDC gas.",
    );
    return;
  }
  // A separate saved admission funds only the dedicated verifier once.
  const tx = await createArcTransactions({
    role: "relayer",
    dir: path.join(dir, "verifier-funding"),
    client: clients[0],
    wallet: { account, signTransaction: (r) => account.signTransaction(r) },
    chainId: 5042002,
    owner: RELAYER,
    budgetWei: parseEther("0.03"),
    maxTransactions: 1,
    priorityFeeWei: 0n,
    maxFeePerGasWei: parseGwei("100"),
    minimumFeePerGasWei: parseGwei("20"),
    nativeBalanceFloorWei: parseEther("0.05"),
    maxPerRoom: 1,
    maxPerHour: 1,
  });
  try {
    const balance = await clients[0].getBalance({ address: VERIFIER });
    const receipts = await tx.receipts();
    const identity = createHash("sha256")
      .update("funcaster-verifier-funding")
      .digest("hex");
    if (receipts.length || balance < parseEther("0.5"))
      await tx.transact(`room:${identity}:fund`, {
        account: RELAYER,
        address: USDC,
        abi: parseAbi(["function transfer(address,uint256) returns(bool)"]),
        functionName: "transfer",
        args: [VERIFIER, 500000n],
        nativeDebitWei: parseEther("0.5"),
      });
  } finally {
    await tx.close();
  }
  const config = {
    MARKET_POT_ADDRESS: pins.ChonksMatchMarkets.address,
    MARKET_POT_CODE_HASH: pins.ChonksMatchMarkets.runtimeHash,
    MARKET_POT_DEPLOY_BLOCK: pins.ChonksMatchMarkets.blockNumber,
    MARKET_SPLIT_ADDRESS: pins.SplitPayout.address,
    MARKET_SPLIT_CODE_HASH: pins.SplitPayout.runtimeHash,
    MARKET_SPLIT_DEPLOY_BLOCK: pins.SplitPayout.blockNumber,
    MARKET_OPERATOR_ADDRESS: RELAYER,
    MARKET_REPORTER_A_ADDRESS: ORACLE,
    MARKET_VERIFIER_ADDRESS: VERIFIER,
    ROUTER_ADDRESS: pins.RevenueRouter.address,
    ROUTER_CODE_HASH: pins.RevenueRouter.runtimeHash,
    ROUTER_DEPLOY_BLOCK: pins.RevenueRouter.blockNumber,
    ROUTER_OPERATOR_ADDRESS: RELAYER,
    ROUTER_PLATFORM_ADDRESS: RELAYER,
  };
  await atomicJson(path.join(dir, "public-config.json"), config);
  console.log(
    "PASS all three contracts pinned and verifier funded. Existing ConditionalPot unchanged. Public configuration saved; no hosted worker activated.",
  );
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href)
  main().catch((e) => {
    console.error(
      JSON.stringify({
        status: "STOPPED",
        code: /^[A-Z_]+$/.test(e.code) ? e.code : "RPC_UNAVAILABLE",
        message:
          "Keep .local/funcaster-deployment. No automatic resend. Share only this diagnostic, never keys.",
      }),
    );
    process.exitCode = 1;
  });
