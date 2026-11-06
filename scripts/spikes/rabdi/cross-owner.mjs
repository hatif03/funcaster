// Owner-operated VX-08: one ENS v2 record and one Arkiv fixture, same viem process.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parseEnv } from "node:util";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { addEnsContracts } from "@ensdomains/ensjs";
import { setRecordsWriteParameters } from "@ensdomains/ensjs/wallet/v2";
import { NETWORK, Probe, createFixture, same, serial } from "./protocol.mjs";
import { ensReadTransport } from "./ens-read-transport.mjs";
const root = new URL("../../../", import.meta.url),
  at = (p) => new URL(p, root);
const registrar = "0x04b0970f4a58caa9E58C5aDBBF7eB402339264a5";
const resolver = "0x8FB3Bc94532Ff13C75d84201D72E7A0A77Bf9439";
const name = "play.funcaster.eth",
  chain = addEnsContracts(sepolia),
  url = "https://11155111.rpc.thirdweb.com";
const args = process.argv.slice(2),
  apply = args[0] === "--apply";
if (apply) assert.deepEqual(args, ["--apply", "--confirm-name", name]);
else assert(args.length === 0 || (args.length === 1 && args[0] === "--check"));
const reader = createPublicClient({
  chain,
  cacheTime: 0,
  transport: ensReadTransport(),
});
const sender = createPublicClient({
  chain,
  transport: http(url, { retryCount: 0, timeout: 30000 }),
});
let lock, operator;
async function main() {
  assert.equal(await reader.getChainId(), 11155111);
  const params = await setRecordsWriteParameters(
    { chain, account: { address: registrar } },
    {
      name,
      resolverAddress: resolver,
      coins: [{ coin: 60, value: NETWORK.owner }],
    },
  );
  const data = encodeFunctionData(params),
    existing = await reader.getEnsAddress({ name });
  assert(
    existing === null || same(existing, NETWORK.owner),
    "Existing address differs; refuse overwrite",
  );
  assert(same(await reader.getEnsResolver({ name }), resolver));
  const estimate = await reader.estimateGas({
    account: registrar,
    to: resolver,
    data,
  });
  const block = await reader.getBlock(),
    gas = (estimate * 12n) / 10n,
    priority = 1000000000n,
    maxFee = (block.baseFeePerGas ?? 0n) * 2n + priority;
  assert(gas * maxFee <= 5000000000000000n, "0.005 SepETH cap");
  const report = {
    at: new Date().toISOString(),
    scope: apply
      ? "OWNER EXECUTED LIVE TESTNET"
      : "PUBLIC READS + UNSIGNED ESTIMATE",
    name,
    resolver,
    registrar,
    console: NETWORK.owner,
    existing,
    estimate: String(estimate),
    maxGasWei: String(gas * maxFee),
    operations: [],
    dataHash: keccak256(data),
  };
  if (!apply) {
    await fs.writeFile(
      at("docs/web3/spikes/cross-owner-plan.json"),
      serial(report),
    );
    console.log(serial(report));
    return;
  }
  assert(
    JSON.parse(
      await fs.readFile(at("docs/web3/spikes/rabdi-final-live.json"), "utf8"),
    ).complete,
    "Finish the Rabdi probe before applying this record",
  );
  lock = await fs.open(at(".local/web3-keys/ens-bootstrap.lock"), "wx", 0o600);
  await lock.writeFile(String(process.pid));
  await lock.sync();
  const { atomic, openOperator } = await import("./final-operator.mjs");
  const journalPath = at(".local/web3-keys/ens-g0-record-journal.json");
  let journal = { chainId: 11155111, name, hash: null };
  try {
    journal = JSON.parse(await fs.readFile(journalPath, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  assert.equal(journal.chainId, 11155111);
  assert.equal(journal.name, name);
  if (!journal.hash && existing === null) {
    assert.equal((await fs.stat(at(".env.worker"))).mode & 0o777, 0o600);
    const account = privateKeyToAccount(
      parseEnv(await fs.readFile(at(".env.worker"), "utf8")).ENS_REGISTRAR_KEY,
    );
    assert(same(account.address, registrar));
    const nonce = await reader.getTransactionCount({
      address: registrar,
      blockTag: "latest",
    });
    assert.equal(
      await reader.getTransactionCount({
        address: registrar,
        blockTag: "pending",
      }),
      nonce,
      "Pending nonce; reconcile first",
    );
    assert(
      (await reader.getBalance({ address: registrar })) >
        gas * maxFee + 5000000000000000n,
    );
    const wallet = createWalletClient({
      chain,
      account,
      transport: http(url, { retryCount: 0 }),
    });
    const signed = await wallet.signTransaction({
      chainId: 11155111,
      nonce,
      to: resolver,
      data,
      value: 0n,
      gas,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: priority,
      type: "eip1559",
    });
    Object.assign(journal, {
      hash: keccak256(signed),
      dataHash: keccak256(data),
      nonce,
      gas: String(gas),
      maxFee: String(maxFee),
    });
    await atomic(journalPath, journal);
    assert.equal(
      await sender.sendRawTransaction({ serializedTransaction: signed }),
      journal.hash,
    );
  }
  if (journal.hash) {
    const receipt = await reader.waitForTransactionReceipt({
      hash: journal.hash,
      timeout: 90000,
      retryCount: 0,
    });
    assert.equal(
      receipt.status,
      "success",
      "Uncertain/reverted receipt; never resend",
    );
    const tx = await reader.getTransaction({ hash: journal.hash }),
      block = await reader.getBlock({ blockNumber: receipt.blockNumber });
    assert.equal(receipt.blockHash, block.hash);
    assert(same(tx.from, registrar));
    assert(same(tx.to, resolver));
    assert.equal(tx.value, 0n);
    assert.equal(keccak256(tx.input), keccak256(data));
    journal.gasCost = String(receipt.gasUsed * receipt.effectiveGasPrice);
    journal.blockNumber = String(receipt.blockNumber);
    await atomic(journalPath, journal);
    report.operations.push(journal);
  }
  const resolved = await reader.getEnsAddress({ name });
  assert(same(resolved, NETWORK.owner));
  // This exact process now loads the pinned Arkiv SDK and writes with the existing console key.
  operator = await openOperator();
  assert(operator.journal.complete, "Finish the Rabdi final probe first");
  const fixture = createFixture(operator.journal.run, 905);
  const cross = await operator.section(
    "SDK compatibility resolution",
    async () => {
      const e = await operator.send("SDK compatibility resolution", {
        creates: [fixture],
      });
      const row = await operator.reader.getEntity(e.created[0], Probe);
      assert(same(row.who.value, resolved));
      return { hash: e.hash, key: row.$key, who: row.who.value };
    },
  );
  const arc = createPublicClient({
    transport: http("https://rpc.testnet.arc.io", {
      retryCount: 0,
      timeout: 15000,
    }),
  });
  assert.equal(await arc.getChainId(), 5042002);
  report.resolved = resolved;
  report.arkiv = cross;
  report.arcChainId = 5042002;
  report.versions = { viem: "2.57.14", ensjs: "5.2.7", arkiv: "1.0.1" };
  await fs.writeFile(
    at("docs/web3/spikes/cross-owner-live.json"),
    serial(report),
  );
  console.log(serial(report));
}
try {
  await main();
} catch (e) {
  console.error(
    `Cross-SDK probe stopped: ${e.name}. Reconcile saved hashes before any retry.`,
  );
  process.exitCode = 1;
} finally {
  if (operator) await operator.close();
  if (lock) {
    await lock.close();
    await fs.unlink(at(".local/web3-keys/ens-bootstrap.lock"));
  }
}
