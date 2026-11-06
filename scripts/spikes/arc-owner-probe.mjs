// A0 owner-operated USDC probe. Default: public reads. Never run --apply as the agent.
import assert from "node:assert/strict";
import { setDefaultResultOrder } from "node:dns";
setDefaultResultOrder("ipv4first");
import fs from "node:fs/promises";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodeFunctionData,
  keccak256,
  stringToHex,
  hashDomain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
const root = new URL("../../", import.meta.url),
  at = (p) => new URL(p, root);
const serial = (v) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? String(x) : x), 2) +
  "\n";
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
export function validateArcMode(args, asset = "USDC") {
  assert(["USDC", "EURC"].includes(asset));
  const mode = args[0] || "--check";
  assert(["--check", "--apply"].includes(mode));
  if (mode === "--apply")
    assert.deepEqual(
      args,
      ["--apply", "--confirm-network", `arc-testnet-${asset}`],
      "Owner confirmation required",
    );
  else assert(args.length <= 1);
  return mode;
}
export function topUpAmount(balance, value = 1000n, floor = 50000n) {
  assert(
    balance >= 0n && value === 1000n && floor === 50000n,
    "Unexpected probe amounts",
  );
  return balance >= value + floor ? 0n : value + floor - balance;
}
const abi = parseAbi([
  "function name() view returns(string)",
  "function version() view returns(string)",
  "function decimals() view returns(uint8)",
  "function DOMAIN_SEPARATOR() view returns(bytes32)",
  "function balanceOf(address) view returns(uint256)",
  "function paused() view returns(bool)",
  "function isBlacklisted(address) view returns(bool)",
  "function authorizationState(address,bytes32) view returns(bool)",
  "function transfer(address,uint256) returns(bool)",
  "function receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)",
]);
const fields = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
];
async function save(path, value) {
  const tmp = new URL(path.href + ".tmp");
  const h = await fs.open(tmp, "w", 0o600);
  try {
    await h.writeFile(serial(value));
    await h.sync();
  } finally {
    await h.close();
  }
  await fs.rename(tmp, path);
}
async function getReceipt(c, hash) {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await c.getTransactionReceipt({ hash });
      assert.equal(
        r.status,
        "success",
        "Receipt reverted; investigate before any new send",
      );
      return r;
    } catch (e) {
      if (e.name !== "TransactionReceiptNotFoundError") throw e;
      await delay(1000);
    }
  }
  throw Error(`Uncertain send; do not resend ${hash}`);
}
export async function runArcOwner(
  asset = "USDC",
  args = process.argv.slice(2),
) {
  const mode = validateArcMode(args, asset);
  const suffix = asset === "USDC" ? "" : "-eurc";
  const cfg = JSON.parse(
    await fs.readFile(at("docs/web3/spikes/arc-readonly-input.json"), "utf8"),
  );
  assert.equal(cfg.chainId, 5042002);
  const { roles } = JSON.parse(
    await fs.readFile(at(".local/web3-keys/addresses.json"), "utf8"),
  );
  const donor = roles.find((r) => r.role === "ARC_RELAYER_KEY").address,
    sender = roles.find(
      (r) => r.role === (asset === "USDC" ? "DEVELOPER_KEY" : "EURC_PROBE_KEY"),
    ).address;
  assert(same(donor, cfg.relayer));
  assert(!same(donor, sender));
  const token = cfg.assets.find((a) => a.symbol === asset);
  assert.equal(token.decimals, 6);
  const chain = {
    id: cfg.chainId,
    name: "Arc Testnet",
    nativeCurrency: { name: "Test USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: cfg.rpcUrls } },
  };
  const c = createPublicClient({
    chain,
    transport: http(cfg.rpcUrls[0], { timeout: 15000, retryCount: 0 }),
    cacheTime: 0,
  });
  assert.equal(await c.getChainId(), 5042002);
  const read = (functionName, args = []) =>
    c.readContract({ address: token.address, abi, functionName, args });
  const domain = {
    name: await read("name"),
    version: await read("version"),
    chainId: 5042002,
    verifyingContract: token.address,
  };
  assert.equal(domain.name, token.name);
  assert.equal(domain.version, token.version);
  assert.equal(await read("decimals"), 6);
  assert.equal(await read("paused"), false);
  assert.equal(
    await read("DOMAIN_SEPARATOR"),
    hashDomain({
      domain,
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
      },
    }),
  );
  for (const address of [donor, sender])
    assert.equal(await read("isBlacklisted", [address]), false);
  const nonce = keccak256(
    stringToHex(`chonks:g0:${asset}:receive:v1:${sender.toLowerCase()}`),
  );
  const before = {
    donor: await read("balanceOf", [donor]),
    sender: await read("balanceOf", [sender]),
    authorizationUsed: await read("authorizationState", [sender, nonce]),
  };
  if (asset === "EURC")
    assert.equal(
      await c.getBalance({ address: sender }),
      0n,
      "EURC probe must start without native gas",
    );
  const report = {
    at: new Date().toISOString(),
    scope:
      mode === "--check" ? "PUBLIC READS ONLY" : "OWNER EXECUTED LIVE TESTNET",
    chainId: 5042002,
    donor,
    sender,
    asset: token.address,
    symbol: asset,
    value: "1000",
    retainedFloor: "50000",
    maxTotalCostNative: "200000000000000000",
    before,
    operations: [],
  };
  if (mode === "--check") {
    report.plannedTopUp = topUpAmount(before.sender);
    await fs.writeFile(
      at(`docs/web3/spikes/arc${suffix}-owner-plan.json`),
      serial(report),
    );
    console.log(serial(report));
    return;
  }
  let lock;
  const journalPath = at(`.local/web3-keys/arc-g0${suffix}-journal.json`);
  try {
    lock = await fs.open(at(".local/web3-keys/arc-g0.lock"), "wx", 0o600);
    await lock.writeFile(String(process.pid));
    await lock.sync();
    async function key(path, name, address) {
      assert.equal((await fs.stat(at(path))).mode & 0o777, 0o600);
      const env = parseEnv(await fs.readFile(at(path), "utf8"));
      const a = privateKeyToAccount(env[name]);
      assert(same(a.address, address), "Wrong role key");
      return a;
    }
    const relayer = await key(".env.worker", "ARC_RELAYER_KEY", donor),
      seat = await key(
        asset === "USDC"
          ? ".local/web3-keys/spares.env"
          : ".local/web3-keys/arc-eurc-probe.env",
        asset === "USDC" ? "DEVELOPER_KEY" : "EURC_PROBE_KEY",
        sender,
      );
    const wallet = createWalletClient({
      account: relayer,
      chain,
      transport: http(cfg.rpcUrls[0], { retryCount: 0 }),
    });
    let journal = { chainId: 5042002, donor, sender, nonce, operations: [] };
    try {
      journal = JSON.parse(await fs.readFile(journalPath, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    assert.equal(journal.chainId, 5042002);
    assert(same(journal.donor, donor) && same(journal.sender, sender));
    assert.equal(journal.nonce, nonce);
    for (const op of journal.operations)
      if (op.status !== "success") {
        const r = await getReceipt(c, op.hash);
        Object.assign(op, {
          status: "success",
          gasCost: String(r.gasUsed * r.effectiveGasPrice),
        });
        await save(journalPath, journal);
      }
    async function send(id, functionName, args, tokenSpend = 0n) {
      assert.equal(await c.getChainId(), 5042002);
      await c.simulateContract({
        address: token.address,
        abi,
        functionName,
        args,
        account: donor,
      });
      const data = encodeFunctionData({ abi, functionName, args }),
        gas =
          ((await c.estimateGas({ account: donor, to: token.address, data })) *
            12n) /
          10n;
      const block = await c.getBlock(),
        base = block.baseFeePerGas || 20_000_000_000n,
        maxFee = base * 2n < 20_000_000_000n ? 20_000_000_000n : base * 2n;
      const spent = journal.operations.reduce(
        (n, r) =>
          n +
          BigInt(r.gasCost || 0) +
          (asset === "USDC" ? BigInt(r.tokenSpend || 0) * 10n ** 12n : 0n),
        0n,
      );
      assert(
        spent +
          gas * maxFee +
          (asset === "USDC" ? tokenSpend * 10n ** 12n : 0n) <=
          200_000_000_000_000_000n,
        "0.2 test-USDC total cap exceeded",
      );
      assert(
        (await c.getBalance({ address: donor })) >
          gas * maxFee +
            (asset === "USDC" ? tokenSpend * 10n ** 12n : 0n) +
            50_000_000_000_000_000n,
        "Relayer reserve too low",
      );
      assert(
        journal.operations.reduce((n, r) => n + BigInt(r.tokenSpend || 0), 0n) +
          tokenSpend <=
          51000n,
        "Probe token top-up cap exceeded",
      );
      const nonce = await c.getTransactionCount({
        address: donor,
        blockTag: "latest",
      });
      assert.equal(
        await c.getTransactionCount({ address: donor, blockTag: "pending" }),
        nonce,
        "Pending nonce; reconcile first",
      );
      const req = await wallet.prepareTransactionRequest({
        nonce,
        to: token.address,
        data,
        value: 0n,
        gas,
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: 0n,
      });
      const signed = await wallet.signTransaction(req),
        hash = keccak256(signed);
      const op = {
        id,
        hash,
        status: "prepared",
        tokenSpend: String(tokenSpend),
        dataHash: keccak256(data),
      };
      journal.operations.push(op);
      await save(journalPath, journal);
      assert.equal(
        await c.sendRawTransaction({ serializedTransaction: signed }),
        hash,
      );
      const r = await getReceipt(c, hash);
      Object.assign(op, {
        status: "success",
        gasCost: String(r.gasUsed * r.effectiveGasPrice),
        blockNumber: String(r.blockNumber),
      });
      await save(journalPath, journal);
      console.log(`${id}: ${hash}`);
    }
    if (!(await read("authorizationState", [sender, nonce]))) {
      const topUp = topUpAmount(await read("balanceOf", [sender]));
      if (topUp)
        await send(
          "bankroll developer probe",
          "transfer",
          [sender, topUp],
          topUp,
        );
      const block = await c.getBlock();
      const message = {
        from: sender,
        to: donor,
        value: 1000n,
        validAfter: 0n,
        validBefore: block.timestamp + 1800n,
        nonce,
      };
      const signature = await seat.signTypedData({
        domain,
        types: { ReceiveWithAuthorization: fields },
        primaryType: "ReceiveWithAuthorization",
        message,
      });
      const args = [
        sender,
        donor,
        1000n,
        0n,
        message.validBefore,
        nonce,
        signature,
      ];
      await send(
        "receive sponsored authorization",
        "receiveWithAuthorization",
        args,
      );
      // Replays are tested with eth_call only; no intentional failed transaction is sent.
      await assert.rejects(
        () =>
          c.simulateContract({
            address: token.address,
            abi,
            functionName: "receiveWithAuthorization",
            args,
            account: donor,
          }),
        (e) =>
          Boolean(e.walk?.((x) => x.name === "ContractFunctionRevertedError")),
      );
      report.replaySimulation = "contract revert";
    } else
      report.replaySimulation =
        "prior authorization used; no new signature or send";
    assert.equal(await read("authorizationState", [sender, nonce]), true);
    assert(
      (await read("balanceOf", [sender])) >= 50000n,
      "Retained floor missing",
    );
    if (asset === "EURC")
      assert.equal(
        await c.getBalance({ address: sender }),
        0n,
        "EURC signer must remain without native gas",
      );
    report.operations = journal.operations;
    report.after = {
      donor: await read("balanceOf", [donor]),
      sender: await read("balanceOf", [sender]),
      authorizationUsed: true,
    };
    await fs.writeFile(
      at(`docs/web3/spikes/arc${suffix}-owner-live.json`),
      serial(report),
    );
    console.log(
      `${asset} owner probe complete; product-flow checks remain open`,
    );
  } finally {
    if (lock) {
      await lock.close();
      await fs.unlink(at(".local/web3-keys/arc-g0.lock"));
    }
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href)
  runArcOwner().catch((e) => {
    console.error(e.shortMessage || e.message);
    process.exitCode = 1;
  });
