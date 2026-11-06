// Default reads only. Public writes require the owner to run --apply explicitly.
import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseGwei,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createParentRegistration } from "../integrations/ens/parent-registration.mjs";
import { createEnsTransactions } from "../integrations/ens/transactions.mjs";
import { stableEnsAdmission } from "../integrations/ens/admission.mjs";
import { ensRpcTransport } from "../integrations/ens/rpc.mjs";
import { rolesFromPinnedSource } from "./spikes/ens-register-parent.mjs";
import { requireEns, EnsError } from "../integrations/ens/errors.mjs";

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
const artifacts = {};
for (const name of Object.keys(old.contracts)) {
  const a = JSON.parse(
    await readFile(path.join(root, `.tools/web3-spikes/${name}.json`), "utf8"),
  );
  requireEns(
    a.address.toLowerCase() === old.contracts[name].toLowerCase(),
    "DEPLOYMENT_DRIFT",
    "Pinned registration artifact differs",
  );
  artifacts[name] = a;
}
const source = await readFile(
    path.join(root, ".tools/web3-spikes/RegistryRolesLib.sol"),
    "utf8",
  ),
  registrarSource = await readFile(
    path.join(root, ".tools/web3-spikes/ETHRegistrar.sol"),
    "utf8",
  ),
  metadata = JSON.parse(artifacts.ETHRegistrar.metadata);
requireEns(
  keccak256(toHex(source)) ===
    metadata.sources["project/src/registry/libraries/RegistryRolesLib.sol"]
      .keccak256 &&
    keccak256(toHex(registrarSource)) ===
      metadata.sources["project/src/registrar/ETHRegistrar.sol"].keccak256,
  "ARTIFACT_DRIFT",
  "Pinned registrar source differs",
);
rolesFromPinnedSource(source, registrarSource);
const owner = process.env.ENS_REGISTRAR_ADDRESS || old.owner;
const rpc =
  process.env.ENS_PARENT_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";
const url = new URL(rpc);
requireEns(
  url.protocol === "https:" && !url.username && !url.password,
  "INVALID_RPC",
  "A public HTTPS Sepolia RPC is required",
);
const client = createPublicClient({
  chain: sepolia,
  transport: ensRpcTransport(rpc),
  cacheTime: 0,
});
const dir = path.join(root, ".local/ens-parents/funcaster"),
  input = { parent: "funcaster.eth", owner, durationSeconds: 63072000 };
let transactions;
try {
  if (apply) {
    const account = privateKeyToAccount(process.env.ENS_REGISTRAR_KEY);
    requireEns(
      account.address.toLowerCase() === owner.toLowerCase(),
      "WRONG_SIGNER",
      "Existing registrar key differs from its public address",
    );
    const wallet = createWalletClient({
      chain: sepolia,
      account,
      transport: http(rpc, { retryCount: 0, timeout: 15000 }),
    });
    transactions = await createEnsTransactions({
      dir,
      client,
      wallet,
      chainId: 11155111,
      owner: account.address,
      budgetWei: parseEther("0.01"),
      maxTransactions: 8,
      priorityFeeWei: parseGwei("1"),
      maxFeePerGasWei: parseGwei("30"),
      maxPerRoom: 8,
      maxPerHour: 8,
    });
  }
  const registration = await createParentRegistration({
    dir,
    input,
    client,
    artifacts,
    transact: transactions
      ? stableEnsAdmission(transactions, {
          onWait: (value) => console.log(JSON.stringify(value)),
        })
      : undefined,
    onProgress: (value) => console.log(JSON.stringify(value)),
  });
  console.log(
    JSON.stringify(
      await (apply ? registration.apply() : registration.check()),
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: "STOPPED",
      code: error.code || "RPC_UNAVAILABLE",
      message:
        error instanceof EnsError
          ? error.message
          : "Keep the funcaster journal; no automatic resend. No keys or env files should be shared.",
    }),
  );
  process.exitCode = 1;
} finally {
  await transactions?.close();
}
