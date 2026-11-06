import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { zeroAddress, parseAbi } from "viem";
import {
  createParentRegistration,
  registrationInput,
} from "../../integrations/ens/parent-registration.mjs";
import { createEnsTransactions } from "../../integrations/ens/transactions.mjs";
import { stableEnsAdmission } from "../../integrations/ens/admission.mjs";
const address = (n) => "0x" + n.toString(16).padStart(40, "0");
async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "chonks-parent-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = {
    parent: "funcaster.eth",
    owner: address(9),
    durationSeconds: 63072000,
  };
  const artifacts = Object.fromEntries(
    ["ETHRegistry", "ETHRegistrar", "StandardRentPriceOracle", "MockUSDC"].map(
      (name, i) => [name, { address: address(i + 1), abi: [] }],
    ),
  );
  const state = {
    time: 1000n,
    registered: false,
    commitment: 0n,
    balance: 0n,
    allowance: 0n,
    price: 14000037n,
    owner: input.owner,
    crash: false,
  };
  const calls = [],
    sent = new Map();
  const client = {
    getChainId: async () => 11155111,
    getBlock: async () => ({ timestamp: state.time }),
    readContract: async ({ functionName: fn }) => {
      const values = {
        ETH_REGISTRY: artifacts.ETHRegistry.address,
        rentPriceOracle: artifacts.StandardRentPriceOracle.address,
        isPaymentToken: true,
        decimals: 6,
        isAvailable: !state.registered,
        getRegisterPrice: [state.price, 0n],
        MIN_COMMITMENT_AGE: 60n,
        MAX_COMMITMENT_AGE: 86400n,
        balanceOf: state.balance,
        allowance: state.allowance,
        makeCommitment: "0x" + "a".repeat(64),
        commitmentAt: state.commitment,
        getState: {
          status: state.registered ? 2 : 0,
          latestOwner: state.registered ? state.owner : zeroAddress,
          expiry: state.registered ? state.time + 63072000n : 0n,
          tokenId: 1n,
        },
      };
      assert(fn in values, `Unexpected read ${fn}`);
      return values[fn];
    },
  };
  const transact = async (id, call) => {
    if (sent.has(id)) return sent.get(id);
    calls.push(call);
    if (call.functionName === "mint") state.balance += call.args[1];
    if (call.functionName === "approve") state.allowance = call.args[1];
    if (call.functionName === "commit") state.commitment = state.time;
    if (call.functionName === "register") {
      assert(state.time >= state.commitment + 60n);
      assert.equal(call.args[0], "funcaster");
      assert.equal(call.args[5], 63072000n);
      state.registered = true;
    }
    const receipt = { tx: "0x" + calls.length.toString(16).padStart(64, "0") };
    sent.set(id, receipt);
    if (state.crash && call.functionName === "register") {
      state.crash = false;
      throw Error("uncertain-response");
    }
    return receipt;
  };
  const options = {
    dir,
    input,
    client,
    artifacts,
    transact,
    wait: async () => {
      state.time += 15n;
    },
  };
  return {
    ...options,
    state,
    calls,
    start: () => createParentRegistration(options),
  };
}
test("new parent registration remains read-only until owner apply and commits before registering", async (t) => {
  const f = await fixture(t),
    adapter = await f.start();
  assert.equal((await adapter.check()).status, "available");
  assert.equal(f.calls.length, 0);
  const result = await adapter.apply();
  assert.equal(result.status, "registered");
  assert.equal(result.name, "funcaster.eth");
  assert.equal(result.owner, f.input.owner);
  assert.deepEqual(
    f.calls.map((c) => c.functionName),
    ["mint", "approve", "commit", "register"],
  );
  assert.equal(f.calls[0].args[1], 20000000n);
  assert.equal(f.calls[1].args[1], 20000000n);
  const stored = JSON.parse(
    await readFile(path.join(f.dir, "registration.json"), "utf8"),
  );
  assert(!JSON.stringify(result).includes(stored.commitmentSecret));
  await (await f.start()).apply();
  assert.equal(f.calls.length, 4);
});
test("registration rejects wrong ownership, excess quote, changed journal and short lifetime", async (t) => {
  const f = await fixture(t),
    adapter = await f.start();
  f.state.price = 20000001n;
  await assert.rejects(adapter.apply(), { code: "PRICE_CAP" });
  assert.equal(f.calls.length, 0);
  f.state.price = 14000000n;
  await adapter.apply();
  await assert.rejects(
    createParentRegistration({
      ...f,
      input: { ...f.input, parent: "other.eth" },
    }),
    { code: "STATE_CONFLICT" },
  );
  f.state.owner = address(88);
  await assert.rejects(adapter.check(), { code: "NAME_UNAVAILABLE" });
  assert.throws(
    () => registrationInput({ ...f.input, durationSeconds: 31536000 }),
    { code: "INVALID_DURATION" },
  );
});
test("confirmed registration survives an uncertain response without sending another transaction", async (t) => {
  const f = await fixture(t),
    adapter = await f.start();
  f.state.crash = true;
  await assert.rejects(adapter.apply(), /uncertain-response/);
  assert.equal((await (await f.start()).apply()).status, "registered");
  assert.equal(f.calls.length, 4);
});

test("registration identity reaches the real transaction port signing boundary with all rate caps intact", async (t) => {
  const f = await fixture(t);
  f.artifacts.MockUSDC.abi = parseAbi([
    "function mint(address to,uint256 amount)",
  ]);
  let boundary = 0,
    nonceReads = 0,
    waits = 0;
  const port = await createEnsTransactions({
    dir: path.join(f.dir, "admission-only"),
    chainId: 11155111,
    owner: f.input.owner,
    client: {
      ...f.client,
      getTransactionCount: async () => (++nonceReads === 1 ? 1 : 0),
      simulateContract: async () => {},
      estimateGas: async () => 100n,
      getBalance: async () => 100000n,
      getBlock: async () => ({ timestamp: 1000n, baseFeePerGas: 2n }),
    },
    wallet: {
      account: { address: f.input.owner },
      signTransaction: async () => {
        boundary++;
        throw Object.assign(Error("Unsigned admission complete"), {
          code: "UNSIGNED_PREFLIGHT_COMPLETE",
        });
      },
    },
    budgetWei: 10000n,
    maxTransactions: 8,
    priorityFeeWei: 1n,
    maxFeePerGasWei: 100n,
    maxPerRoom: 8,
    maxPerHour: 8,
  });
  try {
    const adapter = await createParentRegistration({
      ...f,
      transact: stableEnsAdmission(port, {
        wait: async () => {
          waits++;
        },
      }),
    });
    await assert.rejects(adapter.apply(), {
      code: "UNSIGNED_PREFLIGHT_COMPLETE",
    });
    assert.equal(boundary, 1);
    assert.equal(
      waits,
      1,
      "a transient pre-sign nonce disagreement is retried without another admission",
    );
    const journal = JSON.parse(
      await readFile(
        path.join(f.dir, "admission-only/ens-transactions/journal.json"),
        "utf8",
      ),
    );
    assert.equal(journal.entries.length, 0);
  } finally {
    await port.close();
  }
});

test("hash-only admission snapshot avoids duplicate reads but still verifies before a nonce retry", async () => {
  let reads = 0,
    calls = 0;
  const port = {
    admissionHashes: () => ["original"],
    receipts: async () => {
      reads++;
      return [{ hash: "original" }];
    },
    transact: async () => {
      calls++;
      if (calls === 1)
        throw Object.assign(Error("nonce"), { code: "NONCE_CONFLICT" });
      return { tx: "confirmed" };
    },
  };
  assert.deepEqual(
    await stableEnsAdmission(port, { wait: async () => {} })("id", {}),
    { tx: "confirmed" },
  );
  assert.equal(reads, 1);
  assert.equal(calls, 2);
  calls = 0;
  port.receipts = async () => [{ hash: "changed" }];
  await assert.rejects(
    stableEnsAdmission(port, { wait: async () => {} })("id", {}),
  );
  assert.equal(calls, 1);
});
test("nonce admission never retries an uncertain broadcast or a changed journal", async () => {
  let calls = 0;
  const port = {
    receipts: async () => [],
    transact: async () => {
      calls++;
      throw Object.assign(Error("unknown send"), { code: "RPC_UNAVAILABLE" });
    },
  };
  await assert.rejects(
    stableEnsAdmission(port, { wait: async () => {} })("id", {}),
  );
  assert.equal(calls, 1);
  calls = 0;
  const moved = {
    receipts: async () => (calls ? [{ hash: "new-admission" }] : []),
    transact: async () => {
      calls++;
      throw Object.assign(Error("nonce"), { code: "NONCE_CONFLICT" });
    },
  };
  await assert.rejects(
    stableEnsAdmission(moved, { wait: async () => {} })("id", {}),
  );
  assert.equal(calls, 1);
});
