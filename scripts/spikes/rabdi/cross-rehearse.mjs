// Localhost-only ENS v2 rehearsal. No .env access and no private-key signing.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import httpServer from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  keccak256,
} from "viem";
import { sepolia } from "viem/chains";
import { addEnsContracts } from "@ensdomains/ensjs";
import { setRecordsWriteParameters } from "@ensdomains/ensjs/wallet/v2";
import { assertLocalFork } from "../local-fork-guard.mjs";
import { NETWORK, same, serial } from "./protocol.mjs";
import { ensReadTransport } from "./ens-read-transport.mjs";
const root = new URL("../../../", import.meta.url),
  at = (p) => new URL(p, root);
const upstreamURL = "https://ethereum-sepolia-rpc.publicnode.com",
  liveChain = addEnsContracts(sepolia);
const upstream = createPublicClient({
  chain: liveChain,
  transport: ensReadTransport(),
  cacheTime: 0,
});
assert.equal(await upstream.getChainId(), 11155111);
const name = "play.funcaster.eth",
  resolver = "0x8FB3Bc94532Ff13C75d84201D72E7A0A77Bf9439",
  registrar = "0x04b0970f4a58caa9E58C5aDBBF7eB402339264a5";
const before = await upstream.getEnsAddress({ name }),
  block = await upstream.getBlockNumber();
const listener = net.createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const port = listener.address().port;
await new Promise((r) => listener.close(r));
// Anvil forks through a localhost read-only bridge: serial reads, provider failover,
// and a transport that rejects every write method before any upstream request.
const proxyRpc = ensReadTransport()({ chain: liveChain });
let queue = Promise.resolve();
const bridge = httpServer.createServer((req, res) => {
  const task = async () => {
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        assert(length <= 1000000);
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      assert(!Array.isArray(body));
      const result = await proxyRpc.request({
        method: body.method,
        params: body.params,
      });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
    } catch {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32000, message: "Read-only upstream unavailable" },
        }),
      );
    }
  };
  queue = queue.then(task, task);
});
await new Promise((r) => bridge.listen(0, "127.0.0.1", r));
const forkSource = `http://127.0.0.1:${bridge.address().port}`;
const url = `http://127.0.0.1:${port}`,
  arch = process.arch === "x64" ? "amd64" : process.arch;
const child = spawn(
  at(
    `.tools/g0/node_modules/@foundry-rs/anvil-${process.platform}-${arch}/bin/anvil`,
  ).pathname,
  [
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--chain-id",
    "31337",
    "--fork-url",
    forkSource,
    "--fork-block-number",
    String(block),
    "--compute-units-per-second",
    "20",
    "--fork-retry-backoff",
    "500",
    "--silent",
  ],
  { stdio: "ignore" },
);
let spawnError;
child.on("error", (e) => (spawnError = e));
try {
  const chain = { ...liveChain, id: 31337 };
  const reader = createPublicClient({
    chain,
    cacheTime: 0,
    transport: http(url, { retryCount: 0, timeout: 20000 }),
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (spawnError) throw spawnError;
    try {
      if ((await reader.getChainId()) === 31337) {
        ready = true;
        break;
      }
    } catch {}
    await delay(500);
  }
  assert(ready, "Local fork did not start");
  assertLocalFork(
    url,
    await reader.getChainId(),
    await reader.request({ method: "web3_clientVersion" }),
  );
  await reader.request({
    method: "anvil_impersonateAccount",
    params: [registrar],
  });
  await reader.request({
    method: "anvil_setBalance",
    params: [registrar, "0x56bc75e2d63100000"],
  });
  const wallet = createWalletClient({
    chain,
    account: registrar,
    transport: http(url, { retryCount: 0 }),
  });
  const params = await setRecordsWriteParameters(wallet, {
    name,
    resolverAddress: resolver,
    coins: [{ coin: 60, value: NETWORK.owner }],
  });
  const data = encodeFunctionData(params),
    estimate = await reader.estimateGas({
      account: registrar,
      to: resolver,
      data,
    });
  assertLocalFork(
    url,
    await reader.getChainId(),
    await reader.request({ method: "web3_clientVersion" }),
  );
  const hash = await wallet.sendTransaction({
    to: resolver,
    data,
    value: 0n,
    gas: (estimate * 12n) / 10n,
  });
  const receipt = await reader.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  const resolved = await reader.getEnsAddress({ name });
  assert(same(resolved, NETWORK.owner));
  assert.equal(
    await upstream.getEnsAddress({ name }),
    before,
    "Public state changed during rehearsal",
  );
  const report = {
    at: new Date().toISOString(),
    scope: "LOCAL FORK ONLY; no role keys or upstream sends",
    forkBlock: String(block),
    name,
    resolver,
    before,
    resolved,
    dataHash: keccak256(data),
    gasUsed: String(receipt.gasUsed),
    status: "PASS-LOCAL",
  };
  await fs.writeFile(
    at("docs/web3/spikes/cross-rehearsal.json"),
    serial(report),
  );
  console.log(serial(report));
} finally {
  child.kill("SIGTERM");
  bridge.closeAllConnections();
  await new Promise((r) => bridge.close(r));
}
