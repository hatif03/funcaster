// Owner-operated bounded bootstrap for the new parent. Default mode is read-only.
import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseGwei,
  decodeFunctionData,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadProtocol } from "../integrations/ens/runtime.mjs";
import { createEnsTransactions } from "../integrations/ens/transactions.mjs";
import { stableEnsAdmission } from "../integrations/ens/admission.mjs";
import { ensRpcTransport } from "../integrations/ens/rpc.mjs";
import {
  bootstrapParent,
  bootstrapTransactionId,
} from "../integrations/ens/bootstrap-parent.mjs";
import { createChampionReader } from "../integrations/ens/champion.mjs";
import { requireEns, EnsError } from "../integrations/ens/errors.mjs";
import abi from "../integrations/ens/lifecycle-abi.json" with { type: "json" };
const args = process.argv.slice(2),
  apply = args[0] === "--apply";
requireEns(
  JSON.stringify(args) ===
    JSON.stringify([
      apply ? "--apply" : "--check",
      "--confirm-parent",
      "funcaster.eth",
    ]),
  "INVALID_ARGUMENTS",
  "Use --check --confirm-parent funcaster.eth or owner-run --apply --confirm-parent funcaster.eth",
);
const root = path.resolve(import.meta.dirname, ".."),
  old = JSON.parse(
    await readFile(
      path.join(root, "docs/web3/spikes/ens-registration-input.json"),
      "utf8",
    ),
  );
const owner = process.env.ENS_REGISTRAR_ADDRESS || old.owner,
  parent = "funcaster.eth",
  rpc =
    process.env.ENS_PARENT_RPC_URL ||
    "https://ethereum-sepolia-rpc.publicnode.com";
const url = new URL(rpc);
requireEns(
  url.protocol === "https:" && !url.username && !url.password,
  "INVALID_RPC",
  "A public HTTPS Sepolia RPC is required",
);
let transactions;
try {
  const protocol = await loadProtocol();
  const client = createPublicClient({
    chain: protocol.chain,
    transport: ensRpcTransport(rpc),
    cacheTime: 0,
  });
  if (apply) {
    const account = privateKeyToAccount(process.env.ENS_REGISTRAR_KEY);
    requireEns(
      account.address.toLowerCase() === owner.toLowerCase(),
      "WRONG_SIGNER",
      "Registrar key differs from the public owner",
    );
    const wallet = createWalletClient({
      account,
      chain: protocol.chain,
      transport: http(rpc, { retryCount: 0, timeout: 15000 }),
    });
    transactions = await createEnsTransactions({
      dir: path.join(root, ".local/ens-parents/funcaster/bootstrap"),
      client,
      wallet,
      chainId: 11155111,
      owner: account.address,
      budgetWei: parseEther("0.02"),
      maxTransactions: 24,
      priorityFeeWei: parseGwei("1"),
      maxFeePerGasWei: parseGwei("30"),
      maxPerRoom: 24,
      maxPerHour: 24,
    });
  }
  const transact = transactions
    ? stableEnsAdmission(transactions, {
        onWait: (value) => console.log(JSON.stringify(value)),
      })
    : undefined;
  const report = await bootstrapParent({
    client,
    protocol,
    parent,
    owner,
    transact,
  });
  console.log(JSON.stringify(report, null, 2));
  if (apply) {
    const champion = await createChampionReader({
      client,
      protocol,
      config: { ENS_PARENT: parent, ENS_REGISTRAR_ADDRESS: owner },
    });
    const ready = await champion.preflight();
    if (!ready.ready) {
      requireEns(
        ready.code === "CHAMPION_NAMESPACE_REQUIRED",
        ready.code,
        ready.message,
      );
      const plan = await champion.prepareNamespace();
      const completeAbi = [
        ...abi.factory,
        ...abi.registry,
        ...parseAbi([
          "function revokeRootRoles(uint256 roleBitmap,address account) returns (bool)",
        ]),
      ];
      for (const step of plan.transactions) {
        const decoded = decodeFunctionData({
          abi: completeAbi,
          data: step.data,
        });
        const receipt = await transact(
          bootstrapTransactionId(parent, step.id),
          {
            address: step.to,
            abi: completeAbi,
            functionName: decoded.functionName,
            args: decoded.args,
            account: owner,
          },
        );
        console.log(
          JSON.stringify({ confirmed: step.description, tx: receipt.tx }),
        );
      }
    }
    const final = await champion.preflight();
    requireEns(
      final.ready,
      final.code || "CHAMPION_NOT_READY",
      final.message || "Champion namespace not ready",
    );
    console.log(
      JSON.stringify({
        status: "ready",
        parent,
        play: `play.${parent}`,
        champions: final,
      }),
    );
  }
} catch (error) {
  console.error(
    JSON.stringify({
      status: "STOPPED",
      code: error.code || "RPC_UNAVAILABLE",
      message:
        error instanceof EnsError
          ? error.message
          : "Keep every funcaster journal. No automatic resend. Do not share keys or env files.",
    }),
  );
  process.exitCode = 1;
} finally {
  await transactions?.close();
}
