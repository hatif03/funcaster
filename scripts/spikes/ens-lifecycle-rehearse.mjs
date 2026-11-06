// E3/E4 acceptance against deployed ENS contracts on a disposable localhost fork.
// No .env or role keys. Every mutation checks Anvil/127.0.0.1/31337 first.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import httpServer from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  createPublicClient,
  createWalletClient,
  http,
  toHex,
  zeroAddress,
} from "viem";
import { loadProtocol } from "../../integrations/ens/runtime.mjs";
import { createHierarchyReader } from "../../integrations/ens/hierarchy.mjs";
import { createEnsLifecycle } from "../../integrations/ens/lifecycle.mjs";
import { createEnsAuthority } from "../../integrations/ens/authority.mjs";
import { createEnsReads } from "../../integrations/ens/reads.mjs";
import { request, textCalls } from "../../integrations/ens/lifecycle-calls.mjs";
import { labelId } from "../../integrations/ens/names.mjs";
import { assertLocalFork } from "./local-fork-guard.mjs";
import { ensReadTransport } from "./rabdi/ens-read-transport.mjs";

const root = new URL("../../", import.meta.url),
  at = (p) => new URL(p, root);
const input = JSON.parse(
  await fs.readFile(at("docs/web3/spikes/ens-registration-input.json")),
);
const protocol = await loadProtocol(),
  owner = input.owner;
const publicReader = createPublicClient({
  chain: protocol.chain,
  transport: ensReadTransport(),
  cacheTime: 0,
});
assert.equal(await publicReader.getChainId(), 11155111);
const sourceBlock = await publicReader.getBlock();
const report = {
  at: new Date().toISOString(),
  scope: "LOCAL FORK ONLY — no public transactions",
  chainId: 31337,
  sourceChainId: 11155111,
  sourceBlock: String(sourceBlock.number),
  checks: [],
  operations: [],
};
const pass = (id, detail) => {
  report.checks.push({ id, result: "PASS-LOCAL", detail });
  console.log(`PASS-LOCAL ${id}`);
};
const tmp = await fs.mkdtemp(path.join(tmpdir(), "chonks-ens-g1-fork-"));
const upstream = ensReadTransport()({ chain: protocol.chain });
let queue = Promise.resolve();
const bridge = httpServer.createServer((req, res) => {
  const job = async () => {
    let id = null;
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
      id = body.id;
      const result = await upstream.request({
        method: body.method,
        params: body.params,
      });
      res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
    } catch {
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: "Read-only upstream unavailable" },
        }),
      );
    }
  };
  queue = queue.then(job, job);
});
await new Promise((resolve) => bridge.listen(0, "127.0.0.1", resolve));
const listener = net.createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
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
    `http://127.0.0.1:${bridge.address().port}`,
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
let adapter, childError;
child.on("error", (e) => {
  childError = e;
});
try {
  const chain = { ...protocol.chain, id: 31337 };
  const client = createPublicClient({
    chain,
    cacheTime: 0,
    transport: http(url, { retryCount: 0, timeout: 20000 }),
  });
  const wallet = createWalletClient({
    account: owner,
    chain,
    transport: http(url, { retryCount: 0, timeout: 20000 }),
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (childError) throw childError;
    try {
      if ((await client.getChainId()) === 31337) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  assert(ready, "Local Anvil startup failed");
  const local = async () =>
    assertLocalFork(
      url,
      await client.getChainId(),
      await client.request({ method: "web3_clientVersion" }),
    );
  await local();
  await client.request({ method: "anvil_impersonateAccount", params: [owner] });
  await local();
  await client.request({
    method: "anvil_setBalance",
    params: [owner, toHex(10n ** 21n)],
  });
  let clock = sourceBlock.timestamp;
  // Only this test adapter maps the execution fork back to its source-chain ID
  // for namespace discovery. The public reader has no local-chain bypass.
  const hierarchy = createHierarchyReader({
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
  const discoverPlay = async () => {
    clock = (await client.getBlock()).timestamp;
    return hierarchy.walk("play.funcaster.eth", {
      expectedOwner: owner,
      requireResolver: true,
    });
  };
  const receipts = new Map();
  const transact = async (id, call) => {
    await local();
    if (receipts.has(id)) {
      const r = await client.getTransactionReceipt({ hash: receipts.get(id) });
      assert.equal(r.status, "success");
      return { tx: r.transactionHash };
    }
    await client.simulateContract(call);
    const hash = await wallet.writeContract({
      ...call,
      chain,
      maxFeePerGas: 30000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    receipts.set(id, hash);
    let r;
    for (let i = 0; i < 40; i++) {
      try {
        r = await client.getTransactionReceipt({ hash });
        break;
      } catch (error) {
        if (error.name !== "TransactionReceiptNotFoundError") throw error;
      }
      await delay(250);
    }
    assert(r && r.status === "success");
    report.operations.push({
      id,
      functionName: call.functionName,
      localHash: hash,
      gasUsed: String(r.gasUsed),
    });
    console.log(`LOCAL ${call.functionName}`);
    return { tx: hash };
  };
  const config = {
    ENS_PARENT: "funcaster.eth",
    ENS_REGISTRAR_ADDRESS: owner,
    ENS_WARM_POOL: 2,
    ENS_PARTY_TTL_HOURS: 1,
    PUBLIC_ORIGIN: "https://g1-rehearsal.example",
  };
  const start = (dir) =>
    createEnsLifecycle({
      dir,
      client,
      protocol,
      config,
      transact,
      discoverPlay,
    });
  adapter = await start(tmp);
  await adapter.refill();
  assert.equal(report.operations.length, 4);
  pass("warm pool", "Two unique deployed registry/resolver pairs");
  const room = { partyId: "g1:room:1", code: "G1ROOM", game: "chonks.golf" };
  const before = report.operations.length,
    party = await adapter.open(room);
  assert.equal(report.operations.length - before, 3);
  report.warmOpenTransactions = 3;
  clock = (await client.getBlock()).timestamp;
  const proof = await hierarchy.walk(party.name, {
    expectedOwner: owner,
    requireResolver: true,
  });
  assert.equal(
    proof.leaf.subregistry.toLowerCase(),
    party.registry.toLowerCase(),
  );
  assert.equal(
    await client.getEnsText({ name: party.name, key: "chonks.code" }),
    room.code,
  );
  pass(
    "party open",
    "Three warm transactions; canonical namespace and Universal Resolver text readback",
  );
  const n = report.operations.length;
  await adapter.close();
  adapter = await start(tmp);
  assert.deepEqual(await adapter.open(room), party);
  assert.equal(report.operations.length, n);
  pass("restart", "Zero writes on reopened durable party");
  await adapter.refill();
  assert.equal(report.operations.length, n + 2);
  const second = await adapter.open({
    ...room,
    partyId: "g1:room:2",
    code: "G2ROOM",
  });
  assert.notEqual(second.resolver, party.resolver);
  pass(
    "pool reuse",
    "Next party consumes an unused pre-deployed pair; refill creates one replacement",
  );
  const seatAddress = "0x2000000000000000000000000000000000000002",
    player = {
      partyId: room.partyId,
      seatId: "binding:1",
      slot: 0,
      nickname: "asha",
      address: seatAddress,
      shape: "circle",
      color: "#ffcc00",
    };
  const seat = await adapter.mint(player);
  assert.equal(
    (await client.getEnsAddress({ name: seat.name })).toLowerCase(),
    seatAddress,
  );
  pass("seat mint", "Soulbound seat resolves to the bound phone address");
  const denied = async (id, call) => {
    await assert.rejects(
      client.simulateContract(call),
      (error) =>
        error.walk?.((e) => e.name === "ContractFunctionRevertedError")
          ?.name === "ContractFunctionRevertedError",
    );
    pass(id, "Contract revert; transport failures do not count as denial");
  };
  await denied(
    "seat cannot write",
    request(
      "resolver",
      party.resolver,
      "multicall",
      [textCalls(seat.name, { "chonks.seat": "forged" })],
      seatAddress,
    ),
  );
  const current = await client.readContract(
    request("registry", party.registry, "getState", [labelId("asha")]),
  );
  await denied(
    "seat cannot transfer",
    request(
      "registry",
      party.registry,
      "safeTransferFrom",
      [
        seatAddress,
        "0x3000000000000000000000000000000000000003",
        current.tokenId,
        1n,
        "0x",
      ],
      seatAddress,
    ),
  );
  const hostGrant = {
    partyId: room.partyId,
    grantId: "host:one",
    address: seatAddress,
  };
  await adapter.grant(hostGrant);
  const authority = createEnsAuthority({
    client,
    protocol,
    parent: "funcaster.eth",
    owner,
    hierarchy,
    now: () => Number(clock) * 1000,
  });
  clock = (await client.getBlock()).timestamp;
  const authorityInput = {
    name: party.name,
    seatName: seat.name,
    address: seatAddress,
    capability: "control",
  };
  assert.equal((await authority.check(authorityInput)).outcome, "allowed");
  assert.equal(
    (await authority.check({ ...authorityInput, capability: "kick" })).outcome,
    "allowed",
  );
  await client.simulateContract(
    request(
      "resolver",
      party.resolver,
      "multicall",
      [textCalls(party.name, { "chonks.control": "start" })],
      seatAddress,
    ),
  );
  await client.simulateContract(
    request(
      "registry",
      party.registry,
      "unregister",
      [labelId("asha")],
      seatAddress,
    ),
  );
  pass(
    "host can control and kick",
    "Scoped roles, canonical seat admission and genuine eth_call permissions pass",
  );
  await denied(
    "host cannot mint",
    request(
      "registry",
      party.registry,
      "register",
      [
        "forged",
        seatAddress,
        zeroAddress,
        party.resolver,
        0n,
        BigInt(party.expiresAt),
      ],
      seatAddress,
    ),
  );
  await denied(
    "host cannot grant itself roles",
    request(
      "registry",
      party.registry,
      "grantRootRoles",
      [protocol.registryRoles, seatAddress],
      seatAddress,
    ),
  );
  await denied(
    "host cannot write another record",
    request(
      "resolver",
      party.resolver,
      "multicall",
      [textCalls(party.name, { "chonks.receipt": "forged" })],
      seatAddress,
    ),
  );
  await denied(
    "host cannot control another party",
    request(
      "resolver",
      second.resolver,
      "multicall",
      [textCalls(second.name, { "chonks.control": "forged" })],
      seatAddress,
    ),
  );
  await denied(
    "host cannot transfer its seat",
    request(
      "registry",
      party.registry,
      "safeTransferFrom",
      [seatAddress, owner, current.tokenId, 1n, "0x"],
      seatAddress,
    ),
  );
  await adapter.records({
    partyId: room.partyId,
    changeId: "result:one",
    records: { "chonks.receipt": "a".repeat(64) },
    seats: [{ seatId: player.seatId, last: `match-1:${"a".repeat(64)}:1` }],
  });
  assert.equal(
    await client.getEnsText({ name: party.name, key: "chonks.receipt" }),
    "a".repeat(64),
  );
  pass(
    "record bundle",
    "Party result and seat last-match bundle is written through the deployed resolver",
  );
  clock = (await client.getBlock()).timestamp;
  const reads = createEnsReads({
    client,
    protocol: { ...protocol, chainId: 31337 },
    parent: "funcaster.eth",
    owner,
    hierarchy,
  });
  const joined = await reads.join(party.name);
  assert.equal(joined.code, room.code);
  assert.equal(
    (await reads.roster([seat.name])).seats[0].address.toLowerCase(),
    seatAddress.toLowerCase(),
  );
  const creation = report.operations.find(
    (op) =>
      op.functionName === "register" &&
      op.id.startsWith("party:") &&
      op.id.endsWith(":register"),
  );
  const historyInput = { name: party.name, registrationTx: creation.localHash };
  assert.equal(
    (await reads.history(historyInput)).rows[0].resultHash,
    "a".repeat(64),
  );
  pass(
    "canonical join, roster and history",
    "Join reads HTTPS origin/code; roster resolves the phone at one block; TextUpdated logs contain the result",
  );
  await adapter.revoke(hostGrant);
  clock = (await client.getBlock()).timestamp;
  authority.invalidate(party.name);
  assert.equal((await authority.check(authorityInput)).outcome, "denied");
  await denied(
    "revoked host cannot control",
    request(
      "resolver",
      party.resolver,
      "multicall",
      [textCalls(party.name, { "chonks.control": "start" })],
      seatAddress,
    ),
  );
  authority.close();
  await adapter.release(room.partyId, player.seatId);
  assert.equal(await client.getEnsAddress({ name: seat.name }), null);
  const released = report.operations.length;
  await adapter.release(room.partyId, player.seatId);
  assert.equal(report.operations.length, released);
  const replacement = await adapter.mint({ ...player, seatId: "binding:2" });
  assert.equal(replacement.name, seat.name);
  pass(
    "seat release",
    "Clear resolver bundle before unregister; new binding can reuse the label; repeat release sends nothing",
  );
  const kicked = await adapter.mint({
    ...player,
    seatId: "binding:kicked",
    slot: 1,
    nickname: "ravi",
    address: "0x3000000000000000000000000000000000000003",
  });
  await transact(
    "rehearsal:direct-kick",
    request("registry", party.registry, "unregister", [labelId("ravi")], owner),
  );
  assert.equal(
    (await client.getEnsAddress({ name: kicked.name })).toLowerCase(),
    kicked.address.toLowerCase(),
  );
  clock = (await client.getBlock()).timestamp;
  await assert.rejects(hierarchy.walk(kicked.name), (error) =>
    ["NOT_REGISTERED", "MISSING_REGISTRY"].includes(error.code),
  );
  await adapter.release(room.partyId, "binding:kicked");
  assert.equal(await client.getEnsAddress({ name: kicked.name }), null);
  pass(
    "wildcard cleanup after external revoke",
    "Unregister alone retains the old address; canonical admission rejects it; release clears it without a second unregister",
  );
  await adapter.end("g1:room:2");
  clock = (await client.getBlock()).timestamp;
  await assert.rejects(hierarchy.walk(second.name), (error) =>
    ["NOT_REGISTERED", "MISSING_REGISTRY"].includes(error.code),
  );
  pass(
    "party end",
    "Canonical registry walk refuses the ended party; raw wildcard resolution is not an admission proof",
  );
  await local();
  await client.request({ method: "evm_increaseTime", params: [3601] });
  await local();
  await client.request({ method: "evm_mine", params: [] });
  report.expiredRawAddress = await client.getEnsAddress({
    name: replacement.name,
  });
  clock = (await client.getBlock()).timestamp;
  await assert.rejects(hierarchy.walk(replacement.name), (error) =>
    ["NOT_REGISTERED", "EXPIRED", "MISSING_REGISTRY"].includes(error.code),
  );
  await assert.rejects(
    adapter.mint({ ...player, seatId: "binding:3", slot: 1 }),
    (error) => error.code === "PARTY_CHANGED",
  );
  pass(
    "expiry",
    "Chain-time expiry blocks canonical admission and new seats even if raw resolution returns an ancestor address",
  );
  await adapter.end(room.partyId);
  clock = (await client.getBlock()).timestamp;
  await assert.rejects(reads.join(party.name));
  assert.equal(
    (await reads.history(historyInput)).rows[0].resultHash,
    "a".repeat(64),
  );
  pass(
    "history survives table closure",
    "Ended names cannot admit joins, but the canonical creation receipt still locates immutable result logs",
  );
  report.ok = true;
  await fs.writeFile(
    at("docs/web3/spikes/g1-ens-lifecycle-rehearsal.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  await adapter?.close();
  child.kill("SIGTERM");
  if (child.exitCode === null) await once(child, "exit").catch(() => {});
  bridge.closeAllConnections();
  await new Promise((resolve) => bridge.close(resolve));
  await fs.rm(tmp, { recursive: true, force: true });
}
