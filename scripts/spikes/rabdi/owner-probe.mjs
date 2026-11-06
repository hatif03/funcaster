// OWNER-EXECUTED ONLY with --apply. Default mode performs public reads and unsigned estimation.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parseEnv } from "node:util";
import {
  createWalletClient,
  ENTITY_EVENTS_ABI,
  ExpirationTime,
} from "@arkiv-network/sdk";
import { u64 } from "@arkiv-network/sdk/schema";
import { eq, asc } from "@arkiv-network/sdk/query";
import {
  custom,
  keccak256,
  decodeEventLog,
  formatEther,
  parseAbi,
  decodeErrorResult,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  NETWORK,
  chain,
  Probe,
  publicClient,
  publicRpc,
  createFixture,
  serial,
  same,
  estimateBatch,
  captureBatch,
  selectGas,
  admitCost,
  dataHash,
  mode,
} from "./protocol.mjs";
import { guardSend } from "./send-guard.mjs";
const root = new URL("../../../", import.meta.url),
  at = (p) => new URL(p, root);
const BUDGET = 500000000000000000n; // at most 0.5 test GLM total, retained between restarts
const journalPath = at(".local/web3-keys/rabdi-k0-journal.json");
async function save(path, value) {
  const temp = new URL(path.href + ".tmp");
  const h = await fs.open(temp, "w", 0o600);
  try {
    await h.writeFile(serial(value));
    await h.sync();
  } finally {
    await h.close();
  }
  await fs.rename(temp, path);
}
const reader = publicClient(),
  rpc = publicRpc();
let current = "preflight",
  lock;
async function main() {
  const selected = mode(process.argv.slice(2));
  assert.equal(await reader.getChainId(), NETWORK.id);
  const block = await reader.getBlock({ blockTag: "latest" }),
    balance = await reader.getBalance({ address: NETWORK.owner });
  const preflightBatch = {
    creates: [createFixture("preflight", 0, { readonly: true })],
  };
  const preflight = await estimateBatch(rpc, preflightBatch);
  const gasPrice = await reader.getGasPrice(),
    gas = selectGas({
      estimate: preflight.estimate,
      operations: 1,
      blockGasLimit: block.gasLimit,
    });
  const maxCost = admitCost({
    gas,
    gasPrice,
    spent: 0n,
    budget: BUDGET,
    balance,
  });
  const report = {
    at: new Date().toISOString(),
    scope:
      selected === "check"
        ? "PUBLIC READS + UNSIGNED ESTIMATE"
        : "OWNER EXECUTED LIVE RABDI K0 PHASE 1",
    sdk: "1.0.1",
    chainId: NETWORK.id,
    owner: NETWORK.owner,
    balanceWei: String(balance),
    balanceTGLM: formatEther(balance),
    budgetTGLM: "0.5",
    singleCreate: {
      estimate: preflight.estimate,
      gas,
      gasPrice,
      maxCostWei: maxCost,
    },
    checks: [],
    operations: [],
  };
  if (selected === "check") {
    await fs.writeFile(
      at("docs/web3/spikes/rabdi-owner-plan.json"),
      serial(report),
    );
    console.log(serial(report));
    return;
  }
  lock = await fs.open(at(".local/web3-keys/rabdi-k0.lock"), "wx", 0o600);
  await lock.writeFile(String(process.pid));
  await lock.sync();
  assert.equal((await fs.stat(at(".env.worker"))).mode & 0o777, 0o600);
  const account = privateKeyToAccount(
    parseEnv(await fs.readFile(at(".env.worker"), "utf8")).ARKIV_CONSOLE_KEY,
  );
  assert(same(account.address, NETWORK.owner), "Unexpected role key");
  let journal = {
    version: 1,
    chainId: NETWORK.id,
    owner: NETWORK.owner,
    run: "k0_" + Date.now(),
    budget: String(BUDGET),
    entries: [],
  };
  try {
    journal = JSON.parse(await fs.readFile(journalPath, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  assert.equal(journal.version, 1);
  assert.equal(journal.chainId, NETWORK.id);
  assert(same(journal.owner, NETWORK.owner));
  assert.equal(journal.budget, String(BUDGET));
  async function confirm(entry) {
    const receipt = await reader.waitForTransactionReceipt({
      hash: entry.hash,
      timeout: 90000,
      retryCount: 0,
      pollingInterval: 1500,
    });
    assert.equal(
      receipt.status,
      "success",
      "Reverted or uncertain send: stop; never automatically resend",
    );
    const tx = await reader.getTransaction({ hash: entry.hash }),
      block = await reader.getBlock({ blockNumber: receipt.blockNumber });
    assert.equal(block.hash, receipt.blockHash);
    assert(same(tx.from, NETWORK.owner));
    assert(same(tx.to, entry.to));
    assert.equal(tx.value, 0n);
    assert.equal(keccak256(tx.input), entry.dataHash);
    const created = receipt.logs
      .filter((l) => same(l.address, entry.to))
      .flatMap((l) => {
        try {
          const e = decodeEventLog({
            abi: ENTITY_EVENTS_ABI,
            data: l.data,
            topics: l.topics,
          });
          return e.eventName === "EntityCreated" ? [e.args.entityKey] : [];
        } catch {
          return [];
        }
      });
    assert.equal(
      created.length,
      entry.createCount,
      "Confirmed transaction event mismatch; reconcile, do not resend",
    );
    entry.result = { txHash: entry.hash, createdEntities: created };
    entry.status = "success";
    entry.blockNumber = String(receipt.blockNumber);
    entry.gasUsed = String(receipt.gasUsed);
    entry.gasCost = String(receipt.gasUsed * receipt.effectiveGasPrice);
    await save(journalPath, journal);
    return entry.result;
  }
  // Reconcile every admitted hash before preparing a new operation. No blind retries.
  for (const entry of journal.entries) await confirm(entry);
  if (journal.complete) {
    console.log(
      "Phase 1 was already completed. Existing transactions verified; no new sends.",
    );
    return;
  }
  await save(journalPath, journal);
  async function send(id, batch) {
    current = id;
    const prior = journal.entries.find((e) => e.id === id);
    if (prior) return prior.result;
    const { tx, estimate } = await estimateBatch(rpc, batch);
    const block = await reader.getBlock({ blockTag: "latest" }),
      gasPrice = await reader.getGasPrice();
    const operations = Object.values(batch).reduce((n, v) => n + v.length, 0);
    const gas = selectGas({
      estimate,
      operations,
      blockGasLimit: block.gasLimit,
    });
    const spent = journal.entries.reduce(
      (n, e) => n + BigInt(e.gasCost ?? e.maxCost),
      0n,
    );
    const maxCost = admitCost({
      gas,
      gasPrice,
      spent,
      budget: BUDGET,
      balance: await reader.getBalance({ address: NETWORK.owner }),
    });
    const nonce = await reader.getTransactionCount({
      address: NETWORK.owner,
      blockTag: "latest",
    });
    assert.equal(
      await reader.getTransactionCount({
        address: NETWORK.owner,
        blockTag: "pending",
      }),
      nonce,
      "Pending nonce: reconcile first",
    );
    const entry = {
      id,
      to: tx.to,
      dataHash: dataHash(tx),
      createCount: batch.creates?.length ?? 0,
      estimate: String(estimate),
      gas: String(gas),
      gasPrice: String(gasPrice),
      maxCost: String(maxCost),
      nonce,
    };
    const guard = guardSend({
      account,
      entry,
      rpc,
      persist: async (e) => {
        journal.entries.push(e);
        await save(journalPath, journal);
      },
    });
    const wallet = createWalletClient({
      chain,
      account: guard.account,
      cacheTime: 0,
      transport: custom({ request: guard.request }, { retryCount: 0 }),
    });
    const result = await wallet.executeBatch(batch, { gas, gasPrice, nonce });
    assert.equal(result.txHash, entry.hash);
    const checked = await confirm(entry);
    assert.deepEqual(result.createdEntities, checked.createdEntities);
    console.log(`${id}: confirmed ${entry.hash}`);
    return checked;
  }
  async function expectRevert(id, batch, errorName) {
    current = id;
    const tx = await captureBatch(rpc, batch);
    const errors = parseAbi([
      "error ReadOnlyEntity(bytes32 entityKey)",
      "error NotOwner(bytes32 entityKey,address caller,address owner)",
    ]);
    let matched = false;
    try {
      await rpc.request({ method: "eth_call", params: [tx, "latest"] });
    } catch (error) {
      let cause = error;
      for (let i = 0; cause && i < 24; i++, cause = cause.cause) {
        for (const data of [cause.data, cause.data?.data])
          if (typeof data === "string" && data.startsWith("0x"))
            try {
              if (
                decodeErrorResult({ abi: errors, data }).errorName === errorName
              )
                matched = true;
            } catch {}
      }
    }
    assert(matched, "Expected a specific contract revert, not an RPC outage");
    report.checks.push({ id, status: "PASS-UNSIGNED", errorName });
  }
  const created = await send("typed fixtures", {
    creates: Array.from({ length: 9 }, (_, i) =>
      createFixture(journal.run, i, {
        readonly: i < 3,
        permissionlessExtension: i === 4,
      }),
    ),
  });
  report.run = journal.run;
  report.entities = created.createdEntities;
  for (const [i, entityKey] of created.createdEntities.entries()) {
    const row = await reader.getEntity(entityKey, Probe);
    assert(same(row.$creator, NETWORK.owner));
    assert.equal(row.ordinal.value, i);
    assert.equal(row.at.value, 1793912400000n + BigInt(i));
    assert.equal(row.amount.value, (1n << 80n) + BigInt(i));
    assert.equal(row.label.value, `synthetic_${i}`);
    assert.equal(row.active.value, true);
    assert.equal(row.swarm_ref.value, "0x" + "22".repeat(32));
    assert.equal(row.related.value, "0x" + "11".repeat(32));
    assert.deepEqual(
      JSON.parse(
        new TextDecoder().decode(
          Buffer.from(row.payload.value.slice(2), "hex"),
        ),
      ),
      { synthetic: true, ordinal: i },
    );
  }
  report.checks.push({
    id: "VK-01/create; VK-02/typed round trips",
    status: "PASS-LIVE",
    count: 9,
  });
  const page = await reader
    .select({ $key: true, ordinal: true })
    .from(Probe, { onMismatch: "throw" })
    .createdBy(NETWORK.owner)
    .where(eq("run", journal.run))
    .orderBy(asc("ordinal"))
    .withCount()
    .limit(100)
    .fetch();
  assert.equal(page.count, 9n);
  assert.deepEqual(
    page.entities.map((r) => r.ordinal.value),
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
  );
  report.checks.push({
    id: "VK-08/server ordering and filtered count subset",
    status: "PASS-LIVE",
    block: String(page.blockNumber),
    count: 9,
  });
  const immutable = created.createdEntities[0],
    profile = created.createdEntities[4],
    mutable = created.createdEntities[3];
  await expectRevert(
    "VK-04 readonly patch denied",
    {
      patches: [
        { schema: Probe, entityKey: immutable, set: { label: "forbidden" } },
      ],
    },
    "ReadOnlyEntity",
  );
  await send("mutable patch", {
    patches: [{ schema: Probe, entityKey: mutable, set: { label: "patched" } }],
  });
  assert.equal((await reader.getEntity(mutable, Probe)).label.value, "patched");
  const before = await reader.getEntity(immutable, Probe),
    deadline = before.$expiresAt + 300n;
  await send("readonly owner extends", {
    extensions: [
      { entityKey: immutable, expiration: ExpirationTime.atBlock(deadline) },
    ],
  });
  assert.equal((await reader.getEntity(immutable, Probe)).$expiresAt, deadline);
  await send("profile transfer", {
    ownershipChanges: [{ entityKey: profile, newOwner: NETWORK.recipient }],
  });
  const transferred = await reader.getEntity(profile, Probe);
  assert(same(transferred.$creator, NETWORK.owner));
  assert(same(transferred.$owner, NETWORK.recipient));
  const owned = await reader
    .select({ $key: true, $creator: true, $owner: true })
    .from(Probe)
    .createdBy(NETWORK.owner)
    .ownedBy(NETWORK.recipient)
    .where(eq("run", journal.run))
    .limit(10)
    .fetch();
  assert.deepEqual(
    owned.entities.map((r) => r.$key),
    [profile],
  );
  await expectRevert(
    "VK-05 former owner patch denied",
    {
      patches: [
        { schema: Probe, entityKey: profile, set: { label: "forbidden" } },
      ],
    },
    "NotOwner",
  );
  const extension = transferred.$expiresAt + 300n;
  await send("permissionless extension after transfer", {
    extensions: [
      { entityKey: profile, expiration: ExpirationTime.atBlock(extension) },
    ],
  });
  assert.equal((await reader.getEntity(profile, Probe)).$expiresAt, extension);
  await send("readonly owner deletes disposable fixture", {
    deletes: [{ entityKey: immutable }],
  });
  let missing = false;
  try {
    await reader.getEntity(immutable, Probe);
  } catch (e) {
    missing = e.name === "NoEntityFoundError";
  }
  assert(missing);
  report.checks.push({
    id: "VK-04/05 owner operations, creator immutability, ownership query, permissionless extension",
    status: "PASS-LIVE",
  });
  report.operations = journal.entries;
  report.remaining = [
    "typed eq/gt/lt matrix",
    "size and attribute boundary writes",
    "failed-last-operation atomicity receipt",
    "ten-case cost table",
    "2000-row paging and bounded rate measurements",
    "60-second expiry observations",
    "copied namespace/third-signer forgery",
    "Swarm retention and full cross-SDK/Hall build",
  ];
  report.totalGasTGLM = formatEther(
    journal.entries.reduce((n, e) => n + BigInt(e.gasCost), 0n),
  );
  await fs.writeFile(
    at("docs/web3/spikes/rabdi-owner-live.json"),
    serial(report),
  );
  journal.complete = true;
  await save(journalPath, journal);
  console.log(
    `K0 phase 1 complete. Gas ${report.totalGasTGLM} test GLM. Full G0 remains OPEN; see the report's remaining list.`,
  );
}
try {
  await main();
} catch (e) {
  console.error(
    `K0 stopped at ${current}. ${/^[A-Za-z]+Error$/.test(e.name) ? e.name : "Error"}. Inspect the local journal and reconcile any recorded hash before retrying. No automatic resend.`,
  );
  process.exitCode = 1;
} finally {
  if (lock) {
    await lock.close();
    await fs.unlink(at(".local/web3-keys/rabdi-k0.lock"));
  }
}
