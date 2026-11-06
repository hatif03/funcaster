// Keyless, read-only acceptance audit. It never opens a worker or modifies its
// private journals. A successful script run alone is not an independent Ledger.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { decodeFunctionData, keccak256, parseEther } from "viem";
import { arcClient } from "../integrations/arc/provider.mjs";
import { createArcChain, POT_ABI } from "../integrations/arc/chain.mjs";
import { ASSET_ABI } from "../integrations/arc/assets.mjs";
import {
  requireArc,
  same,
  json,
  hex32,
  contextHash,
} from "../integrations/arc/jobs.mjs";
import { arcFailure } from "../integrations/arc/diagnostics.mjs";
import { verifyArcDeployment } from "./web3-arc-pin.mjs";

export function requireCompletedAcceptance(report) {
  const expected = ["usdc", "eurc"].flatMap((asset) => [
    `${asset} bankroll seat 1`,
    `${asset} bankroll seat 2`,
    ...["cooperative", "refund", "contest", "finalize"].map(
      (kind) => `${asset} ${kind}`,
    ),
  ]);
  requireArc(
    report?.complete === true &&
      !report.failure &&
      Array.isArray(report.checks) &&
      report.checks?.length === expected.length &&
      expected.every(
        (id) =>
          report.checks.filter(
            (c) => c.id === id && c.status === "PASS-PUBLIC-SCRIPT",
          ).length === 1,
      ) &&
      Array.isArray(report.transactions) &&
      report.transactions.length === 54 &&
      report.transactions.every((t) => hex32(t?.hash)) &&
      new Set(report.transactions.map((t) => t.hash)).size === 54,
    "INVALID_PROOF",
    "All public acceptance flows must finish before independent verification",
  );
  return expected;
}

export async function verifyAcceptanceTransaction({ client, entry, owner }) {
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash: entry.hash }),
    client.getTransactionReceipt({ hash: entry.hash }),
  ]);
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  requireArc(
    tx.chainId === 5042002 &&
      same(tx.hash, entry.hash) &&
      same(receipt.transactionHash, entry.hash) &&
      same(tx.blockHash, block.hash) &&
      same(receipt.blockHash, block.hash) &&
      tx.blockNumber === receipt.blockNumber &&
      same(tx.from, owner) &&
      same(tx.to, entry.to) &&
      tx.value === 0n &&
      tx.nonce === entry.nonce &&
      same(keccak256(tx.input), entry.dataHash) &&
      receipt.status === "success" &&
      entry.status === "success",
    "INVALID_PROOF",
    "Receipt differs from admitted sender, intent or canonical block",
  );
  const cost = receipt.gasUsed * receipt.effectiveGasPrice;
  requireArc(
    tx.gas === BigInt(entry.gas) &&
      receipt.gasUsed > 0n &&
      receipt.gasUsed <= tx.gas &&
      tx.maxPriorityFeePerGas === 0n &&
      tx.maxFeePerGas === BigInt(entry.maxFeePerGas) &&
      tx.maxFeePerGas >= 20_000_000_000n &&
      tx.maxFeePerGas <= 100_000_000_000n &&
      receipt.effectiveGasPrice > 0n &&
      receipt.effectiveGasPrice <= tx.maxFeePerGas &&
      String(cost) === entry.costWei &&
      String(receipt.blockNumber) === entry.blockNumber,
    "INVALID_PROOF",
    "Receipt fee or gas differs from admitted bounds",
  );
  return { tx, receipt, cost };
}

export async function main(args = process.argv.slice(2)) {
  requireArc(
    args.length === 0,
    "INVALID_CONFIG",
    "Usage: node scripts/web3-arc-verify-acceptance.mjs (no env file)",
  );
  const read = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
  const report = await read("docs/web3/spikes/g1-arc-worker-public.json");
  requireCompletedAcceptance(report); // before RPC or private journal access
  const dir = ".local/arc-a4-acceptance";
  try {
    await fs.access(path.join(dir, "worker.lock"));
    throw Object.assign(Error("Owner worker still active"), {
      code: "CONFLICT",
    });
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const source = await read("docs/web3/spikes/arc-readonly-input.json"),
    pin = await read(".local/arc-public-deployment.json"),
    funding = await read("docs/web3/spikes/g1-arc-worker-funding.json"),
    artifactBytes = await fs.readFile(
      "integrations/arc/onchain/contracts/out/ConditionalPot.sol/ConditionalPot.json",
    );
  requireArc(
    pin.artifactSha256 ===
      createHash("sha256").update(artifactBytes).digest("hex") &&
      same(report.deployment.contract, pin.contract) &&
      same(report.deployment.creationTx, pin.creationTx) &&
      source.rpcUrls.length === 2 &&
      new Set(source.rpcUrls.map((u) => new URL(u).host)).size === 2,
    "INVALID_PROOF",
    "Pinned artifact and two distinct RPC hosts required",
  );
  const journals = {};
  for (const role of ["relayer", "oracle"]) {
    journals[role] = await read(
      path.join(dir, `arc-${role}-transactions/journal.json`),
    );
    const journal = journals[role],
      owner = funding.hosts[0].balances.find(
        (b) => b.role === `ARC_${role.toUpperCase()}`,
      ).address;
    requireArc(
      journal.chainId === 5042002 &&
        same(journal.owner, owner) &&
        funding.hosts.every((h) =>
          h.balances.some(
            (b) =>
              b.role === `ARC_${role.toUpperCase()}` && same(b.address, owner),
          ),
        ) &&
        journal.entries.length === (role === "relayer" ? 50 : 4) &&
        journal.entries.every(
          (e, i) =>
            e.nonce === journal.entries[0].nonce + i &&
            report.transactions.some(
              (t) =>
                t.role === role &&
                same(t.hash, e.hash) &&
                t.costWei === e.costWei &&
                t.status === e.status,
            ),
        ),
      "INVALID_PROOF",
      "Role journal differs from public report or verified signer",
    );
  }
  const verified = {
    at: new Date().toISOString(),
    scope:
      "KEYLESS TWO-HOST A4 RECEIPT AND FINAL-STATE READBACK; synthetic fixtures, not gameplay or Ledger acceptance",
    complete: false,
    hosts: [],
  };
  for (const url of source.rpcUrls) {
    const client = arcClient(url);
    const deployment = await verifyArcDeployment({
      client,
      address: pin.contract,
      txHash: pin.creationTx,
      artifact: JSON.parse(artifactBytes),
      assets: source.assets,
    });
    requireArc(
      same(deployment.runtimeCodeHash, pin.runtimeCodeHash) &&
        deployment.blockNumber === pin.blockNumber,
      "INVALID_PROOF",
      "Deployment pin changed",
    );
    const chain = createArcChain({ client, deployment });
    const host = {
      host: new URL(url).host,
      transactions: [],
      pots: [],
      gasWei: {},
      dripped: { usdc: 0n, eurc: 0n },
    };
    const drips = new Map();
    for (const [role, journal] of Object.entries(journals)) {
      let spent = 0n;
      for (const entry of journal.entries) {
        const { tx, receipt, cost } = await verifyAcceptanceTransaction({
          client,
          entry,
          owner: journal.owner,
        });
        spent += cost;
        const token = source.assets.find((a) => same(a.address, tx.to));
        if (token) {
          const call = decodeFunctionData({ abi: ASSET_ABI, data: tx.input });
          requireArc(
            role === "relayer" &&
              call.functionName === "transfer" &&
              call.args[1] === 60000n,
            "INVALID_PROOF",
            "Unexpected token transaction",
          );
          const symbol = token.symbol.toLowerCase();
          host.dripped[symbol] += call.args[1];
          drips.set(tx.hash.toLowerCase(), {
            asset: symbol,
            address: call.args[0],
            amount: String(call.args[1]),
          });
        } else {
          const call = decodeFunctionData({ abi: POT_ABI, data: tx.input });
          requireArc(
            same(tx.to, pin.contract) &&
              (role === "oracle"
                ? call.functionName === "propose"
                : [
                    "create",
                    "fundWithAuthorization",
                    "settleCooperative",
                    "contestWithSig",
                    "finalize",
                    "refund",
                    "claim",
                  ].includes(call.functionName)),
            "INVALID_PROOF",
            "Unexpected role or contract method",
          );
        }
        host.transactions.push({
          role,
          hash: tx.hash,
          blockNumber: String(receipt.blockNumber),
          blockHash: receipt.blockHash,
          costWei: String(cost),
          status: receipt.status,
        });
      }
      requireArc(
        spent <= parseEther(role === "relayer" ? "0.5" : "0.05"),
        "BUDGET_EXCEEDED",
        "Actual gas exceeds owner ceiling",
      );
      host.gasWei[role] = String(spent);
    }
    for (const symbol of ["usdc", "eurc"]) {
      const seats = [1, 2].map((n) => {
        const row = report.checks.find(
            (c) => c.id === `${symbol} bankroll seat ${n}`,
          ),
          drip = drips.get(row.tx?.toLowerCase());
        requireArc(
          drip?.asset === symbol && drip.amount === row.amount,
          "INVALID_PROOF",
          "Bankroll differs from actual transfer",
        );
        return drip.address;
      });
      requireArc(
        !same(seats[0], seats[1]) && host.dripped[symbol] === 120000n,
        "INVALID_PROOF",
        "Drip ceiling or seat identity differs",
      );
      for (const kind of ["cooperative", "refund", "contest", "finalize"]) {
        const row = report.checks.find((c) => c.id === `${symbol} ${kind}`),
          proof = await chain.snapshot(row.potId);
        requireArc(
          proof.state ===
            (kind === "refund" || kind === "contest"
              ? "Refunded"
              : "Settled") &&
            proof.state === row.state &&
            proof.claimables.every((v) => v === 0n) &&
            proof.fundedBitmap === (kind === "refund" ? 1 : 3) &&
            same(
              proof.terms.asset,
              source.assets.find((a) => a.symbol.toLowerCase() === symbol)
                .address,
            ) &&
            proof.terms.stake === 1000n &&
            proof.terms.rule === 1 &&
            proof.terms.minPlaySeconds === 60 &&
            proof.terms.challengeWindow === 60 &&
            same(
              proof.terms.metadataHash,
              contextHash({
                gameId: "chonks.star-catch",
                version: "1.0.0",
                bundleHash: "a".repeat(64),
                slots: [0, 1],
              }),
            ) &&
            proof.terms.seats.length === 2 &&
            proof.terms.seats.every((s, i) => same(s, seats[i])) &&
            same(proof.terms.oracle, journals.oracle.owner),
          "INVALID_PROOF",
          "Final pot terms, state or claims differ from expected flow",
        );
        host.pots.push({
          id: row.id,
          potId: row.potId,
          state: proof.state,
          termsHash: proof.termsHash,
          blockNumber: proof.blockNumber,
          blockHash: proof.blockHash,
          claimables: proof.claimables.map(String),
        });
      }
    }
    requireArc(
      (await client.getChainId()) === 5042002,
      "WRONG_CHAIN",
      "RPC changed chain during verification",
    );
    verified.hosts.push(json(host));
    console.log(`PASS read-only receipt and state audit: ${host.host}`);
  }
  requireArc(
    JSON.stringify(verified.hosts[0].transactions) ===
      JSON.stringify(verified.hosts[1].transactions),
    "INVALID_PROOF",
    "Hosts disagree on canonical receipts",
  );
  verified.complete = true;
  await fs.writeFile(
    "docs/web3/spikes/g1-arc-worker-public-verified.json",
    JSON.stringify(verified, null, 2) + "\n",
  );
  return verified;
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href)
  main().catch((error) => {
    console.error(JSON.stringify(arcFailure(error)));
    process.exitCode = 1;
  });
