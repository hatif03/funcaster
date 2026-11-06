import test from "node:test";
import assert from "node:assert/strict";
import { zeroAddress } from "viem";
import { createHierarchyReader } from "../../integrations/ens/hierarchy.mjs";
import {
  checkedName,
  checkedParent,
  dnsName,
  labelId,
} from "../../integrations/ens/names.mjs";
import {
  preflightEns,
  deploymentDiff,
} from "../../integrations/ens/preflight.mjs";
import {
  CONTRACT_KEYS,
  createReadClient,
} from "../../integrations/ens/runtime.mjs";
import pin from "../../integrations/ens/deployment-pin.json" with { type: "json" };

const addr = (n) => `0x${n.toString(16).padStart(40, "0")}`;
const registrar = addr(1),
  parentRegistry = addr(2),
  playRegistry = addr(3),
  resolver = addr(4),
  stranger = addr(5);
const hash = `0x${"ab".repeat(32)}`;
const protocol = {
  chainId: 11155111,
  registeredStatus: 2,
  registryRoles: 1n,
  resolverRoles: 2n,
  contracts: Object.fromEntries(
    Object.entries(CONTRACT_KEYS).map(([name, [key]]) => [
      key,
      pin.contracts[name],
    ]),
  ),
};
const c = protocol.contracts;
const now = () => 1000000;
const config = { ENS_PARENT: "funcaster.eth", ENS_REGISTRAR_ADDRESS: registrar };
const html = `<h3 id="mainnet-ensv2">Mainnet</h3><table><tr><td>ETHRegistry</td><td>${stranger}</td></tr></table><h3 id="sepolia-ensv2">Sepolia</h3><table>${Object.keys(
  CONTRACT_KEYS,
)
  .map(
    (name) =>
      `<tr><td><span>${name}</span><a>ABI</a><a>Source</a></td><td>${pin.contracts[name]}</td></tr>`,
  )
  .join("")}</table>`;

function fixture(override = {}) {
  const calls = [];
  const block = { number: 42n, hash, timestamp: 999n };
  const client = {
    async getChainId() {
      return override.chainId ?? 11155111;
    },
    async getBlock(args) {
      calls.push({ method: "block", ...args });
      return {
        ...block,
        ...override.block,
        ...(args.blockNumber ? override.finalBlock : {}),
      };
    },
    async getCode(args) {
      calls.push({ method: "code", ...args });
      return args.address === override.emptyCode ? "0x" : "0x6000";
    },
    async readContract(args) {
      calls.push(args);
      const result = override.read?.(args);
      if (result !== undefined) return result;
      const { address, functionName: fn, args: values } = args;
      if (fn === "ROOT_REGISTRY") return c.rootRegistry;
      if (fn === "getSubregistry") {
        if (address === c.rootRegistry) return c.ethRegistry;
        return address === c.ethRegistry ? parentRegistry : playRegistry;
      }
      if (fn === "getResolver")
        return address === c.ethRegistry ? zeroAddress : resolver;
      if (fn === "getState")
        return {
          status: 2,
          expiry: address === c.ethRegistry ? 2000n : 1500n,
          latestOwner: registrar,
          tokenId: 123n,
          resource: 456n,
        };
      if (fn === "verifyContract")
        return values[0] === resolver ? c.resolverImpl : c.userRegistryImpl;
      if (fn === "getParent")
        return address === parentRegistry
          ? [c.ethRegistry, "chonks"]
          : [parentRegistry, "play"];
      if (fn === "findCanonicalName")
        return dnsName(
          values[0] === c.ethRegistry
            ? "eth"
            : values[0] === parentRegistry
              ? "funcaster.eth"
              : "play.funcaster.eth",
        );
      if (fn === "hasRootRoles") return true;
      throw Error(`Unexpected call ${fn}`);
    },
  };
  return {
    calls,
    client,
    reader: createHierarchyReader({
      client,
      protocol,
      parent: "funcaster.eth",
      now,
    }),
  };
}

test("ENS walk uses one block, chain expiry, label IDs and discovered addresses", async () => {
  const f = fixture();
  const proof = await f.reader.walk("play.funcaster.eth", {
    expectedOwner: registrar,
    requireResolver: true,
  });
  assert.equal(proof.leaf.subregistry, playRegistry);
  assert.equal(proof.leaf.resolver, resolver);
  assert.equal(proof.expiresAt, 1500n);
  assert.equal(proof.chainTime, 999n);
  for (const call of f.calls.filter((x) => x.method !== "block"))
    assert.equal(call.blockNumber, 42n);
  assert.deepEqual(
    f.calls.filter((x) => x.functionName === "getState").map((x) => x.args),
    [[labelId("chonks")], [labelId("play")]],
  );
  assert.equal("tokenId" in proof.leaf, false);
});

const failures = [
  ["wrong chain", { chainId: 1 }, "WRONG_CHAIN"],
  ["stale head", { block: { timestamp: 950n } }, "STALE_CHAIN"],
  ["future head", { block: { timestamp: 1006n } }, "STALE_CHAIN"],
  ["missing block hash", { block: { hash: null } }, "INVALID_BLOCK"],
  ["reorg", { finalBlock: { hash: `0x${"cd".repeat(32)}` } }, "REORG"],
  ["EOA subregistry", { emptyCode: playRegistry }, "MISSING_CONTRACT"],
  [
    "fake registry",
    {
      read: (x) =>
        x.functionName === "verifyContract" && x.args[0] === playRegistry
          ? stranger
          : undefined,
    },
    "UNTRUSTED_REGISTRY",
  ],
  [
    "fake resolver",
    {
      read: (x) =>
        x.functionName === "verifyContract" && x.args[0] === resolver
          ? stranger
          : undefined,
    },
    "UNTRUSTED_RESOLVER",
  ],
  [
    "canonical alias",
    {
      read: (x) =>
        x.functionName === "findCanonicalName" && x.args[0] === playRegistry
          ? dnsName("fake.funcaster.eth")
          : undefined,
    },
    "NONCANONICAL",
  ],
  [
    "wrong parent",
    {
      read: (x) =>
        x.functionName === "getParent" && x.address === playRegistry
          ? [stranger, "play"]
          : undefined,
    },
    "NONCANONICAL",
  ],
  [
    "wrong canonical label",
    {
      read: (x) =>
        x.functionName === "getParent" && x.address === playRegistry
          ? [parentRegistry, "fake"]
          : undefined,
    },
    "NONCANONICAL",
  ],
  [
    "root drift",
    {
      read: (x) =>
        x.functionName === "getSubregistry" && x.address === c.rootRegistry
          ? stranger
          : undefined,
    },
    "DEPLOYMENT_DRIFT",
  ],
  [
    "helper drift",
    {
      read: (x) => (x.functionName === "ROOT_REGISTRY" ? stranger : undefined),
    },
    "DEPLOYMENT_DRIFT",
  ],
  [
    "absent intermediate registry",
    {
      read: (x) =>
        x.functionName === "getSubregistry" && x.address === c.ethRegistry
          ? zeroAddress
          : undefined,
    },
    "MISSING_REGISTRY",
  ],
  [
    "parent owner changed",
    {
      read: (x) =>
        x.functionName === "getState"
          ? { status: 2, expiry: 1500n, latestOwner: stranger }
          : undefined,
    },
    "OWNER_MISMATCH",
  ],
  [
    "expiry despite retained owner",
    {
      read: (x) =>
        x.functionName === "getState"
          ? { status: 2, expiry: 999n, latestOwner: registrar }
          : undefined,
    },
    "EXPIRED",
  ],
  [
    "reserved name",
    {
      read: (x) =>
        x.functionName === "getState"
          ? { status: 1, expiry: 1500n, latestOwner: registrar }
          : undefined,
    },
    "NOT_REGISTERED",
  ],
  [
    "missing explicit resolver",
    {
      read: (x) => (x.functionName === "getResolver" ? zeroAddress : undefined),
    },
    "MISSING_RESOLVER",
  ],
];
for (const [name, override, code] of failures)
  test(`ENS rejects ${name}`, async () => {
    const f = fixture(override);
    await assert.rejects(
      f.reader.walk("play.funcaster.eth", {
        expectedOwner: registrar,
        requireResolver: true,
      }),
      (error) => error.code === code,
    );
  });

test("RPC errors remain unavailable; deterministic denials never become outage fallback", async () => {
  const down = fixture({
    read: () => {
      throw Error("private-rpc-url-with-secret");
    },
  });
  assert.deepEqual(await down.reader.check("play.funcaster.eth"), {
    outcome: "unavailable",
    code: "RPC_UNAVAILABLE",
  });
  const denied = fixture(failures.find((x) => x[0] === "fake registry")[1]);
  assert.deepEqual(await denied.reader.check("play.funcaster.eth"), {
    outcome: "denied",
    code: "UNTRUSTED_REGISTRY",
  });
});

test("invalid or outside names are rejected before any RPC", async () => {
  for (const name of [
    "",
    "play..funcaster.eth",
    "play.funcaster.eth.",
    "rаvi.funcaster.eth",
    "a".repeat(64) + ".funcaster.eth",
    "https://funcaster.eth",
    " play.funcaster.eth",
    "play.notfuncaster.eth",
    "a.b.c.play.funcaster.eth",
  ]) {
    const f = fixture();
    await assert.rejects(f.reader.walk(name));
    assert.equal(f.calls.length, 0);
  }
  assert.equal(checkedName("Play.Funcaster.eth"), "play.funcaster.eth");
  assert.equal(checkedParent("funcaster.eth"), "funcaster.eth");
  assert.throws(() => checkedParent("play.funcaster.eth"));
});

test("every walk re-reads links and state, even after token regeneration", async () => {
  let revoked = false;
  const f = fixture({
    read: (x) =>
      revoked && x.functionName === "getState"
        ? { status: 0, expiry: 999n, latestOwner: zeroAddress, tokenId: 9999n }
        : undefined,
  });
  await f.reader.walk("play.funcaster.eth");
  revoked = true;
  assert.equal((await f.reader.check("play.funcaster.eth")).outcome, "denied");
});

test("official docs comparison is Sepolia-scoped and detects drift/missing/duplicate rows", () => {
  assert.equal(
    deploymentDiff(html, protocol).every((x) => x.status === "PASS"),
    true,
  );
  const changed = html.replaceAll(pin.contracts.ETHRegistry, stranger);
  assert.equal(
    deploymentDiff(changed, protocol).find((x) => x.name === "ETHRegistry")
      .status,
    "MISMATCH",
  );
  for (const broken of [
    "unavailable",
    html.replace("sepolia-ensv2", "sepolia-v3"),
    html.replace("<span>RootRegistry</span>", "<span>Gone</span>"),
    html.replace(
      /<\/table>$/,
      `<tr><td>RootRegistry</td><td>${c.rootRegistry}</td></tr></table>`,
    ),
  ])
    assert.throws(() => deploymentDiff(broken, protocol));
});

test("preflight checks registrar admin roles and reports only namespace prerequisites", async () => {
  const f = fixture();
  const report = await preflightEns({
    config,
    client: f.client,
    protocol,
    html,
    now,
  });
  assert.equal(report.ok, true);
  assert.equal(report.roles.length, 3);
  assert.equal(report.pending.length, 4);
  assert.equal(
    f.calls
      .filter((x) => x.functionName === "hasRootRoles")
      .every((x) => x.args[1] === registrar && x.blockNumber === 42n),
    true,
  );
  assert.equal(report.proof.leaf.subregistry, playRegistry);
  assert.match(report.scope, /no transactions or provider enablement/);
});

test("preflight stops on published address drift before making RPC calls", async () => {
  const f = fixture();
  const result = await preflightEns({
    config,
    client: f.client,
    protocol,
    html: html.replaceAll(pin.contracts.ETHRegistry, stranger),
    now,
  });
  assert.equal(result.ok, false);
  assert.equal(f.calls.length, 0);
});

test("preflight refuses missing registrar and missing admin roles", async () => {
  const f = fixture({
    read: (x) => (x.functionName === "hasRootRoles" ? false : undefined),
  });
  await assert.rejects(
    preflightEns({ config, client: f.client, protocol, html, now }),
    (e) => e.code === "MISSING_ROLES",
  );
  await assert.rejects(
    preflightEns({
      config: { ...config, ENS_REGISTRAR_ADDRESS: "" },
      client: f.client,
      protocol,
      html,
      now,
    }),
    (e) => e.code === "INVALID_CONFIG",
  );
});

test("read-only transport rejects broadcast/signing/debug RPC before network access", async () => {
  const client = createReadClient(
    { ...protocol, chain: { id: 11155111 } },
    "https://example.invalid",
  );
  for (const method of [
    "eth_sendRawTransaction",
    "eth_sendTransaction",
    "eth_sign",
    "personal_sign",
    "anvil_impersonateAccount",
    "wallet_sendCalls",
  ])
    await assert.rejects(
      client.request({ method, params: [] }),
      (e) => e.code === "READ_ONLY",
    );
  for (const url of [
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com/#fragment",
  ])
    assert.throws(
      () => createReadClient(protocol, url),
      (e) => e.code === "INVALID_RPC",
    );
});
