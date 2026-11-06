// Disposable E0 probe. Never loads .env, signs with a role key, or broadcasts upstream.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  zeroAddress,
  keccak256,
  stringToHex,
  toHex,
  parseEventLogs,
} from "viem";
import { sepolia } from "viem/chains";
import { assertLocalFork } from "./local-fork-guard.mjs";
import { addEnsContracts } from "../../.tools/g0/node_modules/@ensdomains/ensjs/dist/contracts/addEnsContracts.js";
import {
  deployVerifiableProxyWriteParameters,
  createSubnameWriteParameters,
  setRecordsWriteParameters,
  grantRolesWriteParameters,
  grantResolverRolesWriteParameters,
} from "../../.tools/g0/node_modules/@ensdomains/ensjs/dist/exports/wallet/v2.js";
import { encodeRoleBitmap } from "../../.tools/g0/node_modules/@ensdomains/ensjs/dist/utils/v2/roles/encodeRoleBitmap.js";
import { encodeResolverRoleBitmap } from "../../.tools/g0/node_modules/@ensdomains/ensjs/dist/utils/v2/roles/resolverRoles.js";
import { dnsEncodeName } from "../../.tools/g0/node_modules/@ensdomains/ensjs/dist/utils/v2/resolver/resolverMulticallParameters.js";

const input = JSON.parse(
  await fs.readFile("docs/web3/spikes/ens-registration-input.json"),
);
assert.equal(input.chainId, 11155111);
const forkBlock = 12040400;
const sourceNames = [
  "ETHRegistry",
  "VerifiableFactory",
  "UserRegistryImpl",
  "PermissionedResolverImpl",
];
const artifacts = Object.fromEntries(
  await Promise.all(
    sourceNames.map(async (name) => [
      name,
      JSON.parse(await fs.readFile(`.tools/web3-spikes/${name}.json`)),
    ]),
  ),
);
const report = {
  scope: "LOCAL FORK ONLY — not live-chain evidence",
  at: new Date().toISOString(),
  fork: {
    chainId: 11155111,
    block: forkBlock,
    sourceCommit: input.pinnedCommit,
  },
  sdk: "ensjs 5.2.7 / viem 2.57.14 / Anvil 1.7.1",
  checks: [],
  operations: [],
};
const record = (id, detail) => {
  report.checks.push({ id, status: "PASS-LOCAL", detail });
  console.log(`PASS-LOCAL ${id}`);
};
const listener = net.createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const rpc = `http://127.0.0.1:${port}`;
const upstream = createPublicClient({
  chain: sepolia,
  transport: http(input.rpcUrl, { timeout: 20000, retryCount: 0 }),
});
assert.equal(await upstream.getChainId(), 11155111);
const platformArch = `${process.platform}-${process.arch === "x64" ? "amd64" : process.arch}`;
const binary = `.tools/g0/node_modules/@foundry-rs/anvil-${platformArch}/bin/anvil${process.platform === "win32" ? ".exe" : ""}`;
const child = spawn(
  binary,
  [
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--chain-id",
    "31337",
    "--fork-url",
    input.rpcUrl,
    "--fork-block-number",
    String(forkBlock),
    "--silent",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let stderr = "";
child.stderr.on("data", (b) => {
  stderr = (stderr + b).slice(-4000);
});
const chain = {
  ...addEnsContracts(sepolia),
  id: 31337,
  name: "Local ENS spike",
};
const reader = createPublicClient({
  chain,
  transport: http(rpc, { timeout: 25000, retryCount: 0 }),
  pollingInterval: 50,
});
try {
  let ready = false;
  for (let n = 0; n < 80; n++) {
    if (child.exitCode !== null)
      throw new Error(`Anvil startup failed: ${stderr}`);
    try {
      await reader.getChainId();
      ready = true;
      break;
    } catch {
      await delay(250);
    }
  }
  assert(ready, "Anvil startup timed out");
  assertLocalFork(
    rpc,
    await reader.getChainId(),
    await reader.request({ method: "web3_clientVersion" }),
  );
  const owner = input.owner;
  const host = "0x1000000000000000000000000000000000000001";
  const seat = "0x2000000000000000000000000000000000000002";
  const stranger = "0x3000000000000000000000000000000000000003";
  for (const address of [owner, host, seat, stranger]) {
    await reader.request({
      method: "anvil_impersonateAccount",
      params: [address],
    });
    await reader.request({
      method: "anvil_setBalance",
      params: [address, toHex(10n ** 21n)],
    });
  }
  const wallet = (account) =>
    createWalletClient({
      account,
      chain,
      transport: http(rpc, { timeout: 25000, retryCount: 0 }),
    });
  const admin = wallet(owner);
  const read = (name, address, fn, args = []) =>
    reader.readContract({
      address,
      abi: artifacts[name].abi,
      functionName: fn,
      args,
    });
  const params = (name, address, fn, args = [], account = owner) => ({
    address,
    abi: artifacts[name].abi,
    functionName: fn,
    args,
    account,
    chain,
  });
  async function send(label, p) {
    assertLocalFork(
      rpc,
      await reader.getChainId(),
      await reader.request({ method: "web3_clientVersion" }),
    );
    const start = performance.now();
    const sim = await reader.simulateContract(p);
    const hash = await wallet(
      p.account?.address || p.account || owner,
    ).writeContract({
      ...sim.request,
      maxFeePerGas: 30000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    console.log(`LOCAL submitted ${label}`);
    let receipt;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        receipt = await reader.getTransactionReceipt({ hash });
        break;
      } catch (error) {
        if (error.name !== "TransactionReceiptNotFoundError") throw error;
        await delay(250);
      }
    }
    assert(receipt, "Local transaction receipt missing");
    assert.equal(receipt.status, "success");
    report.operations.push({
      label,
      gasUsed: receipt.gasUsed.toString(),
      localElapsedMs: Math.round(performance.now() - start),
    });
    return { result: sim.result, receipt };
  }
  async function denied(label, p) {
    await assert.rejects(
      () => reader.simulateContract(p),
      (e) => {
        // A transport failure is not permission-denial evidence.
        const cause = e.walk?.(
          (x) => x.name === "ContractFunctionRevertedError",
        );
        return cause?.name === "ContractFunctionRevertedError";
      },
    );
    record(label, "Contract revert observed on local fork");
  }
  const contracts = addEnsContracts(sepolia).contracts;
  const mapping = {
    ETHRegistry: "ensRegistry",
    VerifiableFactory: "ensVerifiableFactory",
    UserRegistryImpl: "ensUserRegistryImpl",
    PermissionedResolverImpl: "ensPermissionedResolverImpl",
  };
  for (const [name, key] of Object.entries(mapping))
    assert.equal(
      contracts[key].address.toLowerCase(),
      artifacts[name].address.toLowerCase(),
    );
  record(
    "S-ENS-2 addresses",
    "ensjs deployment addresses equal pinned official Sepolia artifacts",
  );
  const labelId = (label) => BigInt(keccak256(stringToHex(label)));
  const eth = artifacts.ETHRegistry.address;
  const parent = await read("ETHRegistry", eth, "getState", [
    labelId(input.label),
  ]);
  assert.equal(parent.latestOwner.toLowerCase(), owner.toLowerCase());
  const roles = encodeRoleBitmap([
    "ROLE_REGISTRAR",
    "ROLE_REGISTRAR_ADMIN",
    "ROLE_RENEW",
    "ROLE_RENEW_ADMIN",
    "ROLE_UNREGISTER",
    "ROLE_UNREGISTER_ADMIN",
    "ROLE_SET_SUBREGISTRY",
    "ROLE_SET_RESOLVER",
    "ROLE_SET_PARENT",
  ]);
  const resolverRoles = encodeResolverRoleBitmap([
    "ROLE_SET_TEXT",
    "ROLE_SET_TEXT_ADMIN",
    "ROLE_SET_ADDRESS",
    "ROLE_SET_ADDRESS_ADMIN",
  ]);
  let salt = 1000n;
  async function proxy(kind) {
    const name =
      kind === "registry" ? "UserRegistryImpl" : "PermissionedResolverImpl";
    const grants = [
      {
        account: owner,
        roleBitmap: kind === "registry" ? roles : resolverRoles,
      },
    ];
    const callData = encodeFunctionData({
      abi: artifacts[name].abi,
      functionName: "initialize",
      args: kind === "registry" ? [grants] : [grants, []],
    });
    const p = deployVerifiableProxyWriteParameters(admin, {
      factoryAddress: artifacts.VerifiableFactory.address,
      implAddress: artifacts[name].address,
      callData,
      salt: salt++,
    });
    return (await send(`deploy ${kind}`, p)).result;
  }
  const parentRegistry = await proxy("registry");
  const playRegistry = await proxy("registry");
  const partyRegistry = await proxy("registry");
  const resolver = await proxy("resolver");
  await send(
    "link parent",
    params("ETHRegistry", eth, "setSubregistry", [
      parent.tokenId,
      parentRegistry,
    ]),
  );
  const register = (
    registryAddress,
    label,
    owner,
    subregistryAddress,
    resolverAddress,
    roleBitmap,
    expires,
  ) =>
    createSubnameWriteParameters(admin, {
      registryAddress,
      label,
      owner,
      subregistryAddress,
      resolverAddress,
      roleBitmap,
      expires,
    });
  await send(
    "register play",
    register(
      parentRegistry,
      "play",
      owner,
      playRegistry,
      zeroAddress,
      roles,
      parent.expiry,
    ),
  );
  const now = (await reader.getBlock()).timestamp;
  const expiry = now + 3600n;
  await send(
    "register party",
    register(
      playRegistry,
      "spike",
      owner,
      partyRegistry,
      resolver,
      roles,
      expiry,
    ),
  );
  for (const address of [parentRegistry, playRegistry, partyRegistry])
    assert(
      await read("UserRegistryImpl", address, "hasRootRoles", [roles, owner]),
    );
  record(
    "VE-01 bootstrap",
    "Local parent/play/party registries linked; registrar root roles verified. Live bootstrap still absent.",
  );
  await send(
    "mint soulbound seat",
    register(partyRegistry, "player", seat, zeroAddress, resolver, 0n, expiry),
  );
  const seatName = "player.spike.play.funcaster.eth";
  const records = await setRecordsWriteParameters(admin, {
    name: seatName,
    resolverAddress: resolver,
    texts: [{ key: "chonks.seat", value: "slot=1" }],
    coins: [{ coin: 60, value: seat }],
  });
  await send("seat records", records);
  assert.equal(
    (await reader.getEnsAddress({ name: seatName })).toLowerCase(),
    seat.toLowerCase(),
  );
  assert.equal(
    await reader.getEnsText({ name: seatName, key: "chonks.seat" }),
    "slot=1",
  );
  record(
    "S-ENS-2 helpers",
    "deployVerifiableProxy/createSubname/setRecords generated successful local calls; Universal Resolver reads match",
  );
  await denied("S-ENS-3 seat cannot write", {
    ...(await setRecordsWriteParameters(wallet(seat), {
      name: seatName,
      resolverAddress: resolver,
      texts: [{ key: "chonks.seat", value: "forged" }],
    })),
  });
  const state = await read("UserRegistryImpl", partyRegistry, "getState", [
    labelId("player"),
  ]);
  await denied(
    "S-ENS-3 seat cannot transfer",
    params(
      "UserRegistryImpl",
      partyRegistry,
      "safeTransferFrom",
      [seat, stranger, state.tokenId, 1n, "0x"],
      seat,
    ),
  );
  const grant = grantRolesWriteParameters(admin, {
    registryAddress: partyRegistry,
    resource: 0n,
    roles: ["ROLE_UNREGISTER"],
    account: host,
  });
  await send("grant host kick", grant);
  await send(
    "host kicks seat",
    params(
      "UserRegistryImpl",
      partyRegistry,
      "unregister",
      [state.tokenId],
      host,
    ),
  );
  await send(
    "revoke host kick",
    params("UserRegistryImpl", partyRegistry, "revokeRootRoles", [
      encodeRoleBitmap(["ROLE_UNREGISTER"]),
      host,
    ]),
  );
  await send(
    "remint seat",
    register(partyRegistry, "player", seat, zeroAddress, resolver, 0n, expiry),
  );
  const reminted = await read("UserRegistryImpl", partyRegistry, "getState", [
    labelId("player"),
  ]);
  await denied(
    "S-ENS-4 revoked host cannot kick",
    params(
      "UserRegistryImpl",
      partyRegistry,
      "unregister",
      [reminted.tokenId],
      host,
    ),
  );
  await denied("host cannot mint", {
    ...register(
      partyRegistry,
      "forged",
      host,
      zeroAddress,
      resolver,
      0n,
      expiry,
    ),
    account: host,
  });
  const scope = { kind: "text", key: "chonks.control" };
  const granted = await send(
    "grant control",
    grantResolverRolesWriteParameters(admin, {
      resolverAddress: resolver,
      targetAccount: host,
      scope: "setter",
      setter: scope,
    }),
  );
  const resource = BigInt(keccak256(stringToHex(scope.key)));
  const textRole = encodeResolverRoleBitmap(["ROLE_SET_TEXT"]);
  assert(
    await read("PermissionedResolverImpl", resolver, "hasRoles", [
      resource,
      textRole,
      host,
    ]),
  );
  assert(
    parseEventLogs({
      abi: artifacts.PermissionedResolverImpl.abi,
      logs: granted.receipt.logs,
      eventName: "EACRolesChanged",
    }).length > 0,
  );
  await send(
    "host sets control",
    await setRecordsWriteParameters(wallet(host), {
      name: "spike.play.funcaster.eth",
      resolverAddress: resolver,
      texts: [{ key: scope.key, value: "start" }],
    }),
  );
  await denied(
    "host cannot write other record",
    await setRecordsWriteParameters(wallet(host), {
      name: seatName,
      resolverAddress: resolver,
      texts: [{ key: "chonks.seat", value: "forged" }],
    }),
  );
  await denied("host cannot grant itself roles", {
    ...grantResolverRolesWriteParameters(wallet(host), {
      resolverAddress: resolver,
      targetAccount: host,
      scope: "root",
      roles: ["ROLE_SET_TEXT_ADMIN"],
    }),
  });
  const revoked = await send(
    "revoke control",
    params("PermissionedResolverImpl", resolver, "revokeRoles", [
      resource,
      textRole,
      host,
    ]),
  );
  assert(
    !(await read("PermissionedResolverImpl", resolver, "hasRoles", [
      resource,
      textRole,
      host,
    ])),
  );
  assert(
    parseEventLogs({
      abi: artifacts.PermissionedResolverImpl.abi,
      logs: revoked.receipt.logs,
      eventName: "EACRolesChanged",
    }).length > 0,
  );
  await denied(
    "S-ENS-5 revoked host cannot control",
    await setRecordsWriteParameters(wallet(host), {
      name: seatName,
      resolverAddress: resolver,
      texts: [{ key: scope.key, value: "start" }],
    }),
  );
  await reader.request({
    method: "evm_setNextBlockTimestamp",
    params: [Number(expiry + 1n)],
  });
  await reader.request({ method: "evm_mine", params: [] });
  assert.equal(await reader.getEnsAddress({ name: seatName }), null);
  record("expiry", "Seat stops resolving after party expiry, using chain time");
  record(
    "S-ENS-6 gas",
    "Gas recorded per local fork operation; live inclusion latency and daily budget remain unverified",
  );
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = {
    name: error.name,
    message: error.shortMessage || error.message,
  };
  console.error(report.error);
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
  if (child.exitCode === null)
    await Promise.race([once(child, "exit"), delay(2000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await fs.writeFile(
    "docs/web3/spikes/ens-fork.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
