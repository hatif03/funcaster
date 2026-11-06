// One-off operator tool. Sepolia + free MockUSDC only; never called by the relay.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  formatUnits,
  keccak256,
  toHex,
  zeroAddress,
  zeroHash,
  decodeEventLog,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const inputPath = "docs/web3/spikes/ens-registration-input.json";
const statePath = ".local/web3-keys/ens-registration-chonks.json";
const reportPath = "docs/web3/spikes/ens-registration.json";
export function validateInput(input) {
  assert.equal(input.chainId, sepolia.id, "Sepolia only");
  assert.equal(input.label, "chonks", "Only the authorized parent");
  assert.equal(input.durationSeconds, 31536000, "One-year registration");
  assert.equal(
    input.resolver,
    zeroAddress,
    "Resolver bootstrap is a later task",
  );
  assert.equal(
    input.subregistry,
    zeroAddress,
    "Subregistry bootstrap is a later task",
  );
  assert.ok(
    BigInt(input.maxMockTokenUnits) > 0n &&
      BigInt(input.maxMockTokenUnits) <= 100_000_000n,
  );
  assert.ok(
    BigInt(input.maxGasCostWei) > 0n &&
      BigInt(input.maxGasCostWei) <= 10_000_000_000_000_000n,
  );
}
export function rolesFromPinnedSource(source, registrarSource) {
  const resolve = (name) => {
    const expression = source.match(
      new RegExp(`constant ${name} = ([^;]+);`),
    )?.[1];
    assert.ok(expression, "Missing pinned role");
    const parts = expression
      .replace(/[()]/g, "")
      .split("<<")
      .map((x) => x.trim());
    let value = /^\d+$/.test(parts[0]) ? BigInt(parts[0]) : resolve(parts[0]);
    for (const shift of parts.slice(1)) {
      assert.match(shift, /^\d+$/);
      value <<= BigInt(shift);
    }
    return value;
  };
  const body = registrarSource.match(
    /REGISTRATION_ROLE_BITMAP\s*=\s*([^;]+);/,
  )?.[1];
  assert.ok(body, "Missing registration bitmap");
  const names = [...body.matchAll(/RegistryRolesLib\.(ROLE_[A-Z_]+)/g)].map(
    (x) => x[1],
  );
  assert.ok(names.length > 0);
  return {
    registration: names.reduce((mask, name) => mask | resolve(name), 0n),
    setResolver: resolve("ROLE_SET_RESOLVER"),
  };
}
async function main() {
  const mode = process.argv[2] || "--check";
  assert.ok(["--check", "--commit", "--register"].includes(mode));
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  validateInput(input);
  const docs = {};
  for (const name of Object.keys(input.contracts)) {
    docs[name] = JSON.parse(
      await readFile(`.tools/web3-spikes/${name}.json`, "utf8"),
    );
    assert.equal(
      docs[name].address.toLowerCase(),
      input.contracts[name].toLowerCase(),
    );
  }
  const rolesSource = await readFile(
    ".tools/web3-spikes/RegistryRolesLib.sol",
    "utf8",
  );
  const registrarSource = await readFile(
    ".tools/web3-spikes/ETHRegistrar.sol",
    "utf8",
  );
  const metadata = JSON.parse(docs.ETHRegistrar.metadata);
  assert.equal(
    keccak256(toHex(rolesSource)),
    metadata.sources["project/src/registry/libraries/RegistryRolesLib.sol"]
      .keccak256,
  );
  assert.equal(
    keccak256(toHex(registrarSource)),
    metadata.sources["project/src/registrar/ETHRegistrar.sol"].keccak256,
  );
  const expectedRoles = rolesFromPinnedSource(rolesSource, registrarSource);
  const client = createPublicClient({
    chain: sepolia,
    transport: http(input.rpcUrl, { timeout: 15000, retryCount: 1 }),
  });
  assert.equal(await client.getChainId(), sepolia.id);
  const read = (name, functionName, args = []) =>
    client.readContract({
      address: docs[name].address,
      abi: docs[name].abi,
      functionName,
      args,
    });
  for (const doc of Object.values(docs))
    assert.ok(
      (await client.getCode({ address: doc.address }))?.length > 2,
      "Missing deployed code",
    );
  assert.equal(
    (await read("ETHRegistrar", "ETH_REGISTRY")).toLowerCase(),
    docs.ETHRegistry.address.toLowerCase(),
  );
  assert.equal(
    (await read("ETHRegistrar", "rentPriceOracle")).toLowerCase(),
    docs.StandardRentPriceOracle.address.toLowerCase(),
  );
  assert.equal(
    await read("StandardRentPriceOracle", "isPaymentToken", [
      docs.MockUSDC.address,
    ]),
    true,
  );
  assert.equal(await read("MockUSDC", "decimals"), 6);
  const inventory = JSON.parse(
    await readFile(".local/web3-keys/addresses.json", "utf8"),
  );
  const owner = inventory.roles.find(
    (x) => x.role === "ENS_REGISTRAR_KEY",
  ).address;
  assert.equal(owner.toLowerCase(), input.owner.toLowerCase());
  const stranger = inventory.roles.find(
    (x) => x.role === "DEVELOPER_KEY",
  ).address;
  const duration = BigInt(input.durationSeconds);
  let state;
  try {
    state = JSON.parse(await readFile(statePath, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const inputHash = keccak256(toHex(JSON.stringify(input)));
  if (state)
    assert.equal(state.inputHash, inputHash, "Registration parameters changed");
  const report = {
    at: new Date().toISOString(),
    chainId: sepolia.id,
    name: input.label + ".eth",
    owner,
    contracts: input.contracts,
    pinnedCommit: input.pinnedCommit,
    status: "PRECHECK",
    transactions: state?.transactions || [],
  };
  const saveReport = async () =>
    writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  const saveState = async () => {
    await writeFile(statePath, JSON.stringify(state, null, 2) + "\n", {
      mode: 0o600,
    });
    await chmod(statePath, 0o600);
  };
  const available = await read("ETHRegistrar", "isAvailable", [input.label]);
  report.startBalanceWei = String(await client.getBalance({ address: owner }));
  const verify = async () => {
    const id = BigInt(keccak256(toHex(input.label)));
    const value = await read("ETHRegistry", "getState", [id]);
    const currentOwner = await read("ETHRegistry", "getOwner", [id]);
    assert.equal(
      currentOwner.toLowerCase(),
      owner.toLowerCase(),
      "Registered owner mismatch",
    );
    const roles = await read("ETHRegistry", "roles", [id, owner]);
    assert.equal(
      roles,
      expectedRoles.registration,
      "Registration roles mismatch",
    );
    assert.equal(
      await read("ETHRegistry", "hasRoles", [
        id,
        expectedRoles.setResolver,
        owner,
      ]),
      true,
    );
    assert.equal(
      await read("ETHRegistry", "hasRoles", [
        id,
        expectedRoles.setResolver,
        stranger,
      ]),
      false,
    );
    const block = await client.getBlock();
    assert.ok(value.expiry > block.timestamp);
    report.status = "REGISTERED";
    report.tokenId = String(value.tokenId);
    report.resource = String(value.resource);
    report.expiryUnix = String(value.expiry);
    report.expiryUTC = new Date(Number(value.expiry) * 1000).toISOString();
    report.ownerRoles = String(roles);
    report.expectedRolesMatch = true;
    report.unrelatedKeyDeniedResolverRole = true;
    report.resolver = await read("ETHRegistry", "getResolver", [input.label]);
    report.subregistry = await read("ETHRegistry", "getSubregistry", [
      input.label,
    ]);
    report.balanceAfterWei = String(
      await client.getBalance({ address: owner }),
    );
    report.mockTokenBalanceAfter = String(
      await read("MockUSDC", "balanceOf", [owner]),
    );
    report.allowanceAfter = String(
      await read("MockUSDC", "allowance", [owner, docs.ETHRegistrar.address]),
    );
    report.totalGasCostWei = String(
      report.transactions.reduce(
        (sum, t) => sum + BigInt(t.gasCostWei || 0),
        0n,
      ),
    );
    await saveReport();
    console.log(JSON.stringify(report, null, 2));
  };
  if (!available) {
    await verify();
    return;
  }
  const [base, premium] = await read("ETHRegistrar", "getRegisterPrice", [
    input.label,
    duration,
    docs.MockUSDC.address,
  ]);
  const cost = base + premium;
  assert.ok(
    cost > 0n && cost <= BigInt(input.maxMockTokenUnits),
    "Price exceeds test-token cap",
  );
  report.mockTokenPrice = String(cost);
  report.durationSeconds = input.durationSeconds;
  console.log(
    JSON.stringify({
      status: "PRECHECK_PASS",
      name: report.name,
      sepEth: formatEther(BigInt(report.startBalanceWei)),
      priceMockUSDC: formatUnits(cost, 6),
      mode,
    }),
  );
  if (mode === "--check") {
    await saveReport();
    return;
  }
  const env = parseEnv(await readFile(".env.worker", "utf8"));
  const account = privateKeyToAccount(env.ENS_REGISTRAR_KEY);
  assert.equal(account.address.toLowerCase(), owner.toLowerCase());
  const wallet = createWalletClient({
    chain: sepolia,
    account,
    transport: http(input.rpcUrl, { timeout: 15000, retryCount: 0 }),
  });
  if (!state) {
    state = { inputHash, secret: toHex(randomBytes(32)), transactions: [] };
    await saveState();
  }
  report.transactions = state.transactions;
  assert.ok(
    !state.pending,
    "Pending broadcast requires receipt reconciliation; do not resend",
  );
  const send = async (name, functionName, args) => {
    const contract = {
      address: docs[name].address,
      abi: docs[name].abi,
      functionName,
      args,
      account,
    };
    await client.simulateContract(contract);
    const estimated = await client.estimateContractGas(contract);
    const gas = (estimated * 120n) / 100n;
    const fees = await client.estimateFeesPerGas();
    assert.ok(
      gas * fees.maxFeePerGas <= BigInt(input.maxGasCostWei),
      "Gas cap exceeded",
    );
    assert.ok(
      (await client.getBalance({ address: owner })) > gas * fees.maxFeePerGas,
      "Insufficient gas",
    );
    const hash = await wallet.writeContract({ ...contract, gas, ...fees });
    state.pending = { functionName, hash };
    await saveState();
    console.log(JSON.stringify({ submitted: functionName, hash }));
    const receipt = await client.waitForTransactionReceipt({
      hash,
      confirmations: 2,
      timeout: 180000,
      pollingInterval: 3000,
    });
    const tx = {
      functionName,
      hash,
      status: receipt.status,
      blockNumber: String(receipt.blockNumber),
      gasUsed: String(receipt.gasUsed),
      effectiveGasPrice: String(receipt.effectiveGasPrice),
      gasCostWei: String(receipt.gasUsed * receipt.effectiveGasPrice),
    };
    state.transactions.push(tx);
    delete state.pending;
    await saveState();
    await saveReport();
    assert.equal(receipt.status, "success", `${functionName} reverted`);
    console.log(
      JSON.stringify({ confirmed: functionName, hash, block: tx.blockNumber }),
    );
    return receipt;
  };
  const makeArgs = [
    input.label,
    owner,
    state.secret,
    input.subregistry,
    input.resolver,
    duration,
    zeroHash,
  ];
  const commitment = await read("ETHRegistrar", "makeCommitment", makeArgs);
  const commitAt = await read("ETHRegistrar", "commitmentAt", [commitment]);
  const minAge = await read("ETHRegistrar", "MIN_COMMITMENT_AGE");
  const maxAge = await read("ETHRegistrar", "MAX_COMMITMENT_AGE");
  const now = (await client.getBlock()).timestamp;
  if (mode === "--commit") {
    assert.ok(
      duration >= (await read("ETHRegistrar", "MIN_REGISTER_DURATION")),
    );
    const balance = await read("MockUSDC", "balanceOf", [owner]);
    if (balance < cost) await send("MockUSDC", "mint", [owner, cost - balance]);
    const allowance = await read("MockUSDC", "allowance", [
      owner,
      docs.ETHRegistrar.address,
    ]);
    if (allowance !== cost)
      await send("MockUSDC", "approve", [docs.ETHRegistrar.address, cost]);
    if (commitAt === 0n || now >= commitAt + maxAge)
      await send("ETHRegistrar", "commit", [commitment]);
    report.status = "COMMITTED";
    report.minimumAgeSeconds = String(minAge);
    report.commitmentTimestamp = String(
      await read("ETHRegistrar", "commitmentAt", [commitment]),
    );
    await saveReport();
    console.log(
      JSON.stringify({
        status: report.status,
        minimumAgeSeconds: report.minimumAgeSeconds,
      }),
    );
    return;
  }
  assert.ok(
    commitAt > 0n && now >= commitAt + minAge && now < commitAt + maxAge,
    "Commitment not in valid window",
  );
  assert.ok(
    await read("ETHRegistrar", "isAvailable", [input.label]),
    "Name unavailable",
  );
  const receipt = await send("ETHRegistrar", "register", [
    ...makeArgs.slice(0, 6),
    docs.MockUSDC.address,
    zeroHash,
  ]);
  const event = receipt.logs
    .filter(
      (log) =>
        log.address.toLowerCase() === docs.ETHRegistrar.address.toLowerCase(),
    )
    .map((log) => {
      try {
        return decodeEventLog({
          abi: docs.ETHRegistrar.abi,
          data: log.data,
          topics: log.topics,
        });
      } catch {
        return null;
      }
    })
    .find((log) => log?.eventName === "NameRegistered");
  assert.equal(event?.args.label, input.label);
  assert.equal(event?.args.owner.toLowerCase(), owner.toLowerCase());
  await verify();
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        status: "STOPPED",
        errorType: error.name,
        reason:
          error.name === "AssertionError"
            ? error.message
            : "RPC or local operation failed; inspect public transaction receipts before retrying.",
      }),
    );
    process.exitCode = 1;
  });
}
