// Owner-operated Sepolia bootstrap. Default is read-only; agents use --rehearse only.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  keccak256,
  stringToHex,
  zeroAddress,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";
import net from "node:net";
import { once } from "node:events";
import { assertLocalFork } from "./local-fork-guard.mjs";

const ROOT = new URL("../../", import.meta.url);
const at = (p) => new URL(p, ROOT);
const stringify = (value) =>
  JSON.stringify(
    value,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ) + "\n";
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
export function validateMode(args) {
  const mode = args[0] || "--check";
  assert(["--check", "--rehearse", "--apply"].includes(mode), "Unknown mode");
  if (mode === "--apply")
    assert.deepEqual(
      args,
      ["--apply", "--confirm-parent", "funcaster.eth"],
      "Owner execution requires --confirm-parent funcaster.eth",
    );
  else assert(args.length <= 1, "Unexpected arguments");
  return mode;
}
export function assertEmptyOrExpected(actual, expected, label) {
  assert(
    same(actual, zeroAddress) || same(actual, expected),
    `${label}: existing configuration differs; refusing overwrite`,
  );
}
export function assertBudget(gas, maxFeePerGas, spent, budget) {
  assert(gas > 0n && maxFeePerGas > 0n, "Invalid gas bound");
  assert(spent + gas * maxFeePerGas <= budget, "Bootstrap gas budget exceeded");
}
async function atomic(path, value) {
  const tmp = new URL(path.href + ".tmp");
  const handle = await fs.open(tmp, "w", 0o600);
  try {
    await handle.writeFile(stringify(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, path);
}
async function load() {
  const input = JSON.parse(
    await fs.readFile(
      at("docs/web3/spikes/ens-registration-input.json"),
      "utf8",
    ),
  );
  const manifest = JSON.parse(
    await fs.readFile(at("docs/web3/spikes/ens-artifacts.json"), "utf8"),
  );
  assert.equal(input.chainId, 11155111);
  assert.equal(input.label, "chonks");
  assert.equal(manifest.commit, input.pinnedCommit);
  const artifacts = {};
  for (const row of manifest.artifacts) {
    const bytes = await fs.readFile(at(`.tools/web3-spikes/${row.name}.json`));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      row.sha256,
      "Artifact digest changed",
    );
    const artifact = JSON.parse(bytes);
    assert(same(artifact.address, row.address));
    artifacts[row.name] = artifact;
  }
  const { encodeRoleBitmap } =
    await import("../../.tools/g0/node_modules/@ensdomains/ensjs/dist/utils/v2/roles/encodeRoleBitmap.js");
  const { encodeResolverRoleBitmap } =
    await import("../../.tools/g0/node_modules/@ensdomains/ensjs/dist/utils/v2/roles/resolverRoles.js");
  const { addEnsContracts } =
    await import("../../.tools/g0/node_modules/@ensdomains/ensjs/dist/contracts/addEnsContracts.js");
  const c = addEnsContracts(sepolia).contracts;
  for (const [name, key] of Object.entries({
    ETHRegistry: "ensRegistry",
    VerifiableFactory: "ensVerifiableFactory",
    UserRegistryImpl: "ensUserRegistryImpl",
    PermissionedResolverImpl: "ensPermissionedResolverImpl",
  }))
    assert(same(c[key].address, artifacts[name].address), "SDK address drift");
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
  return { input, artifacts, roles, resolverRoles };
}
export async function bootstrap(client, loaded, execute) {
  const { input, artifacts: a, roles, resolverRoles } = loaded;
  const owner = input.owner;
  const read = (kind, address, functionName, args = []) =>
    client.readContract({ address, abi: a[kind].abi, functionName, args });
  const request = (kind, address, functionName, args) => ({
    address,
    abi: a[kind].abi,
    functionName,
    args,
    account: owner,
  });
  const eth = a.ETHRegistry.address,
    factory = a.VerifiableFactory.address;
  const parent = await read("ETHRegistry", eth, "getState", [
    BigInt(keccak256(stringToHex("chonks"))),
  ]);
  assert(same(parent.latestOwner, owner), "ENS owner mismatch");
  assert(
    parent.expiry > (await client.getBlock()).timestamp + 86400n,
    "Parent expiry too close",
  );
  const proxies = [];
  for (const [label, kind, bitmap] of [
    ["funcaster.eth", "UserRegistryImpl", roles],
    ["play.funcaster.eth", "UserRegistryImpl", roles],
    ["play.funcaster.eth:resolver", "PermissionedResolverImpl", resolverRoles],
  ]) {
    const salt = BigInt(keccak256(stringToHex(`chonks:bootstrap:v1:${label}`)));
    const address = await read(
      "VerifiableFactory",
      factory,
      "predictProxyAddress",
      [owner, salt],
    );
    const grants = [{ account: owner, roleBitmap: bitmap }];
    const init = encodeFunctionData({
      abi: a[kind].abi,
      functionName: "initialize",
      args: kind === "UserRegistryImpl" ? [grants] : [grants, []],
    });
    proxies.push({
      label,
      kind,
      bitmap,
      address,
      request: request("VerifiableFactory", factory, "deployProxy", [
        a[kind].address,
        salt,
        init,
      ]),
    });
  }
  const [parentProxy, playProxy, resolver] = proxies;
  const linked = await read("ETHRegistry", eth, "getSubregistry", ["chonks"]);
  assertEmptyOrExpected(linked, parentProxy.address, "Parent subregistry");
  const operations = [];
  const run = async (id, params) => {
    operations.push({
      id,
      to: params.address,
      data: encodeFunctionData(params),
      value: "0",
      chainId: 11155111,
    });
    if (execute) await execute(id, params);
  };
  for (const p of proxies) {
    const code = await client.getCode({ address: p.address });
    if (code && code !== "0x") {
      assert(
        same(
          await read("VerifiableFactory", factory, "verifyContract", [
            p.address,
          ]),
          a[p.kind].address,
        ),
        "Unexpected proxy implementation",
      );
      assert(
        await read(p.kind, p.address, "hasRootRoles", [p.bitmap, owner]),
        "Registrar root roles absent",
      );
    } else await run(`deploy:${p.label}`, p.request);
  }
  // With dry-run only, later calls target future proxies; their full simulation occurs in --rehearse.
  const canRead = async (p) => {
    const code = await client.getCode({ address: p });
    return code && code !== "0x";
  };
  for (const [p, parentAddress, label] of [
    [parentProxy, eth, "chonks"],
    [playProxy, parentProxy.address, "play"],
  ]) {
    let current = [zeroAddress, ""];
    if (await canRead(p.address))
      current = await read("UserRegistryImpl", p.address, "getParent");
    assertEmptyOrExpected(
      current[0],
      parentAddress,
      `Canonical parent ${label}`,
    );
    if (same(current[0], parentAddress))
      assert.equal(current[1], label, "Canonical label mismatch");
    else
      await run(
        `canonical:${label}`,
        request("UserRegistryImpl", p.address, "setParent", [
          parentAddress,
          label,
        ]),
      );
  }
  if (same(linked, zeroAddress))
    await run(
      "link:chonks",
      request("ETHRegistry", eth, "setSubregistry", [
        parent.tokenId,
        parentProxy.address,
      ]),
    );
  let playState;
  if (await canRead(parentProxy.address))
    playState = await read(
      "UserRegistryImpl",
      parentProxy.address,
      "getState",
      [BigInt(keccak256(stringToHex("play")))],
    );
  if (playState && !same(playState.latestOwner, zeroAddress)) {
    assert(same(playState.latestOwner, owner), "play owner mismatch");
    assert.equal(playState.expiry, parent.expiry, "play expiry mismatch");
    assert(
      same(
        await read("UserRegistryImpl", parentProxy.address, "getSubregistry", [
          "play",
        ]),
        playProxy.address,
      ),
      "play subregistry mismatch",
    );
    assert(
      same(
        await read("UserRegistryImpl", parentProxy.address, "getResolver", [
          "play",
        ]),
        resolver.address,
      ),
      "play resolver mismatch",
    );
  } else
    await run(
      "register:play",
      request("UserRegistryImpl", parentProxy.address, "register", [
        "play",
        owner,
        playProxy.address,
        resolver.address,
        roles,
        parent.expiry,
      ]),
    );
  if (execute) {
    for (const p of proxies) {
      assert(
        same(
          await read("VerifiableFactory", factory, "verifyContract", [
            p.address,
          ]),
          a[p.kind].address,
        ),
      );
      assert(await read(p.kind, p.address, "hasRootRoles", [p.bitmap, owner]));
    }
    assert(
      same(
        await read("ETHRegistry", eth, "getSubregistry", ["chonks"]),
        parentProxy.address,
      ),
    );
    assert(
      same(
        await read("UserRegistryImpl", parentProxy.address, "getSubregistry", [
          "play",
        ]),
        playProxy.address,
      ),
    );
    assert(
      same(
        await read("UserRegistryImpl", parentProxy.address, "getResolver", [
          "play",
        ]),
        resolver.address,
      ),
    );
  }
  return {
    owner,
    parent: "funcaster.eth",
    expiry: parent.expiry,
    proxies: proxies.map(({ request, ...p }) => p),
    operations,
  };
}
async function receipt(client, hash) {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await client.getTransactionReceipt({ hash });
      assert.equal(r.status, "success", "Transaction reverted");
      return r;
    } catch (e) {
      if (e.name !== "TransactionReceiptNotFoundError") throw e;
      await delay(1000);
    }
  }
  throw Error(`Receipt not available; do not resend: ${hash}`);
}
async function main() {
  const mode = validateMode(process.argv.slice(2));
  const loaded = await load();
  const { input } = loaded;
  const rpcUrl = process.env.ENS_BOOTSTRAP_RPC_URL || input.rpcUrl;
  assert.equal(
    new URL(rpcUrl).protocol,
    "https:",
    "Public upstream must use HTTPS",
  );
  let child, lock;
  const upstream = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { timeout: 15000, retryCount: 0 }),
  });
  assert.equal(await upstream.getChainId(), 11155111);
  const forkBlock = await upstream.getBlock();
  let url = rpcUrl,
    chain = sepolia;
  const journalPath = at(".local/web3-keys/ens-bootstrap-journal.json");
  try {
    if (mode === "--rehearse") {
      const listener = net.createServer();
      listener.listen(0, "127.0.0.1");
      await once(listener, "listening");
      const port = listener.address().port;
      await new Promise((r) => listener.close(r));
      url = `http://127.0.0.1:${port}`;
      chain = { ...sepolia, id: 31337 };
      const arch = `${process.platform}-${process.arch === "x64" ? "amd64" : process.arch}`;
      child = spawn(
        fileURLToPath(
          new URL(
            `.tools/g0/node_modules/@foundry-rs/anvil-${arch}/bin/anvil`,
            ROOT,
          ),
        ),
        [
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--chain-id",
          "31337",
          "--fork-url",
          rpcUrl,
          "--fork-block-number",
          String(forkBlock.number),
          "--silent",
        ],
        { stdio: "ignore" },
      );
    }
    const client = createPublicClient({
      chain,
      transport: http(url, { timeout: 20000, retryCount: 0 }),
      cacheTime: 0,
    });
    if (child) {
      let ready = false;
      for (let i = 0; i < 80; i++) {
        try {
          await client.getChainId();
          ready = true;
          break;
        } catch {
          await delay(250);
        }
      }
      assert(ready, "Anvil startup failed");
      assertLocalFork(
        url,
        await client.getChainId(),
        await client.request({ method: "web3_clientVersion" }),
      );
      await client.request({
        method: "anvil_impersonateAccount",
        params: [input.owner],
      });
    }
    let account = input.owner;
    let journal = { chainId: 11155111, parent: "funcaster.eth", operations: [] };
    if (mode === "--apply") {
      // Only a human runs this mode. The agent must stop at the public-chain boundary.
      lock = await fs.open(
        at(".local/web3-keys/ens-bootstrap.lock"),
        "wx",
        0o600,
      );
      await lock.writeFile(String(process.pid));
      await lock.sync();
      const privateFile = at(".env.worker");
      assert.equal((await fs.stat(privateFile)).mode & 0o777, 0o600);
      const env = parseEnv(await fs.readFile(privateFile, "utf8"));
      account = privateKeyToAccount(env.ENS_REGISTRAR_KEY);
      assert(same(account.address, input.owner));
      try {
        journal = JSON.parse(await fs.readFile(journalPath, "utf8"));
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      assert.equal(journal.chainId, 11155111);
      assert.equal(journal.parent, "funcaster.eth");
      // Reconcile every recorded send before another nonce can be used. Unknown sends stop, never resend.
      for (const row of journal.operations)
        if (row.status !== "success") {
          const r = await receipt(client, row.hash);
          row.status = "success";
          row.gasCost = String(r.gasUsed * r.effectiveGasPrice);
          await atomic(journalPath, journal);
        }
    }
    const wallet = createWalletClient({
      account,
      chain,
      transport: http(url, { retryCount: 0 }),
    });
    const receipts = [];
    let spent = journal.operations.reduce(
      (n, r) => n + BigInt(r.gasCost || "0"),
      0n,
    );
    const execute =
      mode === "--check"
        ? null
        : async (id, params) => {
            if (child)
              assertLocalFork(
                url,
                await client.getChainId(),
                await client.request({ method: "web3_clientVersion" }),
              );
            else assert.equal(await client.getChainId(), 11155111);
            await client.simulateContract(params);
            const data = encodeFunctionData(params);
            const estimate = await client.estimateGas({
              account: input.owner,
              to: params.address,
              data,
            });
            const gas = (estimate * 12n) / 10n;
            const block = await client.getBlock();
            const priority = 1_000_000_000n,
              maxFee = (block.baseFeePerGas || 0n) * 2n + priority;
            assertBudget(gas, maxFee, spent, 20_000_000_000_000_000n);
            assert(
              (await client.getBalance({ address: input.owner })) >
                gas * maxFee,
              "Insufficient SepETH",
            );
            let hash;
            if (child)
              hash = await wallet.sendTransaction({
                to: params.address,
                data,
                gas,
                maxFeePerGas: maxFee,
                maxPriorityFeePerGas: priority,
              });
            else {
              const request = await wallet.prepareTransactionRequest({
                to: params.address,
                data,
                value: 0n,
                gas,
                maxFeePerGas: maxFee,
                maxPriorityFeePerGas: priority,
              });
              const signed = await wallet.signTransaction(request);
              hash = keccak256(signed);
              journal.operations.push({
                id,
                hash,
                status: "prepared",
                to: params.address,
                dataHash: keccak256(data),
              });
              await atomic(journalPath, journal); // Hash durable before network send; signed bytes never persisted.
              const sent = await client.sendRawTransaction({
                serializedTransaction: signed,
              });
              assert.equal(sent, hash);
            }
            const r = await receipt(client, hash),
              cost = r.gasUsed * r.effectiveGasPrice;
            spent += cost;
            receipts.push({
              id,
              hash,
              blockNumber: r.blockNumber,
              gasUsed: r.gasUsed,
              gasCost: cost,
            });
            if (!child) {
              Object.assign(journal.operations.at(-1), {
                status: "success",
                gasCost: String(cost),
              });
              await atomic(journalPath, journal);
            }
            console.log(`${child ? "LOCAL" : "LIVE"} ${id}: ${hash}`);
          };
    const result = await bootstrap(client, loaded, execute);
    let rerun;
    if (execute) {
      rerun = await bootstrap(client, loaded, execute);
      assert.equal(
        rerun.operations.length,
        0,
        "Idempotent rerun must send nothing",
      );
    }
    const report = {
      at: new Date().toISOString(),
      mode,
      scope: child
        ? "LOCAL FORK ONLY"
        : mode === "--check"
          ? "READ ONLY — unsigned plan"
          : "OWNER EXECUTED LIVE",
      forkBlock: forkBlock.number,
      publicRpc: rpcUrl,
      ...result,
      receipts,
      idempotent: rerun ? true : null,
      gasSpent: spent,
    };
    const suffix =
      mode === "--rehearse"
        ? "rehearsal"
        : mode === "--apply"
          ? "live"
          : "plan";
    await fs.writeFile(
      at(`docs/web3/spikes/ens-bootstrap-${suffix}.json`),
      stringify(report),
    );
    console.log(
      `${mode}: ${result.operations.length} operations; ${suffix} evidence saved`,
    );
  } finally {
    if (child) {
      child.kill("SIGTERM");
      await once(child, "exit").catch(() => {});
    }
    if (lock) {
      await lock.close();
      await fs.unlink(at(".local/web3-keys/ens-bootstrap.lock"));
    }
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href)
  main().catch((e) => {
    console.error(e.shortMessage || e.message);
    process.exitCode = 1;
  });
