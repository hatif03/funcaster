// Product-flow rehearsal on Arc's official local simulator. Never reads env keys
// or signs for a public chain. Public RPC is used only as the fork's read source.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  toHex,
  keccak256,
  stringToHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { assertLocalFork } from "./local-fork-guard.mjs";
import {
  termsHash,
  normalizeTerms,
  acceptData,
  fundingData,
  settleData,
  contestData,
} from "../../integrations/arc/signatures.mjs";
import { payoutVector } from "../../integrations/arc/payouts.mjs";

const option = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const artifactFile = option(
  "--artifact",
  "integrations/arc/onchain/contracts/out/ConditionalPot.sol/ConditionalPot.json",
);
const reportFile = option(
  "--report",
  "docs/web3/spikes/g1-arc-pot-rehearsal.json",
);
const artifactBytes = await fs.readFile(artifactFile),
  artifact = JSON.parse(artifactBytes);
assert(
  Array.isArray(artifact.abi) && /^0x[\da-f]+$/i.test(artifact.bytecode.object),
);
const config = JSON.parse(
  await fs.readFile("docs/web3/spikes/arc-readonly-input.json"),
);
assert.equal(config.chainId, 5042002);
const source = createPublicClient({
  transport: http(config.rpcUrls[0], { timeout: 20000, retryCount: 1 }),
});
assert.equal(await source.getChainId(), 5042002);
const sourceBlock = await source.getBlockNumber();
const listener = net.createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const port = listener.address().port;
await new Promise((r) => listener.close(r));
const rpc = `http://127.0.0.1:${port}`;
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
    String(sourceBlock),
    "--silent",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let stderr = "";
child.stderr.on("data", (b) => (stderr = (stderr + b).slice(-2000)));
const chain = {
  id: 31337,
  name: "Disposable Arc pot rehearsal",
  nativeCurrency: { name: "Test USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
};
const reader = createPublicClient({
  chain,
  transport: http(rpc, { timeout: 20000, retryCount: 0 }),
  cacheTime: 0,
});
const wallet = (account) =>
  createWalletClient({
    chain,
    account,
    transport: http(rpc, { timeout: 20000, retryCount: 0 }),
  });
const deployer = privateKeyToAccount(generatePrivateKey());
const report = {
  at: new Date().toISOString(),
  scope: "LOCAL ARC FORK ONLY; no public broadcasts or role keys",
  sourceBlock: String(sourceBlock),
  artifactSha256: createHash("sha256").update(artifactBytes).digest("hex"),
  checks: [],
  transactions: [],
};
const record = (id, detail) => {
  report.checks.push({ id, status: "PASS-LOCAL", detail });
  console.log(`PASS-LOCAL ${id}`);
};
const guard = async () =>
  assertLocalFork(
    rpc,
    await reader.getChainId(),
    await reader.request({ method: "web3_clientVersion" }),
  );
async function mutate(method, params) {
  await guard();
  return reader.request({ method, params });
}
const tokenAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function masterMinter() view returns (address)",
  "function configureMinter(address,uint256) returns (bool)",
  "function mint(address,uint256) returns (bool)",
  "function blacklister() view returns (address)",
  "function blacklist(address)",
  "function unBlacklist(address)",
  "function isBlacklisted(address) view returns (bool)",
]);
async function receipt(label, hash) {
  let r;
  try {
    // Arc's simulator can mine consecutive blocks with equal timestamps. Direct
    // receipt reads avoid a missed block-watcher notification; never resend.
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        r = await reader.getTransactionReceipt({ hash });
        break;
      } catch (e) {
        if (e.name !== "TransactionReceiptNotFoundError") throw e;
        await delay(250);
      }
    }
    if (!r) throw Error(`Local receipt remains unresolved: ${label}`);
  } catch (error) {
    const tx = await reader.getTransaction({ hash }).catch(() => null);
    report.unresolved = {
      label,
      hash,
      transaction: tx,
      pending: await reader
        .request({ method: "txpool_status" })
        .catch(() => null),
    };
    throw error;
  }
  assert.equal(r.status, "success", label);
  report.transactions.push({
    label,
    hash,
    blockNumber: String(r.blockNumber),
    gasUsed: String(r.gasUsed),
    feeWei: String(r.gasUsed * r.effectiveGasPrice),
  });
  return r;
}
async function send(label, call, account = deployer) {
  await guard();
  const simulation = await reader.simulateContract({ ...call, account });
  await guard();
  const sender = typeof account === "string" ? account : account.address;
  const nonce = await reader.getTransactionCount({
    address: sender,
    blockTag: "latest",
  });
  return receipt(
    label,
    await wallet(account).writeContract({
      ...simulation.request,
      nonce,
      maxFeePerGas: 40_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    }),
  );
}
async function denied(label, call) {
  await assert.rejects(
    reader.simulateContract({ ...call, account: deployer }),
    (e) => !!e.walk?.((x) => x.name === "ContractFunctionRevertedError"),
  );
  record(label, "Simulation reverts on the local fork");
}
async function impersonate(address) {
  await mutate("anvil_impersonateAccount", [address]);
  await mutate("anvil_setBalance", [address, toHex(100n * 10n ** 18n)]);
}
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null)
      throw Error("Local Arc simulator exited before startup");
    try {
      await guard();
      ready = true;
      break;
    } catch {
      await delay(250);
    }
  }
  assert(ready, "Local Arc simulator startup timed out");
  await mutate("anvil_setBalance", [
    deployer.address,
    toHex(100n * 10n ** 18n),
  ]);
  await guard();
  const deployed = await receipt(
    "deploy local ConditionalPot",
    await wallet(deployer).deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object,
      args: [config.assets.map((a) => a.address)],
      maxFeePerGas: 40_000_000_000n,
      maxPriorityFeePerGas: 0n,
    }),
  );
  const contract = deployed.contractAddress;
  assert(contract);
  report.contract = contract;
  const potConfig = { chainId: 5042002, contract };
  const call = (functionName, args) => ({
    address: contract,
    abi: artifact.abi,
    functionName,
    args,
  });
  const read = (functionName, args = []) =>
    reader.readContract(call(functionName, args));
  // Production helpers refuse local signatures. Only this guarded runner maps
  // their domain to the disposable fork; the production modules stay testnet-only.
  const signLocal = async (account, data) => {
    await guard();
    return account.signTypedData({
      ...data,
      domain: { ...data.domain, chainId: 31337 },
    });
  };
  const domain = await read("eip712Domain");
  assert.equal(domain[0], "0x0f");
  assert.equal(domain[1], "ChonksPot");
  assert.equal(domain[2], "1");
  assert.equal(domain[3], 31337n);
  assert.equal(domain[4].toLowerCase(), contract.toLowerCase());
  assert.equal(domain[6].length, 0);
  record(
    "pot domain",
    "ChonksPot/1, local chain 31337, exact deployed contract",
  );
  for (const asset of config.assets) {
    const t = (functionName, args = []) => ({
      address: asset.address,
      abi: tokenAbi,
      functionName,
      args,
    });
    const tokenRead = (fn, args = []) => reader.readContract(t(fn, args));
    if (asset.symbol === "EURC") {
      const master = await tokenRead("masterMinter");
      await impersonate(master);
      await send(
        "configure local EURC minter",
        t("configureMinter", [deployer.address, 1_000_000_000n]),
        master,
      );
    }
    const fresh = async () => {
      const a = privateKeyToAccount(generatePrivateKey());
      if (asset.symbol === "USDC")
        await mutate("anvil_setBalance", [
          a.address,
          toHex(60_001n * 10n ** 12n),
        ]);
      else
        await send("mint local EURC fixture", t("mint", [a.address, 60_001n]));
      assert.equal(await tokenRead("balanceOf", [a.address]), 60_001n);
      return a;
    };
    async function make(tag, count = 3) {
      const accounts = [];
      for (let i = 0; i < count; i++) accounts.push(await fresh());
      const time = (await reader.getBlock()).timestamp;
      const potId = keccak256(stringToHex(`${asset.symbol}:${tag}`));
      const params = normalizeTerms({
        asset: asset.address,
        stake: 10_001n,
        seats: accounts.map((a) => a.address),
        rule: "top2",
        oracle: deployer.address,
        fundDeadline: time + 180n,
        settleDeadline: time + 900n,
        challengeWindow: 120,
        minPlaySeconds: 60,
        metadataHash: keccak256(stringToHex(`local:${tag}`)),
      });
      assert.equal(
        await read("hashTerms", [potId, params]),
        termsHash(potId, params),
      );
      await send(
        `${asset.symbol} ${tag} create`,
        call("create", [potId, params]),
      );
      const view = await read("getPot", [potId]);
      assert.equal(view.termsHash, termsHash(potId, params));
      return { potId, params, accounts };
    }
    async function fund(p, index) {
      const a = p.accounts[index],
        time = (await reader.getBlock()).timestamp;
      const typed = fundingData(
        { ...asset, chainId: 5042002 },
        {
          potId: p.potId,
          seat: a.address,
          contract,
          stake: p.params.stake,
          validAfter: 0n,
          validBefore: p.params.fundDeadline,
          fundDeadline: p.params.fundDeadline,
          chainTime: time,
          balance: await tokenRead("balanceOf", [a.address]),
          floor: 50_000n,
        },
      );
      const accept = await signLocal(
        a,
        acceptData(potConfig, {
          potId: p.potId,
          termsHash: termsHash(p.potId, p.params),
        }),
      );
      const auth = await signLocal(a, typed),
        m = typed.message;
      const request = call("fundWithAuthorization", [
        p.potId,
        a.address,
        accept,
        m.validAfter,
        m.validBefore,
        m.nonce,
        auth,
      ]);
      await send(`${asset.symbol} fund seat ${index}`, request);
      assert.equal(await tokenRead("balanceOf", [a.address]), 50_000n);
      if (asset.symbol === "EURC")
        assert.equal(await reader.getBalance({ address: a.address }), 0n);
      return request;
    }
    const p = await make("cooperative");
    const firstFunding = await fund(p, 0);
    await denied(`${asset.symbol} funding replay denied`, firstFunding);
    await fund(p, 1);
    assert.equal((await read("getPot", [p.potId])).state, 1);
    await fund(p, 2);
    assert.equal((await read("getPot", [p.potId])).state, 2);
    record(
      `${asset.symbol} funding and lock`,
      "Three canonical Accept/authorization pairs, exact stake, retained 0.05 per seat; EURC needs no native gas",
    );
    const places = [1, 1, 2],
      expected = payoutVector(p.params.stake, places, p.params.rule);
    const signatures = await Promise.all(
      p.accounts.map((a) =>
        signLocal(a, settleData(potConfig, { potId: p.potId, places })),
      ),
    );
    await send(
      `${asset.symbol} cooperative settle`,
      call("settleCooperative", [p.potId, places, signatures]),
    );
    for (let i = 0; i < 3; i++)
      assert.equal(
        await read("claimableOf", [p.potId, p.accounts[i].address]),
        expected[i],
      );
    // Separate blocklist cases on the actual USDC and EURC token implementations.
    const blacklister = await tokenRead("blacklister");
    await impersonate(blacklister);
    await send(
      `${asset.symbol} locally block first recipient`,
      t("blacklist", [p.accounts[0].address]),
      blacklister,
    );
    await denied(
      `${asset.symbol} blocked claim isolated`,
      call("claim", [p.potId, p.accounts[0].address]),
    );
    for (let i = 1; i < 3; i++)
      await send(
        `${asset.symbol} claim seat ${i}`,
        call("claim", [p.potId, p.accounts[i].address]),
      );
    await send(
      `${asset.symbol} locally unblock recipient`,
      t("unBlacklist", [p.accounts[0].address]),
      blacklister,
    );
    await send(
      `${asset.symbol} final claim`,
      call("claim", [p.potId, p.accounts[0].address]),
    );
    assert.equal(await tokenRead("balanceOf", [contract]), 0n);
    for (let i = 0; i < 3; i++)
      assert.equal(
        await tokenRead("balanceOf", [p.accounts[i].address]),
        50_000n + expected[i],
      );
    record(
      `${asset.symbol} settle and claims`,
      "Payout vector equals JS; blocked recipient cannot prevent the others; final contract balance drains to zero",
    );
    const refund = await make("partial-refund");
    await fund(refund, 0);
    await denied(
      `${asset.symbol} early refund denied`,
      call("refund", [refund.potId]),
    );
    await mutate("evm_setNextBlockTimestamp", [
      Number(refund.params.fundDeadline),
    ]);
    await mutate("evm_mine", []);
    await send(
      `${asset.symbol} partial refund`,
      call("refund", [refund.potId]),
    );
    await send(
      `${asset.symbol} refund claim`,
      call("claim", [refund.potId, refund.accounts[0].address]),
    );
    assert.equal(
      await tokenRead("balanceOf", [refund.accounts[0].address]),
      60_001n,
    );
    assert.equal(await tokenRead("balanceOf", [contract]), 0n);
    record(
      `${asset.symbol} partial refund`,
      "Funding deadline boundary refunds only the funded seat, whose full stake is claimable",
    );
    const dispute = await make("contest", 2);
    await fund(dispute, 0);
    await fund(dispute, 1);
    const locked = await read("getPot", [dispute.potId]);
    await denied(
      `${asset.symbol} early oracle denied`,
      call("propose", [
        dispute.potId,
        [1, 2],
        keccak256(stringToHex("result")),
      ]),
    );
    await mutate("evm_setNextBlockTimestamp", [Number(locked.lockedAt) + 60]);
    await mutate("evm_mine", []);
    await send(
      `${asset.symbol} propose`,
      call("propose", [
        dispute.potId,
        [1, 2],
        keccak256(stringToHex("result")),
      ]),
    );
    const contest = await signLocal(
      dispute.accounts[1],
      contestData(potConfig, dispute.potId),
    );
    await send(
      `${asset.symbol} contest`,
      call("contestWithSig", [
        dispute.potId,
        dispute.accounts[1].address,
        contest,
      ]),
    );
    await send(
      `${asset.symbol} contested refund`,
      call("refund", [dispute.potId]),
    );
    for (const a of dispute.accounts) {
      await send(
        `${asset.symbol} contested claim`,
        call("claim", [dispute.potId, a.address]),
      );
      assert.equal(await tokenRead("balanceOf", [a.address]), 60_001n);
    }
    assert.equal(await tokenRead("balanceOf", [contract]), 0n);
    record(
      `${asset.symbol} contest refund`,
      "Delayed oracle proposal, gasless seat contest, full refunds and zero residual contract balance",
    );
  }
  report.ok = true;
} catch (e) {
  report.ok = false;
  report.error = {
    name: e.name,
    message: String(e.shortMessage || e.message).slice(0, 500),
  };
  process.exitCode = 1;
  console.error("Local pot rehearsal failed:", report.error.message);
} finally {
  child.kill("SIGTERM");
  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(
    reportFile,
    JSON.stringify(
      report,
      (_k, v) => (typeof v === "bigint" ? String(v) : v),
      2,
    ) + "\n",
  );
}
