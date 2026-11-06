// Invoked ONLY by the owner's explicit --apply runner. Never imported by browser code.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parseEnv } from "node:util";
import { createWalletClient, ENTITY_EVENTS_ABI } from "@arkiv-network/sdk";
import { privateKeyToAccount } from "viem/accounts";
import { custom, decodeEventLog, keccak256, formatEther } from "viem";
import {
  NETWORK,
  chain,
  same,
  serial,
  publicClient,
  publicRpc,
  captureBatch,
  selectGas,
  dataHash,
} from "./protocol.mjs";
import { guardSend } from "./send-guard.mjs";
import { FINAL_BUDGET, SECOND_TOPUP, budgetCost } from "./final-protocol.mjs";
import { observeBalanceAfter } from "./balance-observation.mjs";
export const root = new URL("../../../", import.meta.url),
  at = (p) => new URL(p, root);
export async function atomic(path, value) {
  const temp = new URL(path.href + ".tmp");
  const f = await fs.open(temp, "w", 0o600);
  try {
    await f.writeFile(serial(value));
    await f.sync();
  } finally {
    await f.close();
  }
  await fs.rename(temp, path);
}
export async function openOperator() {
  const reader = publicClient(),
    rpc = publicRpc();
  assert.equal(await reader.getChainId(), NETWORK.id);
  const lockPath = at(".local/web3-keys/rabdi-k0.lock");
  const lock = await fs.open(lockPath, "wx", 0o600);
  await lock.writeFile(String(process.pid));
  await lock.sync();
  const close = async () => {
    await lock.close();
    await fs.unlink(lockPath);
  };
  try {
    const accounts = {};
    for (const [address, file, name] of [
      [NETWORK.owner, ".env.worker", "ARKIV_CONSOLE_KEY"],
      [
        NETWORK.recipient,
        ".local/web3-keys/spares.env",
        "ARKIV_CONSOLE_SECOND_KEY",
      ],
    ]) {
      assert.equal((await fs.stat(at(file))).mode & 0o777, 0o600);
      const account = privateKeyToAccount(
        parseEnv(await fs.readFile(at(file), "utf8"))[name],
      );
      assert(same(account.address, address), "Unexpected role key");
      accounts[address] = account;
    }
    const path = at(".local/web3-keys/rabdi-g0-final-journal.json");
    let journal;
    try {
      journal = JSON.parse(await fs.readFile(path, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    journal ??= {
      version: 1,
      chainId: NETWORK.id,
      run: "g0_" + Date.now(),
      budget: String(FINAL_BUDGET),
      entries: [],
      checks: {},
    };
    assert.equal(journal.version, 1);
    assert.equal(journal.chainId, NETWORK.id);
    assert.equal(journal.budget, String(FINAL_BUDGET));
    const save = async () => {
      await atomic(path, journal);
      await atomic(at("docs/web3/spikes/rabdi-final-live.json"), {
        ...journal,
        scope: "OWNER-EXECUTED SYNTHETIC TESTS",
        at: new Date().toISOString(),
        gasTGLM: formatEther(
          journal.entries.reduce((n, e) => n + BigInt(e.gasCost ?? 0), 0n),
        ),
      });
    };
    async function confirm(e) {
      assert(e.hash, "Incomplete admission requires manual reconciliation");
      const receipt = await reader.waitForTransactionReceipt({
        hash: e.hash,
        timeout: 90000,
        retryCount: 0,
        pollingInterval: 1500,
      });
      assert.equal(
        receipt.status,
        e.expectedStatus,
        "Unexpected receipt; never resend",
      );
      const [tx, block] = await Promise.all([
        reader.getTransaction({ hash: e.hash }),
        reader.getBlock({ blockNumber: receipt.blockNumber }),
      ]);
      assert.equal(block.hash, receipt.blockHash);
      assert(same(tx.from, e.from));
      assert(same(tx.to, e.to));
      assert.equal(tx.chainId, NETWORK.id);
      assert.equal(tx.nonce, e.nonce);
      assert.equal(tx.value, BigInt(e.value));
      assert.equal(keccak256(tx.input), e.dataHash);
      const created = receipt.logs
        .filter((l) => same(l.address, e.to))
        .flatMap((l) => {
          try {
            const event = decodeEventLog({
              abi: ENTITY_EVENTS_ABI,
              data: l.data,
              topics: l.topics,
            });
            return event.eventName === "EntityCreated"
              ? [event.args.entityKey]
              : [];
          } catch {
            return [];
          }
        });
      assert.equal(created.length, e.createCount);
      if (e.expectedStatus === "reverted")
        assert(
          receipt.gasUsed < BigInt(e.gas),
          "Atomicity test ran out of gas",
        );
      Object.assign(e, {
        status: receipt.status,
        created,
        blockNumber: String(receipt.blockNumber),
        blockHash: block.hash,
        timestamp: String(block.timestamp),
        gasUsed: String(receipt.gasUsed),
        gasCost: String(receipt.gasUsed * receipt.effectiveGasPrice),
      });
      await save();
      return e;
    }
    for (const entry of journal.entries) await confirm(entry);
    await save();
    async function send(
      id,
      batch,
      { from = NETWORK.owner, revertEstimate, native = false } = {},
    ) {
      const prior = journal.entries.find((e) => e.id === id);
      if (prior) {
        if (prior.balanceAfter === undefined) {
          await observeBalanceAfter(reader, prior);
          await save();
        }
        return prior;
      }
      assert(
        !revertEstimate || id === "atomic failed last operation",
        "Only the named atomicity case may revert",
      );
      assert(
        !native ||
          (id === "fund second synthetic writer" && from === NETWORK.owner),
        "Only the declared test-key top-up is allowed",
      );
      const tx = native
        ? {
            from: NETWORK.owner,
            to: NETWORK.recipient,
            data: "0x",
            value: "0x" + SECOND_TOPUP.toString(16),
          }
        : await captureBatch(rpc, batch, from);
      const estimate =
        revertEstimate ??
        BigInt(
          await rpc.request({
            method: "eth_estimateGas",
            params: [tx, "latest"],
          }),
        );
      const block = await reader.getBlock({ blockTag: "latest" }),
        gasPrice = await reader.getGasPrice();
      const operations = native
        ? 1
        : Object.values(batch).reduce((n, v) => n + v.length, 0);
      const gas = selectGas({
          estimate,
          operations,
          blockGasLimit: block.gasLimit,
        }),
        value = BigInt(tx.value ?? 0);
      const spent = journal.entries.reduce(
        (n, e) =>
          n +
          BigInt(e.gasCost ?? e.maxCost) +
          (e.status ? BigInt(e.value) : 0n),
        0n,
      );
      const maxCost = budgetCost({
        spent,
        gas,
        gasPrice,
        value,
        balance: await reader.getBalance({ address: from }),
      });
      const nonce = await reader.getTransactionCount({
        address: from,
        blockTag: "latest",
      });
      assert.equal(
        await reader.getTransactionCount({
          address: from,
          blockTag: "pending",
        }),
        nonce,
        "Pending nonce; reconcile first",
      );
      const entry = {
        id,
        from,
        to: tx.to,
        value: String(value),
        dataHash: dataHash(tx),
        nonce,
        gas: String(gas),
        gasPrice: String(gasPrice),
        estimate: String(estimate),
        maxCost: String(maxCost),
        expectedStatus: revertEstimate ? "reverted" : "success",
        createCount: revertEstimate ? 0 : (batch.creates?.length ?? 0),
        balanceBefore: String(await reader.getBalance({ address: from })),
      };
      const guard = guardSend({
        account: accounts[from],
        entry,
        rpc,
        persist: async (e) => {
          journal.entries.push(e);
          await save();
        },
      });
      const wallet = createWalletClient({
        chain,
        account: guard.account,
        cacheTime: 0,
        transport: custom({ request: guard.request }, { retryCount: 0 }),
      });
      const hash = await wallet.sendTransaction({
        to: tx.to,
        data: tx.data,
        value,
        gas,
        gasPrice,
        nonce,
      });
      assert.equal(hash, entry.hash);
      await confirm(entry);
      await observeBalanceAfter(reader, entry);
      await save();
      console.log(`${id}: ${entry.status} ${entry.hash}`);
      return entry;
    }
    async function section(id, fn) {
      if (journal.checks[id]) return journal.checks[id];
      const result = await fn();
      journal.checks[id] = result;
      await save();
      console.log(`${id}: recorded`);
      return result;
    }
    return { reader, rpc, journal, save, send, section, close };
  } catch (e) {
    await close();
    throw e;
  }
}
