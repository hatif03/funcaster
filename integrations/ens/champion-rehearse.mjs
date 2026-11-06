// Disposable local fork only. No env files, private keys or public writes.
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  toHex,
  encodeFunctionData,
} from "viem";
import { loadProtocol } from "./runtime.mjs";
import { createHierarchyReader } from "./hierarchy.mjs";
import {
  createChampionReader,
  createChampionAdapter,
  CHAMPION_YEAR,
} from "./champion.mjs";
import { labelId } from "./names.mjs";
import { request } from "./lifecycle-calls.mjs";
import { assertLocalFork } from "../../scripts/spikes/local-fork-guard.mjs";
import { ensReadTransport } from "../../scripts/spikes/rabdi/ens-read-transport.mjs";
import { hash } from "../../server/records.cjs";

const root = path.resolve(import.meta.dirname, "../.."),
  protocol = await loadProtocol();
const input = JSON.parse(
  await readFile(
    path.join(root, "docs/web3/spikes/ens-registration-input.json"),
    "utf8",
  ),
);
const source = createPublicClient({
  chain: protocol.chain,
  transport: ensReadTransport(),
  cacheTime: 0,
});
assert.equal(await source.getChainId(), 11155111);
const sourceHead = await source.getBlock();
const sourceBlock = await source.getBlock({
  blockNumber: sourceHead.number - 3n,
});
const listener = createServer();
await new Promise((r) => listener.listen(0, "127.0.0.1", r));
const port = listener.address().port;
await new Promise((r) => listener.close(r));
const dir = await mkdtemp(path.join(os.tmpdir(), "chonks-champion-fork-"));
const binary = path.join(
  root,
  `.tools/g0/node_modules/@foundry-rs/anvil-${process.platform}-${process.arch === "x64" ? "amd64" : process.arch}/bin/anvil`,
);
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
    "https://ethereum-sepolia-rpc.publicnode.com",
    "--fork-block-number",
    String(sourceBlock.number),
    "--compute-units-per-second",
    "20",
    "--fork-retry-backoff",
    "500",
    "--silent",
  ],
  { stdio: "ignore" },
);
const url = `http://127.0.0.1:${port}`,
  chain = { ...protocol.chain, id: 31337 };
const client = createPublicClient({
  chain,
  transport: http(url, { retryCount: 0, timeout: 20000 }),
  cacheTime: 0,
});
const wallet = createWalletClient({
  chain,
  transport: http(url, { retryCount: 0, timeout: 20000 }),
});
let adapter,
  clock = sourceBlock.timestamp,
  failure;
child.on("error", (error) => {
  failure = error;
});
const local = async () =>
  assertLocalFork(
    url,
    await client.getChainId(),
    await client.request({ method: "web3_clientVersion" }),
  );
const localRequest = async (method, params) => {
  await local();
  return client.request({ method, params });
};
async function send(call) {
  await local();
  const tx = await wallet.writeContract({ ...call, chain });
  const receipt = await client.waitForTransactionReceipt({ hash: tx });
  assert.equal(receipt.status, "success");
  return { tx };
}
try {
  for (let i = 0; i < 80; i++) {
    if (failure) throw failure;
    try {
      if ((await client.getChainId()) === 31337) break;
    } catch {}
    await delay(250);
  }
  await local();
  const phone = "0x0000000000000000000000000000000000000333",
    recipient = "0x0000000000000000000000000000000000000444";
  for (const account of [input.owner, input.contracts.ETHRegistrar, phone]) {
    await localRequest("anvil_impersonateAccount", [account]);
    await localRequest("anvil_setBalance", [account, toHex(10n ** 21n)]);
  }
  // Local setup simulates a completed owner renewal. This is not evidence that
  // the owner has renewed the public parent or that renewal fees were paid.
  const renewAbi = parseAbi(["function renew(uint256 anyId,uint64 expiry)"]);
  await send({
    address: protocol.contracts.ethRegistry,
    abi: renewAbi,
    functionName: "renew",
    args: [labelId("chonks"), sourceBlock.timestamp + CHAMPION_YEAR * 2n],
    account: input.contracts.ETHRegistrar,
  });
  const nativeHierarchy = createHierarchyReader({
    client: {
      ...client,
      getChainId: async () => {
        await local();
        return 11155111;
      },
    },
    protocol,
    parent: "funcaster.eth",
    now: () => Number(clock) * 1000,
  });
  const hierarchy = {
    async walk(...args) {
      clock = (await client.getBlock()).timestamp;
      return nativeHierarchy.walk(...args);
    },
  };
  const config = {
    ENS_PARENT: "funcaster.eth",
    ENS_REGISTRAR_ADDRESS: input.owner,
  };
  const reader = await createChampionReader({
    client,
    protocol,
    config,
    hierarchy,
    now: () => Number(clock) * 1000,
  });
  const plan = await reader.prepareNamespace();
  for (const tx of plan.transactions) {
    await local();
    const sent = await wallet.sendTransaction({
      account: input.owner,
      chain,
      to: tx.to,
      data: tx.data,
      value: 0n,
    });
    assert.equal(
      (await client.waitForTransactionReceipt({ hash: sent })).status,
      "success",
    );
  }
  assert.equal((await reader.preflight()).ready, true);
  console.log(
    "PASS-LOCAL restricted players namespace and canonical hierarchy",
  );
  const unsigned = {
    status: "completed",
    verification: "verified",
    gameId: "chonks.star-catch",
    scores: [{ slot: 0, score: 42 }],
  };
  const result = { ...unsigned, hash: hash(unsigned) },
    sent = new Map();
  adapter = await createChampionAdapter({
    dir,
    client,
    protocol,
    config,
    hierarchy,
    now: () => Number(clock) * 1000,
    verifyEligibility: async () => ({ result, addresses: [phone] }),
    transact: async (id, call) => {
      const fingerprint = `${call.address}:${encodeFunctionData(call)}`;
      if (sent.has(id)) {
        assert.equal(sent.get(id).fingerprint, fingerprint);
        return sent.get(id).receipt;
      }
      const receipt = await send(call);
      sent.set(id, { fingerprint, receipt });
      return receipt;
    },
  });
  const claim = {
    id: "fork-champion",
    address: phone,
    handle: "fork-champion",
    resultHash: result.hash,
    recoveryAcknowledged: true,
  };
  const issued = await adapter.claim(claim);
  assert.equal(issued.status, "ready");
  assert.equal(sent.size, 4);
  await adapter.claim(claim);
  assert.equal(sent.size, 4);
  console.log(
    "PASS-LOCAL four-step Champion mint, proof records and repeat reconciliation",
  );
  await assert.rejects(
    client.simulateContract(
      request(
        "registry",
        issued.registry,
        "unregister",
        [labelId(claim.handle)],
        input.owner,
      ),
    ),
  );
  console.log("PASS-LOCAL registrar cannot unregister the Champion");
  await send({
    address: issued.registry,
    abi: renewAbi,
    functionName: "renew",
    args: [labelId(claim.handle), BigInt(issued.expiresAt) + 86400n],
    account: phone,
  });
  const owned = await adapter.lookup(claim.id);
  assert.equal(BigInt(owned.expiresAt), BigInt(issued.expiresAt) + 86400n);
  console.log("PASS-LOCAL phone owner renews the Champion");
  const state = await client.readContract(
    request("registry", issued.registry, "getState", [labelId(claim.handle)]),
  );
  await send(
    request(
      "registry",
      issued.registry,
      "safeTransferFrom",
      [phone, recipient, state.tokenId, 1n, "0x"],
      phone,
    ),
  );
  const moved = await client.readContract(
    request("registry", issued.registry, "getState", [labelId(claim.handle)]),
  );
  assert.equal(moved.latestOwner.toLowerCase(), recipient.toLowerCase());
  await assert.rejects(adapter.claim(claim), {
    code: "CHAMPION_OWNERSHIP_CHANGED",
  });
  console.log(
    "PASS-LOCAL phone transfer succeeds; adapter never remints a transferred name",
  );
  console.log(
    `LOCAL ONLY: source Sepolia block ${sourceBlock.number}; public parent/players setup remains pending.`,
  );
} finally {
  await adapter?.close();
  child.kill("SIGTERM");
  await rm(dir, { recursive: true, force: true });
}
