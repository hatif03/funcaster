// A0 / VA-12 local-only experiments using Arc's official Anvil fork.
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
  parseAbi,
  toHex,
  encodeFunctionData,
  keccak256,
  stringToHex,
  hashDomain,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { assertLocalFork } from "./local-fork-guard.mjs";
const config = JSON.parse(
  await fs.readFile("docs/web3/spikes/arc-readonly-input.json"),
);
assert.equal(config.chainId, 5042002);
const source = createPublicClient({
  transport: http(config.rpcUrls[0], { timeout: 15000, retryCount: 0 }),
});
assert.equal(await source.getChainId(), config.chainId);
const block = await source.getBlockNumber();
const listener = net.createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const port = listener.address().port;
await new Promise((r) => listener.close(r));
const rpc = `http://127.0.0.1:${port}`;
const report = {
  at: new Date().toISOString(),
  scope: "LOCAL ARC FORK ONLY; no role keys or public-chain broadcasts",
  forkBlock: String(block),
  release: "circlefin/arc-foundry v0.8.0-2",
  checks: [],
  operations: [],
};
const child = spawn(
  ".tools/arc-foundry/anvil",
  [
    "--network",
    "arc",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--chain-id",
    "31337",
    "--fork-url",
    config.rpcUrls[0],
    "--fork-block-number",
    String(block),
    "--silent",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let stderr = "";
child.stderr.on("data", (b) => {
  stderr = (stderr + b).slice(-3000);
});
const chain = {
  id: 31337,
  name: "Disposable Arc fork",
  nativeCurrency: { name: "Test USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
};
const reader = createPublicClient({
  chain,
  transport: http(rpc, { timeout: 20000, retryCount: 0 }),
  cacheTime: 0,
});
const abi = parseAbi([
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)",
  "function transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)",
  "function authorizationState(address,bytes32) view returns (bool)",
  "function masterMinter() view returns (address)",
  "function configureMinter(address,uint256) returns (bool)",
  "function mint(address,uint256) returns (bool)",
]);
const domainTypes = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
};
const fields = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
];
function record(id, detail) {
  report.checks.push({ id, status: "PASS-LOCAL", detail });
  console.log(`PASS-LOCAL ${id}`);
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(stderr || "Arc Anvil exited");
    try {
      await reader.getChainId();
      ready = true;
      break;
    } catch {
      await delay(250);
    }
  }
  assert(ready, "Arc Anvil startup timed out");
  assertLocalFork(
    rpc,
    await reader.getChainId(),
    await reader.request({ method: "web3_clientVersion" }),
  );
  const sponsor = config.relayer;
  async function impersonate(address) {
    await reader.request({
      method: "anvil_impersonateAccount",
      params: [address],
    });
    await reader.request({
      method: "anvil_setBalance",
      params: [address, toHex(100n * 10n ** 18n)],
    });
  }
  await impersonate(sponsor);
  const wallet = (account) =>
    createWalletClient({
      account,
      chain,
      transport: http(rpc, { timeout: 20000, retryCount: 0 }),
    });
  const read = (address, functionName, args = []) =>
    reader.readContract({ address, abi, functionName, args });
  async function send(label, p) {
    assertLocalFork(
      rpc,
      await reader.getChainId(),
      await reader.request({ method: "web3_clientVersion" }),
    );
    const sim = await reader.simulateContract({
      ...p,
      account: p.account || sponsor,
    });
    const hash = await wallet(p.account || sponsor).writeContract({
      ...sim.request,
      maxFeePerGas: 40000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    let receipt;
    for (let i = 0; i < 80; i++) {
      try {
        receipt = await reader.getTransactionReceipt({ hash });
        break;
      } catch (e) {
        if (e.name !== "TransactionReceiptNotFoundError") throw e;
        await delay(250);
      }
    }
    assert.equal(receipt?.status, "success");
    report.operations.push({
      label,
      gasUsed: String(receipt.gasUsed),
      feeWei: String(receipt.gasUsed * receipt.effectiveGasPrice),
    });
    return receipt;
  }
  async function mustRevert(id, p) {
    await assert.rejects(
      () => reader.simulateContract({ ...p, account: p.account || sponsor }),
      (e) =>
        e.walk?.((x) => x.name === "ContractFunctionRevertedError")?.name ===
        "ContractFunctionRevertedError",
    );
    record(id, "EVM revert in local simulator");
  }
  for (const asset of config.assets) {
    const domain = {
      name: asset.name,
      version: asset.version,
      chainId: 31337,
      verifyingContract: asset.address,
    };
    assert.equal(
      await read(asset.address, "DOMAIN_SEPARATOR"),
      hashDomain({ domain, types: domainTypes }),
    );
    record(
      `${asset.symbol} local domain`,
      "Domain recalculated for disposable chain 31337",
    );
    if (asset.symbol === "EURC") {
      const master = await read(asset.address, "masterMinter");
      await impersonate(master);
      await send("configure local EURC minter", {
        address: asset.address,
        abi,
        functionName: "configureMinter",
        args: [sponsor, 1000000000n],
        account: master,
      });
    }
    async function fresh(balance) {
      const account = privateKeyToAccount(generatePrivateKey());
      if (asset.symbol === "USDC")
        await reader.request({
          method: "anvil_setBalance",
          params: [account.address, toHex(balance * 10n ** 12n)],
        });
      else
        await send("local EURC mint", {
          address: asset.address,
          abi,
          functionName: "mint",
          args: [account.address, balance],
        });
      assert.equal(
        await read(asset.address, "balanceOf", [account.address]),
        balance,
      );
      return account;
    }
    async function authorization(
      account,
      value,
      kind = "receiveWithAuthorization",
    ) {
      const primaryType =
        kind === "receiveWithAuthorization"
          ? "ReceiveWithAuthorization"
          : "TransferWithAuthorization";
      const now = (await reader.getBlock()).timestamp;
      const message = {
        from: account.address,
        to: sponsor,
        value,
        validAfter: 0n,
        validBefore: now + 3600n,
        nonce: keccak256(stringToHex(`${account.address}:${kind}:${value}`)),
      };
      const signature = await account.signTypedData({
        domain,
        types: { [primaryType]: fields },
        primaryType,
        message,
      });
      return {
        address: asset.address,
        abi,
        functionName: kind,
        args: [
          message.from,
          message.to,
          message.value,
          message.validAfter,
          message.validBefore,
          message.nonce,
          signature,
        ],
      };
    }
    const amount = 1000000n,
      floor = 50000n;
    const funded = await fresh(amount + floor);
    const call = await authorization(funded, amount);
    const receipt = await send(`${asset.symbol} sponsored authorization`, call);
    assert.equal(
      await read(asset.address, "balanceOf", [funded.address]),
      floor,
    );
    assert.equal(
      await read(asset.address, "authorizationState", [
        funded.address,
        call.args[5],
      ]),
      true,
    );
    await mustRevert(`${asset.symbol} authorization cannot replay`, call);
    record(`${asset.symbol} gasless receive`, {
      remainingMinorUnits: String(floor),
      nativeBalanceWei: String(
        await reader.getBalance({ address: funded.address }),
      ),
      logEmitters: [...new Set(receipt.logs.map((l) => l.address))],
    });
    const low = await fresh(amount - 1n);
    await mustRevert(
      `${asset.symbol} insufficient balance`,
      await authorization(low, amount),
    );
    const exact = await fresh(amount);
    const exactCall = await authorization(exact, amount);
    // Observe rather than assume the drain behavior; live-flow gate stays open either way.
    try {
      await reader.simulateContract({ ...exactCall, account: sponsor });
      report.checks.push({
        id: `${asset.symbol} exact drain`,
        status: "OBSERVED-LOCAL",
        detail: "Simulation succeeds; do not assume a live safety guarantee",
      });
    } catch (e) {
      const revert = e.walk?.(
        (x) => x.name === "ContractFunctionRevertedError",
      );
      assert(revert);
      report.checks.push({
        id: `${asset.symbol} exact drain`,
        status: "OBSERVED-LOCAL",
        detail: revert.reason || revert.shortMessage,
      });
    }
    if (asset.symbol === "EURC") {
      const zeroGas = await fresh(amount + floor);
      assert.equal(await reader.getBalance({ address: zeroGas.address }), 0n);
      await send(
        "EURC zero-native transfer authorization",
        await authorization(zeroGas, amount, "transferWithAuthorization"),
      );
      assert.equal(await reader.getBalance({ address: zeroGas.address }), 0n);
      record(
        "S-ARC-3 EURC zero native",
        "Sponsored transfer succeeds while signer remains at zero native USDC",
      );
    }
  }
  const usdc = config.assets.find((a) => a.symbol === "USDC").address;
  await mustRevert("USDC blocklisted recipient", {
    address: usdc,
    abi,
    functionName: "transfer",
    args: [config.testBlocklistedAddress, 1n],
  });
  const destination = "0x4000000000000000000000000000000000000004";
  const transfer = encodeFunctionData({
    abi,
    functionName: "transfer",
    args: [destination, 1000n],
  });
  const memoAbi = parseAbi([
    "function memo(address target,bytes data,bytes32 memoId,bytes memoData)",
  ]);
  const before = await read(usdc, "balanceOf", [destination]);
  const memoParams = {
    address: config.contracts.Memo,
    abi: memoAbi,
    functionName: "memo",
    args: [
      usdc,
      transfer,
      keccak256(stringToHex("chonks:local-g0")),
      stringToHex("LOCAL TEST ONLY"),
    ],
  };
  let memoAvailable = true;
  try {
    await reader.simulateContract({ ...memoParams, account: sponsor });
  } catch (e) {
    const revert = e.walk?.((x) => x.name === "ContractFunctionRevertedError");
    assert(
      revert,
      "Only a confirmed unsigned simulation revert permits this fallback",
    );
    memoAvailable = false;
    report.checks.push({
      id: "VA-07 Memo simulation",
      status: "FAIL-LOCAL",
      detail: {
        reason: revert.reason || revert.shortMessage,
        data: revert.data || null,
      },
    });
  }
  if (memoAvailable) {
    const memo = await send("Memo tagged transfer", memoParams);
    assert(
      memo.logs.some(
        (l) => l.address.toLowerCase() === config.contracts.Memo.toLowerCase(),
      ),
    );
    record(
      "VA-07 Memo local call",
      "EOA sender preserved; destination balance and Memo emitter verified",
    );
  } else {
    // No Memo transaction was sent. Never retry a sent/uncertain payment through another route.
    await send("plain transfer fallback", {
      address: usdc,
      abi,
      functionName: "transfer",
      args: [destination, 1000n],
    });
    record(
      "VA-07 plain fallback",
      "Unsigned Memo simulation reverted; plain transfer succeeded. No Memo claim.",
    );
  }
  assert.equal(await read(usdc, "balanceOf", [destination]), before + 1000n);
  report.ok = true;
} catch (e) {
  report.ok = false;
  report.error = { name: e.name, message: e.shortMessage || e.message };
  console.error(report.error);
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
  if (child.exitCode === null)
    await Promise.race([once(child, "exit"), delay(2000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await fs.writeFile(
    "docs/web3/spikes/arc-native.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
