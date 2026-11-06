import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  keccak256,
  stringToHex,
  zeroAddress,
  encodeFunctionData,
  decodeFunctionData,
  encodeFunctionResult,
} from "viem";
import {
  createChampionReader,
  createChampionAdapter,
  CHAMPION_YEAR,
} from "../../integrations/ens/champion.mjs";
import { labelId } from "../../integrations/ens/names.mjs";
import { resolverReads } from "../../integrations/ens/lifecycle-calls.mjs";
import abi from "../../integrations/ens/lifecycle-abi.json" with { type: "json" };
import { hash } from "../../server/records.cjs";
const address = (n) => "0x" + n.toString(16).padStart(40, "0");

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "chonks-champion-"));
  // Synthetic nonoverlapping nibble roles exercise permission logic without
  // loading the optional live ENS SDK. Production uses loadChampionRoles.
  const role = (n) => 1n << BigInt(n * 4);
  const roles = {
      registrar: role(0),
      namespace: role(0) | role(32),
      parentSetup: role(1) | role(33),
      forbidden: role(2) | role(34) | role(3) | role(35),
      owner: role(4) | role(36),
      resolver: role(5) | role(37),
    },
    owner = address(1),
    phone = address(2),
    registry = address(3),
    parentRegistry = address(4);
  const protocol = {
    chainId: 11155111,
    registeredStatus: 2,
    contracts: {
      factory: address(5),
      userRegistryImpl: address(6),
      resolverImpl: address(7),
    },
  };
  const config = { ENS_PARENT: "fixture.eth", ENS_REGISTRAR_ADDRESS: owner };
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  const state = {
    namespaceExists: true,
    expiry: timestamp + CHAMPION_YEAR * 2n,
    rootForbidden: 0n,
    crash: null,
    eligible: true,
    recovery: true,
  };
  const rows = new Map(),
    proxies = new Map(),
    records = new Map(),
    transactions = new Map(),
    calls = [];
  const empty = () => ({
    status: 0,
    expiry: 0n,
    latestOwner: zeroAddress,
    resource: 0n,
  });
  const current = (id) => rows.get(String(id)) || empty();
  const client = {
    async getBlock() {
      return { number: timestamp, timestamp, hash: "0x" + "b".repeat(64) };
    },
    async getCode({ address: target }) {
      return proxies.has(target) ? "0x6000" : "0x";
    },
    async readContract({ address: target, functionName: fn, args }) {
      if (fn === "predictProxyAddress")
        return (
          "0x" + keccak256(stringToHex(`${args[0]}:${args[1]}`)).slice(-40)
        );
      if (fn === "verifyContract")
        return proxies.get(args[0])?.implementation || zeroAddress;
      if (fn === "getState") return current(args[0]);
      if (fn === "roles")
        return target === registry
          ? args[0] === 0n || args[1] === owner
            ? roles.namespace
            : current(args[0]).latestOwner === args[1]
              ? roles.owner
              : 0n
          : proxies.get(target)?.grants.get(args[1]) || 0n;
      if (fn === "roleCount")
        return args[0] === 0n
          ? roles.namespace | state.rootForbidden
          : roles.owner;
      if (fn === "hasRootRoles")
        return (
          ((proxies.get(target)?.grants.get(args[1]) || 0n) & args[0]) ===
          args[0]
        );
      if (fn === "resolve") {
        const decoded = decodeFunctionData({
          abi: resolverReads,
          data: args[1],
        });
        const value = records.get(
          `${target}:${args[0]}:${decoded.functionName === "addr" ? "addr" : decoded.args[1]}`,
        );
        return encodeFunctionResult({
          abi: resolverReads,
          functionName: decoded.functionName,
          result: value || (decoded.functionName === "addr" ? zeroAddress : ""),
        });
      }
      throw Error(`Unexpected read ${fn}`);
    },
  };
  const hierarchy = {
    async walk(name) {
      if (!state.namespaceExists && name.startsWith("players."))
        throw Object.assign(Error("missing"), { code: "NOT_REGISTERED" });
      const leaf =
        name === "fixture.eth"
          ? { owner, subregistry: parentRegistry }
          : name === "players.fixture.eth"
            ? { owner, subregistry: registry }
            : (() => {
                const row = current(labelId(name.split(".")[0]));
                assert.equal(row.status, 2);
                return {
                  owner: row.latestOwner,
                  registry,
                  resolver: row.resolver,
                  expiresAt: row.expiry,
                  resource: row.resource,
                };
              })();
      return {
        name,
        chainTime: timestamp,
        blockNumber: timestamp,
        blockHash: "0x" + "b".repeat(64),
        expiresAt: state.expiry,
        leaf,
      };
    },
  };
  async function transact(id, call) {
    const fingerprint = `${call.address}:${encodeFunctionData(call)}`;
    if (transactions.has(id)) {
      assert.equal(transactions.get(id), fingerprint);
      return { tx: keccak256(stringToHex(id)) };
    }
    calls.push(call);
    const a = call.args;
    if (call.functionName === "deployProxy") {
      const target =
        "0x" + keccak256(stringToHex(`${owner}:${a[1]}`)).slice(-40);
      const init = decodeFunctionData({ abi: abi.resolver, data: a[2] });
      proxies.set(target, {
        implementation: a[0],
        grants: new Map(
          init.args[0].map((g) => [g.account.toLowerCase(), g.roleBitmap]),
        ),
      });
    } else if (call.functionName === "multicall") {
      for (const data of a[0]) {
        const decoded = decodeFunctionData({ abi: abi.resolver, data });
        const v = decoded.args;
        records.set(
          `${call.address}:${v[0]}:${decoded.functionName === "setAddress" ? "addr" : v[1]}`,
          decoded.functionName === "setAddress" ? v[2] : v[2],
        );
      }
    } else if (call.functionName === "revokeRootRoles")
      proxies.get(call.address).grants.set(a[1], 0n);
    else if (call.functionName === "register")
      rows.set(String(labelId(a[0])), {
        status: 2,
        latestOwner: a[1],
        resolver: a[3],
        expiry: a[5],
        resource: 900n,
      });
    else throw Error(`Unexpected transaction ${call.functionName}`);
    transactions.set(id, fingerprint);
    if (state.crash === call.functionName) {
      state.crash = null;
      throw Error("uncertain-response");
    }
    return { tx: keccak256(stringToHex(id)) };
  }
  const unsigned = {
    status: "completed",
    verification: "verified",
    gameId: "chonks.star-catch",
    scores: [{ slot: 0, score: 42 }],
  };
  const result = { ...unsigned, hash: hash(unsigned) };
  const input = {
    id: "earned-one",
    address: phone,
    handle: "asha",
    resultHash: result.hash,
    recoveryAcknowledged: true,
  };
  const options = {
    dir,
    client,
    protocol,
    config,
    transact,
    hierarchy,
    loadRoles: async () => roles,
    verifyEligibility: async () =>
      state.eligible ? { result, addresses: [phone] } : null,
  };
  let adapter;
  const start = async () => {
    adapter = await createChampionAdapter(options);
    return adapter;
  };
  t.after(async () => {
    await adapter?.close();
    await rm(dir, { recursive: true, force: true });
  });
  return {
    ...options,
    state,
    roles,
    phone,
    owner,
    registry,
    rows,
    proxies,
    calls,
    result,
    input,
    start,
    reader: await createChampionReader(options),
  };
}

test("Champion namespace preflight names missing, unsafe and short-lived prerequisites without sending", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.reader.preflight()).ready, true);
  f.state.namespaceExists = false;
  assert.equal(
    (await f.reader.preflight()).code,
    "CHAMPION_NAMESPACE_REQUIRED",
  );
  const preparation = await f.reader.prepareNamespace();
  assert.equal(preparation.requiresOwnerExecution, true);
  assert.equal(preparation.transactions.length, 4);
  assert.equal(f.calls.length, 0);
  f.state.namespaceExists = true;
  f.state.rootForbidden = f.roles.forbidden << 1n;
  assert.equal(
    (await f.reader.preflight()).code,
    "CHAMPION_NAMESPACE_UNSAFE",
    "even-count role holders must be caught",
  );
  f.state.rootForbidden = 0n;
  f.state.expiry = 1n;
  assert.equal(
    (await f.reader.preflight()).code,
    "CHAMPION_PARENT_RENEWAL_REQUIRED",
  );
});

test("earned phone claim gets one-year transferable ownership and a phone-controlled proof resolver", async (t) => {
  const f = await fixture(t),
    adapter = await f.start();
  const result = await adapter.claim(f.input);
  assert.equal(result.name, "asha.players.fixture.eth");
  assert.equal(result.status, "ready");
  assert.equal(
    result.chainVerified,
    false,
    "independent ledger verification stays separate",
  );
  assert.equal(
    BigInt(result.expiresAt),
    (await f.client.getBlock()).timestamp + CHAMPION_YEAR,
  );
  assert.equal(f.calls.length, 4);
  assert.equal(f.calls.at(-1).args[4], f.roles.owner);
  assert.equal(f.proxies.get(result.resolver).grants.get(f.owner), 0n);
  assert.equal(
    f.proxies.get(result.resolver).grants.get(f.phone),
    f.roles.resolver,
  );
  assert.deepEqual(await adapter.claim(f.input), result);
  assert.equal(f.calls.length, 4);
});

test("unearned, unbacked-up and reserved-name requests cannot enter a mint", async (t) => {
  const f = await fixture(t),
    adapter = await f.start();
  await assert.rejects(
    adapter.claim({ ...f.input, recoveryAcknowledged: "yes" }),
    { code: "CHAMPION_RECOVERY_REQUIRED" },
  );
  await assert.rejects(adapter.claim({ ...f.input, handle: "admin" }), {
    code: "INVALID_NAME",
  });
  f.state.eligible = false;
  await assert.rejects(adapter.claim(f.input), { code: "CHAMPION_NOT_EARNED" });
  assert.equal(f.calls.length, 0);
  f.state.eligible = true;
  f.rows.set(String(labelId("asha")), {
    status: 2,
    expiry: f.state.expiry,
    latestOwner: address(88),
  });
  await assert.rejects(adapter.claim(f.input), { code: "CHAMPION_NAME_TAKEN" });
  assert.equal(f.calls.length, 0);
});

test("uncertain register response reconciles the saved claim after restart with no second mint", async (t) => {
  const f = await fixture(t),
    first = await f.start();
  f.state.crash = "register";
  await assert.rejects(first.claim(f.input), /uncertain-response/);
  assert.equal(f.calls.length, 4);
  await first.close();
  const resumed = await f.start(),
    result = await resumed.claim(f.input);
  assert.match(result.tx, /^0x[\da-f]{64}$/);
  assert.equal(f.calls.length, 4);
  f.rows.get(String(labelId("asha"))).latestOwner = address(77);
  await assert.rejects(resumed.claim(f.input), {
    code: "CHAMPION_OWNERSHIP_CHANGED",
  });
  assert.equal(f.calls.length, 4);
});
test("Champion resumes JSONB-reordered context but still rejects a changed namespace", async (t) => {
  const f = await fixture(t),
    first = await f.start();
  const claimed = await first.claim(f.input),
    writes = f.calls.length;
  await first.close();
  const file = path.join(f.dir, "ens/champions/state.json"),
    saved = JSON.parse(await readFile(file, "utf8"));
  saved.context = Object.fromEntries(Object.entries(saved.context).reverse());
  await writeFile(file, JSON.stringify(saved));
  const resumed = await f.start();
  assert.equal((await resumed.claim(f.input)).name, claimed.name);
  assert.equal(f.calls.length, writes);
  await resumed.close();
  saved.context.parent = "another.eth";
  await writeFile(file, JSON.stringify(saved));
  await assert.rejects(f.start(), { code: "STATE_CONFLICT" });
  saved.context.parent = f.config.ENS_PARENT;
  await writeFile(file, JSON.stringify(saved));
  await f.start();
});
